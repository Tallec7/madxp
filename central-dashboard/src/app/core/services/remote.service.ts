/**
 * Remote Cloud Service
 *
 * Service Angular pour contrôler un site Neopro à distance via le cloud.
 * Permet d'utiliser la télécommande depuis n'importe quel réseau.
 *
 * Date: 2026-01-18
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RemoteState {
  siteId: string;
  siteName: string;
  clubName: string;
  status: string;
  isConnected: boolean;
  connectionHealth: {
    inMap: boolean;
    socketConnected: boolean;
    lastPongAgeMs: number | null;
    isHealthy: boolean;
    reason: string;
  };
  lastSeenAt: string;
  config: {
    sponsors: Array<{ name: string; path: string }>;
    categories: Array<{
      id: string;
      name: string;
      videos?: Array<{ name: string; path: string }>;
      subCategories?: Array<{
        id: string;
        name: string;
        videos?: Array<{ name: string; path: string }>;
      }>;
    }>;
    timeCategories: Array<{
      id: string;
      name: string;
      icon?: string;
      color?: string;
      description?: string;
      categoryIds?: string[];
      loopVideos?: Array<{ name: string; path: string }>;
    }>;
    liveScoreEnabled: boolean;
    scoreOverlay: unknown;
    watermark: unknown;
  };
  localVideos: Array<{
    filename: string;
    path: string;
    category: string;
    subcategory: string | null;
    size: number;
    duration: number | null;
  }>;
}

export interface RemoteVideos {
  categories: Array<{
    id: string;
    name: string;
    videos?: Array<{ name: string; path: string }>;
    subCategories?: Array<{
      id: string;
      name: string;
      videos?: Array<{ name: string; path: string }>;
    }>;
  }>;
  videosByCategory: Record<string, Array<{
    filename: string;
    path: string;
    category: string;
    subcategory: string | null;
    size: number;
    duration: number | null;
  }>>;
  totalVideos: number;
}

export interface CommandResult {
  success: boolean;
  message: string;
  commandType: string;
  timestamp: string;
}

export type RemoteCommandType =
  | 'score-update'
  | 'score-reset'
  | 'phase-change'
  | 'play-video'
  | 'play-sponsors'
  | 'timer-update'
  | 'breaking-news'
  | 'match-config';

export interface ScoreData {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period?: string;
  matchTime?: string;
}

export interface VideoData {
  name: string;
  path: string;
  categoryId?: string;
}

export interface TimerData {
  action: 'start' | 'pause' | 'reset' | 'sync';
  time?: number;
}

export interface BreakingNewsData {
  message: string;
  duration?: number;
  position?: 'top' | 'bottom';
}

export interface MatchConfigData {
  sessionId: string;
  matchDate: string;
  matchName: string;
  audienceEstimate: number;
}

@Injectable({
  providedIn: 'root'
})
export class RemoteService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /**
   * Récupère l'état actuel du site (connexion, config, vidéos)
   */
  getState(siteId: string): Observable<RemoteState> {
    return this.http.get<RemoteState>(`${this.apiUrl}/remote/${siteId}/state`);
  }

  /**
   * Liste les vidéos disponibles sur le site
   */
  getVideos(siteId: string): Observable<RemoteVideos> {
    return this.http.get<RemoteVideos>(`${this.apiUrl}/remote/${siteId}/videos`);
  }

  /**
   * Envoie une commande générique au site
   */
  sendCommand(siteId: string, type: RemoteCommandType, data?: unknown): Observable<CommandResult> {
    return this.http.post<CommandResult>(`${this.apiUrl}/remote/${siteId}/command`, { type, data });
  }

  // === Commandes typées pour une meilleure DX ===

  /**
   * Met à jour le score
   */
  updateScore(siteId: string, score: ScoreData): Observable<CommandResult> {
    return this.sendCommand(siteId, 'score-update', score);
  }

  /**
   * Remet le score à 0-0
   */
  resetScore(siteId: string): Observable<CommandResult> {
    return this.sendCommand(siteId, 'score-reset');
  }

  /**
   * Change la phase de boucle vidéo
   */
  changePhase(siteId: string, phase: 'neutral' | 'before' | 'during' | 'after'): Observable<CommandResult> {
    return this.sendCommand(siteId, 'phase-change', { phase });
  }

  /**
   * Lance une vidéo spécifique
   */
  playVideo(siteId: string, video: VideoData): Observable<CommandResult> {
    return this.sendCommand(siteId, 'play-video', { video });
  }

  /**
   * Lance la boucle de sponsors
   */
  playSponsors(siteId: string): Observable<CommandResult> {
    return this.sendCommand(siteId, 'play-sponsors');
  }

  /**
   * Contrôle le timer
   */
  updateTimer(siteId: string, timer: TimerData): Observable<CommandResult> {
    return this.sendCommand(siteId, 'timer-update', timer);
  }

  /**
   * Affiche une annonce (breaking news)
   */
  showBreakingNews(siteId: string, news: BreakingNewsData): Observable<CommandResult> {
    return this.sendCommand(siteId, 'breaking-news', news);
  }

  /**
   * Configure les infos du match
   */
  configureMatch(siteId: string, config: MatchConfigData): Observable<CommandResult> {
    return this.sendCommand(siteId, 'match-config', config);
  }
}
