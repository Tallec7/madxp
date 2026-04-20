/**
 * SaasMatchStateService — Autoritative match state for SaaS sites.
 *
 * Mirrors `raspberry/server/services/state.service.js` + `state-broadcaster.js`
 * for sites without a Pi (site_type='saas'). On Pi, the LAN socket server owns
 * the state. On SaaS, there is no LAN server — so the central server owns it.
 *
 * Scope: score, phase, timer. Monotonic seq per siteId (reset on process restart).
 */

export interface SaasScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export interface SaasTimer {
  currentTime: number;
  isRunning: boolean;
  halfDuration: number;
  countDown: boolean;
}

export interface MatchStateSyncPayload {
  seq: number;
  score: SaasScore | null;
  phase: string;
  timer: SaasTimer;
  options: Record<string, unknown> | null;
  serverTs: number;
}

interface SaasMatchState {
  seq: number;
  score: SaasScore | null;
  phase: string;
  timer: SaasTimer;
  options: Record<string, unknown> | null;
}

const DEFAULT_TIMER: SaasTimer = {
  currentTime: 0,
  isRunning: false,
  halfDuration: 45,
  countDown: true,
};

function createInitialState(): SaasMatchState {
  return {
    seq: 0,
    score: null,
    phase: 'neutral',
    timer: { ...DEFAULT_TIMER },
    options: null,
  };
}

class SaasMatchStateService {
  private readonly states = new Map<string, SaasMatchState>();

  private ensure(siteId: string): SaasMatchState {
    let s = this.states.get(siteId);
    if (!s) {
      s = createInitialState();
      this.states.set(siteId, s);
    }
    return s;
  }

  incrementScore(siteId: string, side: 'home' | 'away'): void {
    const s = this.ensure(siteId);
    if (!s.score) {
      s.score = { homeTeam: 'DOMICILE', awayTeam: 'EXTÉRIEUR', homeScore: 0, awayScore: 0 };
    }
    if (side === 'home') s.score.homeScore += 1;
    else s.score.awayScore += 1;
  }

  decrementScore(siteId: string, side: 'home' | 'away'): void {
    const s = this.ensure(siteId);
    if (!s.score) return;
    if (side === 'home' && s.score.homeScore > 0) s.score.homeScore -= 1;
    else if (side === 'away' && s.score.awayScore > 0) s.score.awayScore -= 1;
  }

  resetScore(siteId: string): void {
    const s = this.ensure(siteId);
    s.score = null;
  }

  /** Absolute score update (legacy path — coexistence ADR-061). */
  setScore(siteId: string, data: Partial<SaasScore>): void {
    const s = this.ensure(siteId);
    s.score = {
      homeTeam: data.homeTeam ?? s.score?.homeTeam ?? 'DOMICILE',
      awayTeam: data.awayTeam ?? s.score?.awayTeam ?? 'EXTÉRIEUR',
      homeScore: data.homeScore ?? s.score?.homeScore ?? 0,
      awayScore: data.awayScore ?? s.score?.awayScore ?? 0,
    };
  }

  setPhase(siteId: string, phase: string): void {
    const s = this.ensure(siteId);
    s.phase = phase || 'neutral';
  }

  timerStart(siteId: string, time?: number): void {
    const s = this.ensure(siteId);
    if (typeof time === 'number') s.timer.currentTime = time;
    s.timer.isRunning = true;
  }

  timerPause(siteId: string): void {
    const s = this.ensure(siteId);
    s.timer.isRunning = false;
  }

  timerReset(siteId: string, time?: number): void {
    const s = this.ensure(siteId);
    s.timer.currentTime = typeof time === 'number' ? time : 0;
    s.timer.isRunning = false;
  }

  /** Partial timer update (legacy path). */
  updateTimer(siteId: string, data: Partial<SaasTimer>): void {
    const s = this.ensure(siteId);
    s.timer = { ...s.timer, ...data };
  }

  setOptions(siteId: string, data: Record<string, unknown> | null): void {
    const s = this.ensure(siteId);
    s.options = data;
  }

  /** Increment seq and return the payload to broadcast. */
  snapshot(siteId: string): MatchStateSyncPayload {
    const s = this.ensure(siteId);
    s.seq += 1;
    return {
      seq: s.seq,
      score: s.score ? { ...s.score } : null,
      phase: s.phase,
      timer: { ...s.timer },
      options: s.options,
      serverTs: Date.now(),
    };
  }

  /** Current state without bumping seq (for late-join via HTTP /state). */
  peek(siteId: string): MatchStateSyncPayload {
    const s = this.ensure(siteId);
    return {
      seq: s.seq,
      score: s.score ? { ...s.score } : null,
      phase: s.phase,
      timer: { ...s.timer },
      options: s.options,
      serverTs: Date.now(),
    };
  }

  reset(siteId: string): void {
    this.states.delete(siteId);
  }
}

export const saasMatchStateService = new SaasMatchStateService();
export default saasMatchStateService;
