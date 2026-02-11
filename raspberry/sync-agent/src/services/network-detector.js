/**
 * NetworkDetector Service
 *
 * Detects and classifies the network environment (simple, mesh, mesh_isolated, enterprise)
 * Runs at boot and periodically (every hour) to update the network profile
 *
 * @module services/network-detector
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const logger = require('../logger');

// Network profile types
const PROFILE_TYPES = {
  SIMPLE: 'simple',
  MESH: 'mesh',
  MESH_ISOLATED: 'mesh_isolated',
  ENTERPRISE: 'enterprise',
  ETHERNET: 'ethernet',
  UNKNOWN: 'unknown'
};

// Detection thresholds
const CONFIG = {
  MESH_AP_THRESHOLD: 1,        // >1 AP = mesh
  STABILITY_WINDOW_HOURS: 1,   // Look at last hour for stability
  STABILITY_THRESHOLD: 3,      // >3 disconnects/hour = unstable
  SCAN_TIMEOUT_MS: 15000,      // WiFi scan timeout
  PING_TIMEOUT_MS: 3000,       // Network ping timeout
  ARP_SCAN_TIMEOUT_MS: 5000,   // ARP scan timeout
  DETECTION_COOLDOWN_MS: 120 * 1000  // 120s minimum between detections
};

/**
 * Main class for network environment detection
 */
class NetworkDetector {
  constructor() {
    this.lastProfile = null;
    this.lastDetectionTime = null;
    this.detectionInProgress = false;
  }

  /**
   * Execute shell command with timeout
   */
  async execWithTimeout(command, timeoutMs = 10000) {
    try {
      const { stdout } = await execAsync(command, { timeout: timeoutMs });
      return { success: true, output: stdout.trim() };
    } catch (error) {
      return { success: false, error: error.message, output: error.stdout || '' };
    }
  }

  /**
   * Check if connected via Ethernet (eth0)
   */
  async checkEthernetConnection() {
    // Check if eth0 is UP and has a valid IP
    const result = await this.execWithTimeout('ip addr show eth0 2>/dev/null');
    if (!result.success) {
      return { connected: false };
    }

    const output = result.output;
    const hasValidIp = output.match(/inet (\d+\.\d+\.\d+\.\d+)/) &&
                       !output.includes('169.254.'); // Exclude APIPA
    const isUp = output.includes('state UP');

    if (!hasValidIp || !isUp) {
      return { connected: false };
    }

    // Check if default route goes through eth0
    const routeResult = await this.execWithTimeout('ip route | grep default');
    const usesEthernet = routeResult.success && routeResult.output.includes('dev eth0');

    const ipMatch = output.match(/inet (\d+\.\d+\.\d+\.\d+)/);

    return {
      connected: usesEthernet,
      interface: 'eth0',
      ipAddress: ipMatch ? ipMatch[1] : null
    };
  }

  /**
   * Get current WiFi connection info
   */
  async getCurrentConnection() {
    const result = await this.execWithTimeout('iwconfig wlan1 2>/dev/null');
    if (!result.success) {
      return { connected: false };
    }

    const output = result.output;
    const ssidMatch = output.match(/ESSID:"([^"]+)"/);
    const bssidMatch = output.match(/Access Point: ([0-9A-Fa-f:]+)/);
    const signalMatch = output.match(/Signal level=(-?\d+)/);
    const channelMatch = output.match(/Frequency:.*Channel (\d+)/);

