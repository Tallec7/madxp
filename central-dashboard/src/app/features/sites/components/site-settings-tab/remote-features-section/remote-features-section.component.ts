/**
 * RemoteFeaturesSectionComponent — ADR-062 famille Features
 * Card admin pour activer/désactiver les features de la télécommande par site.
 * Gated admin dans site-settings-tab.component.html.
 * RÈGLE : aucune option sécurité (→ remote-auth-section) ni UX device (→ preferences-menu).
 */
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface RemoteFeatureFlags {
  profilesEnabled: boolean;
  matchModeEnabled: boolean;
  timerEnabled: boolean;
  breakingNewsEnabled: boolean;
  screenshotEnabled: boolean;
}

@Component({
  selector: 'app-remote-features-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="settings-card">
      <h3 class="card-title">Remote — Features</h3>
      <p class="card-subtitle">
        Fonctionnalités de la télécommande activées pour ce site. Géré par l'admin.
      </p>

      <div class="feature-list" *ngIf="features">
        <label class="feature-row">
          <input type="checkbox" [(ngModel)]="features.profilesEnabled"
                 (ngModelChange)="onFeaturesChange()">
          Profils multi-utilisateur
        </label>
        <label class="feature-row">
          <input type="checkbox" [(ngModel)]="features.matchModeEnabled"
                 (ngModelChange)="onFeaturesChange()">
          Mode match (score + chronomètre)
        </label>
        <label class="feature-row">
          <input type="checkbox" [(ngModel)]="features.timerEnabled"
                 (ngModelChange)="onFeaturesChange()">
          Chronomètre autonome
        </label>
        <label class="feature-row">
          <input type="checkbox" [(ngModel)]="features.breakingNewsEnabled"
                 (ngModelChange)="onFeaturesChange()">
          Annonces flash (breaking news)
        </label>
        <label class="feature-row">
          <input type="checkbox" [(ngModel)]="features.screenshotEnabled"
                 (ngModelChange)="onFeaturesChange()">
          Capture d'écran TV
        </label>
      </div>

      <p class="card-note">
        Les options de sécurité (PIN, tokens) sont dans la section <em>Remote & sécurité</em> ci-dessus.
      </p>
    </div>
  `,
})
export class RemoteFeaturesSectionComponent {
  @Input() siteId!: string;
  @Input() features: RemoteFeatureFlags | null = null;

  onFeaturesChange(): void {
    // Persist via parent component (site-settings-tab) — features are server-side.
  }
}
