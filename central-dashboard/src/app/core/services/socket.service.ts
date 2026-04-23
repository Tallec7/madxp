import { Injectable, inject } from '@angular/core';
import { Observable, Subject, filter, map } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '@env/environment';
import { LoggerService } from './logger.service';

export interface SocketEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export interface ConnectionStatus {
  connected: boolean;
  reconnectAttempt: number;
  nextRetryMs: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private readonly logger = inject(LoggerService);

  private socket: Socket | null = null;
  private eventsSubject = new Subject<SocketEvent>();
  public events$ = this.eventsSubject.asObservable();

  private connected = false;
  private reconnectAttempt = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseDelay = 1000; // 1 seconde
  private readonly maxDelay = 30000; // 30 secondes

  // ADR-063: grace period avant de warn un 'transport close' (flip-flop Railway / proxy recycle).
  // Si reconnect réussit dans ce délai, le warn est annulé. Les métriques Prometheus serveur
  // (recordSocketDisconnect) restent inchangées — visibilité opérationnelle via alerting, pas logs.
  private readonly transientDisconnectGraceMs = 3000;
  private pendingDisconnectWarnTimer: ReturnType<typeof setTimeout> | null = null;

  // Status de connexion observable
  private connectionStatusSubject = new Subject<ConnectionStatus>();
  public connectionStatus$ = this.connectionStatusSubject.asObservable();

  connect(token: string): void {
    if (this.socket) {
      return;
    }

    this.socket = io(environment.socketUrl, {
      // En prod: polling d'abord puis upgrade vers websocket (évite les erreurs de connexion WebSocket)
      // En dev: websocket direct pour une meilleure expérience de développement
      transports: environment.production ? ['polling', 'websocket'] : ['websocket', 'polling'],
      upgrade: true,
      auth: { token },
      // Configuration du backoff exponentiel
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.baseDelay,
      reconnectionDelayMax: this.maxDelay,
      randomizationFactor: 0.5, // Ajoute de l'aléatoire pour éviter les "thundering herd"
    });

    this.socket.on('connect', () => {
      // ADR-063: un reconnect rapide annule le warn différé
      if (this.pendingDisconnectWarnTimer) {
        clearTimeout(this.pendingDisconnectWarnTimer);
        this.pendingDisconnectWarnTimer = null;
      }
      this.logger.info('Socket connected to central server');
      this.connected = true;
      this.reconnectAttempt = 0;
      this.eventsSubject.next({ type: 'connected', data: null });
      this.emitConnectionStatus();
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this.eventsSubject.next({ type: 'disconnected', data: { reason } });
      this.emitConnectionStatus();

      // ADR-063: 'transport close' est souvent un flip-flop transitoire (Railway proxy, redeploy).
      // On diffère le warn : si la reconnexion réussit sous 3s, on log juste un debug.
      // Les autres raisons (io server disconnect, ping timeout, transport error) restent loggées
      // immédiatement. Les métriques serveur (recordSocketDisconnect) capturent tous les events.
      if (reason === 'transport close') {
        if (this.pendingDisconnectWarnTimer) {
          clearTimeout(this.pendingDisconnectWarnTimer);
        }
        this.pendingDisconnectWarnTimer = setTimeout(() => {
          this.logger.warn('Socket disconnected from central server', { reason });
          this.pendingDisconnectWarnTimer = null;
        }, this.transientDisconnectGraceMs);
      } else {
        this.logger.warn('Socket disconnected from central server', { reason });
      }
    });

    // Événements de reconnexion avec backoff exponentiel
    this.socket.io.on('reconnect_attempt', (attempt) => {
      this.reconnectAttempt = attempt;
      const delay = this.calculateBackoffDelay(attempt);
      this.logger.info('Socket reconnecting', { attempt, maxAttempts: this.maxReconnectAttempts, nextRetryMs: delay });
      this.eventsSubject.next({ type: 'reconnecting', data: { attempt, delay } });
      this.emitConnectionStatus();
    });

    this.socket.io.on('reconnect', (attempt) => {
      this.logger.info('Socket reconnected', { attempts: attempt });
      this.reconnectAttempt = 0;
      this.eventsSubject.next({ type: 'reconnected', data: { attempts: attempt } });
      this.emitConnectionStatus();
    });

    this.socket.io.on('reconnect_error', (error) => {
      this.logger.error('Socket reconnection error', { error: error.message });
      this.eventsSubject.next({ type: 'reconnect_error', data: { error: error.message } });
    });

    this.socket.io.on('reconnect_failed', () => {
      this.logger.error('Socket failed to reconnect', { maxAttempts: this.maxReconnectAttempts });
      this.eventsSubject.next({ type: 'reconnect_failed', data: null });
      this.emitConnectionStatus();
    });

    this.socket.on('command_completed', (data: unknown) => {
      this.eventsSubject.next({ type: 'command_completed', data });
    });

    this.socket.on('command_timeout', (data: unknown) => {
      this.eventsSubject.next({ type: 'command_timeout', data });
    });

    this.socket.on('deploy_progress', (data: unknown) => {
      this.eventsSubject.next({ type: 'deploy_progress', data });
    });

    this.socket.on('update_progress', (data: unknown) => {
      this.eventsSubject.next({ type: 'update_progress', data });
    });

    this.socket.on('site_status_changed', (data: unknown) => {
      this.eventsSubject.next({ type: 'site_status_changed', data });
    });

    this.socket.on('alert_created', (data: unknown) => {
      this.eventsSubject.next({ type: 'alert_created', data });
    });

    // Cloud monitoring: player state updates + screenshot data
    this.socket.on('player_state_updated', (data: unknown) => {
      this.eventsSubject.next({ type: 'player_state_updated', data });
    });

    this.socket.on('screenshot-data', (data: unknown) => {
      this.eventsSubject.next({ type: 'screenshot-data', data });
    });

    // E-23 US-23.4.4: HDMI & dual-display status updates
    this.socket.on('hdmi_status_updated', (data: unknown) => {
      this.eventsSubject.next({ type: 'hdmi_status_updated', data });
    });

    // ADR-059 — état match autoritaire (Pi → cloud → dashboard)
    this.socket.on('state-sync', (data: unknown) => {
      this.eventsSubject.next({ type: 'state-sync', data });
    });

    // ADR-088 F-15.2 — scoreboard live multi-vendor (sim/connector → cloud → dashboard)
    this.socket.on('scoreboard-state', (data: unknown) => {
      this.eventsSubject.next({ type: 'scoreboard-state', data });
    });
  }

