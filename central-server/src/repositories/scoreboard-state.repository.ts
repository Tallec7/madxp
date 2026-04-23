/**
 * ADR-088 (draft) — Scoreboard live state store.
 *
 * In-memory cache of the last known match state per site, keyed by siteId.
 * TTL: entries older than 60s are treated as stale (sim/connector disconnected).
 *
 * Volatile by design — F-15.2 Phase SaaS-first validates the push-broadcast
 * contract before investing in persistent storage.
 */

export interface ScoreboardMatchState {
  siteId: string;
  vendor: 'bodet' | 'stramatel' | 'manual' | 'remote';
  sport: 'basketball' | 'football';
  period: number;
  chronoMs: number;
  clockRunning: boolean;
  homeScore: number;
  guestScore: number;
  homeTeamFouls: number;
  guestTeamFouls: number;
  shotClockMs: number;
  timeoutActive: 'home' | 'guest' | null;
  timeoutRemainingMs: number;
  homeTeamName?: string;
  guestTeamName?: string;
  updatedAt: number;
}

const TTL_MS = 60_000;

class ScoreboardStateRepository {
  private store = new Map<string, ScoreboardMatchState>();

  upsert(state: ScoreboardMatchState): void {
    this.store.set(state.siteId, { ...state, updatedAt: Date.now() });
  }

  findBySiteId(siteId: string): ScoreboardMatchState | null {
    const entry = this.store.get(siteId);
    if (!entry) return null;
    if (Date.now() - entry.updatedAt > TTL_MS) {
      this.store.delete(siteId);
      return null;
    }
    return entry;
  }

  clear(siteId: string): void {
    this.store.delete(siteId);
  }

  /** Test-only: flush all entries. */
  flush(): void {
    this.store.clear();
  }
}

export const scoreboardStateRepository = new ScoreboardStateRepository();
