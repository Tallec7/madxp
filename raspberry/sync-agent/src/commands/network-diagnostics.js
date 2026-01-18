const { exec } = require('child_process');
const util = require('util');
const logger = require('../logger');
const { config } = require('../config');

const execAsync = util.promisify(exec);

/**
 * Effectue un diagnostic réseau complet
 * Teste la connectivité internet, la latence, le DNS, perte de paquets, etc.
 */
async function networkDiagnostics() {
  logger.info('Running comprehensive network diagnostics');

  const results = {
    success: true,
    timestamp: new Date().toISOString(),
    internet: {
      reachable: false,
      latency_ms: null,
      packet_loss_percent: null,
      packets_sent: 5,
      packets_received: 0,
    },
    central_server: {
      reachable: false,
      latency_ms: null,
      http_latency_ms: null,
      http_status: null,
      url: config.central.url,
      port_443_open: null,
      ssl_valid: null,
    },
    dns: {
      working: false,
      resolution_time_ms: null,
      tested_domain: null,
      resolved_ip: null,
    },
    gateway: {
      ip: null,
      reachable: false,
      latency_ms: null,
    },
    interfaces: [],
    wifi: null,
    stability: {
      interface_uptime_seconds: null,
      reconnections_24h: null,
    },
  };

  // 1. Récupérer les interfaces réseau
  try {
    const si = require('systeminformation');
    const interfaces = await si.networkInterfaces();
    results.interfaces = interfaces
      .filter(iface => !iface.iface.startsWith('lo'))
      .map(iface => ({
        name: iface.iface,
        ip4: iface.ip4 || null,
        ip6: iface.ip6 || null,
        mac: iface.mac || null,
        type: iface.type || 'unknown',
        operstate: iface.operstate || 'unknown',
        speed: iface.speed || null,
      }));
  } catch (error) {
    logger.warn('Failed to get network interfaces:', error.message);
  }

  // 2. Récupérer la passerelle par défaut
  try {
    const { stdout } = await execAsync("ip route | grep default | awk '{print $3}' | head -n1");
    const gatewayIp = stdout.trim();
    if (gatewayIp) {
      results.gateway.ip = gatewayIp;

      // Ping la passerelle
      try {
        const pingStart = Date.now();
        await execAsync(`ping -c 1 -W 2 ${gatewayIp}`);
        results.gateway.reachable = true;
        results.gateway.latency_ms = Date.now() - pingStart;
      } catch {
        results.gateway.reachable = false;
      }
    }
  } catch (error) {
    logger.warn('Failed to get default gateway:', error.message);
  }

  // 3. Tester la connectivité internet avec perte de paquets
  try {
    const { stdout: pingOutput } = await execAsync('ping -c 5 -W 2 8.8.8.8 2>&1 || true');

    const receivedMatch = pingOutput.match(/(\d+) received/);
    const lossMatch = pingOutput.match(/(\d+(?:\.\d+)?)% packet loss/);
    const avgMatch = pingOutput.match(/= [\d.]+\/([\d.]+)\//);

    if (receivedMatch) {
      results.internet.packets_received = parseInt(receivedMatch[1]);
      results.internet.reachable = results.internet.packets_received > 0;
    }
    if (lossMatch) {
      results.internet.packet_loss_percent = parseFloat(lossMatch[1]);
    }
    if (avgMatch) {
      results.internet.latency_ms = Math.round(parseFloat(avgMatch[1]));
    }
  } catch (error) {
    logger.warn('Failed to test internet connectivity:', error.message);
    results.internet.reachable = false;
  }

  // 4. Tester la résolution DNS
  try {
    const testDomain = 'google.com';
    results.dns.tested_domain = testDomain;
    const dnsStart = Date.now();

    try {
      const { stdout: dnsOutput } = await execAsync(`getent hosts ${testDomain} | head -n1`);
      results.dns.working = true;
      results.dns.resolution_time_ms = Date.now() - dnsStart;
      const ipMatch = dnsOutput.match(/^([\d.]+)/);
      if (ipMatch) {
        results.dns.resolved_ip = ipMatch[1];
      }
    } catch {
      // Fallback avec nslookup
      const { stdout: nsOutput } = await execAsync(`nslookup ${testDomain} 2>/dev/null | grep -A1 "Name:" | grep "Address" | head -n1`);
      results.dns.working = true;
      results.dns.resolution_time_ms = Date.now() - dnsStart;
      const ipMatch = nsOutput.match(/([\d.]+)/);
      if (ipMatch) {
        results.dns.resolved_ip = ipMatch[1];
      }
    }
  } catch {
    results.dns.working = false;
  }

  // 5. Tester la connectivité vers le serveur central
  try {
    const centralUrl = config.central.url;
    if (centralUrl) {
      const url = new URL(centralUrl);
      const hostname = url.hostname;
      const isHttps = url.protocol === 'https:';

      // Test ping
      try {
        const pingStart = Date.now();
        await execAsync(`ping -c 1 -W 3 ${hostname}`);
        results.central_server.latency_ms = Date.now() - pingStart;
      } catch {
        // ICMP peut être bloqué
      }

      // Test port 443
      if (isHttps) {
        try {
          await execAsync(`timeout 5 bash -c "echo > /dev/tcp/${hostname}/443" 2>/dev/null || nc -z -w 5 ${hostname} 443 2>/dev/null`);
          results.central_server.port_443_open = true;
        } catch {
          results.central_server.port_443_open = false;
        }
      }

      // Test HTTP
      try {
        const curlStart = Date.now();
        const { stdout: curlOutput } = await execAsync(
          `curl -s -o /dev/null -w "%{http_code}|%{time_total}|%{ssl_verify_result}" --connect-timeout 10 ${centralUrl}/health 2>/dev/null || echo "000|0|1"`
        );
        results.central_server.http_latency_ms = Date.now() - curlStart;

        const [httpCode, timeTotal, sslResult] = curlOutput.trim().split('|');
        results.central_server.http_status = parseInt(httpCode) || null;
        results.central_server.reachable = parseInt(httpCode) >= 200 && parseInt(httpCode) < 500;

        if (isHttps) {
          results.central_server.ssl_valid = sslResult === '0';
        }
      } catch {
        results.central_server.reachable = false;
      }
    }
  } catch (error) {
    logger.warn('Failed to test central server connectivity:', error.message);
  }

  // 6. Récupérer les infos WiFi
  try {
    const { stdout: iwconfig } = await execAsync('iwconfig 2>/dev/null || true');
    if (iwconfig && !iwconfig.includes('no wireless extensions')) {
      const ssidMatch = iwconfig.match(/ESSID:"([^"]+)"/);
      const qualityMatch = iwconfig.match(/Link Quality=(\d+)\/(\d+)/);
      const signalMatch = iwconfig.match(/Signal level=(-?\d+)/);
      const bitrateMatch = iwconfig.match(/Bit Rate[=:](\d+(?:\.\d+)?)\s*Mb\/s/);

      if (ssidMatch || qualityMatch || signalMatch) {
        results.wifi = {
          connected: !!ssidMatch,
          ssid: ssidMatch ? ssidMatch[1] : null,
          quality_percent: qualityMatch ? Math.round((parseInt(qualityMatch[1]) / parseInt(qualityMatch[2])) * 100) : null,
          signal_dbm: signalMatch ? parseInt(signalMatch[1]) : null,
          bitrate_mbps: bitrateMatch ? parseFloat(bitrateMatch[1]) : null,
        };
      }
    }
  } catch (error) {
    logger.debug('WiFi info not available:', error.message);
  }

  // 7. Stabilité réseau
  try {
    const activeInterface = results.interfaces.find(i => i.operstate === 'up' && i.ip4);
    if (activeInterface) {
      // carrier_changes compte les up/down
      try {
        const { stdout: carrierChanges } = await execAsync(`cat /sys/class/net/${activeInterface.name}/carrier_changes 2>/dev/null || echo "0"`);
        const changes = parseInt(carrierChanges.trim()) || 0;
        results.stability.reconnections_24h = Math.floor(changes / 2);
      } catch {
        // Pas grave
      }

      // Uptime système
      try {
        const { stdout: uptimeOutput } = await execAsync('cat /proc/uptime');
        const systemUptime = parseFloat(uptimeOutput.split(' ')[0]);
        results.stability.interface_uptime_seconds = Math.round(systemUptime);
      } catch {
        // Pas grave
      }
    }
  } catch (error) {
    logger.debug('Failed to get stability info:', error.message);
  }

  // 8. Stats de reconnexion du sync-agent
  try {
    const connectionStatus = require('../services/connection-status');
    const status = connectionStatus.getStatus();
    if (status && status.reconnectAttempts !== undefined) {
      results.stability.reconnections_24h = status.reconnectAttempts;
    }
  } catch {
    // Module peut ne pas être disponible
  }

  logger.info('Network diagnostics completed', {
    internet: results.internet.reachable,
    packetLoss: results.internet.packet_loss_percent,
    central: results.central_server.reachable,
    httpStatus: results.central_server.http_status,
    dns: results.dns.working,
    gateway: results.gateway.reachable,
  });

  return results;
}

module.exports = networkDiagnostics;
