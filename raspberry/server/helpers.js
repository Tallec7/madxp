const path = require('path');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const CENTRAL_SERVER_URL = process.env.CENTRAL_SERVER_URL || 'https://neopro-central-production.up.railway.app';
const SITE_ID = process.env.SITE_ID;
const SITE_NAME = process.env.SITE_NAME || null;
const IS_CLOUD_ENV = !!(process.env.RENDER || process.env.NODE_ENV === 'production');
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------
const HOME_DIR = process.env.HOME || '/home/pi';
const NEOPRO_DATA_DIR = path.join(HOME_DIR, 'neopro', 'data');
const NEOPRO_WEBAPP_DIR = path.join(HOME_DIR, 'neopro', 'webapp');
const CONFIG_PATH = path.join(NEOPRO_WEBAPP_DIR, 'configuration.json');
const LICENSE_CACHE_PATH = path.join(NEOPRO_DATA_DIR, 'license_cache.json');
const ANALYTICS_FILE_PATH = path.join(NEOPRO_DATA_DIR, 'analytics_buffer.json');
const SPONSOR_IMPRESSIONS_FILE_PATH = path.join(NEOPRO_DATA_DIR, 'sponsor_impressions.json');

module.exports = {
  CENTRAL_SERVER_URL,
  SITE_ID,
  SITE_NAME,
  IS_CLOUD_ENV,
  PORT,
  NEOPRO_DATA_DIR,
  NEOPRO_WEBAPP_DIR,
  CONFIG_PATH,
  LICENSE_CACHE_PATH,
  ANALYTICS_FILE_PATH,
  SPONSOR_IMPRESSIONS_FILE_PATH,
};
