/**
 * LicenseBannerComponent (Cloud Remote)
 *
 * Bannière d'avertissement affichée sur la remote cloud quand la licence a un warning.
 * Port du composant raspberry/src/app/components/license-banner/
 */
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LicenseState } from '../../../core/models/license.model';

@Component({
  selector: 'app-license-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="license-banner"
      [class.warning]="licenseState?.status === 'WARNING'"
      [class.grace]="licenseState?.status === 'GRACE_PERIOD'"
      [class.connection]="licenseState?.status === 'CONNECTION_WARNING'"
      [class.dismissed]="isDismissed"
      *ngIf="shouldShow()"
    >
      <div class="banner-content">
        <span class="banner-icon">{{ getIcon() }}</span>
        <span class="banner-text">{{ getMessage() }}</span>
        <span class="banner-days" *ngIf="getDaysInfo()">{{ getDaysInfo() }}</span>
      </div>
      <button class="banner-dismiss" (click)="dismiss()" aria-label="Fermer">
        ✕
      </button>
    </div>
  `,
  styles: [`
    .license-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
      transform: translateY(0);
      transition: transform 0.3s ease;
    }

    .license-banner.dismissed {
      transform: translateY(-100%);
    }

    .license-banner.warning {
      background: linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%);
      color: #92400e;
      border-bottom: 3px solid #f59e0b;
    }

    .license-banner.grace {
      background: linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%);
      color: #9a3412;
      border-bottom: 3px solid #ea580c;
    }

    .license-banner.connection {
      background: linear-gradient(135deg, #dbeafe 0%, #93c5fd 100%);
      color: #1e40af;
      border-bottom: 3px solid #3b82f6;
    }

    .banner-content {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }

    .banner-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .banner-text {
      flex: 1;
    }

    .banner-days {
      background: rgba(0, 0, 0, 0.1);
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }

    .banner-dismiss {
      background: rgba(0, 0, 0, 0.1);
      border: none;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: inherit;
      font-size: 14px;
      transition: background 0.2s;
      flex-shrink: 0;
      margin-left: 12px;
    }

    .banner-dismiss:hover {
      background: rgba(0, 0, 0, 0.2);
    }

    @media (max-width: 480px) {
      .license-banner {
        padding: 10px 12px;
        font-size: 13px;
      }

      .banner-content {
        gap: 8px;
      }

      .banner-icon {
        font-size: 18px;
      }

      .banner-days {
        display: none;
      }
    }
  `]
})
export class LicenseBannerComponent {
  @Input() licenseState: LicenseState | null = null;
  @Output() dismissed = new EventEmitter<void>();

  isDismissed = false;

  shouldShow(): boolean {
    if (!this.licenseState || this.isDismissed) {
      return false;
    }
    const status = this.licenseState.status;
    return status === 'WARNING' || status === 'GRACE_PERIOD' || status === 'CONNECTION_WARNING';
  }

  getMessage(): string {
    if (this.licenseState?.messageRemote) {
      return this.licenseState.messageRemote;
    }

    const reason = this.licenseState?.reason;
    const status = this.licenseState?.status;

    if (status === 'GRACE_PERIOD') {
      const daysLeft = this.licenseState?.daysLeft;
      if (daysLeft !== undefined && daysLeft > 0) {
        return `Connexion requise dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`;
      }
      return 'Connexion requise pour valider la licence.';
    }

    if (status === 'CONNECTION_WARNING') {
      return 'Connexion Internet requise pour valider la licence.';
    }

    if (reason === 'expiring_soon') {
      const daysLeft = this.licenseState?.daysLeft;
      if (daysLeft !== undefined && daysLeft > 0) {
        return `Votre abonnement expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`;
      }
      return 'Votre abonnement expire bientôt.';
    }

    return 'Attention : problème de licence détecté.';
  }

  getIcon(): string {
    const status = this.licenseState?.status;
    const reason = this.licenseState?.reason;

    if (status === 'CONNECTION_WARNING' || reason === 'connection' || reason === 'connection_required') {
      return '📡';
    }
    if (status === 'GRACE_PERIOD') {
      return '⏰';
    }
    if (reason === 'expiring_soon') {
      return '📅';
    }
    return '⚠️';
  }

  getDaysInfo(): string | null {
    const status = this.licenseState?.status;
    const daysLeft = this.licenseState?.daysLeft;
    const daysSinceCheck = this.licenseState?.daysSinceCheck;

    if (status === 'GRACE_PERIOD' && daysLeft !== undefined) {
      return `${daysLeft}j restants`;
    }
    if (status === 'WARNING' && daysLeft !== undefined) {
      return `Expire dans ${daysLeft}j`;
    }
    if (status === 'CONNECTION_WARNING' && daysSinceCheck !== undefined) {
      return `Offline ${daysSinceCheck}j`;
    }
    return null;
  }

  dismiss(): void {
    this.isDismissed = true;
    this.dismissed.emit();
  }
}
