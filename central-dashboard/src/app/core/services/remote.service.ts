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
  secondaryDisplayEnabled?: boolean;
  secondaryVariantPaths?: string[];
  // ADR-058 — Phase 1 : exposition des profils + profil authentifié
  profiles?: Array<{
    id: string;
    name: string;
    displayName: string | null;
    city: string | null;
    sport: string | null;
    isDefault: boolean;
    sortOrder: number;
    pinRequired: boolean;
  }>;
  activeProfileId?: string | null;
  authenticatedProfileId?: string | null;
  // ADR-078 — SaaS authoritative match state (late-join snapshot, null on Pi sites)
  matchState?: {
    seq: number;
    score: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number } | null;
    phase: string;
    timer: { currentTime: number; isRunning: boolean; halfDuration: number; countDown: boolean };
    options: Record<string, unknown> | null;
    serverTs: number;
  } | null;
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

export interface ScreenshotResult {
  success: boolean;
  commandType: string;
  image: string;
  timestamp: number;
  currentVideo?: string;
  phase?: string;
  isManualMode?: boolean;
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

// ADR-059 — commandes granulaires Pi autoritaire
export type MatchCommandType =
  | 'command/increment_home'
  | 'command/decrement_home'
  | 'command/increment_away'
  | 'command/decrement_away'
  | 'command/set_phase'
  | 'command/timer_start'
  | 'command/timer_pause'
  | 'command/timer_reset'
  | 'command/score_reset';

export interface MatchStateSync {
  seq: number;
  score: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number } | null;
  phase: string;
  timer: { currentTime: number; isRunning: boolean; halfDuration: number; countDown: boolean };
  options: Record<string, unknown> | null;
  serverTs: number;
}

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

export interface ProfilePinVerifyResult extends PinVerifyResult {
  tokenId: string;
}

