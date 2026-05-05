---
phase: 03-gate-publication
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/src/scripts/migrations/add-template-test-render-tracking.sql
  - central-server/src/scripts/full-schema.sql
  - central-server/src/cron-tasks/test-render-cleanup.task.ts
  - central-server/src/services/cron-scheduler.service.ts
  - central-server/src/services/metrics.service.ts
  - central-server/src/__tests__/smoke/smoke-template-studio-v3-test-render-cron.test.ts
autonomous: true
requirements: [PUB-02]
must_haves:
  truths:
    - 'Migration ajoute test_render_at, test_render_status, test_render_url sur templates'
    - "CRON 'test_render_cleanup' enregistré dans CHECK constraint check_task_type"
    - 'Métrique Prometheus neopro_test_renders_cleaned_total incrémentée par le CRON'
  artifacts:
    - path: central-server/src/scripts/migrations/add-template-test-render-tracking.sql
      provides: 'ADD COLUMN IF NOT EXISTS test_render_at + test_render_status CHECK + test_render_url + extend check_task_type + INSERT recurring_schedules'
    - path: central-server/src/cron-tasks/test-render-cleanup.task.ts
      provides: 'executeTestRenderCleanupTask scanning /test-renders/ FTP TTL 7d'
  key_links:
    - from: cron-scheduler.service.ts
      to: executeTestRenderCleanupTask
      via: 'TASK_HANDLERS map: test_render_cleanup → executeTestRenderCleanupTask'
      pattern: "test_render_cleanup:\\s*executeTestRenderCleanupTask"
---

<objective>
Backend foundations Phase 3 : migration colonnes test render + CRON cleanup hebdo + métrique Prometheus, smoke-first.

Purpose: Prérequis DB + ops pour PUB-02 (test render async). Sans cette migration, plans 02-04 ne peuvent rien persister.
Output: 1 migration appliquée, 1 CRON task fonctionnel, 1 smoke RED→GREEN.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/03-gate-publication/03-CONTEXT.md
@CLAUDE.md
@.claude/rules/templates.md
@.claude/rules/match.md
@.claude/rules/testing.md

<interfaces>
Pattern ADR-093 (extend-club-sessions-match-fields.sql L60-93) pour CHECK constraint :

```sql
DO $$
BEGIN
  ALTER TABLE recurring_schedules DROP CONSTRAINT IF EXISTS check_task_type;
  ALTER TABLE recurring_schedules
    ADD CONSTRAINT check_task_type
    CHECK (task_type IN (
      'report', 'cleanup', 'aggregation', 'backup',
      'objective_check', 'pdf_report', 'match_session_autoclose',
      'video_ftp_audit', 'connection_events_purge',
      'test_render_cleanup'   -- AJOUT Phase 3
    ));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
```

Pattern CRON handler (cron-scheduler.service.ts L30 + L49) :

```typescript
import { executeTestRenderCleanupTask } from '../cron-tasks/test-render-cleanup.task';
const TASK_HANDLERS = {
  match_session_autoclose: executeMatchAutoCloseTask,
  test_render_cleanup: executeTestRenderCleanupTask, // AJOUT
};
```

