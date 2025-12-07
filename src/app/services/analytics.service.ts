import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Video } from '../interfaces/video.interface';
import { environment } from '../../environments/environment';

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
}

/**
 * Service d'analytics pour tracker les lectures vidéo
 * Les données sont bufferisées localement et envoyées périodiquement au serveur local (sync-agent)
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private buffer: VideoPlayEvent[] = [];
  private currentSession: string | null = null;
  private currentVideoStart: Date | null = null;
  private currentVideo: Video | null = null;
  private currentTriggerType: 'auto' | 'manual' = 'auto';
  private isSending = false;

  private readonly STORAGE_KEY = 'neopro_analytics_buffer';
  private readonly FLUSH_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_BUFFER_SIZE = 100;

  // URL de l'API analytics sur le serveur local (même serveur que Socket.IO)
  private readonly ANALYTICS_API_URL = environment.socketUrl + '/api/analytics';

  constructor(private http: HttpClient) {
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
   * Tracker le début d'une lecture vidéo
   */
  public trackVideoStart(video: Video, triggerType: 'auto' | 'manual' = 'auto'): void {
    // Si une vidéo était en cours, la terminer comme incomplète
    if (this.currentVideo && this.currentVideoStart) {
      this.trackVideoEnd(false);
    }

    this.currentVideo = video;
    this.currentVideoStart = new Date();
    this.currentTriggerType = triggerType;

    console.log('[Analytics] Video started:', {
      filename: this.getFilename(video.path),
      triggerType,
      session: this.currentSession,
    });
  }

  /**
   * Tracker la fin d'une lecture vidéo
   */
  public trackVideoEnd(completed = true): void {
    if (!this.currentVideo || !this.currentVideoStart) {
      return;
    }

    const now = new Date();
    const durationPlayed = Math.round((now.getTime() - this.currentVideoStart.getTime()) / 1000);

    const event: VideoPlayEvent = {
      video_filename: this.getFilename(this.currentVideo.path),
      category: this.detectCategory(this.currentVideo),
      played_at: this.currentVideoStart.toISOString(),
      duration_played: durationPlayed,
      video_duration: durationPlayed,
      completed,
      trigger_type: this.currentTriggerType,
      session_id: this.currentSession || undefined,
    };

    this.buffer.push(event);

    console.log('[Analytics] Video ended:', {
      filename: event.video_filename,
      duration: durationPlayed,
      completed,
      bufferSize: this.buffer.length,
    });

    // Reset
    this.currentVideo = null;
    this.currentVideoStart = null;

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
      this.trackVideoEnd(false);
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

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getFilename(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  private detectCategory(video: Video): string {
    const filename = this.getFilename(video.path).toLowerCase();
    const path = video.path.toLowerCase();

    // Détecter la catégorie basée sur le chemin ou le nom
    if (path.includes('sponsor') || path.includes('partenaire')) {
      return 'sponsor';
    }
    if (path.includes('jingle') || filename.includes('but') || filename.includes('goal') || filename.includes('timeout')) {
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

  private sendToServer(): void {
    if (this.buffer.length === 0 || this.isSending) {
      return;
    }

    this.isSending = true;
    const eventsToSend = [...this.buffer];

    this.http.post<{ success: boolean; received: number; total: number }>(
      this.ANALYTICS_API_URL,
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
