const fs = require('fs/promises');
const path = require('path');
const { config } = require('../config');

const CACHE_TTL = 60 * 1000; // 60s
let cache = null;
let cacheTimestamp = 0;

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function readTextSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw.trim();
  } catch (error) {
    return null;
  }
}

async function getVersionInfo(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheTimestamp < CACHE_TTL) {
    return cache;
  }

  const rootDir = config.paths?.root || '/home/pi/neopro';
  const info = {
    version: 'unknown',
    commit: null,
    buildDate: null,
    source: 'unknown',
  };

  const releaseFile = path.join(rootDir, 'release.json');
  const versionInfoFile = path.join(rootDir, 'webapp', 'version.json');
  const versionFile = path.join(rootDir, 'VERSION');
  const packageFile = path.join(rootDir, 'webapp', 'package.json');

  const releaseData = await readJsonSafe(releaseFile);
  if (releaseData) {
    if (releaseData.version) {
      info.version = releaseData.version;
    }
    info.commit = releaseData.commit || null;
    info.buildDate = releaseData.buildDate || null;
    info.source = releaseData.source || 'release.json';
  }

  if (!info.version || info.version === 'unknown') {
    const versionJson = await readJsonSafe(versionInfoFile);
    if (versionJson?.version) {
      info.version = versionJson.version;
      info.commit = info.commit || versionJson.commit || null;
      info.buildDate = info.buildDate || versionJson.buildDate || null;
      info.source = versionJson.source || 'webapp/version.json';
    }
  }

  if (!info.version || info.version === 'unknown') {
    const versionText = await readTextSafe(versionFile);
    if (versionText) {
      info.version = versionText;
      info.source = 'VERSION';
    }
  }

  if (!info.version || info.version === 'unknown') {
    const pkg = await readJsonSafe(packageFile);
    if (pkg?.version) {
      info.version = pkg.version;
      info.source = 'webapp/package.json';
    }
  }

  cache = info;
  cacheTimestamp = now;
  return info;
}

module.exports = { getVersionInfo };
