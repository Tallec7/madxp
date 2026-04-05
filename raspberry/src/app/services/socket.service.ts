import { Injectable } from "@angular/core";
import { Command } from "../interfaces/command.interface";
import { PlayerState } from "./player-state.service";
import { environment } from "../../environments/environment";
import { APP_VERSION } from "../version";

// Interfaces pour les nouveaux événements socket
export interface MatchConfig {
  sessionId: string | null;
  matchDate: string;
  matchName: string;
  audienceEstimate: number;
}

export interface ScoreUpdate {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export interface PhaseChange {
  phase: 'neutral' | 'before' | 'during' | 'after';
}

export interface TimerUpdate {
  action: 'start' | 'pause' | 'reset' | 'sync';
  currentTime?: number;
  isRunning?: boolean;
  halfDuration?: number;
  countDown?: boolean;
}

export interface BreakingNews {
  message: string;
  duration: number;
  position: 'top' | 'bottom';
  displayMode: 'scroll';
}

export interface OptionsUpdate {
  overlay: {
    scoreEnabled: boolean;
    goalPopupEnabled: boolean;
  };
  timer: {
    enabled: boolean;
    halfDuration: number;
    countDown: boolean;
  };
  breakingNews: {
    enabled: boolean;
    position: 'top' | 'bottom';
    defaultDuration: number;
    displayMode: 'scroll';
    quickMessages: string[];
  };
  template: 'broadcast' | 'minimal';
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RequestState {
  // Empty interface - just a signal to request current state
}

export interface RecordingStateEvent {
  isRecording: boolean;
  isManualOverride: boolean;
}

export interface LoopState {
  videoIndex: number;
  videoPath: string;
  videoStartedAt: number | null;
  isManualMode: boolean;
  manualVideoPath: string | null;
  manualVideoStartedAt: number | null;
  manualVideoVisible: boolean; // ADR-034: master signals when manual video is revealed
  updatedAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TvRegister {
  // Empty interface - just a signal to register as TV instance
}

interface SocketIOOptions {
  transports: string[];
  reconnection: boolean;
  reconnectionDelay: number;
  reconnectionDelayMax: number;
  reconnectionAttempts: number;
}

interface Socket {
  on<T>(event: string, callback: (data: T) => void): void;
  emit(event: string, data: unknown): void;
  connected: boolean;
  id: string;
}

declare const io: (url: string, opts?: SocketIOOptions) => Socket;

@Injectable({providedIn: 'root'})
export class SocketService {
  private socket: Socket | undefined;
  private _connected = false;
  private _reconnectCallbacks: Array<() => void> = [];

  /**
   * Détermine l'URL du serveur Socket.IO dynamiquement.
   * - Utilise environment.socketUrl si défini
   * - Sinon, utilise l'hostname actuel avec le port 3000
   * Cela permet de fonctionner depuis :
   * - Le Pi lui-même (localhost ou neopro.local)
   * - Un téléphone sur le hotspot (neopro.local ou 192.168.4.1)
   */
  private getSocketUrl(): string {
    // Si l'environnement définit une URL, l'utiliser
    if (environment.socketUrl) {
      return environment.socketUrl;
    }

    // Sinon, construire dynamiquement depuis l'origine actuelle
    const hostname = window.location.hostname || 'localhost';
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${hostname}:3000`;
  }

  get connected(): boolean {
    return this._connected;
  }

  public initialize() {
    try {
      const socketUrl = this.getSocketUrl();
      console.log('Connecting to socket server:', socketUrl);
      this.socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
      });

      // Connection lifecycle handlers
      this.socket.on<void>('connect', () => {
        this._connected = true;
        console.log('[Socket] Connected, id:', this.socket?.id);
        this.emitSaasRegisterIfNeeded();
      });

      this.socket.on<string>('disconnect', (reason) => {
        this._connected = false;
        console.warn('[Socket] Disconnected, reason:', reason);
      });

      this.socket.on<number>('reconnect', (attempt) => {
        this._connected = true;
        console.log('[Socket] Reconnected after', attempt, 'attempts');
        this.emitSaasRegisterIfNeeded();
        // Notify all reconnect subscribers (e.g. tv-register re-emit)
        for (const cb of this._reconnectCallbacks) {
          try { cb(); } catch (err) { console.error('[Socket] Reconnect callback error:', err); }
        }
      });

      this.socket.on<Error>('connect_error', (err) => {
        console.warn('[Socket] Connection error:', err);
      });
    } catch (e) {
      if (e instanceof ReferenceError) {
          console.error('socket service : not initialized, reference error')
      }
    }
  }

  /**
   * Register a callback to be called on reconnection.
   * Useful for re-emitting registration events (tv-register, etc.)
   */
  public onReconnect(callback: () => void): void {
    this._reconnectCallbacks.push(callback);
  }

  /**
   * In SaaS mode, register with central server on connect/reconnect
   * so the dashboard can track which version each SaaS site runs.
   */
  private emitSaasRegisterIfNeeded(): void {
    if (!(environment as { saasMode?: boolean }).saasMode) return;
    const params = new URLSearchParams(window.location.search);
    const siteId = params.get('site') || localStorage.getItem('neopro_saas_site_id') || '';
    if (!siteId || !this.socket) return;
    this.socket.emit('saas-register', {
      siteId,
      version: APP_VERSION,
      clientType: 'saas-tv',
    });
    console.log('[Socket] SaaS register emitted', { siteId, version: APP_VERSION });
  }

  public on<T = Command>(action: string, callback: (data: T) => void) {
    if (this.socket) {
      console.log('socket service : on', action);
      this.socket.on(action, callback);
    } else {
      console.error('socket service : not called on due to not initialized');
    }
  }

  public emit(action: string, data: Command | MatchConfig | ScoreUpdate | PhaseChange | RequestState | TimerUpdate | BreakingNews | OptionsUpdate | RecordingStateEvent | LoopState | TvRegister | PlayerState | Record<string, unknown>) {
    if (this.socket) {
      console.log('socket service : emit', action, data);
      this.socket.emit(action, data);
    } else {
      console.error('socket service : not called on due to not initialized');
    }
  }
}
