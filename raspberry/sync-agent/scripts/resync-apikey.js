#!/usr/bin/env node

/**
 * Script pour resynchroniser l'API key d'un site existant
 * Régénère l'API key sur le serveur et met à jour la configuration locale
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Charger la configuration existante
const configPath = '/etc/neopro/site.conf';
const fallbackPath = path.join(__dirname, '../config/.env');

let currentConfigPath = null;
if (fs.existsSync(configPath)) {
  currentConfigPath = configPath;
} else if (fs.existsSync(fallbackPath)) {
  currentConfigPath = fallbackPath;
}

if (currentConfigPath) {
  dotenv.config({ path: currentConfigPath });
}

async function resyncApiKey() {
  console.log('🔄 NEOPRO - Resynchronisation API Key\n');
  console.log('='.repeat(50));

  const serverUrl = process.env.CENTRAL_SERVER_URL;
  const siteId = process.env.SITE_ID;

  if (!serverUrl) {
    console.log('❌ CENTRAL_SERVER_URL non configuré');
    console.log('   Exécutez d\'abord: sudo node scripts/register-site.js');
    process.exit(1);
  }

  console.log(`\nServeur central: ${serverUrl}`);

  if (siteId) {
    console.log(`Site ID existant: ${siteId}`);
  }

  // Demander les credentials admin
  console.log('\n🔑 Credentials admin requis:\n');
  const email = await question('Admin email: ');
  const password = await question('Admin password: ');

  if (!email || !password) {
    console.error('\n❌ Email et mot de passe requis');
    process.exit(1);
  }

  try {
    // 1. S'authentifier
    console.log('\n🔐 Authentification...');
    const loginResponse = await axios.post(`${serverUrl}/api/auth/login`, {
      email,
      password,
    });

    const token = loginResponse.data.token;
    console.log('✅ Authentifié');

    // 2. Récupérer la liste des sites si pas de siteId
    let targetSiteId = siteId;

    if (!targetSiteId) {
      console.log('\n📋 Récupération des sites...');
      const sitesResponse = await axios.get(`${serverUrl}/api/sites`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const sites = sitesResponse.data.sites || [];

      if (sites.length === 0) {
        console.log('❌ Aucun site trouvé. Créez d\'abord un site.');
        process.exit(1);
      }

      console.log('\nSites disponibles:');
      sites.forEach((site, index) => {
        console.log(`  ${index + 1}. ${site.site_name} (${site.club_name}) - ${site.status}`);
      });

      const choice = await question('\nNuméro du site à resynchroniser: ');
      const choiceIndex = parseInt(choice, 10) - 1;

      if (choiceIndex < 0 || choiceIndex >= sites.length) {
        console.log('❌ Choix invalide');
        process.exit(1);
      }

      targetSiteId = sites[choiceIndex].id;
      console.log(`\nSite sélectionné: ${sites[choiceIndex].site_name}`);
    }

    // 3. Régénérer l'API key
    console.log('\n🔄 Régénération de l\'API key...');
    const regenResponse = await axios.post(
      `${serverUrl}/api/sites/${targetSiteId}/regenerate-key`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const newApiKey = regenResponse.data.api_key;
    const siteName = regenResponse.data.site_name;

    console.log('✅ Nouvelle API key générée');

    // 4. Mettre à jour la configuration locale
    console.log('\n💾 Mise à jour de la configuration locale...');

    const targetPath = currentConfigPath || configPath;
    let configContent;

    if (fs.existsSync(targetPath)) {
      // Lire et modifier le fichier existant
      configContent = fs.readFileSync(targetPath, 'utf8');

      // Remplacer SITE_ID et SITE_API_KEY
      if (configContent.includes('SITE_ID=')) {
        configContent = configContent.replace(/SITE_ID=.*/, `SITE_ID=${targetSiteId}`);
      } else {
        configContent += `\nSITE_ID=${targetSiteId}`;
      }

      if (configContent.includes('SITE_API_KEY=')) {
        configContent = configContent.replace(/SITE_API_KEY=.*/, `SITE_API_KEY=${newApiKey}`);
      } else {
        configContent += `\nSITE_API_KEY=${newApiKey}`;
      }
    } else {
      // Créer un nouveau fichier
      configContent = `# NEOPRO Site Configuration
CENTRAL_SERVER_URL=${serverUrl}
CENTRAL_SERVER_ENABLED=true

SITE_ID=${targetSiteId}
SITE_API_KEY=${newApiKey}

SITE_NAME=${siteName}

NEOPRO_ROOT=/home/pi/neopro
VIDEOS_PATH=/home/pi/neopro/videos
CONFIG_PATH=/home/pi/neopro/webapp/configuration.json
BACKUP_PATH=/home/pi/neopro/backups

HEARTBEAT_INTERVAL=30000
METRICS_INTERVAL=300000

LOG_LEVEL=info
LOG_PATH=/home/pi/neopro/logs/sync-agent.log

AUTO_UPDATE_ENABLED=true
AUTO_UPDATE_HOUR=3

MAX_DOWNLOAD_SIZE=1073741824
ALLOWED_COMMANDS=deploy_video,delete_video,update_software,update_config,reboot,restart_service,get_logs,get_system_info,get_config,update_hotspot,get_hotspot_config
`;
    }

    await fs.ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, configContent);

    console.log(`✅ Configuration sauvegardée: ${targetPath}`);

    console.log('\n' + '='.repeat(50));
    console.log('🎉 Resynchronisation terminée!\n');
    console.log('Redémarrez le service:');
    console.log('  sudo systemctl restart neopro-sync-agent\n');

  } catch (error) {
    console.error('\n❌ Erreur:', error.response?.data?.error || error.message);
    if (error.response?.status === 401) {
      console.log('   Vérifiez vos credentials admin');
    } else if (error.response?.status === 404) {
      console.log('   Site non trouvé sur le serveur');
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

resyncApiKey();