    return {
      connected: !!ssidMatch,
      ssid: ssidMatch ? ssidMatch[1] : null,
      bssid: bssidMatch ? bssidMatch[1] : null,
      signal: signalMatch ? parseInt(signalMatch[1]) : null,
      channel: channelMatch ? parseInt(channelMatch[1]) : null
    };
  }

  /**
   * Scan for all visible WiFi networks
   */
  async scanWifiNetworks() {
    const result = await this.execWithTimeout(
      'sudo iwlist wlan1 scan 2>/dev/null',
      CONFIG.SCAN_TIMEOUT_MS
    );

    if (!result.success) {
      logger.warn('WiFi scan failed', { error: result.error });
      return [];
    }

    const networks = [];
    const cells = result.output.split(/Cell \d+ - /);

    for (const cell of cells) {
      if (!cell.trim()) continue;

      const bssidMatch = cell.match(/Address: ([0-9A-Fa-f:]+)/);
      const ssidMatch = cell.match(/ESSID:"([^"]*)"/);
      const channelMatch = cell.match(/Channel:(\d+)/);
      const signalMatch = cell.match(/Signal level=(-?\d+)/);
      const encryptionMatch = cell.match(/Encryption key:(on|off)/);
      const wpaMatch = cell.match(/WPA2?/);
      const enterpriseMatch = cell.match(/IEEE 802\.1X/i);

      if (bssidMatch && ssidMatch) {
        networks.push({
          bssid: bssidMatch[1],
          ssid: ssidMatch[1],
          channel: channelMatch ? parseInt(channelMatch[1]) : null,
          signal: signalMatch ? parseInt(signalMatch[1]) : null,
          encrypted: encryptionMatch ? encryptionMatch[1] === 'on' : false,
          wpa: !!wpaMatch,
          enterprise: !!enterpriseMatch
        });
      }
    }

    return networks;
  }

  /**
   * Detect mesh network (multiple APs with same SSID)
   */
  async detectMesh(currentSSID) {
    const networks = await this.scanWifiNetworks();

    // Filter APs with the same SSID as current connection
    const sameSSIDNetworks = networks.filter(n => n.ssid === currentSSID);

    const isMesh = sameSSIDNetworks.length > CONFIG.MESH_AP_THRESHOLD;

    return {
      isMesh,
      apCount: sameSSIDNetworks.length,
      aps: sameSSIDNetworks.map(n => ({
        bssid: n.bssid,
        channel: n.channel,
        signal: n.signal
      })),
      hasEnterprise: networks.some(n => n.ssid === currentSSID && n.enterprise)
    };
  }

  /**
   * Check if BSSID is locked in wpa_supplicant config
   */
  async checkBssidLock() {
    const result = await this.execWithTimeout(
      'grep "bssid=" /etc/wpa_supplicant/wpa_supplicant-wlan1.conf 2>/dev/null || ' +
      'grep "bssid=" /etc/wpa_supplicant/wpa_supplicant.conf 2>/dev/null'
    );

    const hasLock = result.success && result.output.includes('bssid=');
    let lockedBssid = null;

    if (hasLock) {
      const match = result.output.match(/bssid=([0-9A-Fa-f:]+)/i);
      lockedBssid = match ? match[1] : null;
    }

    return {
      bssidLocked: hasLock,
      lockedBssid
    };
  }

  /**
   * Test for client isolation (can we see other clients on the network?)
   * This is a key indicator for mesh_isolated profile
   */
  async detectClientIsolation() {
    // Get gateway IP
    const gatewayResult = await this.execWithTimeout(
      "ip route | grep default | awk '{print $3}'"
    );

    const gatewayIp = gatewayResult.success ? gatewayResult.output : null;
    let gatewayReachable = false;

    if (gatewayIp) {
      const pingResult = await this.execWithTimeout(
        `ping -c 1 -W 2 ${gatewayIp}`,
        CONFIG.PING_TIMEOUT_MS
      );
      gatewayReachable = pingResult.success;
    }

    // Try ARP scan to detect other clients
    // If we can't see other clients but can reach gateway, likely isolated
    const arpResult = await this.execWithTimeout(
      'arp -a 2>/dev/null | grep -v incomplete | wc -l',
      CONFIG.ARP_SCAN_TIMEOUT_MS
    );

    const visibleClients = arpResult.success ? parseInt(arpResult.output) || 0 : 0;

    // Also try to ping broadcast (only works if not isolated)
    // Get our subnet
    const subnetResult = await this.execWithTimeout(
      "ip -4 addr show wlan1 | grep inet | awk '{print $2}'"
    );

    let broadcastReachable = false;
    if (subnetResult.success && subnetResult.output) {
      // Extract broadcast address from CIDR
      const cidr = subnetResult.output.split('/')[0];
      const parts = cidr.split('.');
      if (parts.length === 4) {
        const broadcastIp = `${parts[0]}.${parts[1]}.${parts[2]}.255`;
        const broadcastResult = await this.execWithTimeout(
          `ping -c 1 -W 1 -b ${broadcastIp} 2>/dev/null`,
          2000
        );
        broadcastReachable = broadcastResult.success;
      }
    }

    // Heuristic: If gateway reachable but few/no other clients visible
    // and broadcast doesn't work, likely isolated
    const hasIsolation = gatewayReachable && visibleClients <= 1 && !broadcastReachable;

    return {
      gatewayIp,
      gatewayReachable,
      visibleClients,
      broadcastReachable,
      hasIsolation
    };
  }

  /**
   * Calculate stability score based on recent disconnections
   * Reads from journalctl wpa_supplicant logs
   */
  async calculateStability() {
    const result = await this.execWithTimeout(
      `sudo journalctl -u wpa_supplicant@wlan1 --since "1 hour ago" 2>/dev/null | ` +
      `grep -c "CTRL-EVENT-DISCONNECTED" || echo "0"`
    );

    const disconnects = result.success ? parseInt(result.output) || 0 : 0;
    const isStable = disconnects <= CONFIG.STABILITY_THRESHOLD;

    // Score: 100 if 0 disconnects, -20 per disconnect, min 0
    const score = Math.max(0, 100 - (disconnects * 20));

    return {
      disconnectsLastHour: disconnects,
      isStable,
      score
    };
  }

  /**
   * Classify the network profile based on all collected data
   */
  classifyProfile(meshInfo, isolationInfo, bssidInfo, stabilityInfo) {
    // Check for enterprise (802.1X detected during scan)
    if (meshInfo.hasEnterprise) {
      return PROFILE_TYPES.ENTERPRISE;
    }

    // Check for mesh with isolation
    if (meshInfo.isMesh && isolationInfo.hasIsolation) {
      return PROFILE_TYPES.MESH_ISOLATED;
    }

    // Check for mesh without isolation
    if (meshInfo.isMesh) {
      return PROFILE_TYPES.MESH;
    }

    // Simple network (single AP, no isolation, no enterprise)
    return PROFILE_TYPES.SIMPLE;
  }

  /**
   * Generate warnings based on detected profile and configuration
   */
  generateWarnings(profile, meshInfo, bssidInfo, stabilityInfo) {
    const warnings = [];

    // BSSID lock in mesh is dangerous
    if (meshInfo.isMesh && bssidInfo.bssidLocked) {
      warnings.push({
        type: 'BSSID_LOCK_IN_MESH',
        severity: 'high',
        message: `BSSID lock is enabled in a mesh environment with ${meshInfo.apCount} APs. ` +
                 `This can cause connectivity issues. Consider removing the lock.`,
        action: 'remove_bssid_lock'
      });
    }

    // Unstable connection
    if (!stabilityInfo.isStable) {
      warnings.push({
        type: 'UNSTABLE_CONNECTION',
        severity: 'medium',
        message: `${stabilityInfo.disconnectsLastHour} disconnections in the last hour. ` +
                 `Connection stability is poor.`,
        action: 'investigate_network'
      });
    }

    // Isolated network - recommend Remote Cloud
    if (profile === PROFILE_TYPES.MESH_ISOLATED) {
      warnings.push({
        type: 'CLIENT_ISOLATION',
        severity: 'info',
        message: 'Client isolation detected. Local remote access may not work. ' +
                 'Use Remote Cloud instead.',
        action: 'use_remote_cloud'
      });
    }

    return warnings;
  }

  /**
   * Main detection method - runs full network profile detection
   */
  async detect() {
    if (this.detectionInProgress) {
      logger.info('Network detection already in progress, skipping');
      return this.lastProfile;
    }

    // Debounce: skip if last detection was less than DETECTION_COOLDOWN_MS ago
    if (this.lastDetectionTime) {
      const elapsed = Date.now() - this.lastDetectionTime.getTime();
      if (elapsed < CONFIG.DETECTION_COOLDOWN_MS) {
        logger.info('Network detection skipped (cooldown)', {
          elapsedMs: elapsed,
          cooldownMs: CONFIG.DETECTION_COOLDOWN_MS,
          remainingMs: CONFIG.DETECTION_COOLDOWN_MS - elapsed
        });
        return this.lastProfile;
      }
    }

    this.detectionInProgress = true;
    const startTime = Date.now();

    try {
      logger.info('Starting network profile detection');

      // First, check if connected via Ethernet
      const ethernetConnection = await this.checkEthernetConnection();
      if (ethernetConnection.connected) {
        logger.info('Connected via Ethernet, returning ethernet profile', {
          ipAddress: ethernetConnection.ipAddress
        });

        const profile = {
          type: PROFILE_TYPES.ETHERNET,
          connected: true,
          connectionType: 'ethernet',
          currentConnection: {
            interface: 'eth0',
            ipAddress: ethernetConnection.ipAddress
          },
          meshInfo: {
            isMesh: false,
            apCount: 0,
            aps: [],
            hasEnterprise: false
          },
          bssidInfo: {
            locked: false,
            lockedBssid: null
          },
          isolationInfo: {
            hasIsolation: false,
            gatewayReachable: true,
            visibleClients: 0
          },
          stabilityInfo: {
            disconnectsLastHour: 0,
            isStable: true,
            score: 100
          },
          warnings: [],
          detectedAt: new Date().toISOString(),
          detectionDurationMs: Date.now() - startTime
        };

        this.lastProfile = profile;
        this.lastDetectionTime = new Date();
        this.detectionInProgress = false;

        return profile;
      }

      // Get current WiFi connection info
      const connection = await this.getCurrentConnection();

      if (!connection.connected) {
        logger.warn('Not connected to WiFi or Ethernet, cannot detect network profile');
        this.detectionInProgress = false;
        return {
          type: PROFILE_TYPES.UNKNOWN,
          connected: false,
          error: 'Not connected to WiFi or Ethernet',
          detectedAt: new Date().toISOString()
        };
      }

      // Run all detection in parallel for efficiency
      const [meshInfo, bssidInfo, isolationInfo, stabilityInfo] = await Promise.all([
        this.detectMesh(connection.ssid),
        this.checkBssidLock(),
        this.detectClientIsolation(),
        this.calculateStability()
      ]);

      // Classify the profile
      const profileType = this.classifyProfile(meshInfo, isolationInfo, bssidInfo, stabilityInfo);

      // Generate warnings
      const warnings = this.generateWarnings(profileType, meshInfo, bssidInfo, stabilityInfo);

      const profile = {
        type: profileType,
        connected: true,
        currentConnection: {
          ssid: connection.ssid,
          bssid: connection.bssid,
          signal: connection.signal,
          channel: connection.channel
        },
        meshInfo: {
          isMesh: meshInfo.isMesh,
          apCount: meshInfo.apCount,
          aps: meshInfo.aps,
          hasEnterprise: meshInfo.hasEnterprise
        },
        bssidInfo: {
          locked: bssidInfo.bssidLocked,
          lockedBssid: bssidInfo.lockedBssid
        },
        isolationInfo: {
          hasIsolation: isolationInfo.hasIsolation,
          gatewayReachable: isolationInfo.gatewayReachable,
          visibleClients: isolationInfo.visibleClients
        },
        stabilityInfo: {
          disconnectsLastHour: stabilityInfo.disconnectsLastHour,
          isStable: stabilityInfo.isStable,
          score: stabilityInfo.score
        },
        warnings,
        detectedAt: new Date().toISOString(),
        detectionDurationMs: Date.now() - startTime
      };

      this.lastProfile = profile;
      this.lastDetectionTime = new Date();

      logger.info('Network profile detection complete', {
        type: profileType,
        apCount: meshInfo.apCount,
        hasIsolation: isolationInfo.hasIsolation,
        stabilityScore: stabilityInfo.score,
        warnings: warnings.length,
        durationMs: profile.detectionDurationMs
      });

      return profile;

    } catch (error) {
      logger.error('Network profile detection failed', { error: error.message });
      return {
        type: PROFILE_TYPES.UNKNOWN,
        error: error.message,
        detectedAt: new Date().toISOString()
      };
    } finally {
      this.detectionInProgress = false;
    }
  }

  /**
   * Get simplified profile for sync_local_state
   * Returns only essential data to minimize payload
   */
  getSimplifiedProfile() {
    if (!this.lastProfile) {
      return null;
    }

    return {
      type: this.lastProfile.type,
      apCount: this.lastProfile.meshInfo?.apCount || 0,
      bssidLocked: this.lastProfile.bssidInfo?.locked || false,
      hasIsolation: this.lastProfile.isolationInfo?.hasIsolation || false,
      stabilityScore: this.lastProfile.stabilityInfo?.score || 0,
      warningCount: this.lastProfile.warnings?.length || 0,
      detectedAt: this.lastProfile.detectedAt
    };
  }

  /**
   * Get full profile (for debug bundle or detailed view)
   */
  getFullProfile() {
    return this.lastProfile;
  }

  /**
   * Check if we should block BSSID lock based on current profile
   */
  shouldBlockBssidLock() {
    if (!this.lastProfile) return false;
    return this.lastProfile.type !== PROFILE_TYPES.SIMPLE;
  }

  /**
   * Check if we should recommend Remote Cloud
   */
  shouldRecommendRemoteCloud() {
    if (!this.lastProfile) return false;
    return this.lastProfile.type === PROFILE_TYPES.MESH_ISOLATED;
  }

  /**
   * Check if we should defer hostapd restart
   */
  shouldDeferHostapdRestart() {
    if (!this.lastProfile) return false;
    return [
      PROFILE_TYPES.MESH,
      PROFILE_TYPES.MESH_ISOLATED,
      PROFILE_TYPES.ENTERPRISE
    ].includes(this.lastProfile.type);
  }
}

// Export singleton instance
const networkDetector = new NetworkDetector();

module.exports = {
  networkDetector,
  NetworkDetector,
  PROFILE_TYPES,
  CONFIG
};
