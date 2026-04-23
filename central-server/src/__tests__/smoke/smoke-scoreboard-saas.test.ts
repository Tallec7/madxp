/**
 * Smoke tests — ADR-088 scoreboard SaaS push (F-15.2).
 *
 * Protège le contrat sim/connector → cloud → dashboard :
 *   - POST /api/scoreboard/:siteId/state (authenticateSiteApiKey + Joi)
 *   - socketService.emitScoreboardState broadcast to siteId room
 *   - repository in-memory + TTL 60s
 *
 * Usage: npm run test:smoke
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function existsRepo(rel: string): boolean {
  return fs.existsSync(path.join(repoRoot, rel));
}

describe('ADR-088 — Scoreboard SaaS push (backend wiring)', () => {
  it('scoreboard.routes.ts exists and is mounted in server.ts', () => {
    expect(existsRepo('central-server/src/routes/scoreboard.routes.ts')).toBe(true);
    const server = readRepo('central-server/src/server.ts');
    expect(server).toMatch(/scoreboardRoutes/);
    expect(server).toMatch(/\/api\/scoreboard/);
  });

  it('POST route uses authenticateSiteApiKey + validateParams(siteId) + validate(schema)', () => {
    const routes = readRepo('central-server/src/routes/scoreboard.routes.ts');
    // POST block
    const postBlock = routes.slice(routes.indexOf('router.post'), routes.indexOf('router.get'));
    expect(postBlock).toMatch(/authenticateSiteApiKey/);
    expect(postBlock).toMatch(/validateParams\(paramSchemas\.siteId\)/);
    expect(postBlock).toMatch(/validate\(scoreboardStateSchema\)/);
  });

  it('controller asserts req.siteId === req.params.siteId (cross-site push guard)', () => {
    const ctrl = readRepo('central-server/src/controllers/scoreboard.controller.ts');
    expect(ctrl).toMatch(/req\.siteId\s*!==\s*siteId/);
    expect(ctrl).toMatch(/API key does not match site/);
  });

  it('controller calls repository.upsert + socketService.emitScoreboardState', () => {
    const ctrl = readRepo('central-server/src/controllers/scoreboard.controller.ts');
    expect(ctrl).toMatch(/scoreboardStateRepository\.upsert/);
    expect(ctrl).toMatch(/socketService\.emitScoreboardState/);
  });

  it('socket.service exposes emitScoreboardState(siteId, state)', () => {
    const svc = readRepo('central-server/src/services/socket.service.ts');
    expect(svc).toMatch(/emitScoreboardState\s*\(/);
    expect(svc).toMatch(/'scoreboard-state'/);
  });

  it('repository enforces TTL on findBySiteId (stale entries dropped)', () => {
    const repo = readRepo('central-server/src/repositories/scoreboard-state.repository.ts');
    expect(repo).toMatch(/TTL_MS/);
    expect(repo).toMatch(/Date\.now\(\)\s*-\s*entry\.updatedAt\s*>\s*TTL_MS/);
  });

  it('Joi schema covers all MatchState v1 fields', () => {
    const v = readRepo('central-server/src/validators/scoreboard.validator.ts');
    for (const field of [
      'vendor', 'sport', 'period', 'chronoMs', 'clockRunning',
      'homeScore', 'guestScore', 'homeTeamFouls', 'guestTeamFouls',
      'shotClockMs', 'timeoutActive', 'timeoutRemainingMs',
    ]) {
      expect(v).toMatch(new RegExp(`${field}:\\s*Joi`));
    }
    // vendor restricted to the 3 supported sources
    expect(v).toMatch(/'bodet'[^)]*'stramatel'[^)]*'manual'/);
  });

  it('repository exported from barrel', () => {
    const barrel = readRepo('central-server/src/repositories/index.ts');
    expect(barrel).toMatch(/scoreboardStateRepository/);
    expect(barrel).toMatch(/ScoreboardMatchState/);
  });

  it('route mount is NOT rate-limited globally (ADR-087 anti-pattern)', () => {
    const server = readRepo('central-server/src/server.ts');
    // Mount line for scoreboardRoutes must not include a rate limiter arg
    const line = server.split('\n').find((l) => l.includes('/api/scoreboard'));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/apiRateLimit|sensitiveRateLimit|adminRateLimit|remoteRateLimit/);
  });
});
