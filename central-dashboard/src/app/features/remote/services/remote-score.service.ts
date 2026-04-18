/**
 * RemoteScoreService — Score state management and broadcasting for cloud remote.
 * Extracted from CloudRemoteComponent (ADR-043).
 * ADR-059: optimistic UI + reconciliation via state-sync.
 */
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { MatchStateSync, RemoteService } from '../../../core/services/remote.service';

export interface ScoreState {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

@Injectable()
export class RemoteScoreService {
  /** Debounce subject — emit to trigger legacy score broadcast after 500ms (coexistence ADR-061) */
  readonly scoreUpdate$ = new Subject<void>();

  currentScore: ScoreState = {
    homeTeam: 'DOMICILE',
    awayTeam: 'EXTÉRIEUR',
    homeScore: 0,
    awayScore: 0,
  };

  constructor(private remoteService: RemoteService) {}

  // --- ADR-059: commandes granulaires (optimistic UI) ---

  incrementHomeScore(siteId: string): void {
    this.currentScore.homeScore++;
    this.remoteService.sendMatchCommand(siteId, 'command/increment_home')
      .subscribe({ error: () => { this.currentScore.homeScore--; } });
  }

  decrementHomeScore(siteId: string): void {
    if (this.currentScore.homeScore <= 0) return;
    this.currentScore.homeScore--;
    this.remoteService.sendMatchCommand(siteId, 'command/decrement_home')
      .subscribe({ error: () => { this.currentScore.homeScore++; } });
  }

  incrementAwayScore(siteId: string): void {
    this.currentScore.awayScore++;
    this.remoteService.sendMatchCommand(siteId, 'command/increment_away')
      .subscribe({ error: () => { this.currentScore.awayScore--; } });
  }

  decrementAwayScore(siteId: string): void {
    if (this.currentScore.awayScore <= 0) return;
    this.currentScore.awayScore--;
    this.remoteService.sendMatchCommand(siteId, 'command/decrement_away')
      .subscribe({ error: () => { this.currentScore.awayScore++; } });
  }

  /** Réconcilie le score local avec l'état autoritaire du Pi (state-sync). */
  syncFromState(state: MatchStateSync): void {
    if (state.score) {
      this.currentScore.homeScore = state.score.homeScore;
      this.currentScore.awayScore = state.score.awayScore;
      this.currentScore.homeTeam = state.score.homeTeam;
      this.currentScore.awayTeam = state.score.awayTeam;
    }
  }

  updateTeamNamesFromMatch(matchName: string): void {
    if (matchName && matchName.toLowerCase().includes('vs')) {
      const teams = matchName.split(/vs/i).map(t => t.trim());
      this.currentScore.homeTeam = teams[0] || 'DOMICILE';
      this.currentScore.awayTeam = teams[1] || 'EXTÉRIEUR';
      this.scoreUpdate$.next();
    }
  }

  /** Legacy — envoi état absolu (coexistence ADR-061, conservé pour rétro-compat). */
  sendScoreUpdate(siteId: string, period: string): void {
    this.remoteService.updateScore(siteId, {
      homeTeam: this.currentScore.homeTeam,
      awayTeam: this.currentScore.awayTeam,
      homeScore: this.currentScore.homeScore,
      awayScore: this.currentScore.awayScore,
      period,
    }).subscribe({
      error: () => { /* Silencieux — retry au prochain update */ },
    });
  }

  resetScore(siteId: string): { success: Subject<void>; error: Subject<void> } {
    const success = new Subject<void>();
    const error = new Subject<void>();

    this.currentScore.homeScore = 0;
    this.currentScore.awayScore = 0;

    this.remoteService.sendMatchCommand(siteId, 'command/score_reset').subscribe({
      next: () => success.next(),
      error: () => { error.next(); },
    });

    return { success, error };
  }

  resetForNewMatch(homeTeamName: string, awayTeamName: string): void {
    this.currentScore = {
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      homeScore: 0,
      awayScore: 0,
    };
  }
}
