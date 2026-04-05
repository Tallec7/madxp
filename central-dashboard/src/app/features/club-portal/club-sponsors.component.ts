import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { Site } from '../../core/models';
import { SiteSponsorsTabComponent } from '../sites/components/site-sponsors-tab/site-sponsors-tab.component';

@Component({
  selector: 'app-club-sponsors',
  standalone: true,
  imports: [CommonModule, TranslateModule, SiteSponsorsTabComponent],
  template: `
    <div class="club-sponsors">
      <div class="page-header">
        <h1>{{ 'nav.clubSponsors' | translate }}</h1>
        <p class="subtitle">{{ 'clubPortal.sponsorsDescription' | translate }}</p>
      </div>

      <app-site-sponsors-tab
        *ngIf="siteId && site"
        [siteId]="siteId"
        [site]="site">
      </app-site-sponsors-tab>

      <div class="loading" *ngIf="!site">
        <div class="spinner"></div>
      </div>
    </div>
  `,
  styles: [`
    .club-sponsors { padding: 2rem; max-width: 1400px; }
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
export class ClubSponsorsComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);

  siteId = '';
  site: Site | null = null;

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    if (user?.site_id) {
      this.siteId = user.site_id;
      this.loadSite();
    }
  }

  private loadSite(): void {
    this.api.get<Site>(`/sites/${this.siteId}`).subscribe({
      next: (site) => { this.site = site; }
    });
  }
}