</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: RED smoke — test_render_cleanup contracts</name>
  <files>central-server/src/__tests__/smoke/smoke-template-studio-v3-test-render-cron.test.ts</files>
  <read_first>
    - central-server/src/__tests__/smoke/smoke-template-studio-v3-options.test.ts (pattern smoke v3 file-based)
    - central-server/src/scripts/migrations/extend-club-sessions-match-fields.sql (pattern CHECK + INSERT seed L60-93)
    - central-server/src/services/cron-scheduler.service.ts (TASK_HANDLERS map L40-55)
  </read_first>
  <action>
    Créer 5 tests file-based qui DOIVENT faillir tant que les artefacts plan 01 n'existent pas :

    Test A — Migration columns :
    ```typescript
    const migration = readFileSync('src/scripts/migrations/add-template-test-render-tracking.sql', 'utf8');
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS test_render_at TIMESTAMP/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS test_render_status TEXT/);
    expect(migration).toMatch(/CHECK \(test_render_status IN \('queued','rendering','success','failed'\)\)/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS test_render_url TEXT/);
    ```

    Test B — CHECK constraint extended :
    ```typescript
    expect(migration).toMatch(/'test_render_cleanup'/);
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS check_task_type/);
    ```

    Test C — Seed INSERT recurring_schedules :
    ```typescript
    expect(migration).toMatch(/INSERT INTO recurring_schedules[\s\S]+test_render_cleanup/);
    expect(migration).toMatch(/WHERE NOT EXISTS[\s\S]+task_type = 'test_render_cleanup'/);
    ```

    Test D — Full-schema mirror :
    ```typescript
    const fullSchema = readFileSync('src/scripts/full-schema.sql', 'utf8');
    expect(fullSchema).toMatch(/test_render_at TIMESTAMP/);
    expect(fullSchema).toMatch(/test_render_cleanup/);
    ```

    Test E — CRON handler wired + metric :
    ```typescript
    const scheduler = readFileSync('src/services/cron-scheduler.service.ts', 'utf8');
    expect(scheduler).toMatch(/test_render_cleanup:\s*executeTestRenderCleanupTask/);
    const task = readFileSync('src/cron-tasks/test-render-cleanup.task.ts', 'utf8');
    expect(task).toMatch(/recordTestRendersCleaned|neopro_test_renders_cleaned_total/);
    expect(task).toMatch(/logger\.info/);
    ```

    Lancer : `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-test-render-cron' --no-coverage --forceExit`
    → DOIT être RED (5 fails). Commit : `test(03-01): add RED smoke for test_render_cleanup contracts`

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-test-render-cron' --no-coverage --forceExit 2>&1 | grep -E 'Tests:.*failed' </automated>
  </verify>
  <acceptance_criteria>
    - File `central-server/src/__tests__/smoke/smoke-template-studio-v3-test-render-cron.test.ts` exists
    - `grep -c "expect(migration).toMatch" ...test.ts` ≥ 6
    - `grep "test_render_cleanup" ...test.ts` finds at least 3 occurrences
    - jest exits non-zero with "5 failed" output (RED state)
    - Commit message starts with `test(03-01):`
  </acceptance_criteria>
  <done>5 tests RED committed, all asserting concrete migration + CRON contract strings.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Migration + full-schema + CRON task handler + metric</name>
  <files>central-server/src/scripts/migrations/add-template-test-render-tracking.sql, central-server/src/scripts/full-schema.sql, central-server/src/cron-tasks/test-render-cleanup.task.ts, central-server/src/services/cron-scheduler.service.ts, central-server/src/services/metrics.service.ts</files>
  <read_first>
    - central-server/src/scripts/migrations/extend-club-sessions-match-fields.sql (full file, copy CHECK pattern)
    - central-server/src/services/cron-scheduler.service.ts (full TASK_HANDLERS + import block)
    - central-server/src/services/metrics.service.ts (existing recordMatchSessionAutoclosed pattern)
    - central-server/src/cron-tasks/match-autoclose.task.ts (handler shape: arity, return type, logger.info+error)
    - central-server/src/scripts/full-schema.sql (locate `CREATE TABLE templates` and `check_task_type` block)
    - central-server/src/config/ftp-storage.ts (helper deleteFileFromFtp signature for FTP cleanup loop)
  </read_first>
  <behavior>
    - Migration is idempotent (ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, INSERT WHERE NOT EXISTS).
    - CRON handler scans `/test-renders/{templateId}/{timestamp}.mp4`, deletes files older than 7 days, logs info per delete and error per failure, increments `neopro_test_renders_cleaned_total{result}`.
    - Adding a NULL value of test_render_status passes the CHECK (NULL is allowed by the IN clause without NOT NULL constraint).
    - Migration filename exactly: `add-template-test-render-tracking.sql`.
  </behavior>
  <action>
    1. Create migration `central-server/src/scripts/migrations/add-template-test-render-tracking.sql` :

    ```sql
    -- Phase 3 (ADR-110) — Test render tracking columns + cleanup CRON
    ALTER TABLE templates ADD COLUMN IF NOT EXISTS test_render_at TIMESTAMP NULL;
    ALTER TABLE templates ADD COLUMN IF NOT EXISTS test_render_status TEXT NULL
      CHECK (test_render_status IN ('queued','rendering','success','failed'));
    ALTER TABLE templates ADD COLUMN IF NOT EXISTS test_render_url TEXT NULL;

    COMMENT ON COLUMN templates.test_render_at IS 'Phase 3 (PUB-02): timestamp last test render request';
    COMMENT ON COLUMN templates.test_render_status IS 'Phase 3 (PUB-02): queued|rendering|success|failed';
    COMMENT ON COLUMN templates.test_render_url IS 'Phase 3 (PUB-02): FTP path /test-renders/{templateId}/{timestamp}.mp4';

    DO $$
    BEGIN
      ALTER TABLE recurring_schedules DROP CONSTRAINT IF EXISTS check_task_type;
      ALTER TABLE recurring_schedules
        ADD CONSTRAINT check_task_type
        CHECK (task_type IN (
          'report', 'cleanup', 'aggregation', 'backup',
          'objective_check', 'pdf_report', 'match_session_autoclose',
          'video_ftp_audit', 'connection_events_purge',
          'test_render_cleanup'
        ));
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$;

    INSERT INTO recurring_schedules (
      name, description, task_type, cron_expression, hour, minute,
      task_config, is_active
    )
    SELECT
      'Test render cleanup',
      'Suppression FTP des test renders /test-renders/* > 7 jours (ADR-110 Phase 3 PUB-02).',
      'test_render_cleanup',
      '0 3 * * 0',
      3, 0,
      '{"ttlDays": 7}'::jsonb,
      true
    WHERE NOT EXISTS (
      SELECT 1 FROM recurring_schedules WHERE task_type = 'test_render_cleanup'
    );
    ```

    2. Mirror columns + CHECK + seed in `central-server/src/scripts/full-schema.sql` (locate `CREATE TABLE templates` and add 3 lines verbatim ; locate the existing `check_task_type` CHECK and add `'test_render_cleanup'` to the IN clause).

    3. Create `central-server/src/cron-tasks/test-render-cleanup.task.ts` (mirror `match-autoclose.task.ts` shape) :
    ```typescript
    import logger from '../config/logger';
    import { metricsService } from '../services/metrics.service';
    import { listFilesInFtpDir, deleteFileFromFtp } from '../config/ftp-storage';

    export async function executeTestRenderCleanupTask(config: { ttlDays?: number } = {}): Promise<void> {
      const ttlDays = config.ttlDays ?? 7;
      const cutoff = Date.now() - ttlDays * 86400_000;
      try {
        const entries = await listFilesInFtpDir('/test-renders/');
        let deleted = 0;
        for (const entry of entries) {
          if (entry.modifiedAt && entry.modifiedAt.getTime() < cutoff) {
            try {
              await deleteFileFromFtp(entry.path);
              metricsService.recordTestRendersCleaned('success');
              deleted += 1;
              logger.info('Test render cleaned', { path: entry.path, modifiedAt: entry.modifiedAt });
            } catch (err) {
              metricsService.recordTestRendersCleaned('error');
              logger.error('Test render cleanup error', { path: entry.path, error: err });
            }
          }
        }
        logger.info('Test render cleanup complete', { deleted, ttlDays });
      } catch (err) {
        logger.error('Test render cleanup task failed', { error: err });
        throw err;
      }
    }
    ```
    Note: si `listFilesInFtpDir` n'existe pas dans `ftp-storage.ts`, ajouter le helper minimal (FTP LIST récursif sur le path) — sinon adapter à l'API existante (vérifier après lecture du fichier).

    4. Wire in `cron-scheduler.service.ts` :
       - Add import `import { executeTestRenderCleanupTask } from '../cron-tasks/test-render-cleanup.task';`
       - Add map entry `test_render_cleanup: executeTestRenderCleanupTask,`

    5. Add metric in `central-server/src/services/metrics.service.ts` :
    ```typescript
    private testRendersCleanedCounter = new Counter({
      name: 'neopro_test_renders_cleaned_total',
      help: 'Test renders cleaned by CRON cleanup task',
      labelNames: ['result'] as const,
      registers: [this.registry],
    });
    recordTestRendersCleaned(result: 'success' | 'error'): void {
      this.testRendersCleanedCounter.inc({ result });
    }
    ```
    (Adapter exactement à la classe MetricsService existante : si pattern utilise `prom-client.Counter` global plutôt que field, lire le fichier d'abord et coller au style en place.)

    6. Run `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-test-render-cron' --no-coverage --forceExit` → DOIT être GREEN.
    7. Run `cd central-server && npx tsc --noEmit` → DOIT être clean.
    8. Commit atomique : `feat(03-01): test render tracking migration + cleanup CRON`.
    9. Run `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-' --no-coverage --forceExit` → all v3 smokes GREEN.

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-test-render-cron' --no-coverage --forceExit && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep "ADD COLUMN IF NOT EXISTS test_render_at TIMESTAMP" central-server/src/scripts/migrations/add-template-test-render-tracking.sql` returns match
    - `grep "test_render_cleanup" central-server/src/scripts/migrations/add-template-test-render-tracking.sql` returns ≥ 3 matches (CHECK + INSERT + WHERE NOT EXISTS)
    - `grep "test_render_at TIMESTAMP" central-server/src/scripts/full-schema.sql` returns match
    - `grep "test_render_cleanup" central-server/src/scripts/full-schema.sql` returns match
    - `grep "test_render_cleanup:\s*executeTestRenderCleanupTask" central-server/src/services/cron-scheduler.service.ts` returns match
    - `grep "neopro_test_renders_cleaned_total" central-server/src/services/metrics.service.ts` returns match
    - jest smoke-template-studio-v3-test-render-cron exits 0 with all 5 tests passing
    - `npx tsc --noEmit` exits 0 (no type errors)
  </acceptance_criteria>
  <done>RED → GREEN ; tsc clean ; 5/5 tests + 3 v3 anciens smokes still GREEN.</done>
</task>

</tasks>

<verification>
- `cd central-server && npx jest --testPathPattern='smoke-template-studio-v3-' --no-coverage --forceExit` → 4 suites GREEN (vocabulary + duplicate + asset-manager + test-render-cron + options + preview = 6 suites total, ≥30 tests)
- `cd central-server && npx tsc --noEmit` → clean
- `npm run test:smoke:smart` → no regression
</verification>

<success_criteria>

- 1 migration committed avec ADD COLUMN IF NOT EXISTS pattern (ADR-086 backwards-compat)
- 1 CRON task class with Winston info+error + Prometheus metric (CLAUDE.md garde-fous)
- full-schema.sql resync
- Smoke RED → GREEN avec 5 contracts file-based
- Aucune regression sur les 5 v3 smokes existants
  </success_criteria>

<output>
After completion, create `.planning/phases/03-gate-publication/03-gate-publication-01-SUMMARY.md`
</output>
