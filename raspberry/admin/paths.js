/**
 * Chemins et constantes de configuration pour le serveur admin Neopro.
 */

const path = require('path');

const DEFAULT_NEOPRO_DIR = path.resolve(__dirname, '..');
const NEOPRO_DIR = process.env.NEOPRO_DIR || DEFAULT_NEOPRO_DIR;
const VIDEOS_DIR = path.join(NEOPRO_DIR, 'videos');
const SECONDARY_VIDEOS_DIR = path.join(NEOPRO_DIR, 'videos-secondary');
const TEMP_UPLOAD_DIR = path.join(NEOPRO_DIR, 'uploads-temp');
const PROCESSING_DIR = path.join(NEOPRO_DIR, 'videos-processing');
const THUMBNAILS_DIR = path.join(NEOPRO_DIR, 'thumbnails');
const LOGS_DIR = path.join(NEOPRO_DIR, 'logs');
const VERSION_FILE = path.join(NEOPRO_DIR, 'VERSION');
const RELEASE_METADATA_FILE = path.join(NEOPRO_DIR, 'release.json');
const VIDEO_COMPRESSION_ENABLED = process.env.VIDEO_COMPRESSION !== 'false';
const VIDEO_THUMBNAILS_ENABLED = process.env.VIDEO_THUMBNAILS !== 'false';
const CONFIG_JSON_INDENT = 4;

// Single source of truth: webapp/configuration.json
const CONFIG_FILE_CANDIDATES = [
  process.env.CONFIG_PATH,
  path.join(NEOPRO_DIR, 'webapp', 'configuration.json'),
].filter((value, index, self) => value && self.indexOf(value) === index);

module.exports = {
  NEOPRO_DIR,
  VIDEOS_DIR,
  SECONDARY_VIDEOS_DIR,
  TEMP_UPLOAD_DIR,
  PROCESSING_DIR,
  THUMBNAILS_DIR,
  LOGS_DIR,
  VERSION_FILE,
  RELEASE_METADATA_FILE,
  VIDEO_COMPRESSION_ENABLED,
  VIDEO_THUMBNAILS_ENABLED,
  CONFIG_FILE_CANDIDATES,
  CONFIG_JSON_INDENT,
};
