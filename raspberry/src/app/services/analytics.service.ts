import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Video } from '../interfaces/video.interface';
import { Configuration } from '../interfaces/configuration.interface';
import { environment } from '../../environments/environment';
import { HdmiStatusService } from './hdmi-status.service';
import { RecordingStateService } from './recording-state.service';

/**
 * Interface pour un événement de lecture vidéo
 */
export interface VideoPlayEvent {
  video_filename: string;
  category: string;
  played_at: string;
  duration_played: number;
  video_duration: number;
  completed: boolean;
  trigger_type: 'auto' | 'manual';
  session_id?: string;
  /** UUID de la vidéo sur le central server (pour jointure avec la table videos) */
  video_id?: string;
  /** UUID du sponsor associé (si applicable) */
  sponsor_id?: string;
  /**
   * État de la TV au moment de la lecture
   * - 'on' : TV allumée, vidéo visible
   * - 'standby' : TV en veille, vidéo NON visible (à exclure des stats)
   * - 'disconnected' : TV débranchée ou éteinte, vidéo NON visible (à exclure des stats)
   * - 'unknown' : CEC non disponible, on ne peut pas savoir
   */
  tv_status?: 'on' | 'standby' | 'disconnected' | 'unknown';
  /** Type d'événement sportif en cours */
  event_type?: 'match' | 'training' | 'tournament' | 'other';
  /** Période du match en cours */
  period?: 'pre_match' | 'halftime' | 'post_match' | 'loop';
  /** Estimation du nombre de spectateurs */
  audience_estimate?: number;
  /** Position de la vidéo dans la boucle de rotation */
  position_in_loop?: number;
  /** UUID du site_sponsor pour jointure directe */
  site_sponsor_id?: string;
  /**
   * E-23 US-23.7.4: Source de la lecture
   * - 'kiosk' : Raspberry Pi (Chromium kiosk)
   * - 'pc' : Navigateur PC (PWA ou navigateur classique)
   */
  source?: 'kiosk' | 'pc';
  /**
   * Raison de l'interruption (si completed === false)
   * - 'manual_action' : action manuelle (télécommande / dashboard)
   * - 'profile_switch' : changement de profil
   * - 'video_error' : erreur de lecture
   * - 'hdmi_lost' : perte de signal HDMI
   * - 'loop_advance' : avancement normal dans la boucle
   * - 'browser_close' : fermeture du navigateur
   */
  interruption_reason?: 'manual_action' | 'profile_switch' | 'video_error' | 'hdmi_lost' | 'loop_advance' | 'browser_close';
}

