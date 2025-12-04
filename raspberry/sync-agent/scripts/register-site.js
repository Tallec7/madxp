#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs-extra');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function registerSite() {
  console.log('🔐 NEOPRO Site Registration');
  console.log('============================\n');

  try {
    const serverUrl = await question('Central Server URL (e.g., https://neopro-central-server.onrender.com): ');
    const email = await question('Admin email: ');
    const password = await question('Admin password: ', { hideEchoBack: true });

    console.log('\n🔑 Authenticating...');

    const loginResponse = await axios.post(`${serverUrl}/api/auth/login`, {
      email,
      password,
    });

    const token = loginResponse.data.token;

    console.log('✅ Authenticated successfully\n');

    const siteName = await question('Site Name (e.g., Site Rennes): ');
    const clubName = await question('Club Name (e.g., Rennes FC): ');
    const city = await question('City: ');
    const region = await question('Region (e.g., Bretagne): ');
    const country = await question('Country (default: France): ') || 'France';
    const sports = await question('Sports (comma-separated, e.g., football,rugby): ');

    console.log('\n📝 Creating site...');

    const createResponse = await axios.post(
      `${serverUrl}/api/sites`,
      {
        site_name: siteName,
        club_name: clubName,
        location: {
          city,
          region,
          country,
        },
        sports: sports.split(',').map(s => s.trim()),
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const site = createResponse.data;

    console.log('✅ Site created successfully\n');
    console.log('Site ID:', site.id);
    console.log('API Key:', site.api_key);

    const configContent = `# NEOPRO Site Configuration
CENTRAL_SERVER_URL=${serverUrl}
CENTRAL_SERVER_ENABLED=true

SITE_ID=${site.id}
SITE_API_KEY=${site.api_key}

SITE_NAME=${siteName}
CLUB_NAME=${clubName}
LOCATION_CITY=${city}
LOCATION_REGION=${region}
LOCATION_COUNTRY=${country}
SPORTS=${sports}

NEOPRO_ROOT=/home/neopro
VIDEOS_PATH=/home/neopro/videos
CONFIG_PATH=/home/neopro/public/configuration.json
BACKUP_PATH=/home/neopro/backups

HEARTBEAT_INTERVAL=30000
METRICS_INTERVAL=300000

LOG_LEVEL=info
LOG_PATH=/home/neopro/logs/sync-agent.log

AUTO_UPDATE_ENABLED=true
AUTO_UPDATE_HOUR=3

MAX_DOWNLOAD_SIZE=1073741824
ALLOWED_COMMANDS=deploy_video,delete_video,update_software,update_config,reboot,restart_service,get_logs
`;

    const saveToEtc = await question('\n💾 Save configuration to /etc/neopro/site.conf? (y/n): ');

    if (saveToEtc.toLowerCase() === 'y') {
      await fs.ensureDir('/etc/neopro');
      await fs.writeFile('/etc/neopro/site.conf', configContent);
      console.log('✅ Configuration saved to /etc/neopro/site.conf');
    } else {
      await fs.writeFile('config/.env', configContent);
      console.log('✅ Configuration saved to config/.env');
    }

    console.log('\n🎉 Site registration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Install the service: sudo npm run install-service');
    console.log('2. Check status: sudo systemctl status neopro-sync-agent');
  } catch (error) {
    console.error('\n❌ Registration failed:', error.response?.data || error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

registerSite();