@Injectable({
  providedIn: 'root'
})
export class RemoteService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Token PIN stocké par siteId (en mémoire + localStorage pour persister)
  private readonly TOKEN_STORAGE_PREFIX = 'neopro_remote_pin_';
  // ADR-058 — token PIN profil stocké par profileId (30j)
  private readonly PROFILE_TOKEN_STORAGE_PREFIX = 'neopro_remote_profile_pin_';
  // ADR-058 — device ID persistant (UUID v4) par navigateur
  private readonly DEVICE_ID_STORAGE_KEY = 'neopro_remote_device_id';

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
   * ADR-058 — récupère (ou crée) un deviceId persistant pour ce navigateur.
   * Utilisé pour scoper les device tokens profil et permettre la révocation
   * par device depuis le dashboard super_admin.
   */
  getOrCreateDeviceId(): string {
    let id = localStorage.getItem(this.DEVICE_ID_STORAGE_KEY);
    if (!id) {
      // Random UUID v4 (browser crypto API)
      const cryptoApi = (window as unknown as { crypto?: Crypto }).crypto;
      if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
        id = cryptoApi.randomUUID();
      } else {
        // Fallback : 16 bytes random hex
        id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      }
      localStorage.setItem(this.DEVICE_ID_STORAGE_KEY, id);
    }
    return id;
  }

  private profileTokenKey(siteId: string, profileId: string): string {
    return `${this.PROFILE_TOKEN_STORAGE_PREFIX}${siteId}_${profileId}`;
  }

  private getProfileToken(siteId: string, profileId: string): string | null {
    return localStorage.getItem(this.profileTokenKey(siteId, profileId));
  }

  private setProfileToken(siteId: string, profileId: string, token: string): void {
    localStorage.setItem(this.profileTokenKey(siteId, profileId), token);
  }

  clearProfileToken(siteId: string, profileId: string): void {
    localStorage.removeItem(this.profileTokenKey(siteId, profileId));
  }

  hasProfileToken(siteId: string, profileId: string): boolean {
    return !!this.getProfileToken(siteId, profileId);
  }

  /**
   * ADR-058 — profile context courant (par site) utilisé comme fallback pour
   * ajouter automatiquement le token profil aux requêtes lorsque les wrappers
   * de commande (playVideo, updateScore, ...) ne reçoivent pas de `profileId`
   * explicite. Le Cloud Remote le positionne après une vérification PIN réussie.
   */
  private readonly currentProfileBySite = new Map<string, string>();

  setCurrentProfileContext(siteId: string, profileId: string): void {
    this.currentProfileBySite.set(siteId, profileId);
  }

  clearCurrentProfileContext(siteId: string): void {
    this.currentProfileBySite.delete(siteId);
  }

  getCurrentProfileContext(siteId: string): string | null {
    return this.currentProfileBySite.get(siteId) || null;
  }

  /**
   * Retourne les headers HTTP avec le token PIN si disponible.
   * Priorité au token profil (ADR-058) si profileId fourni, sinon token site legacy.
   */
  private getHeaders(siteId: string, profileId?: string | null): { headers?: Record<string, string> } {
    const resolvedProfileId = profileId || this.getCurrentProfileContext(siteId);
    if (resolvedProfileId) {
      const pToken = this.getProfileToken(siteId, resolvedProfileId);
      if (pToken) return { headers: { 'X-Remote-Token': pToken } };
    }
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
   * ADR-058 — vérifie un PIN profil et stocke le device token (30j).
   */
  verifyProfilePin(
    siteId: string,
    profileId: string,
    pin: string,
    label?: string | null
  ): Observable<ProfilePinVerifyResult> {
    const deviceId = this.getOrCreateDeviceId();
    return this.http.post<ProfilePinVerifyResult>(
      `${this.apiUrl}/remote/${siteId}/profiles/${profileId}/verify-pin`,
      { pin, deviceId, label: label || null }
    ).pipe(
      tap((result) => {
        if (result.success && result.token) {
          this.setProfileToken(siteId, profileId, result.token);
        }
      })
    );
  }

  /**
   * Récupère l'état actuel du site (connexion, config, vidéos)
   * Inclut le header X-Remote-Token si disponible
   */
  getState(siteId: string, profileId?: string | null): Observable<RemoteState> {
    return this.http.get<RemoteState>(
      `${this.apiUrl}/remote/${siteId}/state`,
      this.getHeaders(siteId, profileId)
    );
  }

  /**
   * Liste les vidéos disponibles sur le site
   */
  getVideos(siteId: string, profileId?: string | null): Observable<RemoteVideos> {
    return this.http.get<RemoteVideos>(
      `${this.apiUrl}/remote/${siteId}/videos`,
      this.getHeaders(siteId, profileId)
    );
  }

  /**
   * Envoie une commande générique au site.
   * Si `profileId` est fourni, le token PIN profil (ADR-058) est préféré au token legacy.
   */
  sendCommand(
    siteId: string,
    type: RemoteCommandType,
    data?: unknown,
    profileId?: string | null
  ): Observable<CommandResult> {
    const options = this.getHeaders(siteId, profileId);
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
   * Demande un screenshot de l'écran TV du Pi.
   * Le serveur attend la réponse du Pi et retourne l'image dans la réponse HTTP.
   */
  requestScreenshot(siteId: string): Observable<ScreenshotResult> {
    const options = this.getHeaders(siteId);
    return this.http.post<ScreenshotResult>(
      `${this.apiUrl}/remote/${siteId}/command`,
      { type: 'screenshot', data: { quality: 0.5 } },
      options
    );
  }

  // =========================================================================
  // ADR-059 — Commandes granulaires (Pi autoritaire)
  // =========================================================================

  /**
   * Envoie une commande granulaire match (ADR-059).
   * Le Pi applique la mutation et répond via `state-sync`.
   */
  sendMatchCommand(
    siteId: string,
    command: MatchCommandType,
    data?: Record<string, unknown>,
    profileId?: string | null
  ): Observable<CommandResult> {
    return this.sendCommand(siteId, command as RemoteCommandType, data, profileId);
  }
}
