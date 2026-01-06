import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NetworkService } from '../services/network.service';

/**
 * Offline Banner Component
 *
 * Displays a warning banner when the user loses network connectivity.
 * Automatically shows/hides based on network status.
 *
 * @example
 * // Add to app.component.ts
 * import { OfflineBannerComponent } from './core/components/offline-banner.component';
 *
 * @Component({
 *   imports: [OfflineBannerComponent, RouterOutlet],
 *   template: `
 *     <app-offline-banner />
 *     <router-outlet />
 *   `
 * })
 */
@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (!networkService.isOnline()) {
      <div class="offline-banner" role="alert" aria-live="polite">
        <span class="offline-icon">⚠️</span>
        <span class="offline-message">
          Vous êtes hors ligne - Certaines fonctionnalités sont indisponibles
        </span>
      </div>
    }
  `,
  styles: [`
    .offline-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(90deg, #ff9800, #f57c00);
      color: white;
      padding: 12px 16px;
      text-align: center;
      z-index: 10000;
      font-weight: 500;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      animation: slideDown 0.3s ease-out;
    }

    .offline-icon {
      font-size: 1.2em;
    }

    .offline-message {
      font-size: 14px;
    }

    @keyframes slideDown {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    @media (max-width: 600px) {
      .offline-banner {
        padding: 10px 12px;
        font-size: 13px;
      }
    }
  `],
})
export class OfflineBannerComponent {
  networkService = inject(NetworkService);
}
