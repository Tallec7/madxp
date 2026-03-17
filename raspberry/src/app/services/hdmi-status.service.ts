import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, interval, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/**
 * État HDMI-CEC de la TV
 */
export interface HdmiCecStatus {
  tv_power: 'on' | 'standby' | 'transitioning' | 'unknown' | null;
  tv_connected: boolean;
  devices_found: number;
  cec_available: boolean;
  last_check_at: string | null;
  error: string | null;
}

/**
 * Service pour surveiller l'état HDMI-CEC de la TV
 *
 * Permet de savoir si la TV est allumée, en veille, ou déconnectée.
 * Utilisé par AnalyticsService pour ne tracker les vidéos que si la TV est allumée.
 */
@Injectable({ providedIn: 'root' })
export class HdmiStatusService {
  private readonly http = inject(HttpClient);

  // État courant de la TV
  private statusSubject = new BehaviorSubject<HdmiCecStatus | null>(null);
  public status$ = this.statusSubject.asObservable();

  // Intervalle de vérification (30 secondes)
  private readonly CHECK_INTERVAL = 30 * 1000;

  // Cache de l'état pour éviter des requêtes trop fréquentes
  private lastCheck: number = 0;
  private readonly CACHE_DURATION = 10 * 1000; // 10 secondes

  constructor() {
    // Démarrer le polling de l'état HDMI
    this.startPolling();
  }

  /**
   * Récupérer l'URL de l'API dynamiquement
   */
  private getApiUrl(): string {
    if (environment.socketUrl) {
      return environment.socketUrl + '/api/hdmi-status';
    }
    const hostname = window.location.hostname || 'localhost';
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${hostname}:3000/api/hdmi-status`;
  }

  /**
   * Démarrer le polling de l'état HDMI
   */
  private startPolling(): void {
    // Check initial
    this.checkStatus().subscribe();

    // Polling périodique
    interval(this.CHECK_INTERVAL).pipe(
      switchMap(() => this.checkStatus())
    ).subscribe();
  }

  /**
   * Vérifier l'état HDMI actuel
   */
  public checkStatus(): Observable<HdmiCecStatus | null> {
    return this.http.get<HdmiCecStatus>(this.getApiUrl()).pipe(
      tap(status => {
        this.statusSubject.next(status);
        this.lastCheck = Date.now();
        console.log('[HDMI] Status updated:', status.tv_power, status.tv_connected ? '(connected)' : '(disconnected)');
      }),
      catchError(error => {
        console.warn('[HDMI] Failed to get status:', error.message || error);
        // En cas d'erreur, on assume que CEC n'est pas disponible
        const fallbackStatus: HdmiCecStatus = {
          tv_power: null,
          tv_connected: false,
          devices_found: 0,
          cec_available: false,
          last_check_at: new Date().toISOString(),
          error: error.message || 'Failed to get HDMI status',
        };
        this.statusSubject.next(fallbackStatus);
        return of(fallbackStatus);
      })
    );
  }

  /**
   * Récupérer l'état actuel (synchrone, depuis le cache)
   */
  public getCurrentStatus(): HdmiCecStatus | null {
    return this.statusSubject.value;
  }

  /**
   * Vérifier si la TV est allumée
   *
   * Retourne true si :
   * - tv_power === 'on'
   * - OU CEC n'est pas disponible (on ne peut pas vérifier)
   *
   * Retourne false si :
   * - tv_power === 'standby' (TV en veille)
   * - tv_power === null et tv_connected === false (TV déconnectée)
   */
  public isTvOn(): boolean {
    const status = this.statusSubject.value;

    // Si pas de statut encore, on assume que c'est OK (premier chargement)
    if (!status) {
      return true;
    }

    // Si CEC n'est pas disponible, on ne peut pas vérifier - on assume OK
    if (!status.cec_available) {
      return true;
    }

    // Si la TV est en veille, elle n'est pas allumée
    if (status.tv_power === 'standby') {
      return false;
    }

    // Si la TV n'est pas connectée et on a CEC, elle est éteinte/débranchée
    if (!status.tv_connected && status.cec_available) {
      return false;
    }

    // TV allumée ou en transition
    return status.tv_power === 'on' || status.tv_power === 'transitioning';
  }

  /**
   * Récupérer l'état de la TV pour inclusion dans les analytics
   */
  public getTvStatusForAnalytics(): 'on' | 'standby' | 'disconnected' | 'unknown' {
    const status = this.statusSubject.value;

    if (!status || !status.cec_available) {
      return 'unknown';
    }

    if (status.tv_power === 'on') {
      return 'on';
    }

    if (status.tv_power === 'standby') {
      return 'standby';
    }

    // tv_power === null signifie que CEC n'a pas pu interroger la TV
    // (ex: CEC adapter présent mais HDMI DRM disconnected, erreur ioctl)
    // → on ne sait pas → 'unknown' plutôt que 'disconnected'
    // Seul tv_power explicitement absent + tv_connected === false = disconnected
    if (!status.tv_connected && status.tv_power !== null) {
      return 'disconnected';
    }

    return 'unknown';
  }
}
