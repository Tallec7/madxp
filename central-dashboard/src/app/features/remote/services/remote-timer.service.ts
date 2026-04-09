/**
 * RemoteTimerService — Timer/chronometer state and interval management for cloud remote.
 * Extracted from CloudRemoteComponent (ADR-043).
 */
import { Injectable, OnDestroy } from '@angular/core';
import { RemoteService } from '../../../core/services/remote.service';

export interface TimerConfig {
  enabled: boolean;
  periodDuration: number;
  countDown: boolean;
  integratedWithScore: boolean;
}

@Injectable()
export class RemoteTimerService implements OnDestroy {
  currentTime = 0;
  isRunning = false;
  private interval: ReturnType<typeof setInterval> | null = null;

  /** Callback fired when timer reaches end of period */
  onPeriodEnd: (() => void) | null = null;

  constructor(private remoteService: RemoteService) {}

  ngOnDestroy(): void {
    this.clearInterval();
  }

  initialize(config: TimerConfig): void {
    this.currentTime = config.countDown ? config.periodDuration * 60 : 0;
  }

  start(siteId: string, config: TimerConfig): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.remoteService.updateTimer(siteId, {
      action: 'start',
      time: this.currentTime,
    }).subscribe({ error: () => { /* Silencieux */ } });

    this.interval = setInterval(() => {
      if (config.countDown) {
        if (this.currentTime > 0) {
          this.currentTime--;
        } else {
          this.pause(siteId);
          this.onPeriodEnd?.();
        }
      } else {
        const maxTime = config.periodDuration * 60;
        if (this.currentTime < maxTime) {
          this.currentTime++;
        } else {
          this.pause(siteId);
          this.onPeriodEnd?.();
        }
      }

      // Sync every 30s to reduce HTTP requests
      if (this.currentTime % 30 === 0) {
        this.sync(siteId);
      }
    }, 1000);
  }

  pause(siteId: string): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.clearInterval();

    this.remoteService.updateTimer(siteId, {
      action: 'pause',
      time: this.currentTime,
    }).subscribe({ error: () => { /* Silencieux */ } });
  }

  reset(siteId: string, config: TimerConfig): void {
    this.pause(siteId);
    this.currentTime = config.countDown ? config.periodDuration * 60 : 0;

    this.remoteService.updateTimer(siteId, {
      action: 'reset',
      time: this.currentTime,
    }).subscribe({ error: () => { /* Silencieux */ } });
  }

  toggle(siteId: string, config: TimerConfig): void {
    if (this.isRunning) {
      this.pause(siteId);
    } else {
      this.start(siteId, config);
    }
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  getDisplayTime(): string {
    return this.formatTime(this.currentTime);
  }

  private sync(siteId: string): void {
    this.remoteService.updateTimer(siteId, {
      action: 'sync',
      time: this.currentTime,
    }).subscribe({ error: () => { /* Silencieux */ } });
  }

  private clearInterval(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
