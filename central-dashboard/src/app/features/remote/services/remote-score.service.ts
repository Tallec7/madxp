/**
 * RemoteScoreService — Score state management and broadcasting for cloud remote.
 * Extracted from CloudRemoteComponent (ADR-043).
 */
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { RemoteService } from '../../../core/services/remote.service';

export interface ScoreState {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

@Injectable()
export class RemoteScoreService {
  /** Debounce subject — emit to trigger score broadcast after 500ms inactivity */
  readonly scoreUpdate$ = new Subject<void>();

  currentScore: ScoreState = {
    homeTeam: 'DOMICILE',
    awayTeam: 'EXTÉRIEUR',
    homeScore: 0,
    awayScore: 0,
  };

  constructor(private remoteService: RemoteService) {}

  incrementHomeScore(): void {
    this.currentScore.homeScore++;
    this.scoreUpdate$.next();
  }

  decrementHomeScore(): void {
    if (this.currentScore.homeScore > 0) {
      this.currentScore.homeScore--;
      this.scoreUpdate$.next();
    }
  }

  incrementAwayScore(): void {
    this.currentScore.awayScore++;
    this.scoreUpdate$.next();
  }

  decrementAwayScore(): void {
    if (this.currentScore.awayScore > 0) {
      this.currentScore.awayScore--;
      this.scoreUpdate$.next();
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

  /** Called by debounced subscription — sends score to Pi via HTTP */
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

    this.remoteService.resetScore(siteId).subscribe({
      next: () => success.next(),
      error: () => error.next(),
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
