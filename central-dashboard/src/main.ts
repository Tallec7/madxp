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

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
