// @ts-check
/** @typedef {import('./types').SystemMetrics} SystemMetrics */

/**
 * MetricsCollector — Orchestrator
 *
 * Delegates to sub-modules (ADR-044):
 * - metrics/hardware-metrics.js  — CPU, memory, temp, disk, GPU, fan, network, system info
 * - metrics/display-metrics.js   — EDID, display info, CEC status
 * - metrics/service-metrics.js   — systemd services, orphan detection, kiosk status
 *
 * @version 2.37.0
 */

const logger = require('./logger');

// Sub-modules (ADR-044)
const hardware = require('./metrics/hardware-metrics');
const display = require('./metrics/display-metrics');
const services = require('./metrics/service-metrics');

class MetricsCollector {
  constructor() {
    // Caches are now managed by sub-modules at module scope.
    // The constructor is kept for backward compatibility.
  }

  // =========================================================================
  // HARDWARE (delegate to hardware-metrics.js)
  // =========================================================================

  detectPiModel() { return hardware.detectPiModel(); }
  /** @returns {Promise<SystemMetrics>} */
  collectAll() { return hardware.collectAll(); }
  getCpuUsage() { return hardware.getCpuUsage(); }
  getMemoryUsage() { return hardware.getMemoryUsage(); }
  getTemperature() { return hardware.getTemperature(); }
  getDiskUsage() { return hardware.getDiskUsage(); }
  getLocalIp() { return hardware.getLocalIp(); }
  getWifiStatus() { return hardware.getWifiStatus(); }
  getNetworkStatus() { return hardware.getNetworkStatus(); }
  getSystemInfo() { return hardware.getSystemInfo(); }
  getFanStatus() { return hardware.getFanStatus(); }
  getFilesystemHealth() { return hardware.getFilesystemHealth(); }
  getGpuInfo() { return hardware.getGpuInfo(); }

  // =========================================================================
  // DISPLAY (delegate to display-metrics.js)
  // =========================================================================

  // Allow tests to reset the display cache via `metricsCollector._displayInfoCache = null`
  set _displayInfoCache(_v) { display._resetCache(); }
  set _displayInfoCacheTime(_v) { /* handled by _resetCache */ }

  _findEdidPath(portFilter) { return display.findEdidPath(portFilter); }
  _parseEdid(edidBuffer) { return display.parseEdid(edidBuffer); }
  _runEdidDecode(edidPath) { return display.runEdidDecode(edidPath); }
  _parseEdidDecodeOutput(output) { return display.parseEdidDecodeOutput(output); }
  _inferDisplayCategory(model, displayType, edidDetailed, manufacturer) {
    return display.inferDisplayCategory(model, displayType, edidDetailed, manufacturer);
  }
  getDisplayInfo() { return display.getDisplayInfo(); }
  getSecondaryDisplayInfo() { return display.getSecondaryDisplayInfo(); }
  getHdmiCecStatus() { return display.getHdmiCecStatus(); }

  // =========================================================================
  // SERVICES (delegate to service-metrics.js)
  // =========================================================================

  getServicesStatus() { return services.getServicesStatus(); }
  getOrphanServices() { return services.getOrphanServices(); }
  getFailedServices() { return services.getFailedServices(); }
  getKioskStatus() { return services.getKioskStatus(); }
  getDependenciesStatus() { return services.getDependenciesStatus(); }

  // =========================================================================
  // HEALTH STATUS (orchestrates all sub-modules)
  // =========================================================================

