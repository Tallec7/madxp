import { Injectable } from "@angular/core";
import { Command } from "../interfaces/command.interface";
import { environment } from "../../environments/environment";

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
  displayMode: 'scroll' | 'truncate' | 'multiline';
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
    displayMode: 'scroll' | 'truncate' | 'multiline';
    quickMessages: string[];
  };
  template: 'sportif' | 'elegant' | 'minimal';
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
  updatedAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TvRegister {
  // Empty interface - just a signal to register as TV instance
}

interface Socket {
  on<T>(event: string, callback: (data: T) => void): void;
  emit(event: string, data: unknown): void;
}

declare const io: (url: string) => Socket;

@Injectable({providedIn: 'root'})
export class SocketService {
  private socket: Socket | undefined;

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

  public initialize() {
    try {
      const socketUrl = this.getSocketUrl();
      console.log('Connecting to socket server:', socketUrl);
      this.socket = io(socketUrl);
    } catch (e) {
      if (e instanceof ReferenceError) {
          console.error('socket service : not initialized, reference error')
      }
    }
  }

  public on<T = Command>(action: string, callback: (data: T) => void) {
    if (this.socket) {
      console.log('socket service : on', action);
      this.socket.on(action, callback);
    } else {
      console.error('socket service : not called on due to not initialized');
    }
  }

  public emit(action: string, data: Command | MatchConfig | ScoreUpdate | PhaseChange | RequestState | TimerUpdate | BreakingNews | OptionsUpdate | RecordingStateEvent | LoopState | TvRegister) {
    if (this.socket) {
      console.log('socket service : emit', action, data);
      this.socket.emit(action, data);
    } else {
      console.error('socket service : not called on due to not initialized');
    }
  }
}
