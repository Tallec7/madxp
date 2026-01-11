const si = require('systeminformation');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const logger = require('./logger');

const execAsync = util.promisify(exec);

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
      // Utiliser (total - available) pour exclure le buff/cache Linux
      // mem.used inclut le cache, ce qui donne des valeurs trompeuses (ex: 88% alors que 73% est disponible)
      const actualUsed = mem.total - mem.available;
      const usedPercent = (actualUsed / mem.total) * 100;
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

  /**
   * Récupère les informations GPU spécifiques au Raspberry Pi via vcgencmd
   * Critique pour diagnostiquer les crashs Chromium (Aw, Snap!)
   */
  async getGpuInfo() {
    const gpuInfo = {
      gpu_mem_mb: null,
      gpu_mem_warning: false,
      temperature: null,
      temperature_warning: false,
      throttled: null,
      throttled_flags: [],
      voltage_ok: true,
      frequency_capped: false,
      throttling_active: false,
    };

    try {
      // GPU Memory (critique - doit être >= 128M, recommandé 256M)
      try {
        const { stdout: gpuMemOutput } = await execAsync('vcgencmd get_mem gpu 2>/dev/null');
        const match = gpuMemOutput.match(/gpu=(\d+)M/);
        if (match) {
          gpuInfo.gpu_mem_mb = parseInt(match[1]);
          gpuInfo.gpu_mem_warning = gpuInfo.gpu_mem_mb < 128;
        }
      } catch {
        // vcgencmd peut ne pas être disponible (non-Raspberry Pi)
      }

      // Température GPU
      try {
        const { stdout: tempOutput } = await execAsync('vcgencmd measure_temp 2>/dev/null');
        const tempMatch = tempOutput.match(/temp=([\d.]+)/);
        if (tempMatch) {
          gpuInfo.temperature = parseFloat(tempMatch[1]);
          gpuInfo.temperature_warning = gpuInfo.temperature > 80;
        }
      } catch {
        // Fallback sur la température CPU si vcgencmd échoue
      }

      // Throttling status (crucial pour diagnostiquer les problèmes d'alimentation)
      try {
        const { stdout: throttledOutput } = await execAsync('vcgencmd get_throttled 2>/dev/null');
        const throttledMatch = throttledOutput.match(/throttled=(0x[0-9a-fA-F]+)/);
        if (throttledMatch) {
          gpuInfo.throttled = throttledMatch[1];
          const throttledValue = parseInt(throttledMatch[1], 16);

          // Décoder les flags de throttling
          // Bits 0-3: actuellement actif, Bits 16-19: s'est produit depuis le boot
          if (throttledValue !== 0) {
            if (throttledValue & 0x1) gpuInfo.throttled_flags.push('Under-voltage detected');
            if (throttledValue & 0x2) gpuInfo.throttled_flags.push('ARM frequency capped');
            if (throttledValue & 0x4) gpuInfo.throttled_flags.push('Currently throttled');
            if (throttledValue & 0x8) gpuInfo.throttled_flags.push('Soft temperature limit active');
            if (throttledValue & 0x10000) gpuInfo.throttled_flags.push('Under-voltage has occurred');
            if (throttledValue & 0x20000) gpuInfo.throttled_flags.push('ARM frequency capping has occurred');
            if (throttledValue & 0x40000) gpuInfo.throttled_flags.push('Throttling has occurred');
            if (throttledValue & 0x80000) gpuInfo.throttled_flags.push('Soft temperature limit has occurred');

            gpuInfo.voltage_ok = !(throttledValue & 0x10001);
            gpuInfo.frequency_capped = !!(throttledValue & 0x20002);
            gpuInfo.throttling_active = !!(throttledValue & 0x40004);
          }
        }
      } catch {
        // vcgencmd peut ne pas être disponible
      }

      return gpuInfo;
    } catch (error) {
      logger.error('Error getting GPU info:', error);
      return gpuInfo;
    }
  }

  /**
   * Récupère l'état des services systemd critiques
   */
  async getServicesStatus() {
    const services = [
      { name: 'neopro-app', description: 'Socket.IO local (port 3000)' },
      { name: 'neopro-sync-agent', description: 'Synchronisation cloud' },
      { name: 'neopro-kiosk', description: 'Affichage TV (Chromium)' },
      { name: 'neopro-admin', description: 'Admin panel (port 8080)' },
      { name: 'nginx', description: 'Serveur web' },
      { name: 'hostapd', description: 'Hotspot WiFi' },
      { name: 'dnsmasq', description: 'DNS/DHCP hotspot' },
    ];

    const results = [];

    for (const service of services) {
      try {
        const { stdout } = await execAsync(`systemctl is-active ${service.name} 2>/dev/null || echo "inactive"`);
        const status = stdout.trim();

        let statusInfo = {
          name: service.name,
          description: service.description,
          status: status,
          active: status === 'active',
          failed: status === 'failed',
        };

        // Si le service est failed, récupérer le message d'erreur
        if (status === 'failed') {
          try {
            const { stdout: errorOutput } = await execAsync(
              `journalctl -u ${service.name} -n 3 --no-pager -q 2>/dev/null | tail -1`
            );
            statusInfo.lastError = errorOutput.trim() || null;
          } catch {
            statusInfo.lastError = null;
          }
        }

        results.push(statusInfo);
      } catch {
        results.push({
          name: service.name,
          description: service.description,
          status: 'unknown',
          active: false,
          failed: false,
        });
      }
    }

    return results;
  }

  /**
   * Récupère un rapport de santé complet du système
   * Utilisé par la commande get_health_status
   */
  async getHealthStatus() {
    try {
      const [metrics, gpuInfo, services, systemInfo] = await Promise.all([
        this.collectAll(),
        this.getGpuInfo(),
        this.getServicesStatus(),
        this.getSystemInfo(),
      ]);

      // Calculer un score de santé global
      let healthScore = 100;
      const issues = [];

      // GPU Memory (critique)
      if (gpuInfo.gpu_mem_mb !== null && gpuInfo.gpu_mem_mb < 128) {
        healthScore -= 30;
        issues.push({
          severity: 'critical',
          component: 'GPU',
          message: `Mémoire GPU insuffisante (${gpuInfo.gpu_mem_mb}M). Minimum requis: 128M, recommandé: 256M`,
          fix: 'Ajouter gpu_mem=256 dans /boot/config.txt et redémarrer',
        });
      }

      // Température
      if (gpuInfo.temperature !== null && gpuInfo.temperature > 80) {
        healthScore -= 20;
        issues.push({
          severity: 'warning',
          component: 'Temperature',
          message: `Température élevée: ${gpuInfo.temperature}°C`,
          fix: 'Améliorer la ventilation ou ajouter un dissipateur thermique',
        });
      }

      // Alimentation (throttling)
      if (!gpuInfo.voltage_ok) {
        healthScore -= 25;
        issues.push({
          severity: 'critical',
          component: 'Power',
          message: 'Sous-voltage détecté. Alimentation insuffisante.',
          fix: 'Utiliser un chargeur 5V/3A officiel',
        });
      }

      // Services critiques
      const criticalServices = ['neopro-app', 'neopro-sync-agent', 'nginx'];
      for (const svc of services) {
        if (criticalServices.includes(svc.name) && svc.failed) {
          healthScore -= 15;
          issues.push({
            severity: 'critical',
            component: 'Service',
            message: `Service ${svc.name} en échec`,
            fix: `sudo systemctl restart ${svc.name}`,
            lastError: svc.lastError,
          });
        }
      }

      // Mémoire système
      if (metrics && metrics.memory > 90) {
        healthScore -= 10;
        issues.push({
          severity: 'warning',
          component: 'Memory',
          message: `Utilisation mémoire élevée: ${metrics.memory}%`,
          fix: 'Redémarrer le boîtier pour libérer la mémoire',
        });
      }

      // Disque
      if (metrics && metrics.disk > 90) {
        healthScore -= 10;
        issues.push({
          severity: 'warning',
          component: 'Disk',
          message: `Espace disque faible: ${metrics.disk}% utilisé`,
          fix: 'Supprimer des vidéos inutilisées',
        });
      }

      return {
        success: true,
        timestamp: new Date().toISOString(),
        healthScore: Math.max(0, healthScore),
        healthStatus: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'critical',
        issues,
        gpu: gpuInfo,
        services,
        metrics,
        system: {
          hostname: systemInfo?.hostname,
          os: systemInfo?.os,
          uptime: metrics?.uptime,
          localIp: metrics?.localIp,
        },
      };
    } catch (error) {
      logger.error('Error getting health status:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

module.exports = new MetricsCollector();
