import { ErrorHandler, Injectable } from '@angular/core';

/**
 * Suppresses Zone.js MediaPlaybackError noise.
 *
 * Zone.js independently wraps the `error` event on <video> elements and
 * re-throws a MediaPlaybackError even when VideoErrorRecoveryService already
 * caught it via addEventListener('error', handler). Without this handler,
 * Angular's global error listener surfaces every video error as "Uncaught".
 */
@Injectable()
export class MediaErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    if (error instanceof Error && error.name === 'MediaPlaybackError') {
      return;
    }
    console.error('[ErrorHandler]', error);
  }
}
