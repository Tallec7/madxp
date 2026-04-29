/**
 * web-content-sync.js — ADR-089 Phase 2
 *
 * Sync-agent consumer for web_page / livestream entries managed cloud-side.
 *
 * Flow:
 *   1. Boot / reconnect → syncFromCloud()
 *   2. GET /api/sites/:id/web-content (Bearer <apiKey>)
 *      - 200 → merge entries into configuration.json under a pseudo-category
 *        `web-content` (id: 'web-content', name: 'Web / Live').
 *      - 404 / non-200 → leave config untouched.
 *
 * Each entry is written as a `PiConfigVideoEntry` carrying `contentType`
 * (`web_page` | `livestream`) and `externalUrl` so the Remote/TV dispatch
 * knows how to play it without any code change on the Pi.
 *
 * Writers of configuration.json after ADR-089:
 *   - update-config.js (cloud config push, merge/replace strategies)
 *   - sync-profiles (profile switch)
 *   - this module (web_page / livestream pseudo-category only)
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const logger = require('../logger');
const config = require('../config');
const { safeReadConfig, atomicWriteJson } = require('../utils/safe-config-io');

const WEB_CATEGORY_ID = 'web-content';
const WEB_CATEGORY_NAME = 'Web / Live';

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

/**
 * Merge cloud entries into categories[], replacing any prior pseudo-category.
 * Pure function — returns a new categories array.
 */
function mergeWebContent(categories, entries) {
  const withoutWeb = (Array.isArray(categories) ? categories : []).filter(
    (c) => c && c.id !== WEB_CATEGORY_ID,
  );

  if (!entries || entries.length === 0) {
    return withoutWeb;
  }

  const videos = entries.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.contentType,
    path: e.externalUrl,
    contentType: e.contentType,
    externalUrl: e.externalUrl,
    durationSeconds: e.durationSeconds ?? null,
    thumbnailUrl: e.thumbnailUrl ?? null,
    video_id: e.id,
  }));

  return [
    ...withoutWeb,
    {
      id: WEB_CATEGORY_ID,
      name: WEB_CATEGORY_NAME,
      videos,
    },
  ];
}

/**
 * ADR-103 Phase 0.6 — register the web-content pseudo-category in every
 * timeCategory.categoryIds[] so the Remote V1 (which filters categories per
 * phase) actually displays "Web / Live". Idempotent. No-op when no entries.
 *
 * Pure function — returns a new timeCategories array.
 */
function registerWebContentInTimeCategories(timeCategories, hasWebContent) {
  if (!Array.isArray(timeCategories)) return [];
  if (!hasWebContent) {
    // Strip the id if it leaked from a previous sync (entries got removed cloud-side)
    return timeCategories.map((tc) => {
      if (!tc || !Array.isArray(tc.categoryIds)) return tc;
      if (!tc.categoryIds.includes(WEB_CATEGORY_ID)) return tc;
      return { ...tc, categoryIds: tc.categoryIds.filter((id) => id !== WEB_CATEGORY_ID) };
    });
  }
  return timeCategories.map((tc) => {
    if (!tc) return tc;
    const ids = Array.isArray(tc.categoryIds) ? tc.categoryIds : [];
    if (ids.includes(WEB_CATEGORY_ID)) return tc;
    return { ...tc, categoryIds: [...ids, WEB_CATEGORY_ID] };
  });
}

/**
 * Main entry: fetch web_page / livestream entries from cloud and merge
 * into the local configuration.json pseudo-category.
 *
 * @param {{ centralUrl: string, siteId: string, apiKey: string, configPath?: string }} opts
 * @returns {Promise<{ action: 'noop'|'updated'|'cleared'|'skipped', detail?: string, count?: number }>}
 */
async function syncFromCloud({ centralUrl, siteId, apiKey, configPath } = {}) {
  if (!centralUrl || !siteId || !apiKey) {
    return { action: 'skipped', detail: 'missing central/site credentials' };
  }

  const resolvedPath = configPath || (config.paths && config.paths.config);
  if (!resolvedPath) {
    return { action: 'skipped', detail: 'no configuration.json path configured' };
  }

  const url = `${centralUrl.replace(/\/$/, '')}/api/sites/${siteId}/web-content`;

  let response;
  try {
    response = await httpJson('GET', url, apiKey);
  } catch (err) {
    return { action: 'skipped', detail: `cloud unreachable: ${err.message}` };
  }

  if (response.status === 404) {
    return { action: 'skipped', detail: 'endpoint not available (cloud < 3.225?)' };
  }
  if (response.status !== 200 || !response.body || !Array.isArray(response.body.entries)) {
    return { action: 'skipped', detail: `unexpected status=${response.status}` };
  }

  const entries = response.body.entries;

  let localConfig;
  try {
    localConfig = await safeReadConfig(resolvedPath);
  } catch (err) {
    return { action: 'skipped', detail: `read config failed: ${err.message}` };
  }

  const beforeCategories = Array.isArray(localConfig.categories) ? localConfig.categories : [];
  const beforeTimeCategories = Array.isArray(localConfig.timeCategories) ? localConfig.timeCategories : [];

  const mergedCategories = mergeWebContent(beforeCategories, entries);
  const mergedTimeCategories = registerWebContentInTimeCategories(beforeTimeCategories, entries.length > 0);

  const categoriesChanged = JSON.stringify(beforeCategories) !== JSON.stringify(mergedCategories);
  const timeCategoriesChanged = JSON.stringify(beforeTimeCategories) !== JSON.stringify(mergedTimeCategories);
  if (!categoriesChanged && !timeCategoriesChanged) {
    return { action: 'noop', count: entries.length };
  }

  localConfig.categories = mergedCategories;
  localConfig.timeCategories = mergedTimeCategories;

  try {
    await atomicWriteJson(resolvedPath, localConfig);
  } catch (err) {
    return { action: 'skipped', detail: `write config failed: ${err.message}` };
  }

  const action = entries.length === 0 ? 'cleared' : 'updated';
  logger.info('web-content-sync: configuration.json updated', {
    action,
    entries: entries.length,
    timeCategoriesPatched: timeCategoriesChanged,
  });
  return { action, count: entries.length };
}

module.exports = {
  syncFromCloud,
  _internal: { mergeWebContent, registerWebContentInTimeCategories, WEB_CATEGORY_ID },
};
