/**
 * RemoteScoreService — Score state management and broadcasting for Pi remote.
 * Extracted from RemoteComponent (mirrors ADR-043 pattern from cloud-remote).
 * Transport: LocalBroadcastService (BroadcastChannel) + SocketService (Socket.IO).
 *
 * ADR-090 — applyCloudState() permet de synchroniser la Remote depuis un
 * scoreboard-state cloud (simulateur dashboard, connecteur table de marque).
 * Sans rebroadcast pour éviter les boucles.
 */
import { Injectable, inject } from '@angular/core';
import { SocketService } from '../../services/socket.service';
import { LocalBroadcastService } from '../../services/local-broadcast.service';

export interface ScoreState {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export interface CloudScoreStateSlice {
  homeScore: number;
  guestScore: number;
  homeTeamName?: string;
  guestTeamName?: string;
}

@Injectable()
export class RemoteScoreService {
  private readonly socketService = inject(SocketService);
  private readonly localBroadcast = inject(LocalBroadcastService);

  currentScore: ScoreState = {
    homeTeam: 'DOMICILE',
    awayTeam: 'EXTÉRIEUR',
    homeScore: 0,
    awayScore: 0,
  };

  /** ADR-090 — hook appelé après chaque changement local pour push vers cloud. */
  onLocalChange: (() => void) | null = null;

  incrementHomeScore(): void {
    this.currentScore.homeScore++;
    this.broadcast();
    this.onLocalChange?.();
  }

  decrementHomeScore(): void {
    if (this.currentScore.homeScore > 0) {
      this.currentScore.homeScore--;
      this.broadcast();
      this.onLocalChange?.();
    }
  }

  incrementAwayScore(): void {
    this.currentScore.awayScore++;
    this.broadcast();
    this.onLocalChange?.();
  }

  decrementAwayScore(): void {
    if (this.currentScore.awayScore > 0) {
      this.currentScore.awayScore--;
      this.broadcast();
      this.onLocalChange?.();
    }
  }

  /** Extrait les noms d'équipes depuis le nom du match (format "Équipe A vs Équipe B") */
  updateTeamNamesFromMatch(matchName: string): void {
    if (matchName && matchName.toLowerCase().includes('vs')) {
      const teams = matchName.split(/vs/i).map(t => t.trim());
      this.currentScore.homeTeam = teams[0] || 'DOMICILE';
      this.currentScore.awayTeam = teams[1] || 'EXTÉRIEUR';
      this.broadcast();
      this.onLocalChange?.();
    }
  }

  resetScore(): void {
    this.currentScore.homeScore = 0;
    this.currentScore.awayScore = 0;
    this.broadcast();
    this.onLocalChange?.();
  }

  resetForNewMatch(homeTeamName: string, awayTeamName: string): void {
    this.currentScore = {
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      homeScore: 0,
      awayScore: 0,
    };
  }

  /** Met à jour le nom d'une équipe et re-broadcast */
  setHomeTeamName(name: string): void {
    this.currentScore.homeTeam = name;
    this.broadcast();
    this.onLocalChange?.();
  }

  setAwayTeamName(name: string): void {
    this.currentScore.awayTeam = name;
    this.broadcast();
    this.onLocalChange?.();
  }

  /**
   * ADR-090 — applique un état cloud entrant (scoreboard-state) sans rebroadcast.
   * Utilisé par la Remote SaaS pour refléter les pushes du simulateur dashboard.
   */
  applyCloudState(state: CloudScoreStateSlice): void {
    const next: ScoreState = {
      homeTeam: state.homeTeamName?.trim() || this.currentScore.homeTeam,
      awayTeam: state.guestTeamName?.trim() || this.currentScore.awayTeam,
      homeScore: state.homeScore,
      awayScore: state.guestScore,
    };
    const unchanged =
      next.homeScore === this.currentScore.homeScore &&
      next.awayScore === this.currentScore.awayScore &&
      next.homeTeam === this.currentScore.homeTeam &&
      next.awayTeam === this.currentScore.awayTeam;
    if (unchanged) return;
    this.currentScore = next;
    this.localBroadcast.emitScoreUpdate(next);
  }

  /** Envoie le score à la TV via BroadcastChannel (local) + Socket.IO (cloud) */
  broadcast(): void {
    const scoreData = {
      homeTeam: this.currentScore.homeTeam,
      awayTeam: this.currentScore.awayTeam,
      homeScore: this.currentScore.homeScore,
      awayScore: this.currentScore.awayScore,
    };
    this.localBroadcast.emitScoreUpdate(scoreData);
    this.socketService.emit('score-update', scoreData);
  }
}
