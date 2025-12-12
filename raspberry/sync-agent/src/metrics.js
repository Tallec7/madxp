const si = require('systeminformation');
const os = require('os');
const logger = require('./logger');

class MetricsCollector {
  async collectAll() {
    try {
      const [cpu, memory, temperature, disk, localIp] = await Promise.all([
        this.getCpuUsage(),
        this.getMemoryUsage(),
        this.getTemperature(),
        this.getDiskUsage(),
        this.getLocalIp(),
      ]);

      return {
        cpu,
        memory,
        temperature,
        disk,
        uptime: os.uptime(),
        localIp,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Error collecting metrics:', error);
      return null;
    }
  }

  async getLocalIp() {
    try {
      const interfaces = await si.networkInterfaces();
      // Chercher une interface avec une IP locale (pas loopback)
      // Priorité: eth0/enp* (ethernet) > wlan0 (wifi)
      const ethernetIface = interfaces.find(
        iface => (iface.iface.startsWith('eth') || iface.iface.startsWith('enp'))
          && iface.ip4 && !iface.ip4.startsWith('127.')
      );
      if (ethernetIface) {
        return ethernetIface.ip4;
      }

      const wifiIface = interfaces.find(
        iface => iface.iface.startsWith('wlan')
          && iface.ip4 && !iface.ip4.startsWith('127.')
      );
      if (wifiIface) {
        return wifiIface.ip4;
      }

      // Fallback: première interface avec une IP non-loopback
      const anyIface = interfaces.find(
        iface => iface.ip4 && !iface.ip4.startsWith('127.')
      );
      return anyIface?.ip4 || null;
    } catch (error) {
      logger.error('Error getting local IP:', error);
      return null;
    }
  }

  async getCpuUsage() {
    try {
      const load = await si.currentLoad();
      return parseFloat(load.currentLoad.toFixed(1));
    } catch (error) {
      logger.error('Error getting CPU usage:', error);
      return 0;
    }
  }

  async getMemoryUsage() {
    try {
      const mem = await si.mem();
      const usedPercent = (mem.used / mem.total) * 100;
      return parseFloat(usedPercent.toFixed(1));
    } catch (error) {
      logger.error('Error getting memory usage:', error);
      return 0;
    }
  }

  async getTemperature() {
    try {
      const temp = await si.cpuTemperature();
      return parseFloat((temp.main || temp.cores?.[0] || 0).toFixed(1));
    } catch (error) {
      return 0;
    }
  }

  async getDiskUsage() {
    try {
      const disks = await si.fsSize();
      const rootDisk = disks.find(d => d.mount === '/') || disks[0];
      if (rootDisk) {
        return parseFloat(rootDisk.use.toFixed(1));
      }
      return 0;
    } catch (error) {
      logger.error('Error getting disk usage:', error);
      return 0;
    }
  }

  async getNetworkStatus() {
    try {
      const [interfaces, connections] = await Promise.all([
        si.networkInterfaces(),
        si.networkConnections(),
      ]);

      return {
        interfaces: interfaces.map(iface => ({
          name: iface.iface,
          ip4: iface.ip4,
          ip6: iface.ip6,
          mac: iface.mac,
          type: iface.type,
        })),
        activeConnections: connections.length,
      };
    } catch (error) {
      logger.error('Error getting network status:', error);
      return null;
    }
  }

  async getSystemInfo() {
    try {
      const [system, cpu, osInfo, memory, interfaces, raspberry] = await Promise.all([
        si.system(),
        si.cpu(),
        si.osInfo(),
        si.mem(),
        si.networkInterfaces(),
        si.get({ raspberry: 'revision,serial' }).catch(() => null),
      ]);

      const networkInterfaces = interfaces || [];

      const primaryInterface =
        networkInterfaces.find(iface =>
          (iface.iface.startsWith('eth') || iface.iface.startsWith('enp')) &&
          iface.ip4 && !iface.ip4.startsWith('127.')
        ) ||
        networkInterfaces.find(iface =>
          iface.iface.startsWith('wlan') &&
          iface.ip4 && !iface.ip4.startsWith('127.')
        ) ||
        networkInterfaces.find(iface => iface.ip4 && !iface.ip4.startsWith('127.')) ||
        networkInterfaces.find(iface => iface.ip6 && !iface.ip6.startsWith('::1')) ||
        networkInterfaces[0];

      const osName = [osInfo?.distro, osInfo?.release].filter(Boolean).join(' ')
        || osInfo?.platform
        || null;

      return {
        hostname: os.hostname(),
        os: osName,
        kernel: osInfo?.kernel || null,
        architecture: osInfo?.arch || os.arch(),
        cpu_model: cpu?.brand || cpu?.manufacturer || null,
        cpu_cores: cpu?.cores || null,
        total_memory: memory?.total || null,
        ip_address: primaryInterface?.ip4 || primaryInterface?.ip6 || null,
        mac_address: primaryInterface?.mac || null,
        // Champs détaillés conservés pour la compatibilité/diagnostics
        manufacturer: system.manufacturer,
        model: system.model,
        version: system.version,
        cpu: {
          manufacturer: cpu.manufacturer,
          brand: cpu.brand,
          speed: cpu.speed,
          cores: cpu.cores,
        },
        os_details: osInfo,
        network_interfaces: networkInterfaces,
        raspberry: raspberry,
      };
    } catch (error) {
      logger.error('Error getting system info:', error);
      return null;
    }
  }
}

module.exports = new MetricsCollector();
