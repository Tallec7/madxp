import { Injectable } from '@angular/core';

/**
 * Describes the current state of the TV player.
 * Sent to the central server via heartbeat for remote monitoring.
 */
export interface PlayerState {
  /** Filename of the currently playing video (e.g. 'highlight-equipe-A.mp4') */
  currentVideo: string | null;
  /** Category of the current video */
  currentCategory: string | null;
  /** Playback progress 0–100 */
  progress: number;
  /** Total duration in seconds */
  duration: number;
  /** Current playback time in seconds */
  currentTime: number;
  /** Active phase: neutral / before / during / after */
  phase: string;
  /** True if playing a manually-triggered video (not the loop) */
  isManualMode: boolean;
  /** True if a video is actively playing (not paused/errored) */
  isPlaying: boolean;
  /** Current index in the video loop */
  loopIndex: number;
  /** Total number of videos in the current loop */
  loopTotal: number;
  /** Filename of the next video in the loop */
  nextVideo: string | null;
  /** Last player error message (null if no error) */
  lastError: string | null;
  /** ISO timestamp of the last video transition */
  lastTransitionAt: string | null;
  /** True if the score overlay is currently visible */
  overlayActive: boolean;
  /** Index from which the loop was resumed after a manual video (null if normal start) */
  loopResumedFrom: number | null;
  /** ISO timestamp of the last state update */
  updatedAt: string;
}

/**
 * PlayerStateService — Tracks the current state of the TV player.
 *
 * The TV component calls update() on every meaningful change (play, ended,
 * error, phase change, manual video). The sync-agent reads this state via
 * the local Socket.IO server and includes it in the heartbeat payload.
 */
@Injectable({ providedIn: 'root' })
export class PlayerStateService {
  private state: PlayerState = {
    currentVideo: null,
    currentCategory: null,
    progress: 0,
    duration: 0,
    currentTime: 0,
    phase: 'neutral',
    isManualMode: false,
    isPlaying: false,
    loopIndex: 0,
    loopTotal: 0,
    nextVideo: null,
    lastError: null,
    lastTransitionAt: null,
    overlayActive: false,
    loopResumedFrom: null,
    updatedAt: new Date().toISOString(),
  };

  /**
   * Partial update of the player state. Only provided fields are overwritten.
   */
  update(partial: Partial<PlayerState>): PlayerState {
    this.state = {
      ...this.state,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    return this.getState();
  }

  /**
   * Returns a snapshot of the current player state.
   */
  getState(): PlayerState {
    return { ...this.state };
  }

  /**
   * Extracts a short filename from a full video path.
   * '/media/neopro/videos/highlight.mp4' → 'highlight.mp4'
   */
  static filenameFromPath(videoPath: string | undefined | null): string | null {
    if (!videoPath) return null;
    const parts = videoPath.split('/');
    return parts[parts.length - 1] || null;
  }
}
