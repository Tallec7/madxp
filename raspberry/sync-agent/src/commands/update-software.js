/**
 * OTA Software Update — Orchestrator.
 *
 * Delegates to sub-modules (ADR-044):
 * - commands/ota-download.js  — package download with stall detection, checksum verification
 * - commands/ota-install.js   — extraction, file operations, systemd, version metadata
 *
 * Keeps: OtaStepTracker, SoftwareUpdateHandler (execute, backup, services, rollback, report).
 */

const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const logger = require('../logger');
const { config } = require('../config');
const { getVersionInfo } = require('../utils/version-info');

// Sub-modules (ADR-044)
const download = require('./ota-download');
const install = require('./ota-install');

const execAsync = util.promisify(exec);

/**
 * Tracks OTA steps with timing and status for structured deployment reporting.
 * Sent to the central server on completion for dashboard "Voir détail" panel.
 */
class OtaStepTracker {
  constructor() {
    this.steps = [];
    this._current = null;
  }

  start(name, label) {
    this._current = { name, label, startedAt: Date.now() };
  }

  end(status, detail) {
    if (!this._current) return;
    const step = {
      name: this._current.name,
      label: this._current.label,
      status,
      durationMs: Date.now() - this._current.startedAt,
    };
    if (detail) step.detail = detail;
    this.steps.push(step);
    this._current = null;
  }

  toJSON() {
    return this.steps;
  }
}

class SoftwareUpdateHandler {
  constructor() {
    this.previousVersion = null;
  }

