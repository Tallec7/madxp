import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Video } from '../interfaces/video.interface';
import { Configuration } from '../interfaces/configuration.interface';
import { environment } from '../../environments/environment';

/**
 * Interface pour une impression sponsor (alignée avec le schéma DB backend)
 */
export interface SponsorImpression {
  site_id?: string;
  video_id?: string;
  video_filename: string;
  played_at: string;
  duration_played: number;
  video_duration: number;
  completed: boolean;
  event_type: string; // 'match' | 'training' | 'tournament' | 'other'
  period: string; // 'pre_match' | 'halftime' | 'post_match' | 'loop'
  trigger_type: 'auto' | 'manual';
  audience_estimate?: number;
}

/**
 * Service spécialisé pour tracker les impressions sponsors
 * Envoie les données vers /api/analytics/impressions pour alimenter le dashboard sponsors
 */
@Injectable({ providedIn: 'root' })
export class SponsorAnalyticsService {
  private readonly http = inject(HttpClient);

  private buffer: SponsorImpression[] = [];
  private currentImpression: Partial<SponsorImpression> | null = null;
  private currentVideoStart: Date | null = null;
  private isSending = false;

  // Configuration courante (site_id, event_type, period, etc.)
  private configuration: Configuration | null = null;
  private siteId: string | null = null;
  private currentEventType: string = 'other';
  private currentPeriod: string = 'loop';
  private audienceEstimate: number | null = null;

  private readonly STORAGE_KEY = 'neopro_sponsor_impressions';
  private readonly FLUSH_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_BUFFER_SIZE = 50;

  // URL de l'API du serveur central (via sync-agent)
  private readonly SYNC_AGENT_URL = environment.socketUrl + '/api/sync/sponsor-impressions';

  constructor() {
    // Charger le buffer depuis le localStorage au démarrage
    this.loadFromStorage();

    // Configurer le flush périodique
    setInterval(() => this.flushBuffer(), this.FLUSH_INTERVAL);

    // Sauvegarder avant fermeture
    window.addEventListener('beforeunload', () => this.saveToStorage());
  }

  /**
   * Définir la configuration du site
   * Extrait automatiquement les informations pertinentes pour le tracking
   */
  public setConfiguration(config: Configuration): void {
    this.configuration = config;

    // Extract site name for logging (site_id is set separately via setSiteId)
    const siteName = config.sync?.siteName || config.sync?.clubName;
    if (siteName) {
      console.log('[SponsorAnalytics] Configuration set for site:', siteName);
    } else {
      console.log('[SponsorAnalytics] Configuration set');
    }
  }

  /**
   * Définir le site ID (club ID)
   */
  public setSiteId(siteId: string): void {
    this.siteId = siteId;
    console.log('[SponsorAnalytics] Site ID set:', siteId);
  }

  /**
   * Définir le type d'événement en cours
   */
  public setEventType(eventType: 'match' | 'training' | 'tournament' | 'other'): void {
    this.currentEventType = eventType;
    console.log('[SponsorAnalytics] Event type set:', eventType);
  }

  /**
   * Définir la période en cours
   */
  public setPeriod(period: 'pre_match' | 'halftime' | 'post_match' | 'loop'): void {
    this.currentPeriod = period;
    console.log('[SponsorAnalytics] Period set:', period);
  }

  /**
   * Définir l'estimation de l'audience
   */
  public setAudienceEstimate(estimate: number): void {
    this.audienceEstimate = estimate;
    console.log('[SponsorAnalytics] Audience estimate set:', estimate);
  }

