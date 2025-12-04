import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Observable, of, switchMap } from 'rxjs';
import { GroupsService } from '../../core/services/groups.service';
import { Group, Site } from '../../core/models';

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-container" *ngIf="group$ | async as group; else loading">
      <div class="page-header">
        <div>
          <h1>{{ group.name }}</h1>
          <p class="subtitle">{{ group.description || 'Aucune description' }}</p>
        </div>
        <div class="actions">
          <a class="btn btn-secondary" routerLink="/groups">← Retour aux groupes</a>
          <button class="btn btn-primary" (click)="refresh(group.id)">Actualiser</button>
        </div>
      </div>

      <div class="card">
        <div class="info-row">
          <span>Type</span>
          <span class="badge">{{ group.type }}</span>
        </div>
        <div class="info-row">
          <span>Sites</span>
          <span>{{ (group.sites?.length) ?? '—' }}</span>
        </div>
        <div class="info-row">
          <span>Créé le</span>
          <span>{{ group.created_at | date:'mediumDate' }}</span>
        </div>
        <div class="info-row" *ngIf="group.filters">
          <span>Filtres appliqués</span>
          <code>{{ group.filters | json }}</code>
        </div>
      </div>

      <div class="card">
        <h3>Sites assignés</h3>
        <div *ngIf="group.sites?.length; else emptySites" class="sites-list">
          <div class="site-row" *ngFor="let site of group.sites">
            <div>
              <strong>{{ site.club_name }}</strong>
              <p class="site-location">
                {{ site.location?.city || 'N/A' }} · {{ site.location?.region || 'N/A' }}
              </p>
            </div>
            <a [routerLink]="['/sites', site.id]" class="btn btn-secondary btn-small">Voir</a>
          </div>
        </div>
        <ng-template #emptySites>
          <div class="empty-state">
            Aucun site n'est encore lié à ce groupe.
          </div>
        </ng-template>
      </div>
    </div>

    <ng-template #loading>
      <div class="page-container">
        <div class="card loading">Chargement du groupe...</div>
      </div>
    </ng-template>
  `,
  styles: [`
    .page-container { padding: 2rem; max-width: 900px; margin: 0 auto; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; gap: 1rem; }
    .subtitle { color: #64748b; margin: 0.25rem 0 0; }
    .card { background: white; border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); }
    .info-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9; font-size: 0.95rem; }
    .info-row:last-child { border-bottom: none; }
    .badge { background: #e0e7ff; color: #3730a3; padding: 0.2rem 0.8rem; border-radius: 999px; font-size: 0.75rem; text-transform: uppercase; }
    code { background: #0f172a; color: #cbd5f5; padding: 0.3rem 0.5rem; border-radius: 8px; }
    .sites-list { display: flex; flex-direction: column; gap: 1rem; }
    .site-row { display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; }
    .site-location { margin: 0.25rem 0 0; color: #94a3b8; }
    .btn-small { padding: 0.4rem 0.9rem; font-size: 0.85rem; }
    .empty-state { text-align: center; padding: 1.5rem; color: #94a3b8; }
  `]
})
export class GroupDetailComponent {
  group$: Observable<Group | null>;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly groupsService: GroupsService
  ) {
    this.group$ = this.route.paramMap.pipe(
      switchMap(params => {
        const id = params.get('id');
        if (!id) {
          return of(null);
        }
        return this.groupsService.getGroup(id).pipe(
          switchMap(group =>
            this.groupsService.getGroupSites(group.id).pipe(
              switchMap(result => {
                const enriched: Group = { ...group, sites: result.sites };
                return of(enriched);
              })
            )
          )
        );
      })
    );
  }

  refresh(id: string) {
    this.groupsService.getGroup(id).subscribe();
  }
}
