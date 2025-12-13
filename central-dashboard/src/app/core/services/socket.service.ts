import { Injectable } from '@angular/core';
import { Observable, Subject, filter, map } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '@env/environment';

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
  private socket: Socket | null = null;
  private eventsSubject = new Subject<SocketEvent>();
  public events$ = this.eventsSubject.asObservable();

  private connected = false;
  private reconnectAttempt = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseDelay = 1000; // 1 seconde
  private readonly maxDelay = 30000; // 30 secondes

  // Status de connexion observable
  private connectionStatusSubject = new Subject<ConnectionStatus>();
  public connectionStatus$ = this.connectionStatusSubject.asObservable();

  connect(token: string): void {
    if (this.socket) {
      return;
    }

    this.socket = io(environment.socketUrl, {
      transports: ['websocket', 'polling'],
      auth: { token },
      // Configuration du backoff exponentiel
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.baseDelay,
      reconnectionDelayMax: this.maxDelay,
      randomizationFactor: 0.5, // Ajoute de l'aléatoire pour éviter les "thundering herd"
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to central server');
      this.connected = true;
      this.reconnectAttempt = 0;
      this.eventsSubject.next({ type: 'connected', data: null });
      this.emitConnectionStatus();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from central server:', reason);
      this.connected = false;
      this.eventsSubject.next({ type: 'disconnected', data: { reason } });
      this.emitConnectionStatus();
    });

    // Événements de reconnexion avec backoff exponentiel
    this.socket.io.on('reconnect_attempt', (attempt) => {
      this.reconnectAttempt = attempt;
      const delay = this.calculateBackoffDelay(attempt);
      console.log(`🔄 Reconnecting... (attempt ${attempt}/${this.maxReconnectAttempts}, next retry in ${delay}ms)`);
      this.eventsSubject.next({ type: 'reconnecting', data: { attempt, delay } });
      this.emitConnectionStatus();
    });

    this.socket.io.on('reconnect', (attempt) => {
      console.log(`✅ Reconnected after ${attempt} attempts`);
      this.reconnectAttempt = 0;
      this.eventsSubject.next({ type: 'reconnected', data: { attempts: attempt } });
      this.emitConnectionStatus();
    });

    this.socket.io.on('reconnect_error', (error) => {
      console.error('Reconnection error:', error.message);
      this.eventsSubject.next({ type: 'reconnect_error', data: { error: error.message } });
    });

    this.socket.io.on('reconnect_failed', () => {
      console.error(`❌ Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
      this.eventsSubject.next({ type: 'reconnect_failed', data: null });
      this.emitConnectionStatus();
    });

    this.socket.on('command_completed', (data: unknown) => {
      this.eventsSubject.next({ type: 'command_completed', data });
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
  }

  disconnect(): void {
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
      console.log('Forcing reconnection...');
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
      console.warn('Cannot emit: socket not connected');
    }
  }
}
