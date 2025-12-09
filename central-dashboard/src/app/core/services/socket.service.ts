import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '@env/environment';

export interface SocketEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private eventsSubject = new Subject<SocketEvent>();
  public events$ = this.eventsSubject.asObservable();

  private connected = false;

  connect(token: string): void {
    if (this.socket) {
      return;
    }

    this.socket = io(environment.socketUrl, {
      transports: ['websocket', 'polling'],
      auth: { token }
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to central server');
      this.connected = true;
      this.eventsSubject.next({ type: 'connected', data: null });
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from central server');
      this.connected = false;
      this.eventsSubject.next({ type: 'disconnected', data: null });
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
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  on(event: string): Observable<unknown> {
    return new Observable(observer => {
      if (!this.socket) {
        observer.error('Socket not connected');
        return;
      }

      this.socket.on(event, (data: unknown) => {
        observer.next(data);
      });

      return () => {
        if (this.socket) {
          this.socket.off(event);
        }
      };
    });
  }

  emit(event: string, data: unknown): void {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Cannot emit: socket not connected');
    }
  }
}
