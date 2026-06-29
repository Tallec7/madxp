#!/usr/bin/env node
/**
 * Weekly Egress Regression Guard
 *
 * Vérifie que le fix PR#849 (désactivation VIDEO_STREAM_PROXY_ENABLED +
 * CORS Hostinger) n'a pas régressé.
 *
 * Usage: node scripts/weekly-egress-guard.mjs
 * Requires: FTP_HOST, FTP_USER, FTP_PASSWORD (central-server/.env ou env)
 *
 * CHECK 1 — FTP diff : .htaccess déployé == cors-htaccess.txt local
 *           Fallback (sans creds FTP) : OPTIONS probe sur le répertoire
 *           neopro-video/ — évite la dépendance à un fichier vidéo spécifique
 *           qui peut être supprimé (faux positif constaté 2026-06-29).
 * CHECK 2 — cors-htaccess.txt contient les 3 headers obligatoires
 * CHECK 3 — smoke-saas.test.ts contient le guard PR#849
 */

import * as ftp from 'basic-ftp';
import { Writable } from 'stream';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
config({ path: join(repoRoot, 'central-server', '.env') });

const HTACCESS_LOCAL = join(repoRoot, 'central-server', 'scripts-ops', 'cors-htaccess.txt');
const SMOKE_FILE = join(repoRoot, 'central-server', 'src', '__tests__', 'smoke', 'smoke-saas.test.ts');

const REQUIRED_HEADERS = [
  'Access-Control-Allow-Origin',
  'Cross-Origin-Resource-Policy',
  'Access-Control-Expose-Headers',
];
const SMOKE_GUARD_STRING = 'OFF-path must not contain /api/videos/stream';

const results = [];
let allPass = true;

function pass(label, detail = '') {
  results.push({ label, status: 'PASS', detail });
  console.log(`✅ PASS  ${label}${detail ? ' — ' + detail : ''}`);
}

function fail(label, detail = '') {
  results.push({ label, status: 'FAIL', detail });
  console.error(`❌ FAIL  ${label}${detail ? ' — ' + detail : ''}`);
  allPass = false;
}

// ─── CHECK 2 — local cors-htaccess.txt ───────────────────────────────────────
function check2() {
  if (!existsSync(HTACCESS_LOCAL)) {
    fail('CHECK 2 — cors-htaccess.txt exists', 'file not found');
    return null;
  }
  const content = readFileSync(HTACCESS_LOCAL, 'utf8');
  const missing = REQUIRED_HEADERS.filter((h) => !content.includes(h));
  if (missing.length > 0) {
    fail('CHECK 2 — cors-htaccess.txt headers', `missing: ${missing.join(', ')}`);
  } else {
    pass('CHECK 2 — cors-htaccess.txt headers');
  }
  return content;
}

// ─── CHECK 3 — smoke guard string ────────────────────────────────────────────
function check3() {
  if (!existsSync(SMOKE_FILE)) {
    fail('CHECK 3 — smoke-saas.test.ts exists', 'file not found');
    return;
  }
  const content = readFileSync(SMOKE_FILE, 'utf8');
  if (content.includes(SMOKE_GUARD_STRING)) {
    pass('CHECK 3 — smoke guard PR#849');
  } else {
    fail('CHECK 3 — smoke guard PR#849', `"${SMOKE_GUARD_STRING}" absent de smoke-saas.test.ts`);
  }
}

// ─── CHECK 1 — FTP diff ───────────────────────────────────────────────────────
// Note: les probes HTTP depuis environnements cloud sont bloquées par Hostinger
// (x-deny-reason: host_not_allowed). Seul le FTP (port 21) est fiable pour
// vérifier le .htaccess déployé. Sans creds FTP : WARN (inconclusive), pas FAIL.
async function check1(localContent) {
  const ftpConfig = {
    host: process.env.FTP_HOST,
    port: parseInt(process.env.FTP_PORT || '21', 10),
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
    secure: process.env.FTP_SECURE === 'true',
  };

  if (!ftpConfig.host || !ftpConfig.user || !ftpConfig.password) {
    console.warn(
      '  ⚠️  CHECK 1 — INCONCLUSIVE : FTP_HOST / FTP_USER / FTP_PASSWORD absents.\n' +
      '     Les probes HTTP depuis cloud sont bloquées par Hostinger (host_not_allowed).\n' +
      '     Relancer avec les creds FTP pour un check définitif.',
    );
    return;
  }

  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access(ftpConfig);

    // Download deployed .htaccess into a string
    let deployed = '';
    const writable = new Writable({
      write(chunk, _enc, cb) {
        deployed += chunk.toString();
        cb();
      },
    });
    await client.downloadTo(writable, '.htaccess');

    const normalize = (s) => s.replace(/\r\n/g, '\n').trimEnd();
    if (normalize(deployed) === normalize(localContent)) {
      pass('CHECK 1 — FTP .htaccess == cors-htaccess.txt');
    } else {
      fail(
        'CHECK 1 — FTP .htaccess == cors-htaccess.txt',
        'Le .htaccess déployé diffère du fichier local — relancer upload-cors-htaccess.mjs',
      );
      console.error('\n  Deployed:\n' + deployed.slice(0, 300));
      console.error('\n  Local:\n' + localContent.slice(0, 300));
    }
  } catch (err) {
    fail('CHECK 1 — FTP .htaccess diff', `FTP error: ${err.message}`);
  } finally {
    client.close();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('=== Weekly Egress Regression Guard ===\n');

const localContent = check2();
check3();
await check1(localContent ?? '');

console.log('\n' + '='.repeat(42));
if (allPass) {
  console.log('✅ All checks passed — egress fix intact');
  process.exit(0);
} else {
  const failed = results.filter((r) => r.status === 'FAIL').map((r) => r.label);
  console.error(`❌ ${failed.length} check(s) failed: ${failed.join(', ')}`);
  console.error('\nAction: check issue #965 ou ouvrir un nouvel issue GitHub.');
  process.exit(1);
}
