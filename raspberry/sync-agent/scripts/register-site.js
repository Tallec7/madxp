#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs-extra');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

/**
 * Get value from environment variable or prompt user
 * @param {string} envVar - Environment variable name
 * @param {string} prompt - Prompt message if env var not set
 * @param {string} defaultValue - Default value if neither env nor input provided
 */
async function getValueOrPrompt(envVar, prompt, defaultValue = '') {
  const envValue = process.env[envVar];
  if (envValue) {
    console.log(`  ${envVar}: ${envValue}`);
    return envValue;
  }
  const input = await question(prompt);
  return input || defaultValue;
}

async function registerSite() {
  console.log('🔐 NEOPRO Site Registration');
  console.log('============================\n');

  // Check if running in non-interactive mode (env vars provided)
  const hasEnvConfig = process.env.SITE_NAME && process.env.CLUB_NAME;
  if (hasEnvConfig) {
    console.log('ℹ️  Running with pre-configured values:\n');
  }

  try {
    // Server URL - default to production
    const serverUrl = await getValueOrPrompt(
      'CENTRAL_SERVER_URL',
      'Central Server URL (e.g., https://neopro-central-server.onrender.com): ',
      'https://neopro-central-server.onrender.com'
    );

    // Admin credentials - always prompt for security
    console.log('\n🔑 Admin credentials (required for authentication):');
    const email = await question('Admin email: ');
    const password = await question('Admin password: ');

    if (!email || !password) {
      console.error('\n❌ Email and password are required');
      process.exit(1);
    }

    console.log('\n🔑 Authenticating...');

    const loginResponse = await axios.post(`${serverUrl}/api/auth/login`, {
      email,
      password,
    });

    const token = loginResponse.data.token;

    console.log('✅ Authenticated successfully\n');

    // Site info - from env vars or prompt
    if (hasEnvConfig) {
      console.log('📋 Site configuration:');
    }

    const siteName = await getValueOrPrompt('SITE_NAME', 'Site Name (e.g., Site Rennes): ');
    const clubName = await getValueOrPrompt('CLUB_NAME', 'Club Name (e.g., Rennes FC): ');
    const city = await getValueOrPrompt('LOCATION_CITY', 'City: ');
    const region = await getValueOrPrompt('LOCATION_REGION', 'Region (e.g., Bretagne): ', 'Bretagne');
    const country = await getValueOrPrompt('LOCATION_COUNTRY', 'Country (default: France): ', 'France');
    const sports = await getValueOrPrompt('SPORTS', 'Sports (comma-separated, e.g., football,rugby): ', 'handball');

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

NEOPRO_ROOT=/home/pi/neopro
VIDEOS_PATH=/home/pi/neopro/videos
CONFIG_PATH=/home/pi/neopro/public/configuration.json
BACKUP_PATH=/home/pi/neopro/backups

HEARTBEAT_INTERVAL=30000
METRICS_INTERVAL=300000

LOG_LEVEL=info
LOG_PATH=/home/pi/neopro/logs/sync-agent.log

AUTO_UPDATE_ENABLED=true
AUTO_UPDATE_HOUR=3

MAX_DOWNLOAD_SIZE=1073741824
ALLOWED_COMMANDS=deploy_video,delete_video,update_software,update_config,reboot,restart_service,get_logs
`;

    // In non-interactive mode with env vars, auto-save to /etc/neopro
    let saveToEtc = 'y';
    if (!hasEnvConfig) {
      saveToEtc = await question('\n💾 Save configuration to /etc/neopro/site.conf? (y/n): ');
    } else {
      console.log('\n💾 Saving configuration to /etc/neopro/site.conf...');
    }

    if (saveToEtc.toLowerCase() === 'y') {
      await fs.ensureDir('/etc/neopro');
      await fs.writeFile('/etc/neopro/site.conf', configContent);
      console.log('✅ Configuration saved to /etc/neopro/site.conf');
    } else {
      await fs.ensureDir('config');
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
