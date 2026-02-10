/**
 * Route de mise à jour de l'application pour le serveur admin Neopro
 *
 * - POST /api/update -> Upload d'un package .tar.gz et déploiement
 */

const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const { execCommand, ensureDirectory, NEOPRO_DIR } = require('../helpers');

const router = express.Router();

// Uploader pour les packages de mise à jour (.tar.gz)
const uploadPackage = multer({
  storage: multer.diskStorage({
    destination: '/tmp',
    filename: (req, file, cb) => {
      cb(null, `neopro-update-${Date.now()}.tar.gz`);
    }
  }),
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  },
  fileFilter: (req, file, cb) => {
    // Accepter les archives tar.gz
    const allowedMimes = ['application/gzip', 'application/x-gzip', 'application/x-tar', 'application/x-compressed-tar'];
    const isTarGz = file.originalname.endsWith('.tar.gz') || file.originalname.endsWith('.tgz');
    if (allowedMimes.includes(file.mimetype) || isTarGz) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté. Utilisez un fichier .tar.gz'));
    }
  }
});

// API: Mise à jour de l'application
router.post('/api/update', uploadPackage.single('package'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // Helper pour exécuter une commande et vérifier le résultat
    const runCommand = async (cmd, description) => {
      const result = await execCommand(cmd);
      if (!result.success) {
        throw new Error(`${description}: ${result.error}`);
      }
      return result;
    };

    // S'assurer que le dossier backups existe
    await ensureDirectory(`${NEOPRO_DIR}/backups`);

    // Créer un backup
    const backupName = `backup-${Date.now()}.tar.gz`;
    await runCommand(
      `tar -czf ${NEOPRO_DIR}/backups/${backupName} -C ${NEOPRO_DIR} webapp server`,
      'Échec de la création du backup'
    );

    // Extraire le nouveau package
    const extractDir = '/tmp/neopro-update';
    await runCommand(`rm -rf ${extractDir} && mkdir -p ${extractDir}`, 'Échec de la préparation du dossier temporaire');
    await runCommand(`tar -xzf ${req.file.path} -C ${extractDir}`, 'Échec de l\'extraction du package');

    // Vérifier que la structure du package est correcte
    // Support des deux formats: nouveau (webapp/, server/) et ancien (deploy/webapp/, deploy/server/)
    const checkWebappNew = await execCommand(`test -d ${extractDir}/webapp`);
    const checkServerNew = await execCommand(`test -d ${extractDir}/server`);
    const checkWebappOld = await execCommand(`test -d ${extractDir}/deploy/webapp`);
    const checkServerOld = await execCommand(`test -d ${extractDir}/deploy/server`);

    const useNewFormat = checkWebappNew.success && checkServerNew.success;
    const useOldFormat = checkWebappOld.success && checkServerOld.success;

    if (!useNewFormat && !useOldFormat) {
      throw new Error('Structure du package invalide: les dossiers webapp et server sont requis');
    }

    const sourcePrefix = useNewFormat ? '' : 'deploy/';

    // S'assurer que les dossiers cibles existent
    await ensureDirectory(`${NEOPRO_DIR}/webapp`);
    await ensureDirectory(`${NEOPRO_DIR}/server`);

    // Sauvegarder configuration.json avant nettoyage
    // Note: Les vidéos sont dans /home/pi/neopro/videos/, pas dans webapp/
    await execCommand(`test -f ${NEOPRO_DIR}/webapp/configuration.json && cp ${NEOPRO_DIR}/webapp/configuration.json /tmp/configuration.json.backup`);

    // Nettoyer webapp/ pour éviter les anciens fichiers (main-*.js)
    await runCommand(`rm -rf ${NEOPRO_DIR}/webapp/*`, 'Échec du nettoyage de webapp');

    // Copier les nouveaux fichiers
    await runCommand(`cp -r ${extractDir}/${sourcePrefix}webapp/* ${NEOPRO_DIR}/webapp/`, 'Échec de la copie des fichiers webapp');
    await runCommand(`cp -r ${extractDir}/${sourcePrefix}server/* ${NEOPRO_DIR}/server/`, 'Échec de la copie des fichiers server');

    // Copier le sync-agent s'il est présent dans le package
    const hasSyncAgent = await execCommand(`test -d ${extractDir}/${sourcePrefix}sync-agent`);
    if (hasSyncAgent.success) {
      await ensureDirectory(`${NEOPRO_DIR}/sync-agent`);

      // Créer un golden snapshot AVANT de remplacer le code
      // Si le nouveau code crashe, le guardian pourra restaurer cette version
      const goldenExists = await execCommand(`test -d ${NEOPRO_DIR}/sync-agent-golden`);
      if (!goldenExists.success) {
        const agentJsExists = await execCommand(`test -f ${NEOPRO_DIR}/sync-agent/src/agent.js`);
        if (agentJsExists.success) {
          console.log('[UPDATE] Création du golden snapshot sync-agent (filet de sécurité)...');
          await execCommand(`cp -r ${NEOPRO_DIR}/sync-agent ${NEOPRO_DIR}/sync-agent-golden`);
          await execCommand(`date -Iseconds > ${NEOPRO_DIR}/sync-agent-golden/.golden-created`);
          await execCommand(`chown -R pi:pi ${NEOPRO_DIR}/sync-agent-golden`);
          console.log('[UPDATE] Golden snapshot créé');
        }
      }

      // Sauvegarder la config locale du sync-agent (.env, config/.env)
      await execCommand(`test -f ${NEOPRO_DIR}/sync-agent/.env && cp ${NEOPRO_DIR}/sync-agent/.env /tmp/sync-agent.env.backup`);
      await execCommand(`test -f ${NEOPRO_DIR}/sync-agent/config/.env && cp ${NEOPRO_DIR}/sync-agent/config/.env /tmp/sync-agent-config.env.backup`);
      // Copier les nouveaux fichiers du sync-agent
      await runCommand(`cp -r ${extractDir}/${sourcePrefix}sync-agent/* ${NEOPRO_DIR}/sync-agent/`, 'Échec de la copie des fichiers sync-agent');
      // Restaurer les configs locales
      await execCommand(`test -f /tmp/sync-agent.env.backup && cp /tmp/sync-agent.env.backup ${NEOPRO_DIR}/sync-agent/.env && rm /tmp/sync-agent.env.backup`);
      await execCommand(`test -f /tmp/sync-agent-config.env.backup && cp /tmp/sync-agent-config.env.backup ${NEOPRO_DIR}/sync-agent/config/.env && rm /tmp/sync-agent-config.env.backup`);
      console.log('[UPDATE] Sync-agent mis à jour');
    }

    // Copier les scripts s'ils sont présents dans le package
    const hasScripts = await execCommand(`test -d ${extractDir}/${sourcePrefix}scripts`);
    if (hasScripts.success) {
      await ensureDirectory(`${NEOPRO_DIR}/scripts`);
      await runCommand(`cp -r ${extractDir}/${sourcePrefix}scripts/* ${NEOPRO_DIR}/scripts/`, 'Échec de la copie des scripts');
      await execCommand(`chmod +x ${NEOPRO_DIR}/scripts/*.sh 2>/dev/null || true`);
      console.log('[UPDATE] Scripts mis à jour');
    }

    // Copier le dossier admin s'il est présent dans le package
    const hasAdmin = await execCommand(`test -d ${extractDir}/${sourcePrefix}admin`);
    if (hasAdmin.success) {
      await runCommand(`cp -r ${extractDir}/${sourcePrefix}admin/* ${NEOPRO_DIR}/admin/`, 'Échec de la copie des fichiers admin');
      console.log('[UPDATE] Admin panel mis à jour');
    }

    // Copier config/ (services systemd, etc.) s'il est présent
    const hasConfig = await execCommand(`test -d ${extractDir}/${sourcePrefix}config`);
    if (hasConfig.success) {
      await ensureDirectory(`${NEOPRO_DIR}/config`);
      await runCommand(`cp -r ${extractDir}/${sourcePrefix}config/* ${NEOPRO_DIR}/config/`, 'Échec de la copie des fichiers config');
      console.log('[UPDATE] Config files mis à jour');
    }

    // Restaurer configuration.json
    await execCommand(`test -f /tmp/configuration.json.backup && cp /tmp/configuration.json.backup ${NEOPRO_DIR}/webapp/configuration.json && rm /tmp/configuration.json.backup`);

    // Copier les fichiers de version si présents (nouveau format)
    if (useNewFormat) {
      await execCommand(`test -f ${extractDir}/VERSION && cp ${extractDir}/VERSION ${NEOPRO_DIR}/VERSION`);
      await execCommand(`test -f ${extractDir}/release.json && cp ${extractDir}/release.json ${NEOPRO_DIR}/release.json`);
    } else {
      await execCommand(`test -f ${extractDir}/deploy/VERSION && cp ${extractDir}/deploy/VERSION ${NEOPRO_DIR}/VERSION`);
      await execCommand(`test -f ${extractDir}/deploy/release.json && cp ${extractDir}/deploy/release.json ${NEOPRO_DIR}/release.json`);
    }

    // Installer les dépendances
    await runCommand(`cd ${NEOPRO_DIR}/server && npm install --production`, 'Échec de l\'installation des dépendances server');

    // npm install pour sync-agent (CRITICAL - sans ça le service crash)
    if (hasSyncAgent.success) {
      await runCommand(`cd ${NEOPRO_DIR}/sync-agent && npm install --production`, 'Échec de l\'installation des dépendances sync-agent');
    }

    // Corriger les permissions (important après copie avec sudo)
    await execCommand(`sudo chown -R pi:pi ${NEOPRO_DIR}/webapp`);
    await execCommand(`sudo chown -R pi:pi ${NEOPRO_DIR}/server`);
    await execCommand(`sudo chown -R pi:pi ${NEOPRO_DIR}/sync-agent 2>/dev/null || true`);
    await execCommand(`sudo chown -R pi:pi ${NEOPRO_DIR}/admin 2>/dev/null || true`);
    await execCommand(`sudo chown -R pi:pi ${NEOPRO_DIR}/scripts 2>/dev/null || true`);
    await execCommand(`sudo chown -R pi:pi ${NEOPRO_DIR}/config 2>/dev/null || true`);
    await execCommand('sudo usermod -a -G pi www-data 2>/dev/null || true');

    // Installer les services systemd depuis config/systemd/ si présents
    const hasSystemdServices = await execCommand(`test -d ${NEOPRO_DIR}/config/systemd`);
    if (hasSystemdServices.success) {
      const serviceFiles = await execCommand(`ls ${NEOPRO_DIR}/config/systemd/*.service 2>/dev/null`);
      if (serviceFiles.success && serviceFiles.output) {
        const files = serviceFiles.output.trim().split('\n').filter(f => f);
        const managedServices = ['neopro-app', 'neopro-admin', 'neopro-kiosk', 'neopro-sync-agent'];
        const newlyInstalled = [];

        for (const svcFile of files) {
          const svcName = path.basename(svcFile);
          const svcBaseName = svcName.replace('.service', '');
          const wasInstalled = (await execCommand(`test -f /etc/systemd/system/${svcName}`)).success;

          await execCommand(`sudo cp "${svcFile}" /etc/systemd/system/${svcName}`);
          await execCommand(`sudo chown root:root /etc/systemd/system/${svcName}`);
          await execCommand(`sudo chmod 644 /etc/systemd/system/${svcName}`);
          await execCommand(`sudo systemctl enable ${svcBaseName} 2>/dev/null || true`);

          if (!wasInstalled) {
            newlyInstalled.push(svcBaseName);
          }
          console.log(`[UPDATE] Service ${svcName} installé`);
        }

        await execCommand('sudo systemctl daemon-reload');

        // Démarrer les nouveaux services (sauf ceux gérés manuellement)
        for (const svc of newlyInstalled) {
          if (!managedServices.includes(svc)) {
            await execCommand(`sudo systemctl start ${svc} 2>/dev/null || true`);
            console.log(`[UPDATE] Service ${svc} démarré (nouveau)`);
          }
        }
      }
    }

    // Redémarrer les services
    await runCommand('sudo systemctl restart neopro-app', 'Échec du redémarrage de neopro-app');
    await runCommand('sudo systemctl restart nginx', 'Échec du redémarrage de nginx');
    // Redémarrer le sync-agent pour qu'il prenne en compte les nouveaux fichiers
    await execCommand('sudo systemctl restart neopro-sync-agent 2>/dev/null || true');
    // Redémarrer le kiosk pour appliquer la nouvelle webapp + kiosk-watchdog.sh
    await execCommand('sudo systemctl restart neopro-kiosk 2>/dev/null || true');

    // Nettoyage
    await fs.unlink(req.file.path);
    await execCommand(`rm -rf ${extractDir}`);

    res.json({
      success: true,
      message: 'Mise à jour appliquée avec succès',
      backup: backupName
    });
  } catch (error) {
    console.error('[UPDATE] Erreur:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