  async execute(data, progressCallback) {
    const { updateUrl, version, checksum, packageSize, scheduleReboot, autoRollback } = data;
    this._scheduleReboot = !!scheduleReboot;

    logger.info('Starting software update', { version, scheduleReboot: !!scheduleReboot, autoRollback: autoRollback !== false });

    this.stepTracker = new OtaStepTracker();

    // Déduplication côté Pi : lock file pour empêcher les exécutions concurrentes
    const LOCK_FILE = '/tmp/neopro-update.lock';
    if (await fs.pathExists(LOCK_FILE)) {
      try {
        const stat = await fs.stat(LOCK_FILE);
        const ageMinutes = (Date.now() - stat.mtimeMs) / 60000;
        if (ageMinutes < 10) {
          logger.warn('Update already in progress, rejecting duplicate command', { lockAge: ageMinutes.toFixed(1) });
          return { success: true, skipped: true, reason: 'update_already_in_progress' };
        }
        logger.warn('Stale update lock found, removing', { ageMinutes: ageMinutes.toFixed(1) });
      } catch (statErr) {
        logger.warn('Failed to stat lock file, proceeding', { error: statErr.message });
      }
    }
    await fs.writeFile(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), version }));

    try {
      progressCallback(2);

      // Sauvegarder la version actuelle pour le rapport
      this.previousVersion = await this.getCurrentVersion();

      // Vérifications pré-mise à jour
      this.stepTracker.start('pre_checks', 'Vérifications pré-update');
      await this.preUpdateChecks(packageSize || 100 * 1024 * 1024); // Default 100MB
      this.stepTracker.end('ok');

      progressCallback(5);

      const packagePath = `/tmp/neopro-update-${version}.tar.gz`;

      this.stepTracker.start('download', 'Téléchargement package');
      const MAX_DOWNLOAD_RETRIES = 3;
      let downloadRetries = 0;
      for (let downloadAttempt = 1; downloadAttempt <= MAX_DOWNLOAD_RETRIES; downloadAttempt++) {
        try {
          await download.downloadPackage(updateUrl, packagePath, (progress) => {
            progressCallback(5 + progress * 0.3);
          });
          break; // Download succeeded
        } catch (dlError) {
          downloadRetries++;
          const isStall = dlError.message && dlError.message.includes('stalled');
          logger.warn('Download attempt failed', {
            attempt: downloadAttempt,
            maxRetries: MAX_DOWNLOAD_RETRIES,
            isStall,
            error: dlError.message,
          });
          await fs.remove(packagePath).catch(() => {});
          if (downloadAttempt >= MAX_DOWNLOAD_RETRIES) {
            this.stepTracker.end('fail', `${MAX_DOWNLOAD_RETRIES} tentatives échouées`);
            throw new Error(`Download failed after ${MAX_DOWNLOAD_RETRIES} attempts: ${dlError.message}`);
          }
          // Wait before retry (progressive: 5s, 10s, 15s)
          const retryDelay = downloadAttempt * 5000;
          logger.info('Retrying download after delay', { retryDelay, nextAttempt: downloadAttempt + 1 });
          await new Promise(r => setTimeout(r, retryDelay));
        }
      }
      this.stepTracker.end('ok', downloadRetries > 0 ? `${downloadRetries} retry(s)` : undefined);

      progressCallback(35);

      if (checksum) {
        this.stepTracker.start('checksum', 'Vérification checksum');
        const verified = await download.verifyChecksumWithRetry(packagePath, checksum, packageSize, {
          updateUrl,
          progressCallback,
        });
        if (!verified) {
          this.stepTracker.end('fail', 'Checksum invalide');
          throw new Error('Checksum verification failed after retry');
        }
        this.stepTracker.end('ok');
      }

      progressCallback(40);

      this.stepTracker.start('backup', 'Sauvegarde configuration');
      await this.createBackup();
      this.stepTracker.end('ok');

      progressCallback(45);

      // Notifier l'utilisateur avant l'arrêt des services
      await this.notifyUpcomingRestart('Mise à jour en cours. Les services vont redémarrer dans 10 secondes...');
      await new Promise(resolve => setTimeout(resolve, 10000)); // Attendre 10 secondes

      progressCallback(50);

      this.stepTracker.start('stop_services', 'Arrêt des services');
      await this.stopServices();
      this.stepTracker.end('ok');

      progressCallback(60);

      this.stepTracker.start('install', 'Extraction et installation');
      await install.extractAndInstall(packagePath, version, this.stepTracker);
      this.stepTracker.end('ok');

      progressCallback(80);

      this.stepTracker.start('start_services', 'Démarrage des services');
      await this.startServices();
      this.stepTracker.end('ok');

      progressCallback(85);

      // Validation post-OTA : vérifie que les services critiques fonctionnent
      // Échec critique = throw = rollback automatique AVANT de reporter le succès
      // Dynamically load the newly installed validator to pick up fixes (e.g. 127.0.0.1 vs localhost)
      // instead of using the stale module cached by require() from the old version
      this.stepTracker.start('validate', 'Validation post-OTA');
      const freshValidatorPath = require.resolve('./validate-post-update');
      delete require.cache[freshValidatorPath];
      const freshValidator = require(freshValidatorPath);
      const validationReport = await freshValidator.validate({ throwOnCritical: true });
      const warnCount = validationReport.warnings.length;
      let validationDetail;
      if (warnCount > 0) {
        const warnMessages = validationReport.warnings.map(w => w.message);
        validationDetail = `${warnCount} warning(s) : ${warnMessages.join(' | ')}`;
      }
      this.stepTracker.end(
        warnCount > 0 ? 'warn' : 'ok',
        validationDetail
      );
      logger.info('Post-OTA validation passed', {
        criticalCount: validationReport.critical.length,
        warningCount: validationReport.warnings.length,
        durationMs: validationReport.durationMs,
      });

      progressCallback(90);

      const newVersion = await this.getCurrentVersion(true);

      // Si la version du dashboard est différente, utiliser celle du dashboard
      const finalVersion = version || newVersion;

      progressCallback(95);

      // Générer le rapport post-mise à jour
      const report = await this.generatePostUpdateReport(newVersion);
      report.validation = validationReport;

      progressCallback(100);

      logger.info('Software update completed successfully', { newVersion, report });

      // Reboot le Pi si demandé par le dashboard
      // Use 'shutdown -r +0' instead of setTimeout+spawn('reboot') because
      // shutdown is handled by the init system and survives process restarts
      // (the old setTimeout approach was killed when sync-agent restarted).
      if (scheduleReboot) {
        logger.warn('OTA reboot: spawning shutdown -r +0', { version: newVersion, previousVersion: this.previousVersion });
        const { spawn } = require('child_process');
        spawn('sudo', ['shutdown', '-r', '+0'], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      }

      return {
        success: true,
        version: newVersion,
        previousVersion: this.previousVersion,
        report,
        steps: this.stepTracker.toJSON(),
      };
    } catch (error) {
      logger.error('Software update failed', { error: error.message, stack: error.stack });

      // autoRollback est true par défaut (rétrocompatible avec les anciennes commandes sans ce flag)
      if (autoRollback !== false) {
        try {
          await this.rollback();
        } catch (rollbackError) {
          logger.error('Rollback failed', { error: rollbackError.message });
        }
      } else {
        logger.warn('Auto-rollback disabled, leaving system in current state');
      }

      // Attach partial steps to the error for the agent to include in the failure report
      error.steps = this.stepTracker.toJSON();
      throw error;
    } finally {
      await fs.remove(LOCK_FILE).catch(() => {});
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
        'sync-agent',
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

  async startServices() {
    try {
      logger.info('Starting services');

      const services = ['neopro-app', 'neopro-admin', 'nginx'];

      for (const service of services) {
        try {
          // Vérifier si le service existe avant de le démarrer
          const { stdout: existsCheck } = await execAsync(
            `systemctl list-unit-files ${service}.service 2>/dev/null | grep -q ${service} && echo "exists" || echo "not_found"`
          );

          if (existsCheck.trim() === 'not_found') {
            logger.info(`Service ${service} not installed, skipping`);
            continue;
          }

          await execAsync(`sudo systemctl start ${service}`);
          logger.info(`Service started: ${service}`);
        } catch (error) {
          logger.warn(`Failed to start service ${service}:`, error.message);
        }
      }

      // Attendre que les services démarrent avec retry
      logger.info('Waiting for services to become active...');
      const maxRetries = 6;
      const retryDelay = 5000; // 5 secondes entre chaque retry (total: 30s max)

      for (const service of services) {
        let isActive = false;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const { stdout } = await execAsync(`sudo systemctl is-active ${service} 2>/dev/null || echo "inactive"`);
            const status = stdout.trim();

            if (status === 'active') {
              isActive = true;
              logger.info(`Service ${service} is active (attempt ${attempt}/${maxRetries})`);
              break;
            } else if (status === 'inactive' || status === 'activating') {
              // Service existe mais pas encore prêt, attendre
              logger.info(`Service ${service} status: ${status}, retrying (${attempt}/${maxRetries})...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
              // Service n'existe pas ou autre état - ne pas bloquer
              logger.warn(`Service ${service} status: ${status}, skipping health check`);
              isActive = true; // Ne pas faire échouer la mise à jour
              break;
            }
          } catch (error) {
            // systemctl a échoué - le service n'existe probablement pas
            logger.warn(`Service ${service} check failed: ${error.message}, skipping`);
            isActive = true; // Ne pas faire échouer la mise à jour
            break;
          }
        }

        if (!isActive) {
          // Après tous les retries, logger un warning mais ne pas échouer
          logger.warn(`Service ${service} did not become active after ${maxRetries} attempts, continuing anyway`);
        }
      }

      logger.info('Services startup complete');

      // Restart neopro-kiosk to apply new webapp + kiosk-watchdog.sh changes
      // (e.g. Pi 5 SwiftShader flags, error recovery improvements)
      // This causes a brief TV interruption (~5s) but is necessary after updates
      try {
        const { stdout: kioskExists } = await execAsync(
          `systemctl list-unit-files neopro-kiosk.service 2>/dev/null | grep -q neopro-kiosk && echo "exists" || echo "not_found"`
        );

        if (kioskExists.trim() === 'exists') {
          logger.info('Restarting neopro-kiosk to apply display updates...');
          await execAsync('sudo systemctl restart neopro-kiosk');
          logger.info('Service neopro-kiosk restarted');
        }
      } catch (error) {
        logger.warn('Failed to restart neopro-kiosk (non-critical):', error.message);
      }

      // Skip sync-agent restart if a reboot is scheduled — it would kill the
      // process and destroy the reboot timer before it fires (race condition).
      if (this._scheduleReboot) {
        logger.info('Skipping sync-agent restart — system reboot is scheduled');
      } else {
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
      }
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

      const itemsToRestore = ['webapp', 'server', 'admin', 'sync-agent'];

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
      // Use a subshell to ensure tail and awk are applied to whichever df command succeeds
      const { stdout } = await execAsync("(df -B1 /home/pi 2>/dev/null || df -B1 /) | tail -1 | awk '{print $4}'");
      const availableBytes = parseInt(stdout.trim()) || 0;
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
      const response = await axios.get('http://127.0.0.1:3000/api/status', { timeout: 2000 });
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
   * Exécute diagnose-pi.sh --json pour un diagnostic complet du Pi,
   * puis enrichit avec les vérifications de services et HTTP.
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
      diagnostic: null,
    };

    // Exécuter le diagnostic complet via diagnose-pi.sh --json
    const diagScript = path.join(config.paths.root, 'scripts', 'diagnose-pi.sh');
    try {
      if (await fs.pathExists(diagScript)) {
        const { stdout } = await execAsync(`bash ${diagScript} --json 2>/dev/null`, { timeout: 30000 });
        try {
          report.diagnostic = JSON.parse(stdout.trim());
          if (report.diagnostic.errors > 0) {
            report.errors.push(`diagnose-pi: ${report.diagnostic.errors} erreur(s) système détectée(s)`);
            report.healthy = false;
          }
          logger.info('Full diagnostic completed', {
            errors: report.diagnostic.errors,
            warnings: report.diagnostic.warnings,
            healthy: report.diagnostic.healthy,
          });
        } catch (parseError) {
          logger.warn('Could not parse diagnostic JSON output', { error: parseError.message });
        }
      } else {
        logger.info('diagnose-pi.sh not found, skipping full diagnostic');
      }
    } catch (diagError) {
      // diagnose-pi.sh exits with error count as exit code — capture output anyway
      if (diagError.stdout) {
        try {
          report.diagnostic = JSON.parse(diagError.stdout.trim());
          if (report.diagnostic.errors > 0) {
            report.errors.push(`diagnose-pi: ${report.diagnostic.errors} erreur(s) système détectée(s)`);
            report.healthy = false;
          }
        } catch {
          logger.warn('Could not parse diagnostic output after error', { error: diagError.message });
        }
      } else {
        logger.warn('diagnose-pi.sh execution failed', { error: diagError.message });
      }
    }

    // Vérifier chaque service (toujours fait, même si le diagnostic est disponible)
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
      await axios.get('http://127.0.0.1:3000/api/health', { timeout: 5000 });
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
    const localSocket = require('../services/local-socket');
    const sent = localSocket.emit('system_notification', {
      type: 'warning',
      title: 'Mise à jour système',
      message,
      duration: durationMs,
      dismissible: false,
    });
    if (sent) {
      logger.info('User notified of upcoming restart', { message });
    } else {
      logger.warn('Could not notify user of restart (local server not connected)');
    }
  }
}

module.exports = new SoftwareUpdateHandler();
