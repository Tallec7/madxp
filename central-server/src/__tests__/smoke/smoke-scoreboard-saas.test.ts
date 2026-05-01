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
    // vendor restricted to the supported sources (bodet/stramatel/manual + remote pour ADR-090)
    expect(v).toMatch(/'bodet'[^)]*'stramatel'[^)]*'manual'[^)]*'remote'/);
  });

  it('repository exported from barrel', () => {
    const barrel = readRepo('central-server/src/repositories/index.ts');
    expect(barrel).toMatch(/scoreboardStateRepository/);
    expect(barrel).toMatch(/ScoreboardMatchState/);
  });

  it('sim-bodet + sim-stramatel expose cloud-push.js with matching vendor tags', () => {
    const bodet = readRepo('raspberry/scripts/sim-bodet-scorepad/src/cloud-push.js');
    const stra = readRepo('raspberry/scripts/sim-stramatel/src/cloud-push.js');
    expect(bodet).toMatch(/vendor:\s*'bodet'/);
    expect(stra).toMatch(/vendor:\s*'stramatel'/);
    // Authorization: Bearer (site api key)
    expect(bodet).toMatch(/Bearer \$\{siteApiKey\}/);
    expect(stra).toMatch(/Bearer \$\{siteApiKey\}/);
  });

  it('sim cloud-push modules have matching test coverage', () => {
    expect(existsRepo('raspberry/scripts/sim-bodet-scorepad/test/cloud-push.test.js')).toBe(true);
    expect(existsRepo('raspberry/scripts/sim-stramatel/test/cloud-push.test.js')).toBe(true);
  });

  describe('F-15.2 Phase 2 — manual push (simulateur Table de marque)', () => {
    it('POST /:siteId/state-manual route wired with JWT + requireRole + Joi', () => {
      const routes = readRepo('central-server/src/routes/scoreboard.routes.ts');
      const idx = routes.indexOf("'/:siteId/state-manual'");
      expect(idx).toBeGreaterThan(-1);
      const block = routes.slice(idx, idx + 600);
      expect(block).toMatch(/authenticate\b/);
      expect(block).toMatch(/requireRole\(\s*'admin'\s*,\s*'operator'\s*,\s*'club'\s*\)/);
      expect(block).toMatch(/validateParams\(paramSchemas\.siteId\)/);
      expect(block).toMatch(/validate\(scoreboardStateSchema\)/);
      expect(block).toMatch(/postScoreboardStateManual/);
    });

    it('controller enforces club cross-site guard and reuses repo + broadcast', () => {
      const ctrl = readRepo('central-server/src/controllers/scoreboard.controller.ts');
      const idx = ctrl.indexOf('postScoreboardStateManual');
      expect(idx).toBeGreaterThan(-1);
      const fn = ctrl.slice(idx, ctrl.indexOf('export const getScoreboardState'));
      expect(fn).toMatch(/req\.user\?\.role\s*===\s*'club'/);
      expect(fn).toMatch(/req\.user\.site_id\s*!==\s*siteId/);
      expect(fn).toMatch(/scoreboardStateRepository\.upsert/);
      expect(fn).toMatch(/socketService\.emitScoreboardState/);
    });
  });

  describe('ADR-090 — Unified scoreboard-state Remote ↔ Simulator ↔ Display', () => {
    it('validator supports sport=football and vendor=remote', () => {
      const v = readRepo('central-server/src/validators/scoreboard.validator.ts');
      expect(v).toMatch(/'basketball'\s*,\s*'football'/);
      expect(v).toMatch(/'remote'/);
      // validateScoreboardStatePush helper exported pour le socket listener
      expect(v).toMatch(/export function validateScoreboardStatePush/);
    });

    it('saas-relay handler wires scoreboard-state-push listener with validator + repo + broadcast (ADR-096)', () => {
      // ADR-096 : la logique relay SaaS (incluant scoreboard-state-push) a été
      // extraite dans handlers/saas-relay.handler.ts. socket.service.ts importe
      // ce handler et délègue via registerSaasRelay().
      const handler = readRepo('central-server/src/handlers/saas-relay.handler.ts');
      expect(handler).toMatch(/socket\.on\('scoreboard-state-push'/);
      expect(handler).toMatch(/validateScoreboardStatePush/);
      expect(handler).toMatch(/scoreboardStateRepository/);
      const svc = readRepo('central-server/src/services/socket.service.ts');
      expect(svc).toMatch(/saas-relay\.handler/);
    });

    it('RemoteScoreService + RemoteTimerService expose applyCloudState + onLocalChange hook', () => {
      const score = readRepo('raspberry/src/app/components/remote/remote-score.service.ts');
      const timer = readRepo('raspberry/src/app/components/remote/remote-timer.service.ts');
      expect(score).toMatch(/applyCloudState/);
      expect(score).toMatch(/onLocalChange/);
      expect(timer).toMatch(/applyCloudState/);
      expect(timer).toMatch(/onLocalChange/);
    });

    it('Remote (V1+V2) subscribe to scoreboard-state via orchestrator and exposes pushScoreboardState', () => {
      // Le listener entrant scoreboard-state vit désormais dans
      // RemoteOrchestratorService (extraction Phase 4 partagée V1+V2).
      // Le push outbound (scoreboard-state-push) reste dans RemoteComponent V1
      // car restreint au mode SaaS et propre au composant.
      const orch = readRepo('raspberry/src/app/services/remote-orchestrator.service.ts');
      expect(orch).toMatch(/['"]scoreboard-state['"]/);
      expect(orch).toMatch(/scoreService\.applyCloudState/);
      expect(orch).toMatch(/timerService\.applyCloudState/);

      const remote = readRepo('raspberry/src/app/components/remote/remote.component.ts');
      expect(remote).toMatch(/pushScoreboardState/);
      expect(remote).toMatch(/scoreboard-state-push/);
      // push restreint au mode SaaS (Pi local garde legacy score-update)
      expect(remote).toMatch(/saasConfigService\.isSaasMode\(\)/);
    });
  });

  it('route mount is NOT rate-limited globally (ADR-087 anti-pattern)', () => {
    const server = readRepo('central-server/src/server.ts');
    // Mount line for scoreboardRoutes must not include a rate limiter arg
    const line = server.split('\n').find((l) => l.includes('/api/scoreboard'));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/apiRateLimit|sensitiveRateLimit|adminRateLimit|remoteRateLimit/);
  });
});
