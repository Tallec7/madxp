/**
 * hotspot-sync.js — ADR-074
 *
 * Sync-agent consumer for the cloud-canonical hotspot PSK.
 *
 * Flow:
 *   1. Boot / reconnect → syncFromCloud()
 *   2. GET /api/sites/:id/hotspot-config (Bearer <apiKey>)
 *      - 200 → diff with /etc/hostapd/hostapd.conf. If changed, rewrite + restart hostapd.
 *      - 404 → cloud not bootstrapped yet. Read local hostapd.conf and POST /bootstrap.
 *   3. On any cloud error → fall back to local cache (encrypted JSONL at $NEOPRO_ROOT/.hotspot-cache).
 *
 * The cache is only used when cloud is unreachable; cloud wins on every successful fetch.
 *
 * Writers of hostapd.conf after ADR-074:
 *   - This module (sync-agent)
 *   - install.sh (initial bootstrap)
 * Everything else must READ hostapd.conf, never write.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { createCipheriv, createDecipheriv, randomBytes, createHash } = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const logger = require('../logger');

const HOSTAPD_CONF = '/etc/hostapd/hostapd.conf';
const CACHE_DIR = process.env.NEOPRO_ROOT || '/home/pi/neopro';
const CACHE_PATH = path.join(CACHE_DIR, '.hotspot-cache');

// The cache is encrypted with a key derived from the site API key (unique per Pi).
// Not a security boundary vs root — the Pi already has hostapd.conf readable by root —
// but prevents the PSK from appearing in cleartext in casual backups.
function cacheKey(apiKey) {
  return createHash('sha256').update(`hotspot-cache:${apiKey}`).digest();
}

function writeCache(apiKey, { ssid, psk }) {
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', cacheKey(apiKey), iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify({ ssid, psk }), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = JSON.stringify({
      v: 1,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ct: ct.toString('base64'),
    });
    fs.writeFileSync(CACHE_PATH, payload, { mode: 0o600 });
  } catch (err) {
    logger.warn('hotspot-sync: cache write failed', { error: err.message });
  }
}

function readCache(apiKey) {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const payload = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    const decipher = createDecipheriv('aes-256-gcm', cacheKey(apiKey), Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(payload.ct, 'base64')), decipher.final()]);
    return JSON.parse(pt.toString('utf8'));
  } catch (err) {
    logger.warn('hotspot-sync: cache read failed', { error: err.message });
    return null;
  }
}

function parseHostapdConf(contents) {
  const ssidMatch = contents.match(/^ssid=(.+)$/m);
  const pskMatch = contents.match(/^wpa_passphrase=(.+)$/m);
  return {
    ssid: ssidMatch ? ssidMatch[1].trim() : null,
    psk: pskMatch ? pskMatch[1].trim() : null,
  };
}

function readLocalHostapd(confPath = HOSTAPD_CONF) {
  if (!fs.existsSync(confPath)) return { ssid: null, psk: null };
  return parseHostapdConf(fs.readFileSync(confPath, 'utf8'));
}

function shellEscape(value) {
  // sed uses `|` as delimiter (consistent with admin rotatePsk). Escape backslashes and pipes.
  return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function execAsync(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
      resolve({ success: !error, stdout, stderr: stderr || (error && error.message) || '' });
    });
  });
}

async function writeHostapdAndRestart({ ssid, psk }) {
  // sudoers: `sudo /usr/bin/sed -i * /etc/hostapd/hostapd.conf`
  const sedSsid = `sudo /usr/bin/sed -i 's|^ssid=.*|ssid=${shellEscape(ssid)}|' ${HOSTAPD_CONF}`;
  const sedPsk = `sudo /usr/bin/sed -i 's|^wpa_passphrase=.*|wpa_passphrase=${shellEscape(psk)}|' ${HOSTAPD_CONF}`;
  const sedResult1 = await execAsync(sedSsid);
  if (!sedResult1.success) throw new Error(`sed ssid failed: ${sedResult1.stderr}`);
  const sedResult2 = await execAsync(sedPsk);
  if (!sedResult2.success) throw new Error(`sed psk failed: ${sedResult2.stderr}`);
  const restart = await execAsync('sudo /usr/bin/systemctl restart hostapd');
  if (!restart.success) throw new Error(`hostapd restart failed: ${restart.stderr}`);
}

function httpJson(method, fullUrl, apiKey, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = lib.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        timeout: 10000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch (_e) { json = null; }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Main entry: sync hostapd.conf with cloud canonical config.
 * @param {{ centralUrl: string, siteId: string, apiKey: string, confPath?: string }} opts
 * @returns {Promise<{ action: 'noop'|'updated'|'bootstrapped'|'fallback_cache'|'skipped', detail?: string }>}
 */
