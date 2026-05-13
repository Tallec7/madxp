/**
 * Smoke tests — Socket.IO Redis adapter SUPPRIMÉ (cleanup post-incident NLF 2026-05-13)
 *
 * Contexte de l'incident :
 * Le quota Upstash Redis a été épuisé (500 000 req/mois) le 2026-05-12 ~20:34 UTC.
 * Le central-server bouclait sur `ERR max requests limit exceeded` côté pub/sub
 * Socket.IO — les events applicatifs `authenticate` et `heartbeat` étaient
 * droppés silencieusement → toute la flotte apparaissait `Hors ligne` côté
 * dashboard alors que les Pi heartbeataient normalement (TCP + Socket.IO
 * low-level + HTTP analytics OK).
 *
 * Décision de cleanup (cf. docs/runbooks/OPS-06 étape 4 — choix A) :
 * Le Redis adapter n'avait d'utilité que pour le scale horizontal (>1 replica
 * Railway). En 1 replica (cas actuel), il était purement décoratif et son
 * crash bloquait le pub/sub local. Supprimé définitivement le 2026-05-13.
 *
 * Ce smoke test bloque toute réintroduction silencieuse de Redis. Si un jour
 * on a besoin de scaler, retrouver le code dans l'historique git (avant
 * commit cleanup) plutôt que de le re-coder vite fait.
 *
 * Note : ce test a remplacé une version intermédiaire (PR #979) qui validait
 * un kill-switch `REDIS_ENABLED=false`. Le kill-switch est devenu obsolète
 * dès lors que tout le code Redis a été supprimé.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../..');
const SOCKET_SERVICE = path.join(SRC_ROOT, 'services/socket.service.ts');
const HEALTH_SERVICE = path.join(SRC_ROOT, 'services/health.service.ts');
const ADMIN_CONTROLLER = path.join(SRC_ROOT, 'controllers/admin.controller.ts');
const SERVER_ENTRY = path.join(SRC_ROOT, 'server.ts');
const PACKAGE_JSON = path.resolve(SRC_ROOT, '../package.json');

describe('Redis adapter cleanup — incident NLF 2026-05-13 (smoke)', () => {
  describe('central-server/package.json — deps retirées', () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
    const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

    it('@socket.io/redis-adapter n\'est plus une dépendance', () => {
      expect(allDeps).not.toHaveProperty('@socket.io/redis-adapter');
    });

    it('le client `redis` n\'est plus une dépendance', () => {
      expect(allDeps).not.toHaveProperty('redis');
    });
  });

  describe('socket.service.ts — pas de Redis', () => {
    const src = fs.readFileSync(SOCKET_SERVICE, 'utf8');

    it('n\'importe pas createAdapter ni createClient', () => {
      expect(src).not.toMatch(/from\s+['"]@socket\.io\/redis-adapter['"]/);
      expect(src).not.toMatch(/from\s+['"]redis['"]/);
    });

    it('ne déclare pas de propriétés redisClient / redisSub', () => {
      expect(src).not.toMatch(/private\s+redisClient/);
      expect(src).not.toMatch(/private\s+redisSub/);
    });

    it('ne contient plus la méthode setupRedisAdapter', () => {
      expect(src).not.toMatch(/setupRedisAdapter\s*\(/);
    });

    it('n\'expose plus isRedisConnected()', () => {
      expect(src).not.toMatch(/isRedisConnected\s*\(/);
    });

    it('ne lit pas REDIS_URL ou REDIS_ENABLED', () => {
      expect(src).not.toMatch(/process\.env\.REDIS_URL/);
      expect(src).not.toMatch(/process\.env\.REDIS_ENABLED/);
    });
  });

  describe('consumers — pas de référence isRedisConnected', () => {
    it('health.service.ts : pas de checkRedis ni isRedisConnected', () => {
      const src = fs.readFileSync(HEALTH_SERVICE, 'utf8');
      expect(src).not.toMatch(/checkRedis\s*\(/);
      expect(src).not.toMatch(/isRedisConnected\s*\(/);
    });

    it('admin.controller.ts : pas de isRedisConnected dans la réponse socketState', () => {
      const src = fs.readFileSync(ADMIN_CONTROLLER, 'utf8');
      expect(src).not.toMatch(/isRedisConnected/);
    });

    it('server.ts : pas de log redisEnabled ni isRedisConnected', () => {
      const src = fs.readFileSync(SERVER_ENTRY, 'utf8');
      expect(src).not.toMatch(/redisEnabled/);
      expect(src).not.toMatch(/isRedisConnected/);
    });
  });

  describe('HealthCheckResult type — plus de champ redis', () => {
    const src = fs.readFileSync(HEALTH_SERVICE, 'utf8');

    it('l\'interface HealthCheckResult ne déclare plus `redis?`', () => {
      const interfaceMatch = src.match(/interface\s+HealthCheckResult\s*\{[\s\S]*?\n\}/);
      expect(interfaceMatch).not.toBeNull();
      expect(interfaceMatch![0]).not.toMatch(/redis\?\s*:/);
    });
  });
});