/**
 * Service d'analytics pour tracker les lectures vidéo
 * Les données sont bufferisées localement et envoyées périodiquement au serveur local (sync-agent)
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly hdmiStatus = inject(HdmiStatusService);
  private readonly recordingState = inject(RecordingStateService);

  private buffer: VideoPlayEvent[] = [];
  private currentSession: string | null = null;
  private currentVideoStart: Date | null = null;
  private currentVideo: Video | null = null;
  private currentTriggerType: 'auto' | 'manual' = 'auto';
  private currentTvStatus: 'on' | 'standby' | 'disconnected' | 'unknown' = 'unknown';
  private currentVideoDuration: number | null = null;
  private isSending = false;

  // Contexte sponsor (unifié depuis SponsorAnalyticsService)
  private currentEventType: 'match' | 'training' | 'tournament' | 'other' = 'other';
  private currentPeriod: 'pre_match' | 'halftime' | 'post_match' | 'loop' = 'loop';
  private audienceEstimate: number | null = null;
  private siteId: string | null = null;

  // Configuration courante avec le mapping des catégories
  private configuration: Configuration | null = null;

  private readonly STORAGE_KEY = 'neopro_analytics_buffer';
  private readonly FLUSH_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_BUFFER_SIZE = 100;

  // E-23 US-23.7.4: Detect kiosk (Pi) vs PC browser at startup
  private readonly playbackSource: 'kiosk' | 'pc' = AnalyticsService.detectSource();

  /**
   * Détermine l'URL de l'API analytics dynamiquement.
   * Utilise la même logique que socket.service.ts pour fonctionner depuis :
   * - Le Pi lui-même (localhost ou neopro.local)
   * - Un téléphone sur le hotspot (neopro.local ou 192.168.4.1)
   */
  private getApiUrl(): string {
    if (environment.socketUrl) {
      return environment.socketUrl + '/api/analytics';
    }
    // Construire dynamiquement depuis l'origine actuelle
    const hostname = window.location.hostname || 'localhost';
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${hostname}:3000/api/analytics`;
  }

  constructor() {
    // Charger le buffer depuis le localStorage au démarrage
    this.loadFromStorage();

    // Configurer le flush périodique
    setInterval(() => this.flushBuffer(), this.FLUSH_INTERVAL);

    // Sauvegarder avant fermeture
    window.addEventListener('beforeunload', () => this.saveToStorage());
  }

  /**
   * Démarrer une nouvelle session
   */
  public startSession(): void {
    this.currentSession = this.generateSessionId();
    console.log('[Analytics] Session started:', this.currentSession);
  }

  /**
   * Terminer la session courante
   */
  public endSession(): void {
    if (this.currentSession) {
      console.log('[Analytics] Session ended:', this.currentSession);
      this.currentSession = null;
    }
  }

  /**
   * Définir la configuration pour utiliser le mapping des catégories analytics
   */
  public setConfiguration(config: Configuration): void {
    this.configuration = config;
    console.log('[Analytics] Configuration set with categoryMappings:', config.categoryMappings);
  }

  /**
   * Définir le site ID (club ID) pour les impressions sponsors
   */
  public setSiteId(id: string): void {
    this.siteId = id;
    console.log('[Analytics] Site ID set:', id);
  }

  /**
   * Définir le type d'événement en cours (match, entraînement, etc.)
   */
  public setEventType(eventType: 'match' | 'training' | 'tournament' | 'other'): void {
    this.currentEventType = eventType;
    console.log('[Analytics] Event type set:', eventType);
  }

  /**
   * Définir la période en cours (pré-match, mi-temps, etc.)
   */
  public setPeriod(period: 'pre_match' | 'halftime' | 'post_match' | 'loop'): void {
    this.currentPeriod = period;
    console.log('[Analytics] Period set:', period);
  }

  /**
   * Définir l'estimation de l'audience
   */
  public setAudienceEstimate(estimate: number): void {
    this.audienceEstimate = estimate;
    console.log('[Analytics] Audience estimate set:', estimate);
  }

  /**
   * Capturer la durée réelle de la vidéo (depuis HTMLVideoElement.duration)
   * Doit être appelé quand loadedmetadata est disponible.
   */
  public setCurrentVideoDuration(seconds: number): void {
    if (seconds > 0 && isFinite(seconds)) {
      this.currentVideoDuration = Math.round(seconds);
    }
  }

  /**
   * Tracker le début d'une lecture vidéo
   * Capture également l'état de la TV via HDMI-CEC
   */
  public trackVideoStart(video: Video, triggerType: 'auto' | 'manual' = 'auto'): void {
    // Ne pas tracker si l'enregistrement est désactivé
    if (!this.recordingState.isRecording) {
      return;
    }

    // Si une vidéo était en cours, la terminer comme incomplète
    if (this.currentVideo && this.currentVideoStart) {
      this.trackVideoEnd(false, triggerType === 'manual' ? 'manual_action' : 'loop_advance');
    }

    this.currentVideo = video;
    this.currentVideoStart = new Date();
    this.currentTriggerType = triggerType;

    // Capturer l'état de la TV au moment du démarrage
    this.currentTvStatus = this.hdmiStatus.getTvStatusForAnalytics();

    console.log('[Analytics] Video started:', {
      filename: this.getFilename(video.path),
      triggerType,
      tvStatus: this.currentTvStatus,
      session: this.currentSession,
    });
  }

  /**
   * Tracker la fin d'une lecture vidéo
   * @param completed - true si la vidéo a été jouée en entier
   * @param interruptionReason - raison de l'interruption si completed=false
   */
  public trackVideoEnd(completed = true, interruptionReason?: VideoPlayEvent['interruption_reason']): void {
    if (!this.currentVideo || !this.currentVideoStart) {
      return;
    }

    // Ne pas tracker si l'enregistrement est désactivé (mais reset l'état interne)
    if (!this.recordingState.isRecording) {
      this.currentVideo = null;
      this.currentVideoStart = null;
      this.currentTvStatus = 'unknown';
      this.currentVideoDuration = null;
      return;
    }

    const now = new Date();
    const durationPlayed = Math.round((now.getTime() - this.currentVideoStart.getTime()) / 1000);

    const event: VideoPlayEvent = {
      video_filename: this.getFilename(this.currentVideo.path),
      category: this.detectCategory(this.currentVideo),
      played_at: this.currentVideoStart.toISOString(),
      duration_played: durationPlayed,
      video_duration: this.currentVideoDuration || durationPlayed,
      completed,
      trigger_type: this.currentTriggerType,
      session_id: this.currentSession || undefined,
      // Métadonnées pour le tracking (depuis la configuration déployée)
      video_id: this.currentVideo.video_id,
      sponsor_id: this.currentVideo.sponsor_id,
      // État de la TV au moment de la lecture
      tv_status: this.currentTvStatus,
      // Contexte sponsor (unifié)
      event_type: this.currentEventType,
      period: this.currentPeriod,
      audience_estimate: this.audienceEstimate || undefined,
      site_sponsor_id: (this.currentVideo as unknown as { site_sponsor_id?: string }).site_sponsor_id,
      // E-23 US-23.7.4: kiosk (Pi) vs pc (browser)
      source: this.playbackSource,
      // PoC Proof of Play: raison d'interruption
      interruption_reason: completed ? undefined : (interruptionReason || 'loop_advance'),
    };

    // NE PAS tracker si la TV est éteinte ou en veille (sauf si CEC non disponible)
    // Cela évite de gonfler les stats avec des vidéos non visibles
    if (this.currentTvStatus === 'standby' || this.currentTvStatus === 'disconnected') {
      console.log('[Analytics] Skipping event - TV not on:', {
        filename: event.video_filename,
        tvStatus: this.currentTvStatus,
      });
      // Reset
      this.currentVideo = null;
      this.currentVideoStart = null;
      this.currentTvStatus = 'unknown';
      this.currentVideoDuration = null;
      return;
    }

    this.buffer.push(event);

    // Persistance immédiate dans localStorage (survit aux redémarrages)
    this.saveToStorage();

    // Envoi immédiat au serveur local (persiste sur disque dans analytics_buffer.json)
    this.sendSingleEvent(event);

    console.log('[Analytics] Video ended:', {
      filename: event.video_filename,
      category: event.category,
      video_id: event.video_id,
      sponsor_id: event.sponsor_id,
      duration: durationPlayed,
      completed,
      tvStatus: event.tv_status,
      bufferSize: this.buffer.length,
    });

    // Reset
    this.currentVideo = null;
    this.currentVideoStart = null;
    this.currentTvStatus = 'unknown';
    this.currentVideoDuration = null;

    // Flush si le buffer est plein
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      this.flushBuffer();
    }
  }

  /**
   * Tracker une erreur de lecture
   */
  public trackVideoError(video: Video, error: unknown): void {
    console.error('[Analytics] Video error:', {
      filename: this.getFilename(video.path),
      error,
    });

    // Terminer la vidéo comme incomplète
    if (this.currentVideo && this.currentVideo.path === video.path) {
      this.trackVideoEnd(false, 'video_error');
    }
  }

  /**
   * Tracker un déclenchement manuel depuis la télécommande
   */
  public trackManualTrigger(video: Video): void {
    // Le tracking réel se fait via trackVideoStart avec triggerType='manual'
    // Cette méthode est appelée depuis la télécommande pour marquer le type
    console.log('[Analytics] Manual trigger:', this.getFilename(video.path));
  }

  /**
   * Récupérer le buffer pour envoi au serveur
   */
  public getBuffer(): VideoPlayEvent[] {
    return [...this.buffer];
  }

  /**
   * Vider le buffer après envoi réussi
   */
  public clearBuffer(): void {
    this.buffer = [];
    this.saveToStorage();
    console.log('[Analytics] Buffer cleared');
  }

  /**
   * Récupérer les stats du buffer
   */
  public getBufferStats(): { count: number; oldestEvent: string | null } {
    return {
      count: this.buffer.length,
      oldestEvent: this.buffer.length > 0 ? this.buffer[0].played_at : null,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * E-23 US-23.7.4: Detect if running on Raspberry Pi kiosk or PC browser.
   * Pi user-agents contain 'armv7l', 'aarch64', or 'Raspbian'.
   */
  private static detectSource(): 'kiosk' | 'pc' {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('armv7l') || ua.includes('aarch64') || ua.includes('raspbian') || ua.includes('raspberry')) {
      return 'kiosk';
    }
    return 'pc';
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getFilename(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  private detectCategory(video: Video): string {
    // 1. Priorité : analytics_category définie lors du déploiement
    if (video.analytics_category) {
      console.log('[Analytics] Using deployed analytics_category:', video.analytics_category);
      return video.analytics_category;
    }

    // 2. Utiliser le mapping de la configuration si disponible
    if (video.categoryId && this.configuration?.categoryMappings) {
      const mappedCategory = this.configuration.categoryMappings[video.categoryId];
      if (mappedCategory) {
        console.log('[Analytics] Using mapped category for', video.categoryId, '->', mappedCategory);
        return mappedCategory;
      }
    }

    // 3. Fallback: détection par path/filename
    const filename = this.getFilename(video.path).toLowerCase();
    const path = video.path.toLowerCase();

    // Détecter la catégorie basée sur le chemin ou le nom
    if (path.includes('sponsor') || path.includes('partenaire')) {
      return 'sponsor';
    }
    if (path.includes('jingle') || path.includes('but') || filename.includes('but') || filename.includes('goal') || filename.includes('timeout')) {
      return 'jingle';
    }
    if (path.includes('ambiance') || path.includes('intro') || path.includes('outro')) {
      return 'ambiance';
    }

    return 'other';
  }

  private flushBuffer(): void {
    if (this.buffer.length === 0 || this.isSending) {
      return;
    }

    // Sauvegarder d'abord dans localStorage (backup)
    this.saveToStorage();

    // Envoyer au serveur local pour que le sync-agent puisse les récupérer
    this.sendToServer();
  }

  /**
   * Envoyer un seul événement immédiatement au serveur local.
   * Retry après 30s en cas d'échec (serveur local pas encore prêt au boot).
   */
  private sendSingleEvent(event: VideoPlayEvent, isRetry = false): void {
    this.http.post<{ success: boolean; received: number; total: number }>(
      this.getApiUrl(),
      { events: [event] }
    ).subscribe({
      next: () => {
        // Événement persisté sur disque via server.js → analytics_buffer.json
      },
      error: () => {
        if (!isRetry) {
          // Retry une fois après 30s (le serveur local peut ne pas être prêt)
          setTimeout(() => this.sendSingleEvent(event, true), 30_000);
        }
        // Si le retry échoue aussi, l'événement reste dans localStorage
        // et sera envoyé par le flush périodique (toutes les 5 min)
      }
    });
  }

  private sendToServer(): void {
    if (this.buffer.length === 0 || this.isSending) {
      return;
    }

    this.isSending = true;
    const eventsToSend = [...this.buffer];

    this.http.post<{ success: boolean; received: number; total: number }>(
      this.getApiUrl(),
      { events: eventsToSend }
    ).subscribe({
      next: (response) => {
        console.log('[Analytics] Sent to server:', response.received, 'events, total buffer:', response.total);
        // Vider le buffer local après envoi réussi
        this.buffer = [];
        this.saveToStorage();
        this.isSending = false;
      },
      error: (error) => {
        console.error('[Analytics] Failed to send to server:', error.message || error);
        // Garder les événements dans le buffer pour réessayer plus tard
        this.isSending = false;
      }
    });
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.buffer));
    } catch (e) {
      console.error('[Analytics] Failed to save to storage:', e);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.buffer = JSON.parse(stored);
        console.log('[Analytics] Loaded', this.buffer.length, 'events from storage');
      }
    } catch (e) {
      console.error('[Analytics] Failed to load from storage:', e);
      this.buffer = [];
    }
  }
}