async function syncFromCloud({ centralUrl, siteId, apiKey, confPath = HOSTAPD_CONF }) {
  if (!centralUrl || !siteId || !apiKey) {
    return { action: 'skipped', detail: 'missing central/site credentials' };
  }

  const url = `${centralUrl.replace(/\/$/, '')}/api/sites/${siteId}/hotspot-config`;
  const local = readLocalHostapd(confPath);

  let response;
  try {
    response = await httpJson('GET', url, apiKey);
  } catch (err) {
    // Cloud unreachable — trust cache if we have one, otherwise trust local hostapd.conf.
    const cached = readCache(apiKey);
    if (cached && (cached.ssid !== local.ssid || cached.psk !== local.psk)) {
      logger.info('hotspot-sync: cloud unreachable, applying cached config', { ssid: cached.ssid });
      await writeHostapdAndRestart(cached);
      return { action: 'fallback_cache', detail: err.message };
    }
    return { action: 'skipped', detail: `cloud unreachable: ${err.message}` };
  }

  if (response.status === 404) {
    // Cloud has no config yet → bootstrap from the Pi's current hostapd.conf.
    if (!local.ssid || !local.psk) {
      return { action: 'skipped', detail: 'local hostapd.conf missing ssid/psk; cannot bootstrap' };
    }
    const postUrl = `${url}/bootstrap`;
    const post = await httpJson('POST', postUrl, apiKey, { ssid: local.ssid, psk: local.psk });
    if (post.status === 201) {
      writeCache(apiKey, local);
      logger.info('hotspot-sync: bootstrapped cloud with local config', { ssid: local.ssid });
      return { action: 'bootstrapped' };
    }
    if (post.status === 409 && post.body && post.body.ssid && post.body.psk) {
      // Race — cloud got bootstrapped from elsewhere meanwhile. Apply what cloud returned.
      return applyIfDiff(post.body, local, apiKey, confPath);
    }
    return { action: 'skipped', detail: `bootstrap failed status=${post.status}` };
  }

  if (response.status !== 200 || !response.body) {
    return { action: 'skipped', detail: `unexpected status=${response.status}` };
  }

  return applyIfDiff(response.body, local, apiKey, confPath);
}

async function applyIfDiff(cloud, local, apiKey, _confPath) {
  if (cloud.ssid === local.ssid && cloud.psk === local.psk) {
    writeCache(apiKey, cloud);
    return { action: 'noop' };
  }
  logger.info('hotspot-sync: applying cloud config (diff detected)', {
    ssidChanged: cloud.ssid !== local.ssid,
    pskChanged: cloud.psk !== local.psk,
  });
  await writeHostapdAndRestart({ ssid: cloud.ssid, psk: cloud.psk });
  writeCache(apiKey, cloud);
  return { action: 'updated' };
}

module.exports = {
  syncFromCloud,
  // Exposed for tests
  _internal: {
    parseHostapdConf,
    readLocalHostapd,
    writeCache,
    readCache,
    shellEscape,
    applyIfDiff,
  },
};
