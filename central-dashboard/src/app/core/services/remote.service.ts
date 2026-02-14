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
import { Observable, tap } from 'rxjs';
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
  pinRequired?: boolean;
  config?: {
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
  localVideos?: Array<{
    filename: string;
    path: string;
    category: string;
    subcategory: string | null;
    size: number;
    duration: number | null;
  }>;
  licenseStatus?: {
    status: string;
    reason?: string;
    daysLeft?: number;
    daysExpired?: number;
    messageRemote?: string;
    subscriptionEnd?: string;
    subscriptionPlan?: string;
    canAutoUnblock?: boolean;
    needsConnection?: boolean;
    daysSinceCheck?: number;
  } | null;
  recordingState?: {
    isRecording: boolean;
    isManualOverride: boolean;
  } | null;
  playerState?: {
    currentVideo: string | null;
    currentCategory: string | null;
    progress: number;
    duration: number;
    currentTime: number;
    phase: string;
    isManualMode: boolean;
    isPlaying: boolean;
    loopIndex: number;
    loopTotal: number;
    nextVideo: string | null;
    lastError: string | null;
    lastTransitionAt: string | null;
    overlayActive: boolean;
    updatedAt: string;
  } | null;
  pendingConfigVersionId?: string | null;
  pendingCommandsCount?: number;
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
  | 'match-config'
  | 'recording-toggle'
  | 'screenshot';

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

export interface PinVerifyResult {
  success: boolean;
  token: string;
  expiresIn: number;
}

@Injectable({
  providedIn: 'root'
})
export class RemoteService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Token PIN stocké par siteId (en mémoire + localStorage pour persister)
  private readonly TOKEN_STORAGE_PREFIX = 'neopro_remote_pin_';

  /**
   * Récupère le token PIN stocké pour un site
   */
  private getToken(siteId: string): string | null {
    return localStorage.getItem(this.TOKEN_STORAGE_PREFIX + siteId);
  }

  /**
   * Stocke le token PIN pour un site
   */
  private setToken(siteId: string, token: string): void {
    localStorage.setItem(this.TOKEN_STORAGE_PREFIX + siteId, token);
  }

  /**
   * Supprime le token PIN pour un site
   */
  clearToken(siteId: string): void {
    localStorage.removeItem(this.TOKEN_STORAGE_PREFIX + siteId);
  }

  /**
   * Vérifie si un token PIN est stocké pour un site
   */
  hasToken(siteId: string): boolean {
    return !!this.getToken(siteId);
  }

  /**
   * Retourne les headers HTTP avec le token PIN si disponible
   */
  private getHeaders(siteId: string): { headers?: Record<string, string> } {
    const token = this.getToken(siteId);
    if (token) {
      return { headers: { 'X-Remote-Token': token } };
    }
    return {};
  }

  /**
   * Vérifie le PIN et stocke le token retourné
   */
  verifyPin(siteId: string, pin: string): Observable<PinVerifyResult> {
    return this.http.post<PinVerifyResult>(
      `${this.apiUrl}/remote/${siteId}/verify-pin`,
      { pin }
    ).pipe(
      tap((result) => {
        if (result.success && result.token) {
          this.setToken(siteId, result.token);
        }
      })
    );
  }

  /**
   * Récupère l'état actuel du site (connexion, config, vidéos)
   * Inclut le header X-Remote-Token si disponible
   */
  getState(siteId: string): Observable<RemoteState> {
    return this.http.get<RemoteState>(
      `${this.apiUrl}/remote/${siteId}/state`,
      this.getHeaders(siteId)
    );
  }

  /**
   * Liste les vidéos disponibles sur le site
   */
  getVideos(siteId: string): Observable<RemoteVideos> {
    return this.http.get<RemoteVideos>(
      `${this.apiUrl}/remote/${siteId}/videos`,
      this.getHeaders(siteId)
    );
  }

  /**
   * Envoie une commande générique au site
   */
  sendCommand(siteId: string, type: RemoteCommandType, data?: unknown): Observable<CommandResult> {
    const options = this.getHeaders(siteId);
    return this.http.post<CommandResult>(
      `${this.apiUrl}/remote/${siteId}/command`,
      { type, data },
      options
    );
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

  /**
   * Toggle l'enregistrement analytics sur le Pi
   */
  toggleRecording(siteId: string): Observable<CommandResult> {
    return this.sendCommand(siteId, 'recording-toggle');
  }

  /**
   * Demande un screenshot de l'écran TV du Pi
   */
  requestScreenshot(siteId: string): Observable<CommandResult> {
    return this.sendCommand(siteId, 'screenshot', { quality: 0.5 });
  }
}
