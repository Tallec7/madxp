/**
 * pi-password-sync.js — ADR-132
 *
 * Sync-agent consumer pour la rotation OTA du mot de passe système `pi`.
 *
 * Flow :
 *   1. Boot / reconnect → syncFromCloud()
 *   2. GET /api/sites/:id/pi-system-password (Bearer <apiKey>)
 *      - 200 { hash, pending: true }  → `echo "pi:HASH" | sudo chpasswd -e`
 *                                        → POST /api/sites/:id/pi-password-applied
 *      - 204 No Content               → pas de rotation en attente, no-op
 *      - Toute autre erreur           → warn + no-op (ne bloque pas le boot)
 *   3. Si chpasswd échoue (ex: sudoers pas encore à jour) → warn, ne retente pas
 *      (la prochaine reconnexion retente automatiquement via le flag pending cloud)
 *
 * Sécurité :
 *   - Le hash SHA-512-crypt ($6$salt$...) n'est jamais loggé
 *   - Le hash est passé à chpasswd via spawn stdin, pas via arg CLI
 *   - sudo /usr/sbin/chpasswd est dans sudoers.d/neopro (ADR-132)
 */

const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const logger = require('../logger');

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
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
            : {}),
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
 * Appelle `sudo chpasswd -e` avec le hash passé via stdin.
 * Stdin : "pi:HASH\n"
 * Jamais le hash dans les arguments CLI (sécurité + ps aux).
 * @param {string} hash  Hash SHA-512-crypt ($6$salt$...)
 * @returns {Promise<void>}
 */
function applyPasswordHash(hash) {
  return new Promise((resolve, reject) => {
    const child = spawn('sudo', ['/usr/sbin/chpasswd', '-e'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });

    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => reject(new Error(`chpasswd spawn error: ${err.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`chpasswd exited ${code}: ${stderr.trim()}`));
      } else {
        resolve();
      }
    });

    // Envoyer "pi:HASH" via stdin — le hash n'apparaît jamais dans les args ou logs
    child.stdin.write(`pi:${hash}\n`);
    child.stdin.end();
  });
}

/**
 * Entrée principale : pull le hash cloud si une rotation est en attente et l'applique.
 * @param {{ centralUrl: string, siteId: string, apiKey: string }} opts
 * @returns {Promise<{ action: 'noop'|'applied'|'skipped', detail?: string }>}
 */
async function syncFromCloud({ centralUrl, siteId, apiKey }) {
  if (!centralUrl || !siteId || !apiKey) {
    return { action: 'skipped', detail: 'missing central/site credentials' };
  }

  const baseUrl = centralUrl.replace(/\/$/, '');
  const fetchUrl = `${baseUrl}/api/sites/${siteId}/pi-system-password`;
  const ackUrl   = `${baseUrl}/api/sites/${siteId}/pi-password-applied`;

  let response;
  try {
    response = await httpJson('GET', fetchUrl, apiKey);
  } catch (err) {
    logger.warn('pi-password-sync: cloud unreachable, skipping', { error: err.message });
    return { action: 'skipped', detail: `cloud unreachable: ${err.message}` };
  }

  if (response.status === 204) {
    // Pas de rotation en attente — no-op nominal
    return { action: 'noop' };
  }

  if (response.status !== 200 || !response.body || !response.body.hash) {
    logger.warn('pi-password-sync: unexpected response', {
      status: response.status,
      body: response.body,
    });
    return { action: 'skipped', detail: `unexpected status=${response.status}` };
  }

  const { hash } = response.body;

  if (!hash.startsWith('$6$')) {
    logger.error('pi-password-sync: received hash is not SHA-512-crypt, aborting');
    return { action: 'skipped', detail: 'invalid hash format' };
  }

  // Appliquer le nouveau mot de passe
  try {
    await applyPasswordHash(hash);
  } catch (err) {
    logger.error('pi-password-sync: chpasswd failed', { error: err.message });
    // Ne pas acquitter — le flag reste pending, la prochaine reconnexion retente
    return { action: 'skipped', detail: `chpasswd failed: ${err.message}` };
  }

  // Acquittement cloud — le flag pending sera mis à false
  try {
    await httpJson('POST', ackUrl, apiKey, {});
    logger.info('pi-password-sync: password rotation applied and acknowledged (ADR-132)');
  } catch (err) {
    // L'acquittement a échoué, mais le mdp EST changé côté Pi.
    // La prochaine reconnexion re-tentera chpasswd (idempotent) et ré-acquittera.
    logger.warn('pi-password-sync: ack failed (will retry at next reconnect)', {
      error: err.message,
    });
  }

  return { action: 'applied' };
}

module.exports = {
  syncFromCloud,
  // Exposé pour les tests
  _internal: { applyPasswordHash },
};
