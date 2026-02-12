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

      await this.extractAndInstall(packagePath, version);

      progressCallback(80);

      await this.startServices();

      progressCallback(90);

      const newVersion = await this.getCurrentVersion(true);

      // Si la version du dashboard est différente, utiliser celle du dashboard
      const finalVersion = version || newVersion;

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
      logger.error('Software update failed', { error: error.message, stack: error.stack });

      try {
        await this.rollback();
      } catch (rollbackError) {
        logger.error('Rollback failed', { error: rollbackError.message });
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

      // Copier VERSION et release.json à la racine (pas besoin de sudo, le process tourne en pi)
      const versionSource = await fs.pathExists(path.join(extractDir, 'VERSION'))
        ? path.join(extractDir, 'VERSION')
        : await fs.pathExists(path.join(sourcePath, 'VERSION'))
          ? path.join(sourcePath, 'VERSION')
          : null;
      if (versionSource) {
        await fs.copy(versionSource, path.join(rootDir, 'VERSION'), { overwrite: true });
      }

      const releaseSource = await fs.pathExists(path.join(extractDir, 'release.json'))
        ? path.join(extractDir, 'release.json')
        : await fs.pathExists(path.join(sourcePath, 'release.json'))
          ? path.join(sourcePath, 'release.json')
          : null;
      if (releaseSource) {
        await fs.copy(releaseSource, path.join(rootDir, 'release.json'), { overwrite: true });
      }

      // Les permissions sont déjà correctes : le process tourne en User=pi,
      // les fichiers extraits/copiés appartiennent déjà à pi:pi.
      logger.info('Permissions OK (process runs as pi)');

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
          await execAsync(`cd ${rootDir}/server && npm install --production 2>/dev/null || true`);
        } catch (e) {
          logger.warn('npm install server failed (non-critical)', { error: e.message });
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
          // C'est critique pour le sync-agent, on log l'erreur mais on continue
        }
      }

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
      const systemdConfigDir = path.join(rootDir, 'config', 'systemd');
      if (await fs.pathExists(systemdConfigDir)) {
        logger.info('Installing systemd services...');
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

          logger.info('Systemd services installed and enabled', {
            total: serviceFiles.filter(f => f.endsWith('.service')).length,
            newlyInstalled: newlyInstalledServices.length,
            started: newlyInstalledServices.filter(s => !managedServices.includes(s)).length
          });
        } catch (e) {
          logger.warn('Failed to install systemd services via sudo, falling back to admin-server', { error: e.message });
          // Fallback: delegate to admin-server which runs without NoNewPrivileges
          try {
            await execAsync('curl -s -X POST http://localhost:8080/api/system/apply-services');
            logger.info('Systemd services applied via admin-server fallback');
          } catch (fallbackError) {
            logger.warn('Admin-server fallback also failed', { error: fallbackError.message });
          }
        }
      } else {
        // No config/systemd/ dir but try apply-services anyway (fixes legacy Pi)
        try {
          await execAsync('curl -s -X POST http://localhost:8080/api/system/apply-services');
          logger.info('Systemd services applied via admin-server (no config/systemd in archive)');
        } catch (e) {
          // Admin-server may not have the route yet on very old versions
        }
      }

      // Écrire les fichiers de version avec la version fournie par le dashboard central
      if (version) {
        await this.writeVersionMetadata(version);
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

      // Écrire VERSION (pas besoin de sudo, le process tourne en pi)
      const versionPath = path.join(rootDir, 'VERSION');
      await fs.writeFile(versionPath, version + '\n');

      // Écrire release.json
      const releaseData = {
        version,
        buildDate,
        source: 'central-dashboard',
      };
      const releasePath = path.join(rootDir, 'release.json');
      await fs.writeJson(releasePath, releaseData, { spaces: 2 });

      // Écrire webapp/version.json (pi:pi devrait avoir les droits)
      const webappVersionPath = path.join(rootDir, 'webapp', 'version.json');
      await fs.writeJson(webappVersionPath, { version, buildDate }, { spaces: 2 });

      logger.info('Version metadata written', { version });
    } catch (error) {
      logger.warn('Failed to write version metadata:', error.message);
      // Ne pas faire échouer la mise à jour pour ça
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
