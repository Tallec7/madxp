/**
 * RemoteTimerService — Timer/chronometer state and interval management for Pi remote.
 * Extracted from RemoteComponent (mirrors ADR-043 pattern from cloud-remote).
 * Transport: LocalBroadcastService (BroadcastChannel) + SocketService (Socket.IO).
 */
import { Injectable, inject, OnDestroy } from '@angular/core';
import { SocketService } from '../../services/socket.service';
import { LocalBroadcastService } from '../../services/local-broadcast.service';

export interface TimerConfig {
  enabled: boolean;
  periodDuration: number;
  countDown: boolean;
  integratedWithScore: boolean;
}

@Injectable()
export class RemoteTimerService implements OnDestroy {
  private readonly socketService = inject(SocketService);
  private readonly localBroadcast = inject(LocalBroadcastService);

  currentTime = 0;
  isRunning = false;
  private interval: ReturnType<typeof setInterval> | null = null;

  /** Callback fired when timer reaches end of period */
  onPeriodEnd: (() => void) | null = null;

  ngOnDestroy(): void {
    this.clearInterval();
  }

  initialize(config: TimerConfig): void {
    this.currentTime = config.countDown ? config.periodDuration * 60 : 0;
  }

  start(config: TimerConfig): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.emit({ action: 'start', currentTime: this.currentTime, isRunning: true, ...config });

    this.interval = setInterval(() => {
      if (config.countDown) {
        if (this.currentTime > 0) {
          this.currentTime--;
        } else {
          this.pause();
          this.onPeriodEnd?.();
        }
      } else {
        const maxTime = config.periodDuration * 60;
        if (this.currentTime < maxTime) {
          this.currentTime++;
        } else {
          this.pause();
          this.onPeriodEnd?.();
        }
      }

      // Sync every 5s (Pi local — plus fréquent que cloud car réseau local)
      if (this.currentTime % 5 === 0) {
        this.sync(config);
      }
    }, 1000);
  }

  pause(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.clearInterval();
    this.emit({ action: 'pause', currentTime: this.currentTime, isRunning: false });
  }

  toggle(config: TimerConfig): void {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start(config);
    }
  }

  reset(config: TimerConfig): void {
    this.pause();
    this.currentTime = config.countDown ? config.periodDuration * 60 : 0;
    this.emit({
      action: 'reset',
      currentTime: this.currentTime,
      isRunning: false,
      periodDuration: config.periodDuration,
      countDown: config.countDown,
    });
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  getDisplayTime(): string {
    return this.formatTime(this.currentTime);
  }

  private sync(config: TimerConfig): void {
    this.emit({
      action: 'sync',
      currentTime: this.currentTime,
      isRunning: this.isRunning,
      periodDuration: config.periodDuration,
      countDown: config.countDown,
    });
  }

  private emit(update: {
    action: 'start' | 'pause' | 'reset' | 'sync';
    currentTime?: number;
    isRunning?: boolean;
    periodDuration?: number;
    countDown?: boolean;
  }): void {
    this.localBroadcast.emitTimerUpdate(update);
    this.socketService.emit('timer-update', update);
  }

  private clearInterval(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