  /**
   * Récupère un rapport de santé complet du système
   * Utilisé par la commande get_health_status
   */
  async getHealthStatus() {
    try {
      const [metrics, gpuInfo, svcList, systemInfo, hdmiCecStatus, displayInfo, fanStatus, secondaryDisplayInfo, orphanServices] = await Promise.all([
        this.collectAll(),
        this.getGpuInfo(),
        this.getServicesStatus(),
        this.getSystemInfo(),
        this.getHdmiCecStatus(),
        this.getDisplayInfo(),
        this.getFanStatus(),
        this.getSecondaryDisplayInfo(),
        this.getOrphanServices(),
      ]);

      // Affiner le type d'écran en croisant EDID + CEC
      if (displayInfo.display_type === 'unknown') {
        if (hdmiCecStatus.devices_found > 0) {
          displayInfo.display_type = 'tv';
        } else if (hdmiCecStatus.cec_available && hdmiCecStatus.devices_found === 0 && displayInfo.connected) {
          displayInfo.display_type = 'monitor';
        }
      }

      // Inférer la catégorie d'écran (tv_oled, tv_led, monitor, projector, etc.)
      displayInfo.display_category = this._inferDisplayCategory(
        displayInfo.model, displayInfo.display_type, displayInfo.edid_detailed, displayInfo.manufacturer
      );

      // Inférer la catégorie du secondaire (pas de CEC — CEC = primaire uniquement sur Pi)
      if (secondaryDisplayInfo.connected) {
        secondaryDisplayInfo.display_category = this._inferDisplayCategory(
          secondaryDisplayInfo.model, secondaryDisplayInfo.display_type, secondaryDisplayInfo.edid_detailed, secondaryDisplayInfo.manufacturer
        );
      }

      // Calculer un score de santé global
      let healthScore = 100;
      const issues = [];

      // GPU Memory (critique sur Pi 4, ignoré sur Pi 5)
      if (gpuInfo.gpu_mem_mb !== null && gpuInfo.gpu_mem_mb < 128 && !gpuInfo.is_pi5) {
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

      // Ventilateur (alerter uniquement si installé et arrêté à haute température)
      if (fanStatus.present && metrics && metrics.temperature > 70 && fanStatus.curState === 0) {
        healthScore -= 15;
        issues.push({
          severity: 'warning',
          component: 'Fan',
          message: `Ventilateur arrêté alors que la température est de ${metrics.temperature}°C`,
          fix: 'Vérifier la connexion du ventilateur ou les paramètres de refroidissement',
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
      const criticalServices = ['neopro-app', 'neopro-sync-agent', 'neopro-kiosk', 'nginx'];
      for (const svc of svcList) {
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

      // Kiosk Chromium check
      const kioskStatus = await this.getKioskStatus();
      if (kioskStatus) {
        if (!kioskStatus.chromiumAlive) {
          healthScore -= 20;
          issues.push({
            severity: 'critical',
            component: 'Kiosk',
            message: 'Chromium non actif — la TV n\'affiche rien',
            fix: 'sudo systemctl restart neopro-kiosk',
          });
        }
        if (kioskStatus.restartCount > 3) {
          healthScore -= 10;
          issues.push({
            severity: 'warning',
            component: 'Kiosk',
            message: `Chromium a redémarré ${kioskStatus.restartCount} fois récemment (instabilité GPU)`,
            fix: 'Vérifier les logs GPU: journalctl -u neopro-kiosk -n 50',
          });
        }
        if (kioskStatus.lxpanelKillCount > 0) {
          issues.push({
            severity: 'warning',
            component: 'Kiosk',
            message: `lxpanel tuée ${kioskStatus.lxpanelKillCount} fois (barre de tâches parasite)`,
            fix: 'Vérifier autostart LXDE: grep lxpanel ~/.config/lxsession/LXDE-pi/autostart — doit être absent',
          });
        }
        if (kioskStatus.gpuDecodeMode === 'software') {
          healthScore -= 5;
          issues.push({
            severity: 'warning',
            component: 'Kiosk',
            message: 'GPU decode en mode software (hardware V4L2 crashé — coil whine PMIC possible)',
            fix: 'Redémarrer le boîtier pour re-tenter le hardware decode. Si récurrent, vérifier version Chromium (128+ requis) et V4L2: v4l2-ctl --list-devices',
          });
        }
      }

      // Dépendances Node.js
      try {
        const depsStatus = await this.getDependenciesStatus();
        for (const dep of depsStatus) {
          if (dep.status === 'error' && dep.missing.length > 0) {
            healthScore -= 20;
            issues.push({
              severity: 'critical',
              component: 'Dependencies',
              message: `${dep.module}: dépendances manquantes: ${dep.missing.join(', ')}`,
              fix: `cd /home/pi/neopro/${dep.module} && npm install --production`,
            });
          }
        }
      } catch {
        // Non-bloquant
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

      // HDMI Failover
      if (kioskStatus && kioskStatus.hdmiFailoverActive) {
        healthScore -= 15;
        issues.push({
          severity: 'warning',
          component: 'HDMI',
          message: 'HDMI-0 déconnecté — failover actif sur HDMI-1',
          fix: 'Vérifier le câble HDMI sur le port HDMI-0 (le plus proche du USB-C)',
        });
      }

      // HDMI-CEC / TV Status
      const isMonitor = displayInfo.display_type === 'monitor';
      if (hdmiCecStatus.cec_available && !hdmiCecStatus.tv_connected && !isMonitor) {
        issues.push({
          severity: 'warning',
          component: 'HDMI-CEC',
          message: 'TV non détectée via HDMI-CEC',
          fix: 'Vérifier le câble HDMI et que la TV supporte CEC',
        });
      } else if (hdmiCecStatus.tv_power === 'standby') {
        issues.push({
          severity: 'warning',
          component: 'HDMI-CEC',
          message: 'TV en veille',
          fix: 'La TV est en veille - les vidéos ne sont pas visibles',
        });
      }

      // Orphan systemd services
      if (orphanServices.length > 0) {
        healthScore -= 5;
        for (const orphan of orphanServices) {
          issues.push({
            severity: 'warning',
            component: 'SystemdOrphan',
            message: `Service orphelin ${orphan.name} (${orphan.status}, ${orphan.restarts} restarts)`,
            fix: `sudo systemctl disable --now ${orphan.name} && sudo rm -f /etc/systemd/system/${orphan.name}.service && sudo systemctl daemon-reload`,
          });
        }
      }

      return {
        success: true,
        timestamp: new Date().toISOString(),
        healthScore: Math.max(0, healthScore),
        healthStatus: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'critical',
        issues,
        gpu: gpuInfo,
        fanStatus,
        services: svcList,
        orphanServices: orphanServices.length > 0 ? orphanServices : undefined,
        metrics,
        hdmiCecStatus,
        displayInfo,
        secondaryDisplayInfo: secondaryDisplayInfo.connected ? secondaryDisplayInfo : undefined,
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
