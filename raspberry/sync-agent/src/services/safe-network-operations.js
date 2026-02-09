/**
 * SafeNetworkOperations Service
 *
 * Wraps risky network operations with safety checks based on detected network profile.
 * Prevents operations that could cause connectivity loss in mesh environments.
 *
 * @module services/safe-network-operations
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs-extra');
const path = require('path');
const logger = require('../logger');
const { networkDetector, PROFILE_TYPES } = require('./network-detector');
const networkWatchdog = require('./network-watchdog');

// Operation types
const OPERATIONS = {
  SET_BSSID_LOCK: 'set_bssid_lock',
  REMOVE_BSSID_LOCK: 'remove_bssid_lock',
  UPDATE_HOTSPOT_SSID: 'update_hotspot_ssid',
  UPDATE_HOTSPOT_PASSWORD: 'update_hotspot_password',
  UPDATE_HOTSPOT_CHANNEL: 'update_hotspot_channel',
  FIX_HOTSPOT: 'fix_hotspot',
  RESTART_HOSTAPD: 'restart_hostapd',
  CONFIGURE_BGSCAN: 'configure_bgscan'
};

// Operation safety matrix
const SAFETY_MATRIX = {
  [OPERATIONS.SET_BSSID_LOCK]: {
    [PROFILE_TYPES.SIMPLE]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.ETHERNET]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.MESH]: { allowed: false, reason: 'BSSID lock is dangerous in mesh environments' },
    [PROFILE_TYPES.MESH_ISOLATED]: { allowed: false, reason: 'BSSID lock is dangerous in mesh environments' },
    [PROFILE_TYPES.ENTERPRISE]: { allowed: false, reason: 'BSSID lock is not recommended in enterprise networks' },
    [PROFILE_TYPES.UNKNOWN]: { allowed: false, reason: 'Network profile unknown, refusing risky operation' }
  },
  [OPERATIONS.REMOVE_BSSID_LOCK]: {
    [PROFILE_TYPES.SIMPLE]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.ETHERNET]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.MESH]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.MESH_ISOLATED]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.ENTERPRISE]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.UNKNOWN]: { allowed: true, method: 'direct' }
  },
  [OPERATIONS.UPDATE_HOTSPOT_SSID]: {
    [PROFILE_TYPES.SIMPLE]: { allowed: true, method: 'restart' },
    [PROFILE_TYPES.ETHERNET]: { allowed: true, method: 'restart' },
    [PROFILE_TYPES.MESH]: { allowed: true, method: 'defer_reboot', reason: 'Reboot required to avoid wlan1 disruption' },
    [PROFILE_TYPES.MESH_ISOLATED]: { allowed: true, method: 'defer_reboot', reason: 'Reboot required to avoid wlan1 disruption' },
    [PROFILE_TYPES.ENTERPRISE]: { allowed: true, method: 'defer_reboot', reason: 'Reboot required to avoid wlan1 disruption' },
    [PROFILE_TYPES.UNKNOWN]: { allowed: true, method: 'defer_reboot', reason: 'Unknown profile, using safe method' }
  },
  [OPERATIONS.UPDATE_HOTSPOT_PASSWORD]: {
    [PROFILE_TYPES.SIMPLE]: { allowed: true, method: 'restart' },
    [PROFILE_TYPES.ETHERNET]: { allowed: true, method: 'restart' },
    [PROFILE_TYPES.MESH]: { allowed: true, method: 'defer_reboot', reason: 'Reboot required to avoid wlan1 disruption' },
    [PROFILE_TYPES.MESH_ISOLATED]: { allowed: true, method: 'defer_reboot', reason: 'Reboot required to avoid wlan1 disruption' },
    [PROFILE_TYPES.ENTERPRISE]: { allowed: true, method: 'defer_reboot', reason: 'Reboot required to avoid wlan1 disruption' },
    [PROFILE_TYPES.UNKNOWN]: { allowed: true, method: 'defer_reboot', reason: 'Unknown profile, using safe method' }
  },
  [OPERATIONS.UPDATE_HOTSPOT_CHANNEL]: {
    [PROFILE_TYPES.SIMPLE]: { allowed: true, method: 'restart' },
    [PROFILE_TYPES.ETHERNET]: { allowed: true, method: 'restart' },
    [PROFILE_TYPES.MESH]: { allowed: true, method: 'defer_reboot', reason: 'Reboot required to avoid wlan1 disruption' },
    [PROFILE_TYPES.MESH_ISOLATED]: { allowed: true, method: 'defer_reboot', reason: 'Reboot required to avoid wlan1 disruption' },
    [PROFILE_TYPES.ENTERPRISE]: { allowed: true, method: 'defer_reboot', reason: 'Reboot required to avoid wlan1 disruption' },
    [PROFILE_TYPES.UNKNOWN]: { allowed: true, method: 'defer_reboot', reason: 'Unknown profile, using safe method' }
  },
  [OPERATIONS.FIX_HOTSPOT]: {
    [PROFILE_TYPES.SIMPLE]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.ETHERNET]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.MESH]: { allowed: true, method: 'defer_reboot', reason: 'Reboot required to apply channel change safely' },
    [PROFILE_TYPES.MESH_ISOLATED]: { allowed: true, method: 'defer_reboot', reason: 'Reboot required to apply channel change safely' },
    [PROFILE_TYPES.ENTERPRISE]: { allowed: true, method: 'defer_reboot', reason: 'Reboot required to apply channel change safely' },
    [PROFILE_TYPES.UNKNOWN]: { allowed: true, method: 'defer_reboot', reason: 'Unknown profile, using safe method' }
  },
  [OPERATIONS.RESTART_HOSTAPD]: {
    [PROFILE_TYPES.SIMPLE]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.ETHERNET]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.MESH]: { allowed: false, reason: 'Restarting hostapd can disrupt wlan1 in mesh environments' },
    [PROFILE_TYPES.MESH_ISOLATED]: { allowed: false, reason: 'Restarting hostapd can disrupt wlan1 in mesh environments' },
    [PROFILE_TYPES.ENTERPRISE]: { allowed: false, reason: 'Restarting hostapd can disrupt wlan1 in mesh environments' },
    [PROFILE_TYPES.UNKNOWN]: { allowed: false, reason: 'Unknown profile, refusing risky operation' }
  },
  [OPERATIONS.CONFIGURE_BGSCAN]: {
    [PROFILE_TYPES.SIMPLE]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.ETHERNET]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.MESH]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.MESH_ISOLATED]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.ENTERPRISE]: { allowed: true, method: 'direct' },
    [PROFILE_TYPES.UNKNOWN]: { allowed: true, method: 'direct' }
  }
};

/**
 * SafeNetworkOperations class
 */
