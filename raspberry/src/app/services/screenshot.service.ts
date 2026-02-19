import { Injectable } from '@angular/core';

/**
 * ScreenshotService — Captures a JPEG screenshot from a <video> element.
 *
 * Used by the TV component when a 'screenshot-request' event arrives from
 * the cloud dashboard via the local Socket.IO server.
 *
 * Constraints:
 * - Output is 480p (854×480) to keep JPEG size around 30–50 KB
 * - Rate-limited to 1 capture per second to avoid CPU spikes on the Pi
 * - Canvas is created/destroyed per capture (no persistent allocation)
 */
@Injectable({ providedIn: 'root' })
export class ScreenshotService {
  private lastCaptureTime = 0;
  private readonly MIN_INTERVAL_MS = 1000; // 1 screenshot/sec max

  /**
   * Capture a JPEG screenshot from a <video> element.
   *
   * @param videoElement - The currently active HTMLVideoElement
   * @param quality - JPEG quality 0–1 (default 0.5 for ~30–50 KB)
   * @returns Base64 data URL string, or empty string if capture fails
   */
  captureScreenshot(videoElement: HTMLVideoElement, quality = 0.5): string {
    // Rate limiting
    const now = Date.now();
    if (now - this.lastCaptureTime < this.MIN_INTERVAL_MS) {
      console.warn('[Screenshot] Rate limited, ignoring request');
      return '';
    }
    this.lastCaptureTime = now;

    // Validate video element has decodable frames
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      console.warn('[Screenshot] No valid video source (videoWidth=0)');
      return '';
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 854;
      canvas.height = 480;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.warn('[Screenshot] Failed to get canvas 2d context');
        return '';
      }

      ctx.drawImage(videoElement, 0, 0, 854, 480);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);

      // Cleanup
      canvas.width = 0;
      canvas.height = 0;

      return dataUrl;
    } catch (error) {
      console.error('[Screenshot] Capture failed:', error);
      return '';
    }
  }
}
