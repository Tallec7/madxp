/**
 * OTA Install — extraction, file operations, systemd, version metadata.
 * Extracted from update-software.js (ADR-044).
 */

const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const logger = require('../logger');
const { config } = require('../config');

const execAsync = util.promisify(exec);

/**
 * Reprend l'ownership d'un fichier s'il appartient à root.
 * Les anciennes versions du sync-agent utilisaient "sudo cp/tee" pour écrire
 * VERSION et release.json, créant des fichiers root:root que le user pi
 * ne peut plus écraser (EACCES sur unlink). Ce fix est idempotent.
 */
async function fixFileOwnership(filePath) {
  try {
    if (!await fs.pathExists(filePath)) return;

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
 * Write VERSION, release.json, and webapp/version.json.
 */
async function writeVersionMetadata(version) {
  try {
    const buildDate = new Date().toISOString();
    const rootDir = config.paths.root;

    const versionPath = path.join(rootDir, 'VERSION');
    const releasePath = path.join(rootDir, 'release.json');
    const webappVersionPath = path.join(rootDir, 'webapp', 'version.json');

    await fixFileOwnership(versionPath);
    await fixFileOwnership(releasePath);
    await fixFileOwnership(webappVersionPath);

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
 * Vérifie que les node_modules critiques sont présents et resolvables.
 * Si un module manque (corruption EXT4, npm install interrompu), tente un npm install
 * de réparation. Si la réparation échoue, throw pour déclencher le rollback.
 */
async function verifyNodeModules(rootDir) {
  const checks = [
    { component: 'server', modules: ['express', 'socket.io', 'axios'] },
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
      throw new Error(`node_modules integrity check failed for ${component}: ${repairError.message}`);
    }
  }

  logger.info('node_modules integrity check passed');
}

/**
 * Extract and install update package.
 * @param {string} packagePath - Path to the downloaded .tar.gz
 * @param {string} version - Target version string
 * @param {object} stepTracker - OtaStepTracker instance for progress reporting
 */
async function extractAndInstall(packagePath, version, stepTracker) {
  try {
    logger.info('Extracting and installing update', { version });

    const rootDir = config.paths.root;
    const extractDir = '/tmp/neopro-update-extract';

    // Nettoyer et créer le dossier d'extraction temporaire
    await fs.remove(extractDir);
    await fs.ensureDir(extractDir);

    // Extraire dans un dossier temporaire
    try {
      const { stderr } = await execAsync(
        `tar --warning=no-unknown-keyword -xzf ${packagePath} -C ${extractDir} 2>&1`
      );
      if (stderr && !stderr.includes('Ignoring unknown extended header')) {
        logger.warn('Tar extraction warnings', { stderr });
      }
    } catch (tarError) {
      const errorMsg = tarError.message || '';
      logger.error('Tar extraction failed', { error: errorMsg, packagePath });

      let fileSizeInfo = '';
      try {
        const stats = await fs.stat(packagePath);
        fileSizeInfo = ` (fichier téléchargé: ${Math.round(stats.size / 1024)}KB)`;
      } catch {
        fileSizeInfo = ' (impossible de vérifier la taille du fichier)';
      }

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

    // Copier webapp
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

    // Copier sync-agent
    if (await fs.pathExists(path.join(sourcePath, 'sync-agent'))) {
      // Golden snapshot AVANT de remplacer le code
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

      // Copier les nouveaux fichiers
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
    if (await fs.pathExists(path.join(sourcePath, 'config'))) {
      await fs.ensureDir(path.join(rootDir, 'config'));
      await execAsync(`cp -r ${path.join(sourcePath, 'config')}/* ${rootDir}/config/`);
      logger.info('Config files updated (systemd services, etc.)');
    }

    // Copier VERSION et release.json
    const versionDest = path.join(rootDir, 'VERSION');
    const releaseDest = path.join(rootDir, 'release.json');

    try {
      await fixFileOwnership(versionDest);
      await fixFileOwnership(releaseDest);

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

    // npm install pour sync-agent (CRITICAL)
    if (await fs.pathExists(path.join(rootDir, 'sync-agent', 'package.json'))) {
      try {
        logger.info('Running npm install for sync-agent...');
        await execAsync(`cd ${rootDir}/sync-agent && npm install --production`);
        logger.info('npm install sync-agent completed');
      } catch (e) {
        logger.error('npm install sync-agent failed', { error: e.message });
      }
    }

    // Vérifier l'intégrité des node_modules critiques
    await verifyNodeModules(rootDir);

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
    const systemdConfigDir = path.join(sourcePath, 'config', 'systemd');
    if (await fs.pathExists(systemdConfigDir)) {
      logger.info('Installing systemd services...');
      stepTracker.start('systemd', 'Services systemd');
      try {
        await execAsync('sudo systemctl daemon-reload');
        const serviceFiles = await fs.readdir(systemdConfigDir);
        const newlyInstalledServices = [];

        for (const serviceFile of serviceFiles) {
          if (serviceFile.endsWith('.service')) {
            const srcPath = path.join(systemdConfigDir, serviceFile);
            const destPath = `/etc/systemd/system/${serviceFile}`;
            const serviceName = serviceFile.replace('.service', '');

            const wasInstalled = await fs.pathExists(destPath);
            await execAsync(`sudo cp ${srcPath} ${destPath}`);
            logger.info(`Installed systemd service: ${serviceFile}`, { wasUpdate: wasInstalled });

            await execAsync(`sudo systemctl enable ${serviceName} 2>/dev/null || true`);

            if (!wasInstalled) {
              newlyInstalledServices.push(serviceName);
            }
          }
        }

        await execAsync('sudo systemctl daemon-reload');

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
        stepTracker.end('ok', `${totalSvc}/${totalSvc} services`);
      } catch (e) {
        logger.warn('Failed to install systemd services via sudo, falling back to admin-server', { error: e.message });
        try {
          await execAsync('curl -s -X POST http://127.0.0.1:8080/api/system/apply-services');
          logger.info('Systemd services applied via admin-server fallback');
          stepTracker.end('warn', 'Fallback admin-server');
        } catch (fallbackError) {
          logger.warn('Admin-server fallback also failed', { error: fallbackError.message });
          stepTracker.end('fail', e.message);
        }
      }
    } else {
      try {
        await execAsync('curl -s -X POST http://127.0.0.1:8080/api/system/apply-services');
        logger.info('Systemd services applied via admin-server (no config/systemd in archive)');
      } catch (e) {
        // Admin-server may not have the route yet on very old versions
      }
    }

    // Installer les paquets apt manquants
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

    // Enable watchdog grace period before network-sensitive operations
    try {
      const networkWatchdog = require('../services/network-watchdog');
      networkWatchdog.enableGracePeriod('internet', 120000);
      networkWatchdog.enableGracePeriod('hotspot', 120000);
      logger.info('NetworkWatchdog grace period enabled for OTA (120s)');
    } catch (e) {
      logger.warn('Could not enable watchdog grace period', { error: e.message });
    }

    // Deploy udev rules if present
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

    // Deploy scripts to /usr/local/bin/
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

    // Deploy modprobe.d configs
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

    // Deploy journald.conf
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

    // Appliquer noatime
    try {
      const { stdout: fstab } = await execAsync('cat /etc/fstab');
      if (fstab.includes('/dev/mmcblk0p2') && !fstab.includes('noatime')) {
        await execAsync(`sudo sed -i 's|defaults|defaults,noatime|' /etc/fstab`);
        logger.info('Added noatime to fstab (effective after reboot)');
      }
    } catch (e) {
      logger.warn('Failed to apply noatime to fstab', { error: e.message });
    }

    // Écrire les fichiers de version
    if (version) {
      await writeVersionMetadata(version);
    }

    // Appliquer les corrections fleet
    const fixFleetScript = path.join(rootDir, 'scripts', 'fix-fleet-pi.sh');
    if (await fs.pathExists(fixFleetScript)) {
      stepTracker.start('fleet_fix', 'Corrections fleet');
      try {
        logger.info('Running fix-fleet-pi.sh (auto fleet corrections)...');
        const { stdout: fleetOutput } = await execAsync(
          `echo 'n' | sudo ${fixFleetScript} 2>&1`,
          { timeout: 120000 }
        );
        const corrections = fleetOutput.match(/Corrections\s*:\s*(\d+)/);
        const errors = fleetOutput.match(/Erreurs\s*:\s*(\d+)/);
        const corrCount = corrections ? corrections[1] : 'unknown';
        const errCount = errors ? errors[1] : 'unknown';
        const fixedLines = fleetOutput.match(/\[✓\]\s*.+/g) || [];
        const errorLines = fleetOutput.match(/\[✗\]\s*.+/g) || [];
        const activeFixLines = fixedLines.filter(l =>
          !l.includes('Déjà') && !l.includes('déjà') && !l.includes('rien à faire')
        );
        const detailParts = [];
        if (activeFixLines.length > 0) {
          const labels = activeFixLines.map(l => l.replace(/\[✓\]\s*/, '').trim());
          detailParts.push(`${labels.length} correction(s) : ${labels.join(' | ')}`);
        } else {
          detailParts.push(`${corrCount} correction(s)`);
        }
        if (errorLines.length > 0) {
          const labels = errorLines.map(l => l.replace(/\[✗\]\s*/, '').trim());
          detailParts.push(`${labels.length} erreur(s) : ${labels.join(' | ')}`);
        } else {
          detailParts.push(`${errCount} erreur(s)`);
        }
        logger.info('fix-fleet-pi.sh completed', {
          corrections: corrCount,
          errors: errCount,
        });
        const hasErrors = errCount !== '0' && errCount !== 'unknown';
        stepTracker.end(
          hasErrors ? 'warn' : 'ok',
          detailParts.join(', ')
        );
      } catch (fleetError) {
        logger.warn('fix-fleet-pi.sh failed (non-blocking)', { error: fleetError.message });
        stepTracker.end('warn', fleetError.message);
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

module.exports = {
  fixFileOwnership,
  writeVersionMetadata,
  verifyNodeModules,
  extractAndInstall,
};