class SafeNetworkOperations {
  constructor() {
    this.pendingReboot = false;
    this.pendingOperations = [];
    this.wpaSupplicantPath = '/etc/wpa_supplicant/wpa_supplicant-wlan1.conf';
    this.wpaSupplicantFallback = '/etc/wpa_supplicant/wpa_supplicant.conf';
    this.hostapdPath = '/etc/hostapd/hostapd.conf';
  }

  /**
   * Get the current network profile
   */
  async getProfile() {
    const profile = networkDetector.getFullProfile();
    if (!profile) {
      // Try to detect if not yet done
      return await networkDetector.detect();
    }
    return profile;
  }

  /**
   * Check if an operation is allowed for the current network profile
   */
  async checkOperation(operation) {
    const profile = await this.getProfile();
    const profileType = profile?.type || PROFILE_TYPES.UNKNOWN;

    const safety = SAFETY_MATRIX[operation]?.[profileType];
    if (!safety) {
      return {
        allowed: false,
        reason: `Unknown operation: ${operation}`,
        profileType
      };
    }

    return {
      ...safety,
      profileType,
      profile
    };
  }

  /**
   * Execute an operation safely based on network profile
   */
  async executeOperation(operation, params = {}) {
    const check = await this.checkOperation(operation);

    logger.info('SafeNetworkOperations: checking operation', {
      operation,
      profileType: check.profileType,
      allowed: check.allowed,
      method: check.method
    });

    if (!check.allowed) {
      logger.warn('SafeNetworkOperations: operation blocked', {
        operation,
        profileType: check.profileType,
        reason: check.reason
      });
      return {
        success: false,
        blocked: true,
        reason: check.reason,
        profileType: check.profileType
      };
    }

    // Execute based on method
    switch (check.method) {
      case 'direct':
        return this.executeDirect(operation, params);
      case 'restart':
        return this.executeWithRestart(operation, params);
      case 'defer_reboot':
        return this.executeDeferred(operation, params, check.reason);
      default:
        return {
          success: false,
          error: `Unknown method: ${check.method}`
        };
    }
  }

