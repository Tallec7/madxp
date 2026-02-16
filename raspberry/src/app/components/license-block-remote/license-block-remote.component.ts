/**
 * LicenseBlockRemoteComponent
 *
 * Composant d'écran de blocage affiché sur /remote quand la licence est bloquée.
 * Design adapté mobile, permet de voir le statut et contacter le support.
 */
import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LicenseState } from '../../services/license.service';

@Component({
  selector: 'app-license-block-remote',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="block-screen" [class]="'reason-' + (licenseState?.reason || 'unknown')">
      <div class="content">
        <!-- Logo -->
        <div class="logo">NEOPRO</div>

        <!-- Icône (SVG pour compatibilité écrans) -->
        <div class="icon" [innerHTML]="getIcon()"></div>

        <!-- Titre -->
        <h1>{{ getTitle() }}</h1>

        <!-- Message -->
        <p class="message">{{ getMessage() }}</p>

        <!-- Détails si disponibles -->
        <div class="details" *ngIf="getDetails()">
          {{ getDetails() }}
        </div>

        <!-- Contact -->
        <div class="contact">
          <p>Contactez votre administrateur</p>
          <p class="reference" *ngIf="siteReference">Ref: {{ siteReference }}</p>
        </div>

        <!-- Indicateur de connexion -->
        <div class="connection-indicator" *ngIf="licenseState?.needsConnection">
          <div class="pulse"></div>
          <span>En attente de connexion...</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .block-screen {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, #1e1e2e 0%, #2d2d44 100%);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 24px;
      text-align: center;
      z-index: 9999;
    }

    /* Couleurs selon raison */
    .block-screen.reason-unpaid { --accent: #ef4444; }
    .block-screen.reason-expired { --accent: #f59e0b; }
    .block-screen.reason-abuse { --accent: #ef4444; }
    .block-screen.reason-maintenance { --accent: #6366f1; }
    .block-screen.reason-request { --accent: #8b5cf6; }
    .block-screen.reason-hardware { --accent: #ef4444; }
    .block-screen.reason-trial_ended { --accent: #f59e0b; }
    .block-screen.reason-connection,
    .block-screen.reason-connection_required { --accent: #3b82f6; }
    .block-screen.reason-unknown { --accent: #6b7280; }

    .content {
      max-width: 360px;
      width: 100%;
    }

    .logo {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 4px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 24px;
    }

    .icon {
      font-size: 64px;
      margin-bottom: 20px;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }

    h1 {
      font-size: 22px;
      font-weight: 600;
      margin: 0 0 12px 0;
      color: white;
    }

    .message {
      font-size: 15px;
      color: rgba(255, 255, 255, 0.7);
      margin: 0 0 24px 0;
      line-height: 1.5;
    }

    .details {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 24px;
    }

    .contact {
      background: rgba(var(--accent), 0.1);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
    }

    .contact p {
      margin: 0;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.6);
    }

    .contact .reference {
      margin-top: 8px;
      font-family: 'SF Mono', 'Consolas', monospace;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.4);
      letter-spacing: 0.5px;
    }

    .connection-indicator {
      margin-top: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.5);
    }

    .pulse {
      width: 10px;
      height: 10px;
      background: var(--accent, #3b82f6);
      border-radius: 50%;
      animation: pulse-dot 1.5s ease-in-out infinite;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `]
})
export class LicenseBlockRemoteComponent {
  /**
   * État de la licence
   */
  @Input() licenseState: LicenseState | null = null;

  /**
   * Référence du site
   */
  @Input() siteReference: string = '';

  /**
   * Retourne le titre selon la raison
   */
  getTitle(): string {
    const reason = this.licenseState?.reason;
    const titles: Record<string, string> = {
      'unpaid': 'Service suspendu',
      'expired': 'Abonnement expiré',
      'abuse': 'Service suspendu',
      'maintenance': 'Maintenance',
      'request': 'Service suspendu',
      'hardware': 'Problème technique',
      'trial_ended': 'Essai terminé',
      'connection': 'Connexion requise',
      'connection_required': 'Connexion requise',
      'server_blocked': 'Service suspendu'
    };
    return titles[reason || ''] || 'Service indisponible';
  }

  /**
   * Retourne le message selon la raison
   */
  getMessage(): string {
    if (this.licenseState?.messageRemote) {
      return this.licenseState.messageRemote;
    }

    const reason = this.licenseState?.reason;
    const messages: Record<string, string> = {
      'unpaid': 'Régularisez votre situation pour réactiver le service.',
      'expired': 'Renouvelez votre abonnement pour continuer.',
      'abuse': 'Contactez le support pour plus d\'informations.',
      'maintenance': 'Le service sera rétabli sous peu.',
      'request': 'Contactez votre administrateur.',
      'hardware': 'Un technicien a été notifié.',
      'trial_ended': 'Passez à un abonnement pour continuer.',
      'connection': 'Connectez le boîtier à Internet.',
      'connection_required': 'Le boîtier doit être connecté régulièrement.',
      'server_blocked': 'Contactez votre administrateur.'
    };
    return messages[reason || ''] || 'Le service est temporairement indisponible.';
  }

  private readonly sanitizer = inject(DomSanitizer);

  /**
   * Retourne l'icône SVG selon la raison du blocage.
   * SVG inline au lieu d'emojis pour compatibilité écrans TV / Raspberry Pi.
   */
  getIcon(): SafeHtml {
    const reason = this.licenseState?.reason;
    const svgAttr = 'xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
    const icons: Record<string, string> = {
      'unpaid': `<svg ${svgAttr}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
      'expired': `<svg ${svgAttr}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
      'abuse': `<svg ${svgAttr}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
      'maintenance': `<svg ${svgAttr}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
      'request': `<svg ${svgAttr}><path d="M18 11V6a2 2 0 0 0-4 0v1M14 10V4a2 2 0 0 0-4 0v6M10 10V5a2 2 0 0 0-4 0v9"/><path d="M18 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-2c-2.5 0-4.3-1-5.7-2.7L3.3 15a2 2 0 0 1 3-2.6L8 14"/></svg>`,
      'hardware': `<svg ${svgAttr}><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8z"/></svg>`,
      'trial_ended': `<svg ${svgAttr}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
      'connection': `<svg ${svgAttr}><path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/></svg>`,
      'connection_required': `<svg ${svgAttr}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
      'server_blocked': `<svg ${svgAttr}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
    };
    const defaultIcon = `<svg ${svgAttr}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    const svg = icons[reason || ''] || defaultIcon;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  /**
   * Retourne les détails supplémentaires si disponibles
   */
  getDetails(): string | null {
    const state = this.licenseState;
    if (!state) return null;

    if (state.daysSinceCheck !== undefined && state.daysSinceCheck > 0) {
      return `Dernière vérification : il y a ${state.daysSinceCheck} jour${state.daysSinceCheck > 1 ? 's' : ''}`;
    }

    if (state.daysExpired !== undefined && state.daysExpired > 0) {
      return `Expiré depuis ${state.daysExpired} jour${state.daysExpired > 1 ? 's' : ''}`;
    }

    return null;
  }
}
