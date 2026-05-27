/**
 * Smoke tests — regression guards for the hotspot PSK / Railway incident (2026-04-20).
 *
 * Each assertion here prevents a class of bugs that caused the incident:
 *
 *   1. npm start must chain migrate.js before server.js (Railway Custom Start Command
 *      override — incident symptom: healthcheck fail after deploy). See PR #497.
 *
 *   2. Migrations must NOT use unqualified `uuid_generate_v4()` — Railway has `uuid-ossp`
 *      in schema `extensions` not in default search_path. Use `gen_random_uuid()`.
 *      See PR #498.
 *
 *   3. `HOTSPOT_PSK_ENCRYPTION_KEY` must be validated at boot in production — otherwise
 *      bootstrap endpoint returns opaque 500 until first Pi tries to bootstrap.
 *
 *   4. Bootstrap + rotate controllers must record Prometheus metrics so we detect
 *      a wall of errors before the fleet is affected.
 *
 *   5. ADR-074 runbook must exist and be discoverable.
 *
 * File-level reads only (no app bootstrap).
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(repoRoot, rel));

describe('Smoke — hotspot PSK incident regressions (2026-04-20)', () => {
  // ============================================================
  // 1. Railway Custom Start Command override (PR #497)
  // ============================================================

  describe('npm start chains migrations before server', () => {
    it('central-server package.json start script runs migrate.js && server.js', () => {
      const pkg = JSON.parse(read('central-server/package.json'));
      const start: string = pkg.scripts?.start ?? '';
      expect({
        chainsMigration: /migrate\.js\s*&&\s*node.*server\.js/.test(start),
        notOnlyServer: !/^node\s+dist\/(scripts\/)?server\.js$/.test(start.trim()),
      }).toEqual({ chainsMigration: true, notOnlyServer: true });
    });
  });

  // ============================================================
  // 2. Migrations must use gen_random_uuid() (PR #498)
  // ============================================================

  describe('SQL migrations are Railway-compatible', () => {
    const migrationsDir = path.join(repoRoot, 'central-server/src/scripts/migrations');

    // Pre-incident migrations that shipped with unqualified uuid_generate_v4().
    // Règle "JAMAIS modifier les migrations déjà en production" — they work because
    // `CREATE EXTENSION "uuid-ossp"` was done at install-time when the extension
    // still lived in the default search_path. Only NEW migrations must use
    // gen_random_uuid() (PG13+ native) to avoid the Railway `extensions` schema trap.
    const LEGACY_EXEMPT = new Set([
      'add-campaigns-and-scheduled-reports.sql',
      'add-command-queue.sql',
      'add-config-drafts.sql',
      'add-neopro-templates.sql',
      'add-password-reset-tokens.sql',
      'add-proof-of-broadcasts.sql',
      'add-sponsor-access-tokens.sql',
      'add-sponsor-agency-roles.sql',
      'adr035-phase3-campaigns-operational.sql',
      'adr058-remote-pin-per-profile.sql',
      'enable-row-level-security.sql',
    ]);

    it('no NEW migration uses unqualified uuid_generate_v4() (uuid-ossp lives in extensions schema on Railway)', () => {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
      const offending: Array<{ file: string; lines: number[] }> = [];

      for (const file of files) {
        if (LEGACY_EXEMPT.has(file)) continue;
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        const lines = content.split('\n');
        const bad: number[] = [];
        lines.forEach((line, i) => {
          if (/^\s*--/.test(line)) return;
          if (/\buuid_generate_v4\s*\(/.test(line) && !/\bextensions\.uuid_generate_v4\s*\(/.test(line)) {
            bad.push(i + 1);
          }
        });
        if (bad.length) offending.push({ file, lines: bad });
      }

      expect(offending).toEqual([]);
    });
  });

  // ============================================================
  // 3. HOTSPOT_PSK_ENCRYPTION_KEY fail-fast validation at boot
  // ============================================================

  describe('central-server validates HOTSPOT_PSK_ENCRYPTION_KEY in production', () => {
    it('server.ts aborts boot if HOTSPOT_PSK_ENCRYPTION_KEY missing or malformed in production', () => {
      const server = read('central-server/src/server.ts');
      // Block that references both the env var and `process.exit` near NODE_ENV === 'production'.
      const hasEnvCheck = /HOTSPOT_PSK_ENCRYPTION_KEY/.test(server);
      const hasHexValidation = /\[0-9a-fA-F\]\{64\}|64 hex|32 bytes/.test(server);
      const abortsOnMissing = /process\.exit\s*\(\s*1\s*\)/.test(server);
      expect({ hasEnvCheck, hasHexValidation, abortsOnMissing }).toEqual({
        hasEnvCheck: true,
        hasHexValidation: true,
        abortsOnMissing: true,
      });
    });
  });

  // ============================================================
  // 4. Prometheus metrics on bootstrap + rotate
  // ============================================================

  describe('hotspot controller records Prometheus metrics', () => {
    it('metrics.service.ts exports the three hotspot counters', () => {
      const svc = read('central-server/src/services/metrics.service.ts');
      expect({
        hasBootstrapCounter: /madxp_hotspot_bootstrap_attempts_total/.test(svc),
        hasRotationCounter: /madxp_hotspot_rotation_attempts_total/.test(svc),
        hasDecryptCounter: /madxp_hotspot_psk_decrypt_errors_total/.test(svc),
        hasBootstrapRecorder: /recordHotspotBootstrapAttempt\s*\(/.test(svc),
        hasRotationRecorder: /recordHotspotRotationAttempt\s*\(/.test(svc),
        hasDecryptRecorder: /recordHotspotPskDecryptError\s*\(/.test(svc),
      }).toEqual({
        hasBootstrapCounter: true,
        hasRotationCounter: true,
        hasDecryptCounter: true,
        hasBootstrapRecorder: true,
        hasRotationRecorder: true,
        hasDecryptRecorder: true,
      });
    });

    it('hotspot-config.controller instruments bootstrap + rotate with the metric recorders', () => {
      const ctrl = read('central-server/src/controllers/hotspot-config.controller.ts');
      expect({
        importsMetricsService: /from\s+['"][^'"]*metrics\.service['"]/.test(ctrl),
        recordsBootstrapSuccess: /recordHotspotBootstrapAttempt\(\s*['"]success['"]\s*\)/.test(ctrl),
        recordsBootstrapConflict: /recordHotspotBootstrapAttempt\(\s*['"]already_bootstrapped['"]\s*\)/.test(ctrl),
        recordsBootstrapError: /recordHotspotBootstrapAttempt\(\s*['"]error['"]\s*\)/.test(ctrl),
        recordsRotation: /recordHotspotRotationAttempt\(/.test(ctrl),
      }).toEqual({
        importsMetricsService: true,
        recordsBootstrapSuccess: true,
        recordsBootstrapConflict: true,
        recordsBootstrapError: true,
        recordsRotation: true,
      });
    });
  });

  // ============================================================
  // 5. Runbook & docs exist
  // ============================================================

  describe('incident runbook & docs', () => {
    it('RUNBOOK_HOTSPOT_PSK_INCIDENT.md exists with the three diagnostic branches', () => {
      expect(exists('docs/modops/RUNBOOK_HOTSPOT_PSK_INCIDENT.md')).toBe(true);
      const runbook = read('docs/modops/RUNBOOK_HOTSPOT_PSK_INCIDENT.md');
      expect({
        coversEnvVar: /HOTSPOT_PSK_ENCRYPTION_KEY/.test(runbook),
        coversMigrations: /uuid_generate_v4|gen_random_uuid|Custom Start Command/i.test(runbook),
        coversRotationPropagation: /rotate_psk|sync-agent/.test(runbook),
      }).toEqual({
        coversEnvVar: true,
        coversMigrations: true,
        coversRotationPropagation: true,
      });
    });

    it('DEPLOY_CENTRAL_SERVER.md documents HOTSPOT_PSK_ENCRYPTION_KEY + Railway gotchas', () => {
      const deploy = read('docs/deployment/DEPLOY_CENTRAL_SERVER.md');
      expect({
        documentsEnvVar: /HOTSPOT_PSK_ENCRYPTION_KEY/.test(deploy),
        documentsRailwayGotchas: /Custom Start Command|uuid-ossp|gen_random_uuid|Railway gotchas/i.test(deploy),
      }).toEqual({ documentsEnvVar: true, documentsRailwayGotchas: true });
    });
  });
});
