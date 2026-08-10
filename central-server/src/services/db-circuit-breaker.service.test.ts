/**
 * Circuit breaker DB — met en pause les services de fond quand Postgres décroche.
 *
 * Ce test existe parce que le heartbeat SaaS s'appuie sur `isAvailable()` pour
 * s'abstenir pendant une panne DB : le contrat CLOSED → OPEN → HALF_OPEN → CLOSED
 * n'était couvert par aucun test (entrée `LEGACY_SERVICES_WITHOUT_TEST`, retirée
 * avec cette PR conformément à `.claude/rules/testing.md`).
 *
 * Seul le singleton est exporté : chaque test remet l'état à zéro via un cycle
 * de récupération complet, plutôt que d'exposer un `reset()` de test en prod.
 */

import { dbCircuitBreaker } from './db-circuit-breaker.service';

/** Défauts du service (cf. DEFAULT_CONFIG) — dupliqués ici volontairement : */
/** si quelqu'un les change, ces tests doivent le signaler, pas suivre en silence. */
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 30_000;

/** Ramène le breaker en CLOSED quel que soit son état de départ. */
function forceClosed(): void {
  const { state, lastFailureAt } = dbCircuitBreaker.getStatus();
  if (state === 'CLOSED') {
    dbCircuitBreaker.recordSuccess();
    return;
  }
  jest.useFakeTimers();
  // Se placer après le cooldown DU DERNIER ÉCHEC, pas après « maintenant » : un
  // test précédent a pu laisser `lastFailureAt` dans le futur (temps simulé), et
  // repartir de l'heure réelle laisserait le circuit coincé OPEN 30 s durant.
  jest.setSystemTime(lastFailureAt + COOLDOWN_MS + 1);
  dbCircuitBreaker.isAvailable(); // OPEN → HALF_OPEN (sonde autorisée)
  dbCircuitBreaker.recordSuccess(); // HALF_OPEN → CLOSED
  jest.useRealTimers();
}

describe('dbCircuitBreaker', () => {
  beforeEach(() => forceClosed());
  afterEach(() => {
    jest.useRealTimers();
    forceClosed();
  });

  it('laisse passer tant que la DB répond', () => {
    expect(dbCircuitBreaker.isAvailable()).toBe(true);
    expect(dbCircuitBreaker.getStatus().state).toBe('CLOSED');
  });

  it('ne s’ouvre qu’au seuil d’échecs consécutifs', () => {
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      dbCircuitBreaker.recordFailure(new Error('timeout'));
      expect(dbCircuitBreaker.isAvailable()).toBe(true);
    }
    dbCircuitBreaker.recordFailure(new Error('timeout'));
    expect(dbCircuitBreaker.getStatus().state).toBe('OPEN');
    expect(dbCircuitBreaker.isAvailable()).toBe(false);
  });

  it('un succès remet le compteur à zéro — les échecs doivent être CONSÉCUTIFS', () => {
    dbCircuitBreaker.recordFailure();
    dbCircuitBreaker.recordFailure();
    dbCircuitBreaker.recordSuccess();
    expect(dbCircuitBreaker.getStatus().consecutiveFailures).toBe(0);

    dbCircuitBreaker.recordFailure();
    expect(dbCircuitBreaker.isAvailable()).toBe(true); // pas encore le seuil
  });

  it('reste fermé pendant le cooldown, puis laisse passer une sonde', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) dbCircuitBreaker.recordFailure();
    expect(dbCircuitBreaker.isAvailable()).toBe(false);

    jest.useFakeTimers();
    jest.setSystemTime(Date.now() + COOLDOWN_MS - 1000);
    expect(dbCircuitBreaker.isAvailable()).toBe(false); // cooldown pas écoulé

    jest.setSystemTime(Date.now() + 2000);
    expect(dbCircuitBreaker.isAvailable()).toBe(true); // la sonde passe
    expect(dbCircuitBreaker.getStatus().state).toBe('HALF_OPEN');

    // Une seule sonde à la fois : l'appel suivant est refusé.
    expect(dbCircuitBreaker.isAvailable()).toBe(false);
    jest.useRealTimers();
  });

  it('une sonde réussie referme le circuit', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) dbCircuitBreaker.recordFailure();
    jest.useFakeTimers();
    jest.setSystemTime(Date.now() + COOLDOWN_MS + 1);
    dbCircuitBreaker.isAvailable(); // → HALF_OPEN
    jest.useRealTimers();

    dbCircuitBreaker.recordSuccess();
    expect(dbCircuitBreaker.getStatus().state).toBe('CLOSED');
    expect(dbCircuitBreaker.isAvailable()).toBe(true);
  });

  it('une sonde échouée rouvre immédiatement, sans re-compter le seuil', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) dbCircuitBreaker.recordFailure();
    jest.useFakeTimers();
    jest.setSystemTime(Date.now() + COOLDOWN_MS + 1);
    dbCircuitBreaker.isAvailable(); // → HALF_OPEN

    dbCircuitBreaker.recordFailure(new Error('toujours KO'));
    expect(dbCircuitBreaker.getStatus().state).toBe('OPEN');
    expect(dbCircuitBreaker.isAvailable()).toBe(false);
    jest.useRealTimers();
  });

  describe('guardSilent', () => {
    it('exécute l’opération et la retourne quand le circuit est fermé', async () => {
      const result = await dbCircuitBreaker.guardSilent('test', async () => 42);
      expect(result).toBe(42);
    });

    it('saute l’opération quand le circuit est ouvert', async () => {
      for (let i = 0; i < FAILURE_THRESHOLD; i++) dbCircuitBreaker.recordFailure();
      const op = jest.fn(async () => 42);
      const result = await dbCircuitBreaker.guardSilent('test', op);
      expect(result).toBeUndefined();
      expect(op).not.toHaveBeenCalled();
    });

    it('avale l’erreur et la compte comme un échec', async () => {
      const result = await dbCircuitBreaker.guardSilent('test', async () => {
        throw new Error('boom');
      });
      expect(result).toBeUndefined();
      expect(dbCircuitBreaker.getStatus().consecutiveFailures).toBe(1);
    });
  });

  describe('guard', () => {
    it('propage l’erreur (contrairement à guardSilent) tout en la comptant', async () => {
      await expect(
        dbCircuitBreaker.guard(async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
      expect(dbCircuitBreaker.getStatus().consecutiveFailures).toBe(1);
    });

    it('retourne undefined sans exécuter quand le circuit est ouvert', async () => {
      for (let i = 0; i < FAILURE_THRESHOLD; i++) dbCircuitBreaker.recordFailure();
      const op = jest.fn(async () => 42);
      await expect(dbCircuitBreaker.guard(op)).resolves.toBeUndefined();
      expect(op).not.toHaveBeenCalled();
    });
  });
});
