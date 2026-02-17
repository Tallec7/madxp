/**
 * ScreenshotViewerComponent — Captures and displays screenshots from the Pi TV.
 *
 * Features:
 * - "Capture" button sends a screenshot request to the Pi
 * - Screenshot is returned directly via HTTP response (not Socket.IO)
 * - "Auto refresh" toggle re-captures every 5 seconds
 * - Loading state with spinner
 */

import { Component, Input, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RemoteService } from '../../../../core/services/remote.service';

@Component({
  selector: 'app-screenshot-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="screenshot-viewer">
      <div class="screenshot-header">
        <button
          class="capture-btn"
          (click)="captureScreenshot()"
          [disabled]="isLoading || !isConnected"
        >
          @if (isLoading) {
            <span class="spinner"></span>
            Capture en cours...
          } @else {
            <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            Capturer l'écran
          }
        </button>

        <label class="auto-refresh-toggle">
          <input
            type="checkbox"
            [checked]="autoRefresh"
            (change)="toggleAutoRefresh()"
            [disabled]="!isConnected"
          />
          <span>Auto (5s)</span>
        </label>
      </div>

      @if (screenshotUrl) {
        <div class="screenshot-container">
          <img
            [src]="screenshotUrl"
            alt="Screenshot TV"
            class="screenshot-image"
          />
          <div class="screenshot-meta">
            @if (screenshotVideo) {
              <span>{{ screenshotVideo }}</span>
            }
            <span class="screenshot-time">{{ screenshotTimeAgo }}</span>
          </div>
        </div>
      }

      @if (error) {
        <div class="screenshot-error">
          {{ error }}
        </div>
      }
    </div>
  `,
  styles: [`
    .screenshot-viewer {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 12px 16px;
      margin-bottom: 12px;
    }

    .screenshot-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .capture-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      color: rgba(255, 255, 255, 0.9);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .capture-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.15);
    }

    .capture-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .capture-btn .icon-svg {
      width: 16px;
      height: 16px;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .auto-refresh-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
    }

    .auto-refresh-toggle input {
      accent-color: #4ade80;
    }

    .screenshot-container {
      margin-top: 8px;
    }

    .screenshot-image {
      width: 100%;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .screenshot-meta {
      display: flex;
      justify-content: space-between;
      margin-top: 4px;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
    }

    .screenshot-error {
      margin-top: 8px;
      font-size: 12px;
      color: #ef4444;
      background: rgba(239, 68, 68, 0.1);
      padding: 6px 10px;
      border-radius: 6px;
    }
  `]
})
export class ScreenshotViewerComponent implements OnDestroy {
  @Input() siteId = '';
  @Input() isConnected = false;

  private readonly remoteService = inject(RemoteService);

  isLoading = false;
  autoRefresh = false;
  screenshotUrl: string | null = null;
  screenshotVideo: string | null = null;
  screenshotTimestamp: number | null = null;
  error: string | null = null;

  private autoRefreshInterval: ReturnType<typeof setInterval> | null = null;

  get screenshotTimeAgo(): string {
    if (!this.screenshotTimestamp) return '';
    const seconds = Math.floor((Date.now() - this.screenshotTimestamp) / 1000);
    if (seconds < 5) return 'à l\'instant';
    if (seconds < 60) return `il y a ${seconds}s`;
    return `il y a ${Math.floor(seconds / 60)}min`;
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  captureScreenshot(): void {
    if (this.isLoading || !this.isConnected) return;

    this.isLoading = true;
    this.error = null;

    this.remoteService.requestScreenshot(this.siteId).subscribe({
      next: (result) => {
        if (result.image) {
          this.screenshotUrl = result.image;
          this.screenshotVideo = result.currentVideo || null;
          this.screenshotTimestamp = result.timestamp || Date.now();
          this.error = null;
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        const serverError = err.error?.error;
        if (serverError === 'timeout') {
          this.error = 'Le Pi n\'a pas répondu (timeout)';
        } else if (serverError === 'no_active_video') {
          this.error = 'Aucune vidéo active sur le Pi';
        } else if (serverError === 'capture_failed') {
          this.error = 'Capture échouée (pas de frames décodées)';
        } else {
          this.error = err.error?.message || 'Erreur lors de la capture';
        }
      }
    });
  }

  toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    if (this.autoRefresh) {
      this.captureScreenshot();
      this.autoRefreshInterval = setInterval(() => {
        if (this.isConnected && !this.isLoading) {
          this.captureScreenshot();
        }
      }, 5000);
    } else {
      this.stopAutoRefresh();
    }
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }
}
