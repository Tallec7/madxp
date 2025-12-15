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

interface Socket {
  on<T>(event: string, callback: (data: T) => void): void;
  emit(event: string, data: unknown): void;
}

declare const io: (url: string) => Socket;

@Injectable({providedIn: 'root'})
export class SocketService {
  private socket: Socket | undefined;

  public initialize() {
    try {
      console.log('Connecting to socket server:', environment.socketUrl);
      this.socket = io(environment.socketUrl);
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

  public emit(action: string, data: Command | MatchConfig | ScoreUpdate) {
    if (this.socket) {
      console.log('socket service : emit', action, data);
      this.socket.emit(action, data);
    } else {
      console.error('socket service : not called on due to not initialized');
    }
  }
}
