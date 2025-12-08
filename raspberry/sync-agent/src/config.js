const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

const configPath = process.env.CONFIG_FILE || '/etc/neopro/site.conf';

if (fs.existsSync(configPath)) {
  dotenv.config({ path: configPath });
}

dotenv.config({ path: path.join(__dirname, '../config/.env') });

const config = {
  central: {
    url: process.env.CENTRAL_SERVER_URL || 'http://localhost:3001',
    enabled: process.env.CENTRAL_SERVER_ENABLED === 'true',
  },

  site: {
    id: process.env.SITE_ID,
    apiKey: process.env.SITE_API_KEY,
    name: process.env.SITE_NAME,
    clubName: process.env.CLUB_NAME,
    location: {
      city: process.env.LOCATION_CITY,
      region: process.env.LOCATION_REGION,
      country: process.env.LOCATION_COUNTRY,
    },
    sports: process.env.SPORTS ? process.env.SPORTS.split(',') : [],
  },

  paths: {
    root: process.env.NEOPRO_ROOT || '/home/pi/neopro',
    videos: process.env.VIDEOS_PATH || '/home/pi/neopro/videos',
    config: process.env.CONFIG_PATH || '/home/pi/neopro/webapp/configuration.json',
    backup: process.env.BACKUP_PATH || '/home/pi/neopro/backups',
  },

  monitoring: {
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000'),
    metricsInterval: parseInt(process.env.METRICS_INTERVAL || '300000'),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    path: process.env.LOG_PATH || '/home/pi/neopro/logs/sync-agent.log',
  },

  updates: {
    autoUpdateEnabled: process.env.AUTO_UPDATE_ENABLED === 'true',
    autoUpdateHour: parseInt(process.env.AUTO_UPDATE_HOUR || '3'),
  },

  security: {
    maxDownloadSize: parseInt(process.env.MAX_DOWNLOAD_SIZE || '1073741824'),
    allowedCommands: process.env.ALLOWED_COMMANDS
      ? process.env.ALLOWED_COMMANDS.split(',')
      : ['deploy_video', 'delete_video', 'update_software', 'update_config', 'reboot', 'restart_service', 'get_logs', 'get_config'],
  },
};

const validateConfig = () => {
  if (!config.central.enabled) {
    console.warn('⚠️  Central server disabled - agent will run in offline mode');
    return false;
  }

  if (!config.site.id || !config.site.apiKey) {
    console.error('❌ SITE_ID and SITE_API_KEY are required');
    console.error('Run: sudo node scripts/register-site.js');
    return false;
  }

  return true;
};

module.exports = { config, validateConfig };
