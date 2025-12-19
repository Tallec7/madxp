const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const logger = require('../logger');
const { config } = require('../config');
const { getVersionInfo } = require('../utils/version-info');

const execAsync = util.promisify(exec);

class SoftwareUpdateHandler {
  constructor() {
    this.previousVersion = null;
  }

  async execute(data, progressCallback) {
    const { updateUrl, version, checksum, packageSize } = data;

    logger.info('Starting software update', { version });

    try {
      progressCallback(2);

      // Sauvegarder la version actuelle pour le rapport
      this.previousVersion = await this.getCurrentVersion();

      // Vérifications pré-mise à jour
      await this.preUpdateChecks(packageSize || 100 * 1024 * 1024); // Default 100MB

      progressCallback(5);

      const packagePath = `/tmp/neopro-update-${version}.tar.gz`;

      await this.downloadPackage(updateUrl, packagePath, (progress) => {
        progressCallback(5 + progress * 0.3);
      });

      progressCallback(35);

      if (checksum) {
        await this.verifyChecksum(packagePath, checksum);
      }

      progressCallback(40);

      await this.createBackup();

      progressCallback(45);

      // Notifier l'utilisateur avant l'arrêt des services
      await this.notifyUpcomingRestart('Mise à jour en cours. Les services vont redémarrer dans 10 secondes...');
      await new Promise(resolve => setTimeout(resolve, 10000)); // Attendre 10 secondes

      progressCallback(50);

      await this.stopServices();

      progressCallback(60);

      await this.extractAndInstall(packagePath);

      progressCallback(80);

      await this.startServices();

      progressCallback(90);

      const newVersion = await this.getCurrentVersion(true);

      progressCallback(95);

      // Générer le rapport post-mise à jour
      const report = await this.generatePostUpdateReport(newVersion);

      progressCallback(100);

      logger.info('Software update completed successfully', { newVersion, report });

      return {
        success: true,
        version: newVersion,
        previousVersion: this.previousVersion,
        report,
      };
    } catch (error) {
      logger.error('Software update failed:', error);

      try {
        await this.rollback();
      } catch (rollbackError) {
        logger.error('Rollback failed:', rollbackError);
      }

      throw error;
    }
  }

