import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { SiteContentTabComponent } from '../sites/components/site-content-tab/site-content-tab.component';

@Component({
  selector: 'app-club-content',
  standalone: true,
  imports: [CommonModule, TranslateModule, SiteContentTabComponent],
  template: `
    <div class="club-content">
      <div class="page-header">
        <h1>{{ 'nav.clubContent' | translate }}</h1>
        <p class="subtitle">{{ 'clubPortal.contentDescription' | translate }}</p>
      </div>

      <app-site-content-tab
        *ngIf="siteId"
        [siteId]="siteId"
        [siteName]="siteName"
        [isConnected]="isConnected"
        (configDeployed)="onConfigDeployed()">
      </app-site-content-tab>

      <div class="loading" *ngIf="!siteId">
        <div class="spinner"></div>
      </div>
    </div>
  `,
  styles: [`
    .club-content { padding: 2rem; max-width: 1400px; }
    .page-header {
      margin-bottom: 1.5rem;
      h1 { font-size: 1.5rem; margin: 0; }
      .subtitle { color: var(--text-secondary, #64748b); margin: 0.25rem 0 0; font-size: 0.875rem; }
    }
    .loading { text-align: center; padding: 3rem; }
    .spinner {
      width: 32px; height: 32px; margin: 0 auto;
      border: 3px solid #e2e8f0; border-top-color: var(--neo-hockey-dark, #2022E9);
      border-radius: 50%; animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class ClubContentComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);

  siteId = '';
  siteName = '';
  isConnected = false;

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user?.site_id) {
      this.siteId = user.site_id;
      this.loadSiteInfo();
    }
  }

  private loadSiteInfo(): void {
    this.api.get<{ site_name: string; club_name: string; status: string }>(`/sites/${this.siteId}`).subscribe({
      next: (site) => {
        this.siteName = site.site_name || site.club_name;
        this.isConnected = site.status === 'online';
      }
    });
  }

  onConfigDeployed(): void {
    // Refresh connection status after deploy
    this.loadSiteInfo();
  }
}
