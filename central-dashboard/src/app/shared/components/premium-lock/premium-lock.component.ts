import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeatureGateService, FeatureKey, SiteTier } from '../../../core/services/feature-gate.service';

/**
 * Composant reutilisable pour afficher un bandeau de verrouillage
 * lorsqu'une feature necessite un abonnement superieur.
 *
 * Meilleure UX que le masquage brut : l'utilisateur voit la feature existe
 * et l'incite a upgrader (effet upsell).
 *
 * Usage dans un template :
 *   <!-- Lock sur feature avec detection automatique du tier requis -->
 *   <app-premium-lock feature="secondary_display" />
 *
 *   <!-- Avec message personnalise et CTA -->
 *   <app-premium-lock
 *     feature="multi_profiles"
 *     message="Creer plusieurs ambiances pour votre club (match, entrainement...)"
 *     [showUpgradeCta]="true" />
 *
 *   <!-- En overlay sur un bloc de contenu grise -->
 *   <div class="locked-content">
 *     <app-premium-lock feature="analytics_advanced" overlay />
 *     <app-chart [data]="advancedData" />
 *   </div>
 */
@Component({
  selector: 'app-premium-lock',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="premium-lock" [class.premium-lock--overlay]="overlay">
      <div class="premium-lock__content">
        <div class="premium-lock__icon" aria-hidden="true">🔒</div>
        <div class="premium-lock__text">
          <div class="premium-lock__title">
            {{ title || defaultTitle() }}
          </div>
          <div class="premium-lock__message" *ngIf="message || defaultMessage()">
            {{ message || defaultMessage() }}
          </div>
        </div>
        <button
          *ngIf="showUpgradeCta"
          type="button"
          class="premium-lock__cta"
          (click)="onUpgradeClick()"
        >
          Upgrader
        </button>
      </div>
    </div>
  `,
  styles: [`
    .premium-lock {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      border: 1px dashed rgba(255, 193, 7, 0.5);
      border-radius: 0.75rem;
      background: linear-gradient(
        135deg,
        rgba(255, 193, 7, 0.06),
        rgba(255, 152, 0, 0.04)
      );
      color: #333;
    }

    .premium-lock--overlay {
      position: absolute;
      inset: 0;
      z-index: 10;
      backdrop-filter: blur(3px);
      background: rgba(255, 255, 255, 0.75);
    }

    .premium-lock__content {
      display: flex;
      align-items: center;
      gap: 1rem;
      max-width: 520px;
    }

    .premium-lock__icon {
      font-size: 1.75rem;
      flex-shrink: 0;
    }

    .premium-lock__text {
      flex: 1;
      min-width: 0;
    }

    .premium-lock__title {
      font-weight: 600;
      font-size: 0.95rem;
      color: #1a1a1a;
    }

    .premium-lock__message {
      font-size: 0.85rem;
      color: #555;
      margin-top: 0.25rem;
    }

    .premium-lock__cta {
      flex-shrink: 0;
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 0.5rem;
      background: #ff9800;
      color: white;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .premium-lock__cta:hover {
      background: #f57c00;
    }
  `],
})
export class PremiumLockComponent {
  private gate = inject(FeatureGateService);

  /** Cle de la feature gatée (source de verite pour le tier requis) */
  @Input() feature?: FeatureKey;

  /** Tier requis explicite — prioritaire sur `feature` si fourni */
  @Input() tier?: SiteTier;

  /** Titre personnalise (default : genere depuis le tier requis) */
  @Input() title?: string;

  /** Message descriptif optionnel */
  @Input() message?: string;

  /** Afficher le bouton "Upgrader" */
  @Input() showUpgradeCta = false;

  /** Mode overlay : positionnement absolu au-dessus du contenu parent */
  @Input() overlay = false;

  defaultTitle(): string {
    const requiredTier = this.resolveRequiredTier();
    const labels: Record<SiteTier, string> = {
      play: 'Disponible avec un abonnement',
      club: 'Disponible avec l\'offre Club',
      pro: 'Disponible avec l\'offre Pro',
      premium: 'Disponible avec l\'offre Premium',
    };
    return labels[requiredTier];
  }

  defaultMessage(): string | null {
    if (!this.feature) return null;
    const messages: Partial<Record<FeatureKey, string>> = {
      multi_profiles: 'Creez plusieurs ambiances (match, entrainement, evenement) et basculez d\'un clic.',
      weighted_rotation: 'Ajustez le poids de chaque video pour controler la frequence d\'affichage.',
      hourly_schedule: 'Programmez vos videos sur des plages horaires ou des dates specifiques.',
      secondary_display: 'Gerez le contenu de votre second ecran independamment.',
      analytics_advanced: 'Analyses sur 90 jours avec export CSV et rapports PDF.',
      remote_diagnostic: 'Diagnostiquez l\'etat de votre boitier a distance.',
      white_label: 'Personnalisez l\'interface aux couleurs de votre club.',
      watermark: 'Affichez votre logo en permanence sur la boucle video.',
      image_to_video: 'Transformez une image en video directement depuis le portail.',
    };
    return messages[this.feature] ?? null;
  }

  onUpgradeClick(): void {
    // TODO: router vers la page d'upgrade / ouvrir la modal contact commercial
    // Sera connecte dans une iteration ulterieure.
    console.info('Premium upgrade requested', { feature: this.feature });
  }

  private resolveRequiredTier(): SiteTier {
    if (this.tier) return this.tier;
    if (this.feature) return this.gate.requiredTier(this.feature);
    return 'premium';
  }
}
