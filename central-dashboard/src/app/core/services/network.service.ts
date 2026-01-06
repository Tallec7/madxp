import { Injectable, signal, inject } from '@angular/core';
import { fromEvent, merge, map, startWith } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { LoggerService } from './logger.service';

/**
 * Network Service
 *
 * Monitors network connectivity status and provides:
 * - Reactive signal for online/offline status
 * - Observable for status changes
 * - Logging of connectivity events
 *
 * @example
 * // In template with signal
 * @if (!networkService.isOnline()) {
 *   <app-offline-banner />
 * }
 *
 * // In component
 * if (this.networkService.isOnline()) {
 *   this.loadData();
 * }
 */
@Injectable({
  providedIn: 'root',
})
export class NetworkService {
  private logger = inject(LoggerService);

  // Reactive signal for online status
  isOnline = signal(navigator.onLine);

  // Observable for status changes
  private readonly online$ = merge(
    fromEvent(window, 'online').pipe(map(() => true)),
    fromEvent(window, 'offline').pipe(map(() => false))
  ).pipe(startWith(navigator.onLine));

  // Signal from observable (for use in templates)
  readonly onlineStatus = toSignal(this.online$, { initialValue: navigator.onLine });

  constructor() {
    this.initNetworkListeners();
  }

  /**
   * Check if currently online
   */
  checkOnline(): boolean {
    return navigator.onLine;
  }

  private initNetworkListeners(): void {
    // Online event
    fromEvent(window, 'online').subscribe(() => {
      this.isOnline.set(true);
      this.logger.info('Network connection restored');
      this.logger.addBreadcrumb('action', 'Network: online');
    });

    // Offline event
    fromEvent(window, 'offline').subscribe(() => {
      this.isOnline.set(false);
      this.logger.warn('Network connection lost');
      this.logger.addBreadcrumb('action', 'Network: offline');
    });

    // Log initial state
    this.logger.info('Network service initialized', {
      online: navigator.onLine,
    });
  }
}
