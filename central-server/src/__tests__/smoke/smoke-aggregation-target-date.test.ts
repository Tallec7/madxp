/**
 * Smoke regression guard — Live sponsor stats aggregation (Bottière 2026-05-08)
 *
 * Verrouille les invariants critiques :
 *   1. `aggregation.task.ts` lit `task_config.target_date` (sinon retombe en mode
 *      "yesterday only" et un nouveau Pi reste invisible jusqu'à minuit).
 *   2. La migration `add-hourly-sponsor-stats-live-aggregation.sql` insère bien
 *      la nouvelle recurring_schedule avec `cron_expression='10 * * * *'` et
 *      `target_date='today'`.
 *   3. La résolution du targetDate ne crée pas de SQL injection (ne concatène
 *      qu'une whitelist de strings).
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../..');

describe('Aggregation task — target_date support (Bottière 2026-05-08 regression guard)', () => {
  it('aggregation.task.ts must read task_config.target_date', () => {
    const taskPath = path.join(repoRoot, 'central-server/src/cron-tasks/aggregation.task.ts');
    const content = fs.readFileSync(taskPath, 'utf8');
    expect({
      readsTargetDate: /task_config\s+as\s+\{[^}]*target_date/.test(content),
      hasTargetDateType: /TargetDate/.test(content),
      reason: 'aggregation.task must read target_date from task_config — incident Bottière 2026-05-08',
    }).toEqual({
      readsTargetDate: true,
      hasTargetDateType: true,
      reason: 'aggregation.task must read target_date from task_config — incident Bottière 2026-05-08',
    });
  });

  it('aggregation.task.ts must support both today and yesterday SQL targets', () => {
    const taskPath = path.join(repoRoot, 'central-server/src/cron-tasks/aggregation.task.ts');
    const content = fs.readFileSync(taskPath, 'utf8');
    expect({
      hasYesterdaySql: /CURRENT_DATE\s*-\s*1/.test(content),
      hasTodaySql: /['"`]CURRENT_DATE['"`]/.test(content),
      defaultsToYesterday: /target_date\s*===\s*['"]today['"]\s*\?\s*['"]today['"]\s*:\s*['"]yesterday['"]/.test(content),
      reason: 'aggregation.task must support both today and yesterday targets with safe default',
    }).toEqual({
      hasYesterdaySql: true,
      hasTodaySql: true,
      defaultsToYesterday: true,
      reason: 'aggregation.task must support both today and yesterday targets with safe default',
    });
  });

  it('aggregation.task.ts must NOT interpolate user-supplied strings into SQL (injection guard)', () => {
    // Le mapping target_date → SQL passe par une whitelist (today/yesterday → CURRENT_DATE/CURRENT_DATE - 1).
    // Toute concaténation directe de `config.target_date` dans la query SQL est interdite.
    const taskPath = path.join(repoRoot, 'central-server/src/cron-tasks/aggregation.task.ts');
    const content = fs.readFileSync(taskPath, 'utf8');
    expect({
      noDirectInterpolation:
        !/calculate_(all_daily_stats|all_advertiser_daily_stats|site_sponsor_daily_stats)\(\$\{config/.test(
          content
        ) &&
        !/calculate_(all_daily_stats|all_advertiser_daily_stats|site_sponsor_daily_stats)\(\$\{targetDate\}/.test(
          content
        ),
      reason: 'target_date must be mapped via whitelist, never interpolated directly into SQL',
    }).toEqual({
      noDirectInterpolation: true,
      reason: 'target_date must be mapped via whitelist, never interpolated directly into SQL',
    });
  });

  it('migration add-hourly-sponsor-stats-live-aggregation.sql must insert a recurring schedule with target_date=today', () => {
    const migPath = path.join(
      repoRoot,
      'central-server/src/scripts/migrations/add-hourly-sponsor-stats-live-aggregation.sql'
    );
    const content = fs.readFileSync(migPath, 'utf8');
    expect({
      isInsert: /INSERT INTO recurring_schedules/.test(content),
      isHourlyCron: /['"]10 \* \* \* \*['"]/.test(content),
      isAggregationType: /['"]aggregation['"]/.test(content),
      targetsToday: /"target_date"\s*:\s*"today"/.test(content),
      isSponsorStats: /"aggregation_type"\s*:\s*"site_sponsor_daily_stats"/.test(content),
      isIdempotent: /ON CONFLICT|WHERE NOT EXISTS/.test(content),
      reason: 'migration must idempotently insert hourly site_sponsor_daily_stats with target_date=today',
    }).toEqual({
      isInsert: true,
      isHourlyCron: true,
      isAggregationType: true,
      targetsToday: true,
      isSponsorStats: true,
      isIdempotent: true,
      reason: 'migration must idempotently insert hourly site_sponsor_daily_stats with target_date=today',
    });
  });
});