  /**
   * Tracker le début d'une vidéo sponsor
   */
  public trackSponsorStart(
    video: Video,
    triggerType: 'auto' | 'manual' = 'auto',
    videoDuration?: number
  ): void {
    // Terminer l'impression précédente si elle existe
    if (this.currentImpression && this.currentVideoStart) {
      this.trackSponsorEnd(false);
    }

    this.currentVideoStart = new Date();
    this.currentImpression = {
      site_id: this.siteId || undefined,
      video_id: video.id || undefined,
      video_filename: this.getFilename(video.path),
      played_at: this.currentVideoStart.toISOString(),
      video_duration: videoDuration || 0,
      event_type: this.currentEventType,
      period: this.currentPeriod,
      trigger_type: triggerType,
      audience_estimate: this.audienceEstimate || undefined,
    };

    console.log('[SponsorAnalytics] Sponsor video started:', {
      filename: this.currentImpression.video_filename,
      eventType: this.currentEventType,
      period: this.currentPeriod,
      triggerType,
    });
  }

  /**
   * Tracker la fin d'une vidéo sponsor
   */
  public trackSponsorEnd(completed = true): void {
    if (!this.currentImpression || !this.currentVideoStart) {
      return;
    }

    const now = new Date();
    const durationPlayed = Math.round((now.getTime() - this.currentVideoStart.getTime()) / 1000);

    const impression: SponsorImpression = {
      ...this.currentImpression,
      duration_played: durationPlayed,
      completed,
    } as SponsorImpression;

    this.buffer.push(impression);

    console.log('[SponsorAnalytics] Sponsor video ended:', {
      filename: impression.video_filename,
      duration: durationPlayed,
      completed,
      bufferSize: this.buffer.length,
    });

    // Reset
    this.currentImpression = null;
    this.currentVideoStart = null;

    // Sauvegarder dans localStorage
    this.saveToStorage();

    // Flush si le buffer est plein
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      this.flushBuffer();
    }
  }

  /**
   * Mettre à jour l'impression en cours (ex: changement de période)
   */
  public updateCurrentImpression(updates: Partial<SponsorImpression>): void {
    if (this.currentImpression) {
      this.currentImpression = { ...this.currentImpression, ...updates };
      console.log('[SponsorAnalytics] Current impression updated:', updates);
    }
  }

  /**
   * Récupérer le buffer pour inspection
   */
  public getBuffer(): SponsorImpression[] {
    return [...this.buffer];
  }

  /**
   * Forcer le flush du buffer
   */
  public forceFlush(): void {
    this.flushBuffer();
  }

  /**
   * Récupérer les stats du buffer
   */
  public getBufferStats(): { count: number; oldestImpression: string | null } {
    return {
      count: this.buffer.length,
      oldestImpression: this.buffer.length > 0 ? this.buffer[0].played_at : null,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getFilename(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  private flushBuffer(): void {
    if (this.buffer.length === 0 || this.isSending) {
      return;
    }

    console.log('[SponsorAnalytics] Flushing buffer:', this.buffer.length, 'impressions');
    this.sendToSyncAgent();
  }

  private sendToSyncAgent(): void {
    if (this.buffer.length === 0 || this.isSending) {
      return;
    }

    this.isSending = true;
    const impressionsToSend = [...this.buffer];

    this.http
      .post<{ success: boolean; received: number; queued: number }>(
        this.SYNC_AGENT_URL,
        { impressions: impressionsToSend }
      )
      .subscribe({
        next: (response) => {
          console.log(
            '[SponsorAnalytics] Sent to sync-agent:',
            response.received,
            'impressions queued:',
            response.queued
          );
          // Vider le buffer local après envoi réussi
          this.buffer = [];
          this.saveToStorage();
          this.isSending = false;
        },
        error: (error) => {
          console.error('[SponsorAnalytics] Failed to send to sync-agent:', error.message || error);
          // Garder les impressions dans le buffer pour réessayer plus tard
          this.isSending = false;
        },
      });
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.buffer));
    } catch (e) {
      console.error('[SponsorAnalytics] Failed to save to storage:', e);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.buffer = JSON.parse(stored);
        console.log('[SponsorAnalytics] Loaded', this.buffer.length, 'impressions from storage');
      }
    } catch (e) {
      console.error('[SponsorAnalytics] Failed to load from storage:', e);
      this.buffer = [];
    }
  }
}
