/**
 * TransportResilienceService — ADR-060
 * Fallback automatique cloud → LAN → offline selon connectivité détectée.
 * Le mode est dérivé du statut Socket cloud + probe mDNS neopro.local.
 */
import { Injectable, inject, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subscription, timeout, catchError, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SocketService, ConnectionStatus } from '../../../core/services/socket.service';

export type TransportMode = 'cloud' | 'lan' | 'offline';

const LAN_BASE_URL = 'http://neopro.local:3001';
const LAN_PROBE_PATH = '/health';
const LAN_PROBE_TIMEOUT_MS = 2000;

@Injectable()
export class TransportResilienceService implements OnDestroy {
  private readonly socketService = inject(SocketService);
  private readonly http = inject(HttpClient);

  private readonly modeSubject = new BehaviorSubject<TransportMode>('cloud');
  readonly mode$ = this.modeSubject.asObservable();

  private lanAvailable = false;
  private probePending = false;
  private readonly sub: Subscription;

  constructor() {
    this.sub = this.socketService.connectionStatus$.subscribe((status) =>
      this.onConnectionStatusChange(status)
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  get currentMode(): TransportMode {
    return this.modeSubject.value;
  }

  /** Effective API base URL to use for HTTP commands. */
  getApiBaseUrl(): string {
    return this.currentMode === 'lan' ? LAN_BASE_URL : environment.apiUrl;
  }

  /** Probe neopro.local to check LAN reachability. */
  probeLan(): void {
    if (this.probePending) return;
    this.probePending = true;

    this.http.get(`${LAN_BASE_URL}${LAN_PROBE_PATH}`, { responseType: 'text' }).pipe(
      timeout(LAN_PROBE_TIMEOUT_MS),
      catchError(() => of(null))
    ).subscribe((result) => {
      this.probePending = false;
      this.lanAvailable = result !== null;
      this.recomputeMode();
    });
  }

  /** Called externally when cloud socket reconnects. */
  onCloudRestored(): void {
    this.lanAvailable = false;
    this.modeSubject.next('cloud');
  }

  private onConnectionStatusChange(status: ConnectionStatus): void {
    if (status.connected) {
      this.lanAvailable = false;
      this.modeSubject.next('cloud');
    } else {
      this.probeLan();
    }
  }

  private recomputeMode(): void {
    if (this.socketService.isConnected()) {
      this.modeSubject.next('cloud');
    } else if (this.lanAvailable) {
      this.modeSubject.next('lan');
    } else {
      this.modeSubject.next('offline');
    }
  }
}
