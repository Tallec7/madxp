/**
 * LicenseBlockComponent
 *
 * Composant d'écran de blocage affiché sur /tv quand la licence est expirée ou suspendue.
 * Design épuré aux couleurs Neopro, affiche un message contextuel.
 */
import { Component, Input, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LicenseService, LicenseState } from '../../services/license.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-license-block',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="block-screen" [class]="'reason-' + (licenseState?.reason || 'unknown')">
      <!-- Background gradient animation -->
      <div class="background-animation"></div>

      <!-- Content -->
      <div class="content">
        <!-- Logo Neopro -->
        <div class="logo-container">
          <img
            src="assets/neopro-logo-white.png"
            alt="Neopro"
            class="logo"
            onerror="this.style.display='none'"
          />
          <div class="logo-fallback" *ngIf="!logoLoaded">NEOPRO</div>
        </div>

        <!-- Message principal -->
        <h1 class="title">{{ getTitle() }}</h1>

        <!-- Message contextuel -->
        <p class="message">{{ getMessage() }}</p>

        <!-- Icone contextuelle -->
        <div class="icon-container">
          <span class="icon">{{ getIcon() }}</span>
        </div>

        <!-- Information de contact -->
        <div class="contact-info">
          <p>Contactez votre administrateur</p>
          <p class="reference" *ngIf="siteReference">
            Ref: {{ siteReference }}
          </p>
        </div>

        <!-- Indicateur de connexion -->
        <div class="connection-indicator" *ngIf="licenseState?.needsConnection">
          <div class="pulse-dot"></div>
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
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: white;
      font-family: 'Segoe UI', system-ui, sans-serif;
      overflow: hidden;
      z-index: 9999;
    }

    /* Raisons spécifiques - couleurs d'accent */
    .block-screen.reason-unpaid { --accent-color: #ef4444; }
    .block-screen.reason-expired { --accent-color: #f59e0b; }
    .block-screen.reason-abuse { --accent-color: #ef4444; }
    .block-screen.reason-maintenance { --accent-color: #6366f1; }
    .block-screen.reason-request { --accent-color: #8b5cf6; }
    .block-screen.reason-hardware { --accent-color: #ef4444; }
    .block-screen.reason-trial_ended { --accent-color: #f59e0b; }
    .block-screen.reason-connection,
    .block-screen.reason-connection_required { --accent-color: #3b82f6; }
    .block-screen.reason-unknown { --accent-color: #6b7280; }

    /* Animation de fond subtile */
    .background-animation {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 20% 80%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(139, 92, 246, 0.15) 0%, transparent 50%);
      animation: pulse-bg 8s ease-in-out infinite;
    }

    @keyframes pulse-bg {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }

    .content {
      position: relative;
      z-index: 1;
      text-align: center;
      padding: 40px;
      max-width: 600px;
    }

    /* Logo */
    .logo-container {
      margin-bottom: 40px;
    }

    .logo {
      max-width: 200px;
      height: auto;
      filter: drop-shadow(0 4px 20px rgba(0, 0, 0, 0.3));
    }

    .logo-fallback {
      font-size: 48px;
      font-weight: 700;
      letter-spacing: 8px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    /* Titre */
    .title {
      font-size: 36px;
      font-weight: 600;
      margin: 0 0 20px 0;
      line-height: 1.2;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }

    /* Message */
    .message {
      font-size: 18px;
      color: rgba(255, 255, 255, 0.8);
      margin: 0 0 40px 0;
      line-height: 1.5;
    }

    /* Icone */
    .icon-container {
      margin-bottom: 40px;
    }

    .icon {
      font-size: 80px;
      display: inline-block;
      animation: float 3s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }

    /* Contact */
    .contact-info {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px 30px;
      backdrop-filter: blur(10px);
    }

    .contact-info p {
      margin: 0;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.7);
    }

    .contact-info .reference {
      margin-top: 8px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      letter-spacing: 1px;
    }

    /* Indicateur de connexion */
    .connection-indicator {
      position: absolute;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.6);
    }

    .pulse-dot {
      width: 12px;
      height: 12px;
      background: var(--accent-color, #3b82f6);
      border-radius: 50%;
      animation: pulse-dot 2s ease-in-out infinite;
    }

    @keyframes pulse-dot {
      0%, 100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.5;
        transform: scale(1.2);
      }
    }

    /* Responsive */
    @media (max-width: 600px) {
      .content {
        padding: 20px;
      }

      .title {
        font-size: 28px;
      }

      .message {
        font-size: 16px;
      }

      .icon {
        font-size: 60px;
      }
    }

    /* Mode TV (paysage, grande résolution) */
    @media (min-width: 1200px) {
      .title {
        font-size: 48px;
      }

      .message {
        font-size: 24px;
      }

      .icon {
        font-size: 100px;
      }

      .logo {
        max-width: 280px;
      }
    }
  `]
})
export class LicenseBlockComponent implements OnInit, OnDestroy {
  /**
   * Référence du site (pour le support technique)
   */
  @Input() siteReference: string = '';

  /**
   * État de la licence (injecté ou lu depuis le service)
   */
  @Input() licenseState: LicenseState | null = null;

  private readonly licenseService = inject(LicenseService);
  private subscription: Subscription | null = null;

  logoLoaded = true;

  ngOnInit(): void {
    // Si pas d'état fourni en input, utiliser le service
    if (!this.licenseState) {
      this.subscription = this.licenseService.state$.subscribe(state => {
        this.licenseState = state;
      });
    }
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  /**
   * Retourne le titre selon la raison du blocage
   */
  getTitle(): string {
    const reason = this.licenseState?.reason;
    const titles: Record<string, string> = {
      'unpaid': 'Service suspendu',
      'expired': 'Abonnement expiré',
      'abuse': 'Service suspendu',
      'maintenance': 'Maintenance en cours',
      'request': 'Service suspendu',
      'hardware': 'Problème technique',
      'trial_ended': 'Période d\'essai terminée',
      'connection': 'Connexion requise',
      'connection_required': 'Connexion Internet requise',
      'server_blocked': 'Service suspendu'
    };
    return titles[reason || ''] || 'Service temporairement indisponible';
  }

  /**
   * Retourne le message selon la raison du blocage
   */
  getMessage(): string {
    // Utiliser le message du serveur si disponible
    if (this.licenseState?.messageTv) {
      return this.licenseState.messageTv;
    }

    const reason = this.licenseState?.reason;
    const messages: Record<string, string> = {
      'unpaid': 'Veuillez régulariser votre situation pour réactiver le service.',
      'expired': 'Votre abonnement a expiré. Veuillez le renouveler.',
      'abuse': 'Le service a été suspendu pour non-respect des conditions d\'utilisation.',
      'maintenance': 'Une maintenance est en cours. Merci de patienter.',
      'request': 'Le service a été suspendu à votre demande.',
      'hardware': 'Un problème technique a été détecté. Le support a été notifié.',
      'trial_ended': 'Votre période d\'essai est terminée. Passez à un abonnement payant.',
      'connection': 'Connectez le boîtier à Internet pour valider la licence.',
      'connection_required': 'Le boîtier doit être connecté à Internet périodiquement.',
      'server_blocked': 'Le service a été suspendu par l\'administrateur.'
    };
    return messages[reason || ''] || 'Le service est temporairement indisponible.';
  }

  /**
   * Retourne l'icône selon la raison du blocage
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
}
