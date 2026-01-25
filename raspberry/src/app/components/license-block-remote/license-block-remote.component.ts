/**
 * LicenseBlockRemoteComponent
 *
 * Composant d'écran de blocage affiché sur /remote quand la licence est bloquée.
 * Design adapté mobile, permet de voir le statut et contacter le support.
 */
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
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

        <!-- Icône -->
        <div class="icon">{{ getIcon() }}</div>

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

  /**
   * Retourne l'icône selon la raison
   */
  getIcon(): string {
    const reason = this.licenseState?.reason;
    const icons: Record<string, string> = {
      'unpaid': '💳',
      'expired': '📅',
      'abuse': '⛔',
      'maintenance': '🔧',
      'request': '✋',
      'hardware': '🔌',
      'trial_ended': '🎁',
      'connection': '📡',
      'connection_required': '🌐',
      'server_blocked': '🚫'
    };
    return icons[reason || ''] || '⚠️';
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
