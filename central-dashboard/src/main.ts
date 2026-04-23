import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { init as launchkitInit } from '@bworlds/launchkit';

// TEMPORARY: bworlds LaunchKit uptime monitoring — à retirer après évaluation (juin 2026)
launchkitInit({ buildSlug: 'neopro-admin-kalonpartners-bzh' });

// Suppress Zone.js MediaPlaybackError thrown from video elements inside React roots
// (Remotion Player). Zone.js wraps ALL video event listeners globally — errors fire
// outside Angular's zone so GlobalErrorHandler doesn't see them. play().catch() already
// handles the actual error; this only silences the spurious window-level throw.
window.addEventListener('error', (event) => {
  if (event.error instanceof Error && event.error.name === 'MediaPlaybackError') {
    event.preventDefault();
  }
}, true);

// Suppress Remotion "Could not play video: AbortError" spam from Chrome power-saving
// video-only <video> elements (no audio track + muted). The same filter lives in
// template-studio-player.component.ts but that module is lazy-loaded, so errors that
// fire before the user navigates to the template studio page leak through.
// The play() rejection is already handled by Remotion internally — this is cosmetic only.
const _origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = args[0];
  if (typeof msg === 'string' && msg.includes('Could not play video')) return;
  _origConsoleError(...args);
};

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
