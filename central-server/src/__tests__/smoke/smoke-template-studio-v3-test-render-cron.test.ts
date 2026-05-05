/**
 * Smoke test — Template Studio v3 / Phase 3 Plan 01 / PUB-02.
 *
 * Locks the contract for the test render tracking migration + cleanup CRON :
 *  - migration ajoute test_render_at, test_render_status, test_render_url sur la
 *    table templates (neopro_templates) avec ADD COLUMN IF NOT EXISTS + CHECK
 *  - check_task_type étendu pour 'test_render_cleanup'
 *  - seed INSERT recurring_schedules pour la nouvelle tâche CRON
 *  - full-schema.sql resync
 *  - cron-scheduler dispatch table contient le mapping vers
 *    executeTestRenderCleanupTask
 *  - le handler enregistre la métrique Prometheus
 *    neopro_test_renders_cleaned_total + log Winston
 *
 * File-based assertions only — no HTTP server boot. Same pattern as
 * smoke-template-studio-v3-options.test.ts and smoke-template-studio-v3-duplicate.test.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const migrationFile = path.join(
  repoRoot,
  'central-server/src/scripts/migrations/add-template-test-render-tracking.sql',
);
const fullSchemaFile = path.join(
  repoRoot,
  'central-server/src/scripts/full-schema.sql',
);
const schedulerFile = path.join(
  repoRoot,
  'central-server/src/services/cron-scheduler.service.ts',
);
const taskFile = path.join(
  repoRoot,
  'central-server/src/cron-tasks/test-render-cleanup.task.ts',
);

describe('Template Studio v3 — test render tracking + cleanup CRON (PUB-02)', () => {
  it('A: migration adds test_render_at / test_render_status / test_render_url with idempotent guards', () => {
    const migration = fs.readFileSync(migrationFile, 'utf8');
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS test_render_at TIMESTAMP/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS test_render_status TEXT/);
    expect(migration).toMatch(
      /CHECK \(test_render_status IN \('queued','rendering','success','failed'\)\)/,
    );
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS test_render_url TEXT/);
  });

  it('B: migration extends check_task_type to include test_render_cleanup', () => {
    const migration = fs.readFileSync(migrationFile, 'utf8');
    expect(migration).toMatch(/'test_render_cleanup'/);
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS check_task_type/);
  });

  it('C: migration seeds recurring_schedules with idempotent INSERT for test_render_cleanup', () => {
    const migration = fs.readFileSync(migrationFile, 'utf8');
    expect(migration).toMatch(/INSERT INTO recurring_schedules[\s\S]+test_render_cleanup/);
    expect(migration).toMatch(/WHERE NOT EXISTS[\s\S]+task_type = 'test_render_cleanup'/);
  });

  it('D: full-schema.sql mirrors test_render_at column + test_render_cleanup task type', () => {
    const fullSchema = fs.readFileSync(fullSchemaFile, 'utf8');
    expect(fullSchema).toMatch(/test_render_at timestamp|test_render_at TIMESTAMP/);
    expect(fullSchema).toMatch(/test_render_cleanup/);
  });

  it('E: cron-scheduler dispatches test_render_cleanup → handler with Winston log + Prometheus metric', () => {
    const scheduler = fs.readFileSync(schedulerFile, 'utf8');
    expect(scheduler).toMatch(/test_render_cleanup:\s*executeTestRenderCleanupTask/);
    const task = fs.readFileSync(taskFile, 'utf8');
    expect(task).toMatch(/recordTestRendersCleaned|neopro_test_renders_cleaned_total/);
    expect(task).toMatch(/logger\.info/);
  });
});
