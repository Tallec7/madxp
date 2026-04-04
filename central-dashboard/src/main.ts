import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { init as launchkitInit } from '@bworlds/launchkit';

// TEMPORARY: bworlds LaunchKit uptime monitoring — à retirer après évaluation (juin 2026)
launchkitInit({ buildSlug: 'neopro-admin-kalonpartners-bzh' });

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
