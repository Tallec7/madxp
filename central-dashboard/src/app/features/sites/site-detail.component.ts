import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Observable, of, switchMap } from 'rxjs';
import { SitesService } from '../../core/services/sites.service';
import { Site } from '../../core/models';

@Component({
  selector: 'app-site-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-container" *ngIf="site$ | async as site; else loading">
      <div class="page-header">
        <div>
          <h1>{{ site.club_name }}</h1>
          <p class="subtitle">{{ site.site_name }}</p>
        </div>
        <div class="header-actions">
          <a class="btn btn-secondary" routerLink="/sites">← Retour aux sites</a>
          <button class="btn btn-primary" (click)="refresh(site.id)">Actualiser</button>
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <h3>Informations générales</h3>
          <div class="info-row">
            <span>Status</span>
            <span class="badge" [class]="'badge-' + site.status">{{ site.status }}</span>
          </div>
          <div class="info-row">
            <span>Localisation</span>
            <span>
              {{ site.location?.city || 'N/A' }}, {{ site.location?.region || 'N/A' }}
            </span>
          </div>
          <div class="info-row">
            <span>Sports</span>
            <span>{{ site.sports?.join(', ') || 'Non renseigné' }}</span>
          </div>
          <div class="info-row">
            <span>Dernier contact</span>
            <span>{{ site.last_seen_at ? (site.last_seen_at | date:'short') : 'Jamais' }}</span>
          </div>
          <div class="info-row">
            <span>Version logicielle</span>
            <span>{{ site.software_version || 'Inconnue' }}</span>
          </div>
        </div>

        <div class="card">
          <h3>API & Sécurité</h3>
          <div class="info-row">
            <span>Site ID</span>
            <code>{{ site.id }}</code>
          </div>
          <div class="info-row">
            <span>Clé API</span>
            <code>{{ site.api_key }}</code>
          </div>
          <p class="muted">
            Utilisez ces identifiants sur le Raspberry Pi via l'agent sync pour authentifier ce site au serveur central.
          </p>
          <button class="btn btn-warning" (click)="regenerate(site.id)">Regénérer la clé</button>
        </div>
      </div>
    </div>

    <ng-template #loading>
      <div class="page-container">
        <div class="card loading">
          Chargement des informations du site...
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }
    .subtitle {
      margin: 0;
      color: #64748b;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.95rem;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .badge {
      padding: 0.15rem 0.65rem;
      border-radius: 999px;
      font-size: 0.75rem;
      text-transform: uppercase;
    }
    .badge-online { background: #dcfce7; color: #166534; }
    .badge-offline { background: #fee2e2; color: #b91c1c; }
    .badge-maintenance { background: #fef3c7; color: #92400e; }
    .badge-error { background: #fee2e2; color: #991b1b; }
    .muted {
      color: #94a3b8;
      font-size: 0.85rem;
      margin-top: 0.75rem;
    }
    code {
      background: #f8fafc;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      font-size: 0.85rem;
    }
  `]
})
export class SiteDetailComponent {
  site$: Observable<Site | null>;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly sitesService: SitesService
  ) {
    this.site$ = this.route.paramMap.pipe(
      switchMap(params => {
        const id = params.get('id');
        if (!id) {
          return of(null);
        }
        return this.sitesService.getSite(id);
      })
    );
  }

  refresh(id: string) {
    this.sitesService.getSite(id).subscribe();
  }

  regenerate(id: string) {
    this.sitesService.regenerateApiKey(id).subscribe();
  }
}
