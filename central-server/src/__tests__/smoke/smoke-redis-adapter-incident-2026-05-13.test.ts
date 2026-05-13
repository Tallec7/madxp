/**
 * Smoke tests — Socket.IO Redis adapter hardening (incident NLF 2026-05-13)
 *
 * Garde-fou contre la régression de l'incident 2026-05-13 :
 * - Quota Upstash Redis épuisé (500 000 req/mois) → pub/sub Socket.IO en
 *   boucle d'erreurs → events applicatifs (authenticate, heartbeat) droppés
 *   → toute la flotte apparaît `Hors ligne` côté dashboard alors que les
 *   Pi heartbeat normalement.
 * - Aggravé par un fallback bogué : après `Failed to setup Redis adapter`,
 *   les clients gardaient leurs handlers `error` attachés et continuaient à
 *   logger en boucle.
 *
 * Le fix introduit :
 *   1. Un kill-switch explicite `REDIS_ENABLED=false` qui prend le pas sur
 *      `REDIS_URL` (utile quand on ne peut pas supprimer la variable d'env).
 *   2. Le cleanup correct des listeners `error` (`removeAllListeners('error')`)
 *      dans le catch du setup Redis.
 */

import * as fs from 'fs';
import * as path from 'path';

const SERVICE = path.resolve(__dirname, '../..', 'services/socket.service.ts');

describe('Socket.IO Redis adapter — hardening NLF 2026-05-13 (smoke)', () => {
  const src = fs.readFileSync(SERVICE, 'utf8');

  it('expose le kill-switch REDIS_ENABLED', () => {
    expect(src).toMatch(/process\.env\.REDIS_ENABLED/);
  });

  it('REDIS_ENABLED=false court-circuite avant REDIS_URL', () => {
    const enabledIdx = src.indexOf('process.env.REDIS_ENABLED');
    const urlIdx = src.indexOf('process.env.REDIS_URL');
    expect(enabledIdx).toBeGreaterThan(-1);
    expect(urlIdx).toBeGreaterThan(-1);
    // Le test du kill-switch doit lire REDIS_ENABLED AVANT REDIS_URL et avant
    // toute tentative de createClient.
    const createIdx = src.indexOf('createClient(');
    expect(enabledIdx).toBeLessThan(createIdx);
  });

  it('le default REDIS_ENABLED est true (pas de breaking change si var absente)', () => {
    // Pattern attendu : (process.env.REDIS_ENABLED ?? 'true')
    expect(src).toMatch(/REDIS_ENABLED\s*\?\?\s*['"]true['"]/);
  });

  it('le catch nettoie les listeners error des clients Redis', () => {
    // Sans removeAllListeners, les clients quit()-és continuent à logger
    // l'erreur de connexion en boucle pendant que single-instance prend le relais.
    const pubMatches = src.match(/this\.redisClient\.removeAllListeners\(['"]error['"]\)/);
    const subMatches = src.match(/this\.redisSub\.removeAllListeners\(['"]error['"]\)/);
    expect(pubMatches).not.toBeNull();
    expect(subMatches).not.toBeNull();
  });

  it('le removeAllListeners est APPELÉ AVANT le quit() dans le catch', () => {
    // Inverser l'ordre re-introduirait la boucle de logs : Redis client
    // émet 'error' juste avant que quit() résolve.
    const catchStart = src.indexOf('Failed to setup Redis adapter');
    expect(catchStart).toBeGreaterThan(-1);
    const tail = src.slice(catchStart, catchStart + 1500);
    const pubRemoveIdx = tail.indexOf("this.redisClient.removeAllListeners('error')");
    const pubQuitIdx = tail.indexOf('this.redisClient.quit()');
    const subRemoveIdx = tail.indexOf("this.redisSub.removeAllListeners('error')");
    const subQuitIdx = tail.indexOf('this.redisSub.quit()');
    expect(pubRemoveIdx).toBeGreaterThan(-1);
    expect(pubQuitIdx).toBeGreaterThan(pubRemoveIdx);
    expect(subRemoveIdx).toBeGreaterThan(-1);
    expect(subQuitIdx).toBeGreaterThan(subRemoveIdx);
  });
});