  /**
   * Execute operation directly without any service restart
   */
  async executeDirect(operation, params) {
    try {
      switch (operation) {
        case OPERATIONS.REMOVE_BSSID_LOCK:
          return await this.removeBssidLock();
        case OPERATIONS.SET_BSSID_LOCK:
          return await this.setBssidLock(params.bssid);
        case OPERATIONS.CONFIGURE_BGSCAN:
          return await this.configureBgscan(params.bgscan);
        case OPERATIONS.FIX_HOTSPOT:
          return await this.fixHotspotDirect(params);
        default:
          return { success: false, error: `Direct execution not implemented for ${operation}` };
      }
    } catch (error) {
      logger.error('SafeNetworkOperations: direct execution failed', { operation, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute operation with hostapd restart (only for simple networks)
   */
  async executeWithRestart(operation, params) {
    try {
      // First apply the configuration change
      let configResult;
      switch (operation) {
        case OPERATIONS.UPDATE_HOTSPOT_SSID:
          configResult = await this.updateHostapdConfig('ssid', params.ssid);
          break;
        case OPERATIONS.UPDATE_HOTSPOT_PASSWORD:
          configResult = await this.updateHostapdConfig('wpa_passphrase', params.password);
          break;
        case OPERATIONS.UPDATE_HOTSPOT_CHANNEL:
          configResult = await this.updateHostapdConfig('channel', params.channel);
          break;
        default:
          return { success: false, error: `Restart execution not implemented for ${operation}` };
      }

      if (!configResult.success) {
        return configResult;
      }

      // Restart hostapd
      await execAsync('sudo systemctl restart hostapd');

      // Wait for hostapd to come back up
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify hostapd is running
      const { stdout } = await execAsync('systemctl is-active hostapd');
      const isActive = stdout.trim() === 'active';

      return {
        success: isActive,
        applied: true,
        restarted: true,
        message: isActive ? 'Configuration applied and hostapd restarted' : 'hostapd failed to restart'
      };
    } catch (error) {
      logger.error('SafeNetworkOperations: restart execution failed', { operation, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute operation with deferred reboot (for mesh environments)
   */
  async executeDeferred(operation, params, reason) {
    try {
      // Apply the configuration change without restarting
      let configResult;
      switch (operation) {
        case OPERATIONS.UPDATE_HOTSPOT_SSID:
          configResult = await this.updateHostapdConfig('ssid', params.ssid);
          break;
        case OPERATIONS.UPDATE_HOTSPOT_PASSWORD:
          configResult = await this.updateHostapdConfig('wpa_passphrase', params.password);
          break;
        case OPERATIONS.UPDATE_HOTSPOT_CHANNEL:
          configResult = await this.updateHostapdConfig('channel', params.channel);
          break;
        case OPERATIONS.FIX_HOTSPOT:
          configResult = await this.fixHotspotDeferred(params);
          break;
        default:
          return { success: false, error: `Deferred execution not implemented for ${operation}` };
      }

      if (!configResult.success) {
        return configResult;
      }

      // Mark that a reboot is pending
      this.pendingReboot = true;
      this.pendingOperations.push({
        operation,
        params,
        timestamp: new Date().toISOString()
      });

      logger.info('SafeNetworkOperations: operation deferred until reboot', {
        operation,
        pendingOperations: this.pendingOperations.length
      });

      return {
        success: true,
        applied: false,
        needsReboot: true,
        reason,
        message: 'Configuration saved. Reboot required to apply changes safely.'
      };
    } catch (error) {
      logger.error('SafeNetworkOperations: deferred execution failed', { operation, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Atomically modify a wpa_supplicant config file.
   * Reads → modifies in memory → writes to .tmp → mv to original.
   * This prevents race conditions where wpa_cli reconfigure reads a half-written file.
   */
  async atomicWpaSupplicantEdit(configPath, modifyFn) {
    const tmpPath = `${configPath}.tmp`;
    try {
      // Read current content
      const { stdout: content } = await execAsync(`sudo cat ${configPath}`);

      // Modify in memory
      const newContent = modifyFn(content);

      // Write to tmp file atomically
      await execAsync(`echo ${JSON.stringify(newContent)} | sudo tee ${tmpPath} > /dev/null`);

      // Atomic move (rename is atomic on same filesystem)
      await execAsync(`sudo mv ${tmpPath} ${configPath}`);

      // Fix permissions
      await execAsync(`sudo chmod 600 ${configPath}`);

      return { success: true };
    } catch (error) {
      // Cleanup tmp file on failure
      await execAsync(`sudo rm -f ${tmpPath} 2>/dev/null || true`);
      throw error;
    }
  }

  /**
   * Remove BSSID lock from wpa_supplicant config
   */
  async removeBssidLock() {
    try {
      // Atomically remove bssid= from main config
      await this.atomicWpaSupplicantEdit(this.wpaSupplicantPath, (content) => {
        return content.split('\n').filter(line => !line.trim().startsWith('bssid=')).join('\n');
      });

      // Also try fallback config (may not exist)
      try {
        await this.atomicWpaSupplicantEdit(this.wpaSupplicantFallback, (content) => {
          return content.split('\n').filter(line => !line.trim().startsWith('bssid=')).join('\n');
        });
      } catch {
        // Fallback file may not exist, ignore
      }

      // Reconfigure wpa_supplicant (single call, config is already consistent)
      await execAsync('sudo wpa_cli -i wlan1 reconfigure');

      logger.info('SafeNetworkOperations: BSSID lock removed');
      return { success: true, message: 'BSSID lock removed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Set BSSID lock in wpa_supplicant config (only for simple networks)
   */
  async setBssidLock(bssid) {
    if (!bssid || !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(bssid)) {
      return { success: false, error: 'Invalid BSSID format' };
    }

    try {
      // Atomically: remove old bssid + add new one (single file write)
      await this.atomicWpaSupplicantEdit(this.wpaSupplicantPath, (content) => {
        const lines = content.split('\n');
        // Remove existing bssid lines
        const filtered = lines.filter(line => !line.trim().startsWith('bssid='));
        // Find 'network={' and insert bssid after it
        const result = [];
        for (const line of filtered) {
          result.push(line);
          if (line.trim() === 'network={') {
            result.push(`    bssid=${bssid}`);
          }
        }
        return result.join('\n');
      });

      // Single reconfigure call (config is already consistent)
      await execAsync('sudo wpa_cli -i wlan1 reconfigure');

      logger.info('SafeNetworkOperations: BSSID lock set', { bssid });
      return { success: true, message: `BSSID locked to ${bssid}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Configure bgscan for roaming in mesh environments
   */
  async configureBgscan(bgscan = 'simple:30:-70:300') {
    try {
      // Atomically: remove old bgscan + add new one (single file write)
      await this.atomicWpaSupplicantEdit(this.wpaSupplicantPath, (content) => {
        const lines = content.split('\n');
        // Remove existing bgscan lines
        const filtered = lines.filter(line => !line.trim().startsWith('bgscan='));
        // Find 'network={' and insert bgscan after it
        const result = [];
        for (const line of filtered) {
          result.push(line);
          if (line.trim() === 'network={') {
            result.push(`    bgscan="${bgscan}"`);
          }
        }
        return result.join('\n');
      });

      // Single reconfigure call (config is already consistent)
      await execAsync('sudo wpa_cli -i wlan1 reconfigure');

      logger.info('SafeNetworkOperations: bgscan configured', { bgscan });
      return { success: true, message: `bgscan configured: ${bgscan}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update hostapd configuration file
   */
  async updateHostapdConfig(key, value) {
    try {
      // Check if hostapd.conf exists
      const exists = await fs.pathExists(this.hostapdPath);
      if (!exists) {
        return { success: false, error: 'hostapd.conf not found' };
      }

      // Update the value
      await execAsync(`sudo sed -i 's/^${key}=.*/${key}=${value}/' ${this.hostapdPath}`);

      logger.info('SafeNetworkOperations: hostapd config updated', { key, value: key === 'wpa_passphrase' ? '***' : value });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Fix hotspot directly (for simple networks)
   */
  async fixHotspotDirect(params) {
    const scriptPath = '/home/pi/neopro/scripts/fix-hotspot.sh';
    try {
      const args = params.autoFix ? '--auto-fix --json' : '--json';
      const { stdout } = await execAsync(`sudo ${scriptPath} ${args}`, { timeout: 30000 });

      const result = JSON.parse(stdout);

      if (result.channelChanged) {
        // In simple networks, we can restart hostapd
        await execAsync('sudo systemctl restart hostapd');
        await new Promise(resolve => setTimeout(resolve, 3000));
        result.applied = true;
      }

      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Fix hotspot with deferred reboot (for mesh environments)
   */
  async fixHotspotDeferred(params) {
    const scriptPath = '/home/pi/neopro/scripts/fix-hotspot.sh';
    try {
      const args = params.autoFix ? '--auto-fix --json' : '--json';
      const { stdout } = await execAsync(`sudo ${scriptPath} ${args}`, { timeout: 30000 });

      const result = JSON.parse(stdout);

      // Don't restart hostapd - changes will apply at reboot
      result.applied = false;
      result.needsReboot = result.channelChanged;

      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute a reboot (used when user confirms)
   */
  async executeReboot() {
    logger.info('SafeNetworkOperations: executing reboot', {
      pendingOperations: this.pendingOperations.length
    });

    try {
      // Give some time for response to be sent
      setTimeout(() => {
        execAsync('sudo reboot');
      }, 2000);

      return {
        success: true,
        message: 'Reboot initiated. Device will restart in a few seconds.'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get pending operations status
   */
  getPendingStatus() {
    return {
      pendingReboot: this.pendingReboot,
      pendingOperations: this.pendingOperations
    };
  }

  /**
   * Clear pending operations (after reboot)
   */
  clearPending() {
    this.pendingReboot = false;
    this.pendingOperations = [];
  }

  /**
   * Auto-optimize network based on detected profile
   * Called at boot or when profile changes significantly
   */
  async autoOptimize() {
    const profile = await this.getProfile();
    if (!profile || profile.type === PROFILE_TYPES.UNKNOWN) {
      logger.info('SafeNetworkOperations: skipping auto-optimize, profile unknown');
      return { success: false, reason: 'Profile unknown' };
    }

    const actions = [];
    let willReconfigure = false;

    // Determine if we'll need to reconfigure wpa_supplicant
    if ((profile.type === PROFILE_TYPES.MESH || profile.type === PROFILE_TYPES.MESH_ISOLATED)
        && profile.bssidInfo?.locked) {
      willReconfigure = true;
    }
    if (profile.type === PROFILE_TYPES.MESH || profile.type === PROFILE_TYPES.MESH_ISOLATED) {
      try {
        const { stdout } = await execAsync(`grep "bgscan=" ${this.wpaSupplicantPath} 2>/dev/null || echo ""`);
        if (!stdout.includes('bgscan=')) {
          willReconfigure = true;
        }
      } catch (e) {
        // Ignore
      }
    }

    // Enable grace period BEFORE any wpa_cli reconfigure to prevent
    // NetworkWatchdog from triggering recovery during the reconfigure
    if (willReconfigure) {
      networkWatchdog.enableGracePeriod('internet', 60000); // 60s grace period
      logger.info('SafeNetworkOperations: grace period enabled before auto-optimize');
    }

    // If mesh and BSSID is locked, remove it
    if ((profile.type === PROFILE_TYPES.MESH || profile.type === PROFILE_TYPES.MESH_ISOLATED)
        && profile.bssidInfo?.locked) {
      const result = await this.executeOperation(OPERATIONS.REMOVE_BSSID_LOCK);
      actions.push({ action: 'remove_bssid_lock', ...result });
    }

    // If mesh and no bgscan, configure it
    if (profile.type === PROFILE_TYPES.MESH || profile.type === PROFILE_TYPES.MESH_ISOLATED) {
      try {
        const { stdout } = await execAsync(`grep "bgscan=" ${this.wpaSupplicantPath} 2>/dev/null || echo ""`);
        if (!stdout.includes('bgscan=')) {
          const result = await this.executeOperation(OPERATIONS.CONFIGURE_BGSCAN, { bgscan: 'simple:30:-70:300' });
          actions.push({ action: 'configure_bgscan', ...result });
        }
      } catch (e) {
        // Ignore
      }
    }

    logger.info('SafeNetworkOperations: auto-optimize completed', { actions: actions.length });
    return { success: true, actions };
  }
}

// Export singleton
const safeNetworkOperations = new SafeNetworkOperations();

module.exports = {
  safeNetworkOperations,
  SafeNetworkOperations,
  OPERATIONS,
  SAFETY_MATRIX
};