  subscribeSite(siteId: string): void {
    if (this.socket && this.connected) {
      this.socket.emit('dashboard-subscribe-site', { siteId });
    }
  }

  unsubscribeSite(siteId: string): void {
    if (this.socket && this.connected) {
      this.socket.emit('dashboard-unsubscribe-site', { siteId });
    }
  }

  disconnect(): void {
    if (this.pendingDisconnectWarnTimer) {
      clearTimeout(this.pendingDisconnectWarnTimer);
      this.pendingDisconnectWarnTimer = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.reconnectAttempt = 0;
      this.emitConnectionStatus();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Retourne le status de connexion actuel
   */
  getConnectionStatus(): ConnectionStatus {
    return {
      connected: this.connected,
      reconnectAttempt: this.reconnectAttempt,
      nextRetryMs: this.reconnectAttempt > 0 ? this.calculateBackoffDelay(this.reconnectAttempt) : null,
    };
  }

  /**
   * Calcule le délai de backoff exponentiel
   * Formule: min(baseDelay * 2^attempt, maxDelay) avec jitter
   */
  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.baseDelay * Math.pow(2, attempt - 1),
      this.maxDelay
    );
    // Ajouter un jitter de ±25% pour éviter les reconnexions synchronisées
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(exponentialDelay + jitter);
  }

  /**
   * Émet le status de connexion
   */
  private emitConnectionStatus(): void {
    this.connectionStatusSubject.next(this.getConnectionStatus());
  }

  /**
   * Force une tentative de reconnexion
   */
  forceReconnect(): void {
    if (this.socket && !this.connected) {
      this.logger.info('Forcing socket reconnection');
      this.socket.connect();
    }
  }

  on<T = unknown>(event: string): Observable<T> {
    return this.events$.pipe(
      filter((socketEvent): socketEvent is SocketEvent => socketEvent.type === event),
      map(socketEvent => socketEvent.data as T)
    );
  }

  emit(event: string, data: unknown): void {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    } else {
      this.logger.warn('Cannot emit: socket not connected', { event });
    }
  }
}
