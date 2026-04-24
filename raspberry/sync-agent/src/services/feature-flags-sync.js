/**
 * feature-flags-sync.js — ADR-092 Phase Pi
 *
 * Sync-agent consumer for site-level feature flags (`feature_overrides`).
 *
 * Flow:
 *   1. Boot / reconnect → syncFromCloud()
 *   2. GET /api/sites/:id/feature-flags (Bearer <apiKey>)
 *      - 200 → overwrite `configuration.json` root-level `featureOverrides`
 *      - non-200 → leave config untouched
 *
 * The Angular Pi webapp reads `configuration.featureOverrides` via the
 * route resolver and RemoteHostComponent picks V1/V2 accordingly.
 *
 * featureOverrides is declared in LOCAL_ONLY_SETTINGS (config-merge.js) so
 * a subsequent cloud `update_config` push does not wipe the value between
 * feature-flags-sync runs.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const logger = require('../logger');
const config = require('../config');
const { safeReadConfig, atomicWriteJson } = require('../utils/safe-config-io');

function httpJson(method, fullUrl, apiKey) {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const lib = u.protocol === 'https:' ? https : http;
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
    req.end();
  });
}

async function syncFromCloud({ centralUrl, siteId, apiKey, configPath } = {}) {
  if (!centralUrl || !siteId || !apiKey) {
    return { action: 'skipped', detail: 'missing central/site credentials' };
  }

  const resolvedPath = configPath || (config.paths && config.paths.config);
  if (!resolvedPath) {
    return { action: 'skipped', detail: 'no configuration.json path configured' };
  }

  const url = `${centralUrl.replace(/\/$/, '')}/api/sites/${siteId}/feature-flags`;

  let response;
  try {
    response = await httpJson('GET', url, apiKey);
  } catch (err) {
    return { action: 'skipped', detail: `cloud unreachable: ${err.message}` };
  }

  if (response.status !== 200 || !response.body || typeof response.body.featureOverrides !== 'object') {
    return { action: 'skipped', detail: `unexpected status=${response.status}` };
  }

  const cloudOverrides = response.body.featureOverrides || {};

  let localConfig;
  try {
    localConfig = await safeReadConfig(resolvedPath);
  } catch (err) {
    return { action: 'skipped', detail: `read config failed: ${err.message}` };
  }

  const before = localConfig.featureOverrides || {};
  const changed = JSON.stringify(before) !== JSON.stringify(cloudOverrides);

  if (!changed) {
    return { action: 'noop', count: Object.keys(cloudOverrides).length };
  }

  localConfig.featureOverrides = cloudOverrides;

  try {
    await atomicWriteJson(resolvedPath, localConfig);
  } catch (err) {
    return { action: 'skipped', detail: `write config failed: ${err.message}` };
  }

  logger.info('feature-flags-sync: configuration.json updated', {
    flags: Object.keys(cloudOverrides),
  });
  return { action: 'updated', count: Object.keys(cloudOverrides).length };
}

module.exports = {
  syncFromCloud,
};
