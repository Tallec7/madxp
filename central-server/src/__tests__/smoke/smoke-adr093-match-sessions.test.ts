/**
 * Smoke tests — ADR-093 match sessions persistence + auto-close CRON.
 * File-level reads only (no app bootstrap).
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(repoRoot, rel));

describe('Smoke — ADR-093 match sessions', () => {
  it('migration file exists and extends club_sessions with match fields', () => {
    const file = 'central-server/src/scripts/migrations/extend-club-sessions-match-fields.sql';
    expect(exists(file)).toBe(true);
    const sql = read(file);
    for (const col of ['home_team', 'away_team', 'home_score', 'away_score', 'profile_id', 'event_type', 'ended_by']) {
      expect(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`).test(sql)).toBe(true);
    }
  });

  it('migration rewrites check_task_type to include pdf_report + match_session_autoclose', () => {
    const sql = read('central-server/src/scripts/migrations/extend-club-sessions-match-fields.sql');
    expect(/DROP CONSTRAINT IF EXISTS check_task_type/.test(sql)).toBe(true);
    expect(/'pdf_report'/.test(sql)).toBe(true);
    expect(/'match_session_autoclose'/.test(sql)).toBe(true);
  });

  it('migration seeds the hourly match_session_autoclose schedule', () => {
    const sql = read('central-server/src/scripts/migrations/extend-club-sessions-match-fields.sql');
    expect(/INSERT INTO recurring_schedules/.test(sql)).toBe(true);
    expect(/'match_session_autoclose'/.test(sql)).toBe(true);
    expect(/idleHours/.test(sql)).toBe(true);
    expect(/absoluteTimeoutHours/.test(sql)).toBe(true);
  });

  it('full-schema.sql check_task_type mirrors migration values', () => {
    const sql = read('central-server/src/scripts/full-schema.sql');
    const line = sql.split('\n').find((l) => /CONSTRAINT check_task_type/.test(l));
    expect(line).toBeDefined();
    expect(line!).toMatch(/pdf_report/);
    expect(line!).toMatch(/match_session_autoclose/);
  });

  it('full-schema.sql club_sessions has ADR-093 columns', () => {
    const sql = read('central-server/src/scripts/full-schema.sql');
    const table = sql.match(/CREATE TABLE public\.club_sessions[\s\S]*?\);/);
    expect(table).not.toBeNull();
    for (const col of ['home_team', 'away_team', 'home_score', 'away_score', 'profile_id', 'event_type', 'ended_by']) {
      expect(table![0]).toMatch(new RegExp(col));
    }
  });

  it('cron-scheduler dispatches match_session_autoclose to extracted handler (ADR-097)', () => {
    // ADR-097 : extraction des executors dans cron-tasks/. Le service garde un
    // dispatch via TASK_EXECUTORS qui mappe `match_session_autoclose` vers
    // executeMatchAutoCloseTask, et la logique métier vit dans le task file.
    const svc = read('central-server/src/services/cron-scheduler.service.ts');
    expect(/executeMatchAutoCloseTask/.test(svc)).toBe(true);
    expect(/match_session_autoclose:\s*executeMatchAutoCloseTask/.test(svc)).toBe(true);

    const task = read('central-server/src/cron-tasks/match-autoclose.task.ts');
    expect(/ended_by = 'timeout'/.test(task)).toBe(true);
    expect(/recordMatchSessionAutoclosed/.test(task)).toBe(true);
  });

  it('metrics.service exposes madxp_match_sessions_autoclosed_total with reason label', () => {
    const metrics = read('central-server/src/services/metrics.service.ts');
    expect(/madxp_match_sessions_autoclosed_total/.test(metrics)).toBe(true);
    expect(/recordMatchSessionAutoclosed/.test(metrics)).toBe(true);
    expect(/labelNames:\s*\[\s*'reason'\s*\]/.test(metrics)).toBe(true);
  });

  it('score-update.handler freezes home_score/away_score on open session', () => {
    const handler = read('central-server/src/handlers/score-update.handler.ts');
    expect(/UPDATE club_sessions/.test(handler)).toBe(true);
    expect(/home_score/.test(handler)).toBe(true);
    expect(/away_score/.test(handler)).toBe(true);
    expect(/ended_at IS NULL/.test(handler)).toBe(true);
  });

  it('match-config.handler persists home_team/away_team/profile_id/event_type', () => {
    const handler = read('central-server/src/handlers/match-config.handler.ts');
    for (const col of ['home_team', 'away_team', 'profile_id', 'event_type']) {
      expect(new RegExp(col).test(handler)).toBe(true);
    }
  });

  it('site.repository MatchRow + getMatchStats support period filter', () => {
    const repo = read('central-server/src/repositories/site.repository.ts');
    for (const col of ['home_team', 'away_team', 'home_score', 'away_score', 'profile_id', 'event_type', 'ended_by']) {
      expect(new RegExp(col).test(repo)).toBe(true);
    }
    expect(/getMatchStats\([\s\S]*?from\?:\s*Date[\s\S]*?to\?:\s*Date/.test(repo)).toBe(true);
  });

  it('sites.routes validates match-history query (from/to/limit)', () => {
    const routes = read('central-server/src/routes/sites.routes.ts');
    expect(/validateQuery\(\s*querySchemas\.matchHistory\s*\)/.test(routes)).toBe(true);
    const validation = read('central-server/src/middleware/validation.ts');
    expect(/matchHistory:\s*Joi\.object/.test(validation)).toBe(true);
  });

  it('remote.component emits enriched match-config payload', () => {
    const remote = read('raspberry/src/app/components/remote/remote.component.ts');
    expect(/homeTeam:/.test(remote)).toBe(true);
    expect(/awayTeam:/.test(remote)).toBe(true);
    expect(/profileId:/.test(remote)).toBe(true);
    expect(/eventType:/.test(remote)).toBe(true);
    expect(/currentProfileId/.test(remote)).toBe(true);
  });
});
