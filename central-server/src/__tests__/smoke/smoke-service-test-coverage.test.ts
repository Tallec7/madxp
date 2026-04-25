/**
 * Smoke test — service test coverage guard
 *
 * Goal: every new `src/services/*.service.ts` MUST have at least one test.
 * A test counts if either:
 *   - a colocated `<name>.service.test.ts` exists (next to the service or in `__tests__/`)
 *   - some `*.test.ts` under `src/` imports the service by path (regex on `from '...<name>.service'`)
 *
 * Legacy services without tests are grandfathered via the `LEGACY_SERVICES_WITHOUT_TEST`
 * allowlist below. The allowlist is FROZEN — do not add new entries. When you write
 * a test for a legacy service, remove its entry in the same PR.
 *
 * See plan: ~/.claude/plans/coverage-threshold-41-valiant-canyon.md
 * Related: jest.config.js coverageThreshold (functions: 41) — this guard prevents
 * new additions from dragging the threshold further down.
 */

import * as fs from 'fs';
import * as path from 'path';

const SERVICES_DIR = path.resolve(__dirname, '../../services');
const SRC_DIR = path.resolve(__dirname, '../..');

// LEGACY — services without dedicated tests at the time the guard was introduced.
// Do NOT add entries here. Remove an entry when you add a test for that service.
const LEGACY_SERVICES_WITHOUT_TEST = new Set<string>([
  'alerting-checks.service.ts',
  'alerting-notifier.service.ts',
  'benchmark.service.ts',
  'billing.service.ts',
  'campaign-deployment.service.ts',
  'canary-monitor.service.ts',
  'club-template-quota.service.ts',
  'cron-scheduler.service.ts',
  'db-circuit-breaker.service.ts',
  'excel-export.service.ts',
  'github.service.ts',
  'image-to-video.service.ts',
  'memory-manager.service.ts',
  'monthly-reports.service.ts',
  'network-alerts.service.ts',
  'realtime-stats.service.ts',
  'remotion-render-worker.service.ts',
  'saas-match-state.service.ts',
  'scheduler.service.ts',
  'sponsor-alert.service.ts',
  'template-renderer.service.ts',
  'video-category.service.ts',
  'video-token.service.ts',
]);

function walkSync(dir: string, predicate: (p: string) => boolean, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__mocks__') continue;
      walkSync(full, predicate, out);
    } else if (entry.isFile() && predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function listServiceFiles(): string[] {
  return walkSync(
    SERVICES_DIR,
    (p) => p.endsWith('.service.ts') && !p.endsWith('.test.ts')
  );
}

function listTestFiles(): string[] {
  return walkSync(SRC_DIR, (p) => p.endsWith('.test.ts'));
}

function hasColocatedTest(servicePath: string): boolean {
  const base = path.basename(servicePath, '.ts'); // e.g. "alert.service"
  const dir = path.dirname(servicePath);
  return (
    fs.existsSync(path.join(dir, `${base}.test.ts`)) ||
    fs.existsSync(path.join(dir, '__tests__', `${base}.test.ts`))
  );
}

function isImportedByAnyTest(servicePath: string, testFiles: string[]): boolean {
  const base = path.basename(servicePath, '.ts'); // e.g. "alert.service"
  const escaped = base.replace(/\./g, '\\.');
  // Match `from '...alert.service'` or `require('...alert.service')` (with any relative prefix)
  const re = new RegExp(`(from|require\\()\\s*['"][^'"]*${escaped}['"]`);
  for (const tf of testFiles) {
    try {
      if (re.test(fs.readFileSync(tf, 'utf8'))) return true;
    } catch {
      /* ignore unreadable */
    }
  }
  return false;
}

describe('Smoke — service test coverage guard', () => {
  it('every service has at least one test (colocated or via import)', () => {
    const services = listServiceFiles();
    const tests = listTestFiles();

    const orphansFound: string[] = [];
    const allowlistUsed = new Set<string>();

    for (const svc of services) {
      const fileName = path.basename(svc); // e.g. "alert.service.ts"
      if (hasColocatedTest(svc)) continue;
      if (isImportedByAnyTest(svc, tests)) continue;

      if (LEGACY_SERVICES_WITHOUT_TEST.has(fileName)) {
        allowlistUsed.add(fileName);
        continue;
      }
      orphansFound.push(fileName);
    }

    if (orphansFound.length > 0) {
      const msg = [
        '',
        `Found ${orphansFound.length} service(s) without any test:`,
        ...orphansFound.map((s) => `  - src/services/${s}`),
        '',
        'Every new service must have at least one test that imports it.',
        'Add a colocated <name>.service.test.ts that exercises the main function.',
        'Do NOT add to LEGACY_SERVICES_WITHOUT_TEST — the allowlist is frozen.',
        '',
      ].join('\n');
      throw new Error(msg);
    }

    // Detect stale allowlist entries (a legacy service that now has a test, or has been deleted)
    const stale: string[] = [];
    for (const entry of LEGACY_SERVICES_WITHOUT_TEST) {
      if (!allowlistUsed.has(entry)) stale.push(entry);
    }
    if (stale.length > 0) {
      const msg = [
        '',
        `Stale entries in LEGACY_SERVICES_WITHOUT_TEST (${stale.length}):`,
        ...stale.map((s) => `  - ${s}`),
        '',
        'Either the service was deleted, or it now has a test. Remove the entry.',
        '',
      ].join('\n');
      throw new Error(msg);
    }
  });
});