  async downloadPackage(url, targetPath, progressCallback) {
    try {
      logger.info('Downloading update package', { url });

      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout: 1800000,
        maxContentLength: config.security.maxDownloadSize,
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = progressEvent.loaded / progressEvent.total;
            if (progressCallback) {
              progressCallback(progress);
            }
          }
        },
      });

      const writer = fs.createWriteStream(targetPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } catch (error) {
      logger.error('Package download failed:', error);
      throw new Error(`Failed to download update package: ${error.message}`);
    }
  }

  async verifyChecksum(filePath, expectedChecksum) {
    try {
      const { stdout } = await execAsync(`sha256sum ${filePath}`);
      const actualChecksum = stdout.split(' ')[0];

      if (actualChecksum !== expectedChecksum) {
        throw new Error('Checksum verification failed');
      }

      logger.info('Checksum verified successfully');
    } catch (error) {
      logger.error('Checksum verification failed:', error);
      throw error;
    }
  }

  async createBackup() {
    try {
      logger.info('Creating backup before update');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(config.paths.backup, `backup-${timestamp}`);

      await fs.ensureDir(backupDir);

      const itemsToBackup = [
        'webapp',
        'server',
        'admin',
      ];

      for (const item of itemsToBackup) {
        const sourcePath = path.join(config.paths.root, item);
        const targetPath = path.join(backupDir, item);

        if (await fs.pathExists(sourcePath)) {
          await fs.copy(sourcePath, targetPath);
        }
      }

      await this.cleanOldBackups();

      logger.info('Backup created successfully', { backupDir });

      return backupDir;
    } catch (error) {
      logger.error('Backup creation failed:', error);
      throw error;
    }
  }

  async cleanOldBackups() {
    try {
      const backupDir = config.paths.backup;
      const backups = await fs.readdir(backupDir);

      const backupDirs = [];
      for (const dir of backups) {
        const fullPath = path.join(backupDir, dir);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          backupDirs.push({ path: fullPath, mtime: stat.mtime });
        }
      }

      backupDirs.sort((a, b) => b.mtime - a.mtime);

      if (backupDirs.length > 5) {
        for (let i = 5; i < backupDirs.length; i++) {
          await fs.remove(backupDirs[i].path);
          logger.info('Old backup removed', { path: backupDirs[i].path });
        }
      }
    } catch (error) {
      logger.warn('Failed to clean old backups:', error);
    }
  }

  async stopServices() {
    try {
      logger.info('Stopping services');

      // Note: neopro-sync-agent is NOT stopped here because it's running this code
      // It will be restarted at the end via startServices()
      const services = ['neopro-app', 'neopro-admin'];

      for (const service of services) {
        try {
          await execAsync(`sudo systemctl stop ${service}`);
          logger.info(`Service stopped: ${service}`);
        } catch (error) {
          logger.warn(`Failed to stop service ${service}:`, error.message);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      logger.error('Failed to stop services:', error);
      throw error;
    }
  }

  async extractAndInstall(packagePath) {
    try {
      logger.info('Extracting and installing update');

      // Exclude user data directories and configuration from extraction
      // These should never be overwritten by software updates:
      // - videos/: user video content (managed by deploy-video.js)
      // - logs/: runtime logs
      // - backups/: backup archives
      // - webapp/configuration.json: club-specific configuration
      await execAsync(
        `tar -xzf ${packagePath} -C ${config.paths.root}/ ` +
        `--exclude='videos' --exclude='logs' --exclude='backups' ` +
        `--exclude='webapp/configuration.json'`
      );

      if (await fs.pathExists(path.join(config.paths.root, 'webapp/package.json'))) {
        await execAsync(`cd ${config.paths.root}/webapp && npm install --production`);
      }

      if (await fs.pathExists(path.join(config.paths.root, 'server/package.json'))) {
        await execAsync(`cd ${config.paths.root}/server && npm install --production`);
      }

      logger.info('Update installed successfully');
    } catch (error) {
      logger.error('Installation failed:', error);
      throw error;
    }
  }

  async startServices() {
    try {
      logger.info('Starting services');

      const services = ['neopro-app', 'neopro-admin'];

      for (const service of services) {
        try {
          await execAsync(`sudo systemctl start ${service}`);
          logger.info(`Service started: ${service}`);
        } catch (error) {
          logger.warn(`Failed to start service ${service}:`, error.message);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 5000));

      for (const service of services) {
        try {
          const { stdout } = await execAsync(`sudo systemctl is-active ${service}`);
          if (stdout.trim() !== 'active') {
            throw new Error(`Service ${service} is not active after restart`);
          }
        } catch (error) {
          logger.error(`Service health check failed for ${service}:`, error);
          throw error;
        }
      }

      logger.info('All services started and healthy');

      // Schedule sync-agent restart to apply any updates to itself
      // Use spawn with detached to allow the current process to exit
      logger.info('Scheduling sync-agent restart in 5 seconds...');
      const { spawn } = require('child_process');
      setTimeout(() => {
        spawn('sudo', ['systemctl', 'restart', 'neopro-sync-agent'], {
          detached: true,
          stdio: 'ignore'
        }).unref();
      }, 5000);
    } catch (error) {
      logger.error('Failed to start services:', error);
      throw error;
    }
  }

  async getCurrentVersion(forceRefresh = false) {
    try {
      const info = await getVersionInfo(forceRefresh);
      return info.version || 'unknown';
    } catch (error) {
      logger.warn('Failed to get current version:', error);
      return 'unknown';
    }
  }

  async rollback() {
    try {
      logger.warn('Attempting rollback to previous version');

      const backupDir = config.paths.backup;
      const backups = await fs.readdir(backupDir);

      if (backups.length === 0) {
        throw new Error('No backups available for rollback');
      }

      const latestBackup = backups.sort().reverse()[0];
      const backupPath = path.join(backupDir, latestBackup);

      await this.stopServices();

      const itemsToRestore = ['webapp', 'server', 'admin'];

      for (const item of itemsToRestore) {
        const sourcePath = path.join(backupPath, item);
        const targetPath = path.join(config.paths.root, item);

        if (await fs.pathExists(sourcePath)) {
          await fs.remove(targetPath);
          await fs.copy(sourcePath, targetPath);
        }
      }

      await this.startServices();

      logger.info('Rollback completed successfully');
    } catch (error) {
      logger.error('Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Vérifications pré-mise à jour
   * @param {number} packageSize Taille estimée du package en bytes
   * @returns {Promise<object>} Résultat des vérifications
   */
  async preUpdateChecks(packageSize) {
    logger.info('Running pre-update checks');

    const checks = {
      diskSpace: { passed: false, available: 0, required: 0 },
      servicesHealthy: { passed: false, services: {} },
      noActiveSession: { passed: false },
    };

    // 1. Vérifier l'espace disque (besoin 3x la taille du package)
    try {
      const { stdout } = await execAsync("df -B1 /home/pi 2>/dev/null || df -B1 / | tail -1 | awk '{print $4}'");
      const availableBytes = parseInt(stdout.trim().split('\n').pop()) || 0;
      const requiredBytes = packageSize * 3;

      checks.diskSpace = {
        passed: availableBytes > requiredBytes,
        available: availableBytes,
        required: requiredBytes,
        availableMB: Math.round(availableBytes / (1024 * 1024)),
        requiredMB: Math.round(requiredBytes / (1024 * 1024)),
      };

      logger.info('Disk space check', checks.diskSpace);
    } catch (error) {
      logger.warn('Disk space check failed:', error.message);
      checks.diskSpace.passed = true; // Ne pas bloquer si on ne peut pas vérifier
    }

    // 2. Vérifier la santé des services
    const services = ['neopro-app', 'neopro-admin', 'nginx'];
    let allHealthy = true;

    for (const service of services) {
      try {
        const { stdout } = await execAsync(`systemctl is-active ${service} 2>/dev/null || echo 'unknown'`);
        const status = stdout.trim();
        checks.servicesHealthy.services[service] = status;

        if (status !== 'active' && status !== 'unknown') {
          allHealthy = false;
        }
      } catch {
        checks.servicesHealthy.services[service] = 'unknown';
      }
    }

    checks.servicesHealthy.passed = allHealthy;
    logger.info('Services health check', checks.servicesHealthy);

    // 3. Vérifier qu'il n'y a pas de session TV active
    try {
      const response = await axios.get('http://localhost:3000/api/status', { timeout: 2000 });
      checks.noActiveSession.passed = !response.data?.isPlaying;
      checks.noActiveSession.currentState = response.data?.isPlaying ? 'playing' : 'idle';
    } catch {
      // Si on ne peut pas vérifier, on considère que c'est OK
      checks.noActiveSession.passed = true;
      checks.noActiveSession.currentState = 'unknown';
    }

    logger.info('Active session check', checks.noActiveSession);

    // Valider les résultats critiques
    if (!checks.diskSpace.passed) {
      throw new Error(`Espace disque insuffisant: ${checks.diskSpace.availableMB}MB disponibles, ${checks.diskSpace.requiredMB}MB requis`);
    }

    return checks;
  }

  /**
   * Génère un rapport post-mise à jour
   * @param {string} newVersion Nouvelle version installée
   * @returns {Promise<object>} Rapport détaillé
   */
  async generatePostUpdateReport(newVersion) {
    const report = {
      timestamp: new Date().toISOString(),
      previousVersion: this.previousVersion,
      newVersion,
      servicesStatus: {},
      diskUsage: null,
      errors: [],
      healthy: true,
    };

    // Vérifier chaque service
    const services = ['neopro-app', 'neopro-admin', 'neopro-sync-agent', 'nginx'];

    for (const service of services) {
      try {
        const { stdout } = await execAsync(`systemctl is-active ${service} 2>/dev/null || echo 'unknown'`);
        report.servicesStatus[service] = stdout.trim();

        if (stdout.trim() === 'failed') {
          report.errors.push(`Service ${service} failed to start`);
          report.healthy = false;
        }
      } catch (error) {
        report.servicesStatus[service] = 'error';
        report.errors.push(`Could not check ${service}: ${error.message}`);
      }
    }

    // Récupérer l'utilisation disque
    try {
      const { stdout } = await execAsync("df -h /home/pi 2>/dev/null || df -h / | tail -1");
      const parts = stdout.trim().split(/\s+/);
      report.diskUsage = {
        total: parts[1],
        used: parts[2],
        available: parts[3],
        percent: parts[4],
      };
    } catch {
      report.diskUsage = { error: 'Could not get disk usage' };
    }

    // Vérifier que l'application répond
    try {
      await axios.get('http://localhost:3000/api/health', { timeout: 5000 });
      report.appResponding = true;
    } catch {
      report.appResponding = false;
      report.errors.push('Application not responding on port 3000');
      report.healthy = false;
    }

    logger.info('Post-update report generated', report);

    return report;
  }

  /**
   * Notifie l'interface utilisateur d'un redémarrage imminent
   * @param {string} message Message à afficher
   * @param {number} durationMs Durée d'affichage en ms (optionnel)
   */
  async notifyUpcomingRestart(message, durationMs = 10000) {
    try {
      const io = require('socket.io-client');
      const socket = io('http://localhost:3000', {
        timeout: 5000,
        reconnection: false,
      });

      return new Promise((resolve) => {
        socket.on('connect', () => {
          socket.emit('system_notification', {
            type: 'warning',
            title: 'Mise à jour système',
            message,
            duration: durationMs,
            dismissible: false,
          });

          logger.info('User notified of upcoming restart', { message });

          // Donner le temps au message d'être reçu
          setTimeout(() => {
            socket.close();
            resolve();
          }, 1000);
        });

        socket.on('connect_error', (error) => {
          logger.warn('Could not notify user of restart (app may be down):', error.message);
          socket.close();
          resolve(); // Ne pas bloquer la mise à jour
        });

        // Timeout si pas de connexion après 3 secondes
        setTimeout(() => {
          if (!socket.connected) {
            logger.warn('Timeout connecting to local socket for notification');
            socket.close();
            resolve();
          }
        }, 3000);
      });
    } catch (error) {
      logger.warn('Failed to notify user of restart:', error.message);
      // Ne pas bloquer la mise à jour en cas d'erreur
    }
  }
}

module.exports = new SoftwareUpdateHandler();
