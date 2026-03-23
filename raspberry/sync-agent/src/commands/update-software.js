const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const logger = require('../logger');
const { config } = require('../config');
const { getVersionInfo } = require('../utils/version-info');
const postUpdateValidator = require('./validate-post-update');

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
          await this.downloadPackage(updateUrl, packagePath, (progress) => {
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
        const verified = await this.verifyChecksumWithRetry(packagePath, checksum, packageSize, {
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
      await this.extractAndInstall(packagePath, version);
      this.stepTracker.end('ok');

      progressCallback(80);

      this.stepTracker.start('start_services', 'Démarrage des services');
      await this.startServices();
      this.stepTracker.end('ok');

      progressCallback(85);

      // Validation post-OTA : vérifie que les services critiques fonctionnent
      // Échec critique = throw = rollback automatique AVANT de reporter le succès
      this.stepTracker.start('validate', 'Validation post-OTA');
      const validationReport = await postUpdateValidator.validate({ throwOnCritical: true });
      const warnCount = validationReport.warnings.length;
      this.stepTracker.end(
        warnCount > 0 ? 'warn' : 'ok',
        warnCount > 0 ? `${warnCount} warning(s)` : undefined
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

      // Stall detection: abort if no data received for 30s
      // On WiFi mesh (RTL8192EU), silent drops don't trigger stream errors —
      // the stream hangs indefinitely waiting for data that never arrives.
      const STALL_TIMEOUT_MS = 30000;
      let stallTimer = null;
      const resetStallTimer = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          const err = new Error(`Download stalled: no data received for ${STALL_TIMEOUT_MS / 1000}s`);
          logger.warn('Download stall detected, aborting stream', { targetPath });
          response.data.destroy(err);
          writer.destroy(err);
        }, STALL_TIMEOUT_MS);
      };

      response.data.on('data', resetStallTimer);
      resetStallTimer(); // Start the first timer

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          if (stallTimer) clearTimeout(stallTimer);
          resolve();
        });
        writer.on('error', (err) => {
          if (stallTimer) clearTimeout(stallTimer);
          reject(err);
        });
        response.data.on('error', (err) => {
          if (stallTimer) clearTimeout(stallTimer);
          writer.destroy(err);
          reject(err);
        });
      });
    } catch (error) {
      logger.error('Package download failed:', error);
      throw new Error(`Failed to download update package: ${error.message}`);
    }
  }

  /**
   * Verify checksum with one retry on failure.
   * On mismatch: logs diagnostics, re-downloads once, and retries.
   */
  async verifyChecksumWithRetry(filePath, expectedChecksum, expectedSize, { updateUrl, progressCallback }) {
    const firstResult = await this.verifyChecksum(filePath, expectedChecksum, expectedSize);
    if (firstResult.match) {
      return true;
    }

    logger.warn('Checksum mismatch on first attempt, will retry download', {
      expectedChecksum,
      actualChecksum: firstResult.actualChecksum,
      expectedSize,
      actualSize: firstResult.actualSize,
      sizeMismatch: expectedSize && firstResult.actualSize !== expectedSize,
    });

    // Re-download
    logger.info('Re-downloading update package for retry...');
    await fs.remove(filePath);
    await this.downloadPackage(updateUrl, filePath, (progress) => {
      if (progressCallback) {
        progressCallback(35 + progress * 0.03);
      }
    });

    const secondResult = await this.verifyChecksum(filePath, expectedChecksum, expectedSize);
    if (secondResult.match) {
      logger.info('Checksum verified on retry');
      return true;
    }

    logger.error('Checksum verification failed after retry', {
      expectedChecksum,
      actualChecksum: secondResult.actualChecksum,
      expectedSize,
      actualSize: secondResult.actualSize,
    });
    return false;
  }

  async verifyChecksum(filePath, expectedChecksum, expectedSize) {
    try {
      const stats = await fs.stat(filePath);
      const actualSize = stats.size;

      if (expectedSize && actualSize !== expectedSize) {
        logger.warn('Downloaded file size mismatch', {
          expected: expectedSize,
          actual: actualSize,
          diff: actualSize - expectedSize,
        });
      }

      const { stdout } = await execAsync(`sha256sum ${filePath}`);
      const actualChecksum = stdout.split(' ')[0];
      const match = actualChecksum === expectedChecksum;

      if (match) {
        logger.info('Checksum verified successfully');
      }

      return { match, actualChecksum, actualSize };
    } catch (error) {
      logger.error('Checksum computation failed:', error);
      return { match: false, actualChecksum: null, actualSize: null };
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

  async extractAndInstall(packagePath, version) {
    try {
      logger.info('Extracting and installing update', { version });

      const rootDir = config.paths.root;
      const extractDir = '/tmp/neopro-update-extract';

      // Nettoyer et créer le dossier d'extraction temporaire
      await fs.remove(extractDir);
      await fs.ensureDir(extractDir);

      // Extraire dans un dossier temporaire (comme deploy-remote.sh et admin-server.js)
      // Capturer stderr pour détecter les vraies erreurs
      try {
        const { stderr } = await execAsync(
          `tar --warning=no-unknown-keyword -xzf ${packagePath} -C ${extractDir} 2>&1`
        );
        // Logger les warnings non-critiques mais ne pas échouer
        if (stderr && !stderr.includes('Ignoring unknown extended header')) {
          logger.warn('Tar extraction warnings', { stderr });
        }
      } catch (tarError) {
        const errorMsg = tarError.message || '';
        logger.error('Tar extraction failed', { error: errorMsg, packagePath });

        // Vérifier la taille du fichier téléchargé pour diagnostic
        let fileSizeInfo = '';
        try {
          const stats = await fs.stat(packagePath);
          fileSizeInfo = ` (fichier téléchargé: ${Math.round(stats.size / 1024)}KB)`;
        } catch {
          fileSizeInfo = ' (impossible de vérifier la taille du fichier)';
        }

        // Détecter les erreurs typiques d'archive corrompue ou incomplète
        const isCorruptedArchive =
          errorMsg.includes('unexpected EOF') ||
          errorMsg.includes('gzip: stdin: unexpected end of file') ||
          errorMsg.includes('Unexpected EOF in archive') ||
          errorMsg.includes('not in gzip format') ||
          errorMsg.includes('invalid compressed data') ||
          errorMsg.includes('truncated');

        if (isCorruptedArchive) {
          throw new Error(
            `Archive corrompue ou téléchargement incomplet${fileSizeInfo}. ` +
            `Cela peut se produire si le déploiement a été lancé avant la fin de l'upload sur le serveur. ` +
            `Veuillez patienter quelques instants et relancer le déploiement.`
          );
        }

        throw new Error(`Échec de l'extraction du package de mise à jour${fileSizeInfo}: ${errorMsg}`);
      }

      // Détecter le format de l'archive (nouveau ou legacy avec préfixe deploy/)
      let sourcePrefix = '';
      if (await fs.pathExists(path.join(extractDir, 'deploy', 'webapp'))) {
        sourcePrefix = 'deploy/';
        logger.info('Detected legacy archive format (deploy/ prefix)');
      } else if (await fs.pathExists(path.join(extractDir, 'webapp'))) {
        sourcePrefix = '';
        logger.info('Detected new archive format (no prefix)');
      } else {
        throw new Error('Invalid archive structure: webapp/ not found');
      }

      const sourcePath = path.join(extractDir, sourcePrefix);

      // Sauvegarder configuration.json avant mise à jour
      const configBackupPath = '/tmp/configuration.json.backup';
      const webappConfigPath = path.join(rootDir, 'webapp', 'configuration.json');
      if (await fs.pathExists(webappConfigPath)) {
        await fs.copy(webappConfigPath, configBackupPath);
        logger.info('Configuration saved');
      }

      // Copier webapp (comme deploy-remote.sh)
      if (await fs.pathExists(path.join(sourcePath, 'webapp'))) {
        await execAsync(`rm -rf ${rootDir}/webapp/*`);
        await execAsync(`cp -r ${path.join(sourcePath, 'webapp')}/* ${rootDir}/webapp/`);
        logger.info('Webapp updated');
      }

      // Restaurer configuration.json
      if (await fs.pathExists(configBackupPath)) {
        await fs.copy(configBackupPath, webappConfigPath);
        await fs.remove(configBackupPath);
        logger.info('Configuration restored');
      }

      // Copier server
      if (await fs.pathExists(path.join(sourcePath, 'server'))) {
        await execAsync(`cp -r ${path.join(sourcePath, 'server')}/* ${rootDir}/server/`);
        logger.info('Server updated');
      }

      // Copier sync-agent (comme deploy-remote.sh et admin-server.js)
      if (await fs.pathExists(path.join(sourcePath, 'sync-agent'))) {
        // IMPORTANT: Créer un golden snapshot AVANT de remplacer le code
        // Si le nouveau code crashe, le guardian pourra restaurer cette version
        const goldenDir = path.join(rootDir, 'sync-agent-golden');
        if (!await fs.pathExists(goldenDir)) {
          const currentAgentJs = path.join(rootDir, 'sync-agent', 'src', 'agent.js');
          if (await fs.pathExists(currentAgentJs)) {
            logger.info('Creating golden snapshot before update (first-time safety net)...');
            try {
              await execAsync(`cp -r ${path.join(rootDir, 'sync-agent')} ${goldenDir}`);
              await execAsync(`echo "$(date -Iseconds)" > ${goldenDir}/.golden-created`);
              await execAsync(`chown -R pi:pi ${goldenDir}`);
              logger.info('Golden snapshot created successfully');
            } catch (goldenError) {
              logger.warn('Failed to create golden snapshot (non-critical)', { error: goldenError.message });
            }
          }
        } else {
          logger.info('Golden snapshot already exists, skipping');
        }

        // Sauvegarder les configs locales du sync-agent
        const syncAgentEnvBackup = '/tmp/sync-agent.env.backup';
        const syncAgentConfigEnvBackup = '/tmp/sync-agent-config.env.backup';

        if (await fs.pathExists(path.join(rootDir, 'sync-agent', '.env'))) {
          await fs.copy(path.join(rootDir, 'sync-agent', '.env'), syncAgentEnvBackup);
        }
        if (await fs.pathExists(path.join(rootDir, 'sync-agent', 'config', '.env'))) {
          await fs.copy(path.join(rootDir, 'sync-agent', 'config', '.env'), syncAgentConfigEnvBackup);
        }

        // Copier les nouveaux fichiers du sync-agent
        await fs.ensureDir(path.join(rootDir, 'sync-agent'));
        await execAsync(`cp -r ${path.join(sourcePath, 'sync-agent')}/* ${rootDir}/sync-agent/`);
        logger.info('Sync-agent updated');

        // Restaurer les configs locales
        if (await fs.pathExists(syncAgentEnvBackup)) {
          await fs.copy(syncAgentEnvBackup, path.join(rootDir, 'sync-agent', '.env'));
          await fs.remove(syncAgentEnvBackup);
        }
        if (await fs.pathExists(syncAgentConfigEnvBackup)) {
          await fs.ensureDir(path.join(rootDir, 'sync-agent', 'config'));
          await fs.copy(syncAgentConfigEnvBackup, path.join(rootDir, 'sync-agent', 'config', '.env'));
          await fs.remove(syncAgentConfigEnvBackup);
        }
        logger.info('Sync-agent config restored');
      }

      // Copier admin si présent
      if (await fs.pathExists(path.join(sourcePath, 'admin'))) {
        await fs.ensureDir(path.join(rootDir, 'admin'));
        await execAsync(`cp -r ${path.join(sourcePath, 'admin')}/* ${rootDir}/admin/`);
        logger.info('Admin panel updated');
      }

      // Copier scripts si présents
      if (await fs.pathExists(path.join(sourcePath, 'scripts'))) {
        await fs.ensureDir(path.join(rootDir, 'scripts'));
        await execAsync(`cp -r ${path.join(sourcePath, 'scripts')}/* ${rootDir}/scripts/`);
        await execAsync(`chmod +x ${rootDir}/scripts/*.sh 2>/dev/null || true`);
        logger.info('Scripts updated');
      }

      // Copier config/ si présent (contient les fichiers systemd .service)
      // IMPORTANT: Sans cette copie, les nouveaux services systemd ajoutés après
      // l'install initial ne sont jamais installés via OTA
      if (await fs.pathExists(path.join(sourcePath, 'config'))) {
        await fs.ensureDir(path.join(rootDir, 'config'));
        await execAsync(`cp -r ${path.join(sourcePath, 'config')}/* ${rootDir}/config/`);
        logger.info('Config files updated (systemd services, etc.)');
      }

      // Copier VERSION et release.json à la racine
      // FIX: Les anciens scripts utilisaient "sudo cp/tee" pour écrire ces fichiers,
      // ce qui les rendait owner root:root. Le process tourne en pi, donc fs.copy
      // échoue avec EACCES en tentant d'unlink un fichier root.
      // Solution : sudo chown avant fs.copy pour reprendre l'ownership.
      // IMPORTANT : ne PAS faire échouer l'OTA pour un échec de copy VERSION.
      // writeVersionMetadata() en fin de process réécrira la version dans un try/catch séparé.
      const versionDest = path.join(rootDir, 'VERSION');
      const releaseDest = path.join(rootDir, 'release.json');

      try {
        await this.fixFileOwnership(versionDest);
        await this.fixFileOwnership(releaseDest);

        const versionSource = await fs.pathExists(path.join(extractDir, 'VERSION'))
          ? path.join(extractDir, 'VERSION')
          : await fs.pathExists(path.join(sourcePath, 'VERSION'))
            ? path.join(sourcePath, 'VERSION')
            : null;
        if (versionSource) {
          await fs.copy(versionSource, versionDest, { overwrite: true });
        }

        const releaseSource = await fs.pathExists(path.join(extractDir, 'release.json'))
          ? path.join(extractDir, 'release.json')
          : await fs.pathExists(path.join(sourcePath, 'release.json'))
            ? path.join(sourcePath, 'release.json')
            : null;
        if (releaseSource) {
          await fs.copy(releaseSource, releaseDest, { overwrite: true });
        }

        logger.info('VERSION and release.json copied (ownership fixed if needed)');
      } catch (versionCopyError) {
        // Non-bloquant : writeVersionMetadata() réécrira après l'installation du sudoers
        logger.warn('VERSION/release.json copy failed (will retry via writeVersionMetadata)', {
          error: versionCopyError.message,
        });
      }

      // npm install si nécessaire
      if (await fs.pathExists(path.join(rootDir, 'webapp', 'package.json'))) {
        try {
          await execAsync(`cd ${rootDir}/webapp && npm install --production 2>/dev/null || true`);
        } catch (e) {
          logger.warn('npm install webapp failed (non-critical)', { error: e.message });
        }
      }

      if (await fs.pathExists(path.join(rootDir, 'server', 'package.json'))) {
        try {
          logger.info('Running npm install for server...');
          await execAsync(`cd ${rootDir}/server && npm install --production`);
          logger.info('npm install server completed');
        } catch (e) {
          logger.warn('npm install server failed', { error: e.message });
        }
      }

      // npm install pour sync-agent (CRITICAL - sans ça le service crash)
      if (await fs.pathExists(path.join(rootDir, 'sync-agent', 'package.json'))) {
        try {
          logger.info('Running npm install for sync-agent...');
          await execAsync(`cd ${rootDir}/sync-agent && npm install --production`);
          logger.info('npm install sync-agent completed');
        } catch (e) {
          logger.error('npm install sync-agent failed', { error: e.message });
        }
      }

      // Vérifier l'intégrité des node_modules critiques avant de démarrer les services.
      // Si un module est manquant (ex: corruption EXT4 après shutdown unclean, npm install
      // interrompu), on lance un npm install ciblé. Si ça échoue toujours, on throw pour
      // déclencher le rollback automatique.
      await this.verifyNodeModules(rootDir);

      // Installer le fichier sudoers si présent dans l'archive
      const sudoersSrc = path.join(rootDir, 'config', 'sudoers.d', 'neopro');
      if (await fs.pathExists(sudoersSrc)) {
        try {
          await execAsync(`sudo cp ${sudoersSrc} /etc/sudoers.d/neopro`);
          await execAsync('sudo chmod 440 /etc/sudoers.d/neopro');
          logger.info('Sudoers file installed');
        } catch (e) {
          logger.warn('Failed to install sudoers via sudo (NoNewPrivileges?), admin-server will handle it', { error: e.message });
        }
      }

      // Installer les nouveaux services systemd si présents dans l'archive
      // IMPORTANT: lire depuis l'archive extraite (sourcePath), PAS depuis rootDir
      // rootDir (/home/pi/neopro) peut contenir des .service orphelins d'anciennes versions
      // qui seraient réinstallés à chaque OTA avant que fix-fleet-pi.sh ne les supprime
      const systemdConfigDir = path.join(sourcePath, 'config', 'systemd');
      if (await fs.pathExists(systemdConfigDir)) {
        logger.info('Installing systemd services...');
        this.stepTracker.start('systemd', 'Services systemd');
        try {
          await execAsync('sudo systemctl daemon-reload');
          const serviceFiles = await fs.readdir(systemdConfigDir);
          const newlyInstalledServices = [];

          for (const serviceFile of serviceFiles) {
            if (serviceFile.endsWith('.service')) {
              const srcPath = path.join(systemdConfigDir, serviceFile);
              const destPath = `/etc/systemd/system/${serviceFile}`;
              const serviceName = serviceFile.replace('.service', '');

              // Vérifier si le service est déjà installé
              const wasInstalled = await fs.pathExists(destPath);

              // Copier le fichier service
              await execAsync(`sudo cp ${srcPath} ${destPath}`);
              logger.info(`Installed systemd service: ${serviceFile}`, { wasUpdate: wasInstalled });

              // Activer le service
              await execAsync(`sudo systemctl enable ${serviceName} 2>/dev/null || true`);

              // Si c'est un NOUVEAU service (pas une mise à jour), le démarrer
              if (!wasInstalled) {
                newlyInstalledServices.push(serviceName);
              }
            }
          }

          // Recharger après toutes les copies
          await execAsync('sudo systemctl daemon-reload');

          // Démarrer les nouveaux services (pas ceux gérés par startServices)
          const managedServices = ['neopro-app', 'neopro-admin', 'neopro-kiosk', 'neopro-sync-agent'];
          for (const serviceName of newlyInstalledServices) {
            if (!managedServices.includes(serviceName)) {
              try {
                await execAsync(`sudo systemctl start ${serviceName}`);
                logger.info(`Started new service: ${serviceName}`);
              } catch (startError) {
                logger.warn(`Failed to start new service ${serviceName}`, { error: startError.message });
              }
            }
          }

          const totalSvc = serviceFiles.filter(f => f.endsWith('.service')).length;
          logger.info('Systemd services installed and enabled', {
            total: totalSvc,
            newlyInstalled: newlyInstalledServices.length,
            started: newlyInstalledServices.filter(s => !managedServices.includes(s)).length
          });
          this.stepTracker.end('ok', `${totalSvc}/${totalSvc} services`);
        } catch (e) {
          logger.warn('Failed to install systemd services via sudo, falling back to admin-server', { error: e.message });
          // Fallback: delegate to admin-server which runs without NoNewPrivileges
          try {
            await execAsync('curl -s -X POST http://127.0.0.1:8080/api/system/apply-services');
            logger.info('Systemd services applied via admin-server fallback');
            this.stepTracker.end('warn', 'Fallback admin-server');
          } catch (fallbackError) {
            logger.warn('Admin-server fallback also failed', { error: fallbackError.message });
            this.stepTracker.end('fail', e.message);
          }
        }
      } else {
        // No config/systemd/ dir but try apply-services anyway (fixes legacy Pi)
        try {
          await execAsync('curl -s -X POST http://127.0.0.1:8080/api/system/apply-services');
          logger.info('Systemd services applied via admin-server (no config/systemd in archive)');
        } catch (e) {
          // Admin-server may not have the route yet on very old versions
        }
      }

      // Installer les paquets apt manquants requis par les services.
      // x11-utils: fournit xdpyinfo, utilisé par neopro-kiosk.service pour vérifier que X est prêt.
      // edid-decode: parsing EDID détaillé (résolutions, taille physique, HDR, HDMI version).
      // Non-bloquant: si apt échoue (pas d'internet, lock dpkg), l'OTA continue.
      const requiredAptPackages = ['x11-utils', 'edid-decode'];
      try {
        const missingPackages = [];
        for (const pkg of requiredAptPackages) {
          try {
            const { stdout } = await execAsync(`dpkg -l ${pkg} 2>/dev/null | grep '^ii'`);
            if (!stdout.trim()) missingPackages.push(pkg);
          } catch {
            missingPackages.push(pkg);
          }
        }
        if (missingPackages.length > 0) {
          logger.info('Installing missing apt packages...', { packages: missingPackages });
          await execAsync(`sudo apt-get update -qq && sudo apt-get install -y ${missingPackages.join(' ')}`, { timeout: 120000 });
          logger.info('Apt packages installed', { packages: missingPackages });
        }
      } catch (e) {
        logger.warn('Failed to install apt packages (non-blocking)', { error: e.message });
      }

      // Enable watchdog grace period before network-sensitive operations (udev + service restart)
      // Prevents the watchdog from triggering recovery during OTA udev deployment
      try {
        const networkWatchdog = require('../services/network-watchdog');
        networkWatchdog.enableGracePeriod('internet', 120000); // 2 min
        networkWatchdog.enableGracePeriod('hotspot', 120000);
        logger.info('NetworkWatchdog grace period enabled for OTA (120s)');
      } catch (e) {
        logger.warn('Could not enable watchdog grace period', { error: e.message });
      }

      // Deploy udev rules if present in the archive
      const udevDir = path.join(rootDir, 'config', 'udev');
      if (await fs.pathExists(udevDir)) {
        try {
          const ruleFiles = (await fs.readdir(udevDir)).filter(f => f.endsWith('.rules'));
          for (const rule of ruleFiles) {
            await execAsync(`sudo cp ${path.join(udevDir, rule)} /etc/udev/rules.d/${rule}`);
            logger.info(`Installed udev rule: ${rule}`);
          }
          if (ruleFiles.length > 0) {
            await execAsync(
              'sudo udevadm control --reload-rules && sudo udevadm trigger --subsystem-match=net --action=add && sudo udevadm trigger --subsystem-match=drm --action=change'
            );
            logger.info('Udev rules reloaded (net/add + drm/change)');
          }
        } catch (e) {
          logger.warn('Failed to install udev rules', { error: e.message });
        }
      }

      // Deploy scripts to /usr/local/bin/ if present (udev handlers, etc.)
      const scriptsDir = path.join(rootDir, 'scripts');
      if (await fs.pathExists(scriptsDir)) {
        try {
          const binScripts = (await fs.readdir(scriptsDir)).filter(f => f.startsWith('neopro-') && f.endsWith('.sh'));
          for (const script of binScripts) {
            await execAsync(`sudo cp ${path.join(scriptsDir, script)} /usr/local/bin/${script}`);
            await execAsync(`sudo chmod +x /usr/local/bin/${script}`);
            logger.info(`Installed script to /usr/local/bin: ${script}`);
          }
        } catch (e) {
          logger.warn('Failed to install bin scripts', { error: e.message });
        }
      }

      // Deploy modprobe.d configs if present (WiFi driver tuning, etc.)
      const modprobeDir = path.join(rootDir, 'config', 'modprobe.d');
      if (await fs.pathExists(modprobeDir)) {
        try {
          const confFiles = (await fs.readdir(modprobeDir)).filter(f => f.endsWith('.conf'));
          for (const conf of confFiles) {
            await execAsync(`sudo cp ${path.join(modprobeDir, conf)} /etc/modprobe.d/${conf}`);
            logger.info(`Installed modprobe config: ${conf}`);
          }
          if (confFiles.length > 0) {
            logger.info('Modprobe configs deployed (effective after next module reload or reboot)');
          }
        } catch (e) {
          logger.warn('Failed to install modprobe configs', { error: e.message });
        }
      }

      // Deploy journald.conf si présent (limiter les écritures SD card)
      const journaldConf = path.join(rootDir, 'config', 'journald.conf');
      if (await fs.pathExists(journaldConf)) {
        try {
          await execAsync(`sudo cp ${journaldConf} /etc/systemd/journald.conf`);
          await execAsync('sudo systemctl restart systemd-journald');
          logger.info('journald.conf deployed and journald restarted');
        } catch (e) {
          logger.warn('Failed to deploy journald.conf', { error: e.message });
        }
      }

      // Appliquer noatime sur la partition root si pas déjà configuré (réduit les écritures SD)
      try {
        const { stdout: fstab } = await execAsync('cat /etc/fstab');
        if (fstab.includes('/dev/mmcblk0p2') && !fstab.includes('noatime')) {
          await execAsync(`sudo sed -i 's|defaults|defaults,noatime|' /etc/fstab`);
          logger.info('Added noatime to fstab (effective after reboot)');
        }
      } catch (e) {
        logger.warn('Failed to apply noatime to fstab', { error: e.message });
      }

      // Écrire les fichiers de version avec la version fournie par le dashboard central
      if (version) {
        await this.writeVersionMetadata(version);
      }

      // Appliquer les corrections fleet (idempotent — n'agit que si nécessaire)
      // Corrige cmdline.txt, config.txt, systemd, permissions, boot splash, etc.
      const fixFleetScript = path.join(rootDir, 'scripts', 'fix-fleet-pi.sh');
      if (await fs.pathExists(fixFleetScript)) {
        this.stepTracker.start('fleet_fix', 'Corrections fleet');
        try {
          logger.info('Running fix-fleet-pi.sh (auto fleet corrections)...');
          // echo 'n' pour refuser le reboot interactif — l'OTA gère le reboot via scheduleReboot
          const { stdout: fleetOutput } = await execAsync(
            `echo 'n' | sudo ${fixFleetScript} 2>&1`,
            { timeout: 120000 }
          );
          const corrections = fleetOutput.match(/Corrections\s*:\s*(\d+)/);
          const errors = fleetOutput.match(/Erreurs\s*:\s*(\d+)/);
          const corrCount = corrections ? corrections[1] : 'unknown';
          const errCount = errors ? errors[1] : 'unknown';
          logger.info('fix-fleet-pi.sh completed', {
            corrections: corrCount,
            errors: errCount,
          });
          const hasErrors = errCount !== '0' && errCount !== 'unknown';
          this.stepTracker.end(
            hasErrors ? 'warn' : 'ok',
            `${corrCount} correction(s), ${errCount} erreur(s)`
          );
        } catch (fleetError) {
          logger.warn('fix-fleet-pi.sh failed (non-blocking)', { error: fleetError.message });
          this.stepTracker.end('warn', fleetError.message);
        }
      }

      // Nettoyage
      await fs.remove(extractDir);
      await fs.remove(packagePath);

      logger.info('Update installed successfully');
    } catch (error) {
      logger.error('Installation failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async writeVersionMetadata(version) {
    try {
      const buildDate = new Date().toISOString();
      const rootDir = config.paths.root;

      // FIX: Reprendre l'ownership des fichiers potentiellement créés par root (ancien sudo)
      const versionPath = path.join(rootDir, 'VERSION');
      const releasePath = path.join(rootDir, 'release.json');
      const webappVersionPath = path.join(rootDir, 'webapp', 'version.json');

      await this.fixFileOwnership(versionPath);
      await this.fixFileOwnership(releasePath);
      await this.fixFileOwnership(webappVersionPath);

      // Écrire VERSION
      await fs.writeFile(versionPath, version + '\n');

      // Écrire release.json
      const releaseData = {
        version,
        buildDate,
        source: 'central-dashboard',
      };
      await fs.writeJson(releasePath, releaseData, { spaces: 2 });

      // Écrire webapp/version.json
      await fs.writeJson(webappVersionPath, { version, buildDate }, { spaces: 2 });

      logger.info('Version metadata written', { version });
    } catch (error) {
      logger.warn('Failed to write version metadata:', error.message);
      // Ne pas faire échouer la mise à jour pour ça
    }
  }

  /**
   * Reprend l'ownership d'un fichier s'il appartient à root.
   * Les anciennes versions du sync-agent utilisaient "sudo cp/tee" pour écrire
   * VERSION et release.json, créant des fichiers root:root que le user pi
   * ne peut plus écraser (EACCES sur unlink). Ce fix est idempotent.
   */
  async fixFileOwnership(filePath) {
    try {
      if (!await fs.pathExists(filePath)) return;

      // Check actual write access instead of just uid — covers root-owned files,
      // immutable flags, directory permission issues, etc.
      try {
        await fs.access(filePath, fs.constants.W_OK);
        return; // writable, no fix needed
      } catch {
        // File exists but not writable — fix it
      }

      logger.info('Fixing non-writable file', { filePath });
      try {
        await execAsync(`sudo chown pi:pi ${filePath}`);
      } catch {
        // Fallback: remove so fs.copy can recreate it
        await execAsync(`sudo rm -f ${filePath}`);
      }
    } catch (error) {
      logger.warn('fixFileOwnership failed', { filePath, error: error.message });
    }
  }

  /**
   * Vérifie que les node_modules critiques sont présents et resolvables.
   * Si un module manque (corruption EXT4, npm install interrompu), tente un npm install
   * de réparation. Si la réparation échoue, throw pour déclencher le rollback.
   */
  async verifyNodeModules(rootDir) {
    const checks = [
      { component: 'server', modules: ['express', 'socket.io'] },
      { component: 'sync-agent', modules: ['socket.io-client', 'fs-extra'] },
      { component: 'admin', modules: ['express'] },
    ];

    for (const { component, modules } of checks) {
      const componentDir = path.join(rootDir, component);
      if (!await fs.pathExists(path.join(componentDir, 'package.json'))) continue;

      const missing = [];
      for (const mod of modules) {
        const modPath = path.join(componentDir, 'node_modules', mod);
        if (!await fs.pathExists(modPath)) {
          missing.push(mod);
        }
      }

      if (missing.length === 0) continue;

      logger.warn(`Missing modules in ${component}: ${missing.join(', ')} — running repair npm install`);
      try {
        await execAsync(`cd ${componentDir} && npm install --production`, { timeout: 300000 });
        logger.info(`Repair npm install for ${component} completed`);

        // Re-check after repair
        const stillMissing = [];
        for (const mod of missing) {
          const modPath = path.join(componentDir, 'node_modules', mod);
          if (!await fs.pathExists(modPath)) {
            stillMissing.push(mod);
          }
        }

        if (stillMissing.length > 0) {
          throw new Error(`Critical modules still missing in ${component} after repair: ${stillMissing.join(', ')}`);
        }
      } catch (repairError) {
        // Throw pour déclencher le rollback automatique
        throw new Error(`node_modules integrity check failed for ${component}: ${repairError.message}`);
      }
    }

    logger.info('node_modules integrity check passed');
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
