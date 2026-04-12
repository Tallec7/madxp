/**
 * RemoteScoreService — Score state management and broadcasting for Pi remote.
 * Extracted from RemoteComponent (mirrors ADR-043 pattern from cloud-remote).
 * Transport: LocalBroadcastService (BroadcastChannel) + SocketService (Socket.IO).
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

  incrementHomeScore(): void {
    this.currentScore.homeScore++;
    this.broadcast();
  }

  decrementHomeScore(): void {
    if (this.currentScore.homeScore > 0) {
      this.currentScore.homeScore--;
      this.broadcast();
    }
  }

  incrementAwayScore(): void {
    this.currentScore.awayScore++;
    this.broadcast();
  }

  decrementAwayScore(): void {
    if (this.currentScore.awayScore > 0) {
      this.currentScore.awayScore--;
      this.broadcast();
    }
  }

  /** Extrait les noms d'équipes depuis le nom du match (format "Équipe A vs Équipe B") */
  updateTeamNamesFromMatch(matchName: string): void {
    if (matchName && matchName.toLowerCase().includes('vs')) {
      const teams = matchName.split(/vs/i).map(t => t.trim());
      this.currentScore.homeTeam = teams[0] || 'DOMICILE';
      this.currentScore.awayTeam = teams[1] || 'EXTÉRIEUR';
      this.broadcast();
    }
  }

  resetScore(): void {
    this.currentScore.homeScore = 0;
    this.currentScore.awayScore = 0;
    this.broadcast();
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
  }

  setAwayTeamName(name: string): void {
    this.currentScore.awayTeam = name;
    this.broadcast();
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
