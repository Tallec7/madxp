/**
 * SubscriptionBadgeComponent
 *
 * Badge affichant le statut d'abonnement d'un site
 * Utilisé dans la liste des sites et la page de détail
 */
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SubscriptionDisplayStatus, SubscriptionPlan, SuspensionReason } from '../../../core/models';

@Component({
  selector: 'app-subscription-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="subscription-badge"
      [class]="'badge-' + displayStatus"
      [title]="tooltipText"
    >
      <span class="badge-icon">{{ icon }}</span>
      <span class="badge-text" *ngIf="showText">{{ label }}</span>
    </span>
  `,
  styles: [`
    .subscription-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      cursor: help;
    }

    .badge-icon {
      font-size: 12px;
    }

    /* Active - Vert */
    .badge-active {
      background: rgba(76, 175, 80, 0.15);
      color: #2e7d32;
      border: 1px solid rgba(76, 175, 80, 0.3);
    }

    /* Trial - Bleu */
    .badge-trial {
      background: rgba(33, 150, 243, 0.15);
      color: #1565c0;
      border: 1px solid rgba(33, 150, 243, 0.3);
    }

    /* Expiring Soon - Orange */
    .badge-expiring_soon {
      background: rgba(255, 152, 0, 0.15);
      color: #e65100;
      border: 1px solid rgba(255, 152, 0, 0.3);
    }

    /* Grace Period - Orange foncé */
    .badge-grace_period {
      background: rgba(255, 87, 34, 0.15);
      color: #d84315;
      border: 1px solid rgba(255, 87, 34, 0.3);
    }

    /* Suspended - Rouge */
    .badge-suspended {
      background: rgba(244, 67, 54, 0.15);
      color: #c62828;
      border: 1px solid rgba(244, 67, 54, 0.3);
    }

    /* Blocked - Rouge foncé */
    .badge-blocked {
      background: rgba(183, 28, 28, 0.2);
      color: #b71c1c;
      border: 1px solid rgba(183, 28, 28, 0.4);
    }

    /* Unknown - Gris */
    .badge-unknown {
      background: rgba(158, 158, 158, 0.15);
      color: #616161;
      border: 1px solid rgba(158, 158, 158, 0.3);
    }
  `]
})
export class SubscriptionBadgeComponent implements OnChanges {
  /** Date de fin d'abonnement (ISO string) */
  @Input() subscriptionEnd: string | null = null;

  /** Plan d'abonnement */
  @Input() plan: SubscriptionPlan | null = null;

  /** Site suspendu */
  @Input() suspended = false;

  /** Motif de suspension */
  @Input() suspensionReason: SuspensionReason | string | null = null;

  /** Afficher le texte du badge (sinon juste l'icône) */
  @Input() showText = true;

  /** Statut calculé pour l'affichage */
  displayStatus: SubscriptionDisplayStatus = 'unknown';

  /** Icône du badge */
  icon = '❓';

  /** Label du badge */
  label = 'Inconnu';

  /** Texte du tooltip */
  tooltipText = '';

  ngOnChanges(changes: SimpleChanges): void {
    this.calculateStatus();
  }

  private calculateStatus(): void {
    // Si pas de date de fin, considérer comme actif indéfiniment (legacy)
    if (!this.subscriptionEnd && !this.suspended) {
      this.displayStatus = 'active';
      this.icon = '✓';
      this.label = 'Actif';
      this.tooltipText = 'Abonnement actif (pas de date d\'expiration)';
      return;
    }

    // Site suspendu
    if (this.suspended) {
      this.displayStatus = 'suspended';
      this.icon = '⏸';
      this.label = 'Suspendu';
      this.tooltipText = this.getSuspensionTooltip();
      return;
    }

    // Calculer le nombre de jours avant/après expiration
    const endDate = new Date(this.subscriptionEnd!);
    const now = new Date();
    const diffMs = endDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Trial
    if (this.plan === 'trial') {
      if (diffDays < 0) {
        // Trial expiré
        this.displayStatus = 'blocked';
        this.icon = '🚫';
        this.label = 'Essai terminé';
        this.tooltipText = `Période d'essai terminée depuis ${Math.abs(diffDays)} jour(s)`;
      } else if (diffDays <= 7) {
        // Trial expire bientôt
        this.displayStatus = 'expiring_soon';
        this.icon = '⏳';
        this.label = `Essai J-${diffDays}`;
        this.tooltipText = `Période d'essai expire dans ${diffDays} jour(s)`;
      } else {
        // Trial actif
        this.displayStatus = 'trial';
        this.icon = '🎁';
        this.label = 'Essai';
        this.tooltipText = `Période d'essai - Expire le ${this.formatDate(endDate)}`;
      }
      return;
    }

    // Abonnement expiré depuis plus de 7 jours = bloqué
    if (diffDays < -7) {
      this.displayStatus = 'blocked';
      this.icon = '🚫';
      this.label = 'Bloqué';
      this.tooltipText = `Abonnement expiré depuis ${Math.abs(diffDays)} jour(s) - Service bloqué`;
      return;
    }

    // Période de grâce (expiré depuis moins de 7 jours)
    if (diffDays < 0) {
      this.displayStatus = 'grace_period';
      this.icon = '⚠️';
      this.label = `Grâce J+${Math.abs(diffDays)}`;
      this.tooltipText = `Période de grâce - ${7 + diffDays} jour(s) restant(s) avant blocage`;
      return;
    }

    // Expire dans moins de 30 jours
    if (diffDays <= 30) {
      this.displayStatus = 'expiring_soon';
      this.icon = '⏳';
      this.label = `J-${diffDays}`;
      this.tooltipText = `Expire le ${this.formatDate(endDate)} (dans ${diffDays} jour(s))`;
      return;
    }

    // Actif
    this.displayStatus = 'active';
    this.icon = '✓';
    this.label = this.getPlanLabel();
    this.tooltipText = `Abonnement ${this.getPlanLabel()} - Expire le ${this.formatDate(endDate)}`;
  }

  private getSuspensionTooltip(): string {
    const reasons: Record<string, string> = {
      unpaid: 'Impayé',
      expired: 'Abonnement expiré',
      abuse: 'Utilisation abusive',
      maintenance: 'Maintenance',
      request: 'À la demande du client',
      hardware: 'Problème matériel',
      trial_ended: 'Fin de période d\'essai',
      connection: 'Connexion requise'
    };

    const reasonLabel = this.suspensionReason
      ? reasons[this.suspensionReason] || this.suspensionReason
      : 'Non spécifié';

    return `Suspendu : ${reasonLabel}`;
  }

  private getPlanLabel(): string {
    const plans: Record<SubscriptionPlan, string> = {
      trial: 'Essai',
      standard: 'Standard',
      premium: 'Premium'
    };
    return this.plan ? plans[this.plan] : 'Standard';
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
}
