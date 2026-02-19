/**
 * PlayerStatusComponent — Displays the current state of the Pi TV player.
 *
 * Shows: current video name, progress bar, phase, loop position,
 * next video, manual mode indicator, and last error.
 *
 * Updated via Socket.IO events (player_state_updated) from the central server.
 */

import { Component, Input, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { SocketService } from '../../../../core/services/socket.service';

export interface PlayerState {
  currentVideo: string | null;
  currentCategory: string | null;
  progress: number;
  duration: number;
  currentTime: number;
  phase: string;
  isManualMode: boolean;
  isPlaying: boolean;
  loopIndex: number;
  loopTotal: number;
  nextVideo: string | null;
  lastError: string | null;
  lastTransitionAt: string | null;
  overlayActive: boolean;
  updatedAt: string;
}

@Component({
  selector: 'app-player-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (playerState) {
      <div class="player-status">
        <div class="player-status-header">
          <div class="status-indicator" [class.playing]="playerState.isPlaying" [class.error]="!!playerState.lastError"></div>
          <span class="status-label">TV en direct</span>
          @if (playerState.isManualMode) {
            <span class="badge manual">Manuel</span>
          }
          @if (playerState.overlayActive) {
            <span class="badge overlay">Score</span>
          }
          <span class="badge phase" [attr.data-phase]="playerState.phase">{{ phaseLabel }}</span>
        </div>

        <div class="player-status-body">
          <div class="video-info">
            <span class="video-name" [title]="playerState.currentVideo || ''">
              {{ playerState.currentVideo || noVideoLabel }}
            </span>
            @if (!playerState.isManualMode && playerState.loopTotal > 0) {
              <span class="loop-position">{{ playerState.loopIndex + 1 }}/{{ playerState.loopTotal }}</span>
            }
          </div>

          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" [style.width.%]="playerState.progress"></div>
            </div>
            <span class="time-info">{{ formatTime(playerState.currentTime) }} / {{ formatTime(playerState.duration) }}</span>
          </div>

          @if (playerState.nextVideo && !playerState.isManualMode) {
            <div class="next-video">
              Suivante : {{ playerState.nextVideo }}
            </div>
          }

          @if (playerState.lastError) {
            <div class="last-error">
              {{ playerState.lastError }}
            </div>
          }
        </div>
      </div>
    } @else {
      <div class="player-status player-status-empty">
        <div class="status-indicator offline"></div>
        <span class="status-label">TV — pas de données</span>
      </div>
    }
  `,
  styles: [`
    .player-status {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 12px 16px;
      margin-bottom: 12px;
    }

    .player-status-empty {
      display: flex;
      align-items: center;
      gap: 8px;
      opacity: 0.5;
    }

    .player-status-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #666;
      flex-shrink: 0;
    }

    .status-indicator.playing {
      background: #4ade80;
      box-shadow: 0 0 6px rgba(74, 222, 128, 0.5);
      animation: pulse 2s infinite;
    }

    .status-indicator.error {
      background: #ef4444;
      box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
    }

    .status-indicator.offline {
      background: #666;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .status-label {
      font-size: 13px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
    }

    .badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge.manual {
      background: rgba(234, 179, 8, 0.2);
      color: #eab308;
    }

    .badge.overlay {
      background: rgba(59, 130, 246, 0.2);
      color: #3b82f6;
    }

    .badge.phase {
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.7);
    }

    .badge.phase[data-phase="before"] {
      background: rgba(234, 179, 8, 0.15);
      color: #eab308;
    }

    .badge.phase[data-phase="during"] {
      background: rgba(74, 222, 128, 0.15);
      color: #4ade80;
    }

    .badge.phase[data-phase="after"] {
      background: rgba(59, 130, 246, 0.15);
      color: #3b82f6;
    }

    .player-status-body {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .video-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .video-name {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.85);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 200px;
    }

    .loop-position {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      flex-shrink: 0;
    }

    .progress-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .progress-bar {
      flex: 1;
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #4ade80;
      border-radius: 2px;
      transition: width 0.5s ease;
    }

    .time-info {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
      flex-shrink: 0;
      min-width: 70px;
      text-align: right;
    }

    .next-video {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .last-error {
      font-size: 11px;
      color: #ef4444;
      background: rgba(239, 68, 68, 0.1);
      padding: 4px 8px;
      border-radius: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `]
})
export class PlayerStatusComponent implements OnInit, OnDestroy {
  @Input() siteId = '';
  @Input() initialPlayerState: PlayerState | null = null;

  private readonly socketService = inject(SocketService);
  private readonly destroy$ = new Subject<void>();

  playerState: PlayerState | null = null;
  readonly noVideoLabel = 'Aucune vid\u00e9o';

  get phaseLabel(): string {
    const labels: Record<string, string> = {
      neutral: 'Neutre',
      before: 'Avant-match',
      during: 'Pendant',
      after: 'Après-match',
    };
    return labels[this.playerState?.phase || ''] || this.playerState?.phase || '';
  }

  ngOnInit(): void {
    // Initialize with data from getRemoteState (HTTP)
    if (this.initialPlayerState) {
      this.playerState = this.initialPlayerState;
    }

    // Listen for real-time updates via Socket.IO
    this.socketService.on<{ siteId: string; playerState: PlayerState }>('player_state_updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data.siteId === this.siteId) {
          this.playerState = data.playerState;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  formatTime(seconds: number): string {
    if (!seconds || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
