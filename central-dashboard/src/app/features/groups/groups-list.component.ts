import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
import { GroupsService } from '../../core/services/groups.service';
import { Group } from '../../core/models';

@Component({
  selector: 'app-groups-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1>Groupes</h1>
          <p class="subtitle">Organisez vos sites par sport, région ou version logicielle.</p>
        </div>
        <button class="btn btn-primary" (click)="createGroup()">+ Nouveau groupe</button>
      </div>

      <div class="groups-grid" *ngIf="groups$ | async as groups; else loading">
        <div class="group-card card" *ngFor="let group of groups">
          <div class="group-header">
            <div>
              <h3>{{ group.name }}</h3>
              <span class="badge">{{ group.type }}</span>
            </div>
            <a class="btn btn-secondary" [routerLink]="['/groups', group.id]">Voir</a>
          </div>
          <p>{{ group.description || 'Aucune description' }}</p>
          <div class="group-meta">
            <div>
              <span class="meta-label">Sites</span>
              <span class="meta-value">{{ group.site_count ?? '—' }}</span>
            </div>
            <div>
              <span class="meta-label">Créé le</span>
              <span class="meta-value">{{ group.created_at | date:'shortDate' }}</span>
            </div>
          </div>
        </div>

        <div class="empty-state card" *ngIf="groups.length === 0">
          <div class="empty-icon">👥</div>
          <h3>Aucun groupe encore</h3>
          <p>Créez votre premier groupe pour gérer vos sites par lot.</p>
        </div>
      </div>

      <ng-template #loading>
        <div class="card loading">Chargement des groupes...</div>
      </ng-template>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1100px;
      margin: 0 auto;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      gap: 1rem;
    }
    .subtitle {
      color: #64748b;
      margin: 0.25rem 0 0;
    }
    .groups-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.5rem;
    }
    .group-card {
      background: white;
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 10px 35px rgba(15, 23, 42, 0.08);
    }
    .group-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .badge {
      background: #e0f2fe;
      color: #0369a1;
      padding: 0.1rem 0.75rem;
      border-radius: 999px;
      font-size: 0.75rem;
      text-transform: uppercase;
    }
    .group-meta {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #f1f5f9;
      margin-top: 1rem;
      padding-top: 1rem;
    }
    .meta-label {
      font-size: 0.75rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .meta-value {
      display: block;
      font-size: 1.15rem;
      font-weight: 600;
      color: #0f172a;
    }
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
    }
    .empty-icon {
      font-size: 2.5rem;
      margin-bottom: 1rem;
    }
  `]
})
export class GroupsListComponent implements OnInit {
  groups$!: Observable<Group[]>;

  constructor(private readonly groupsService: GroupsService) {}

  ngOnInit(): void {
    this.groups$ = this.groupsService.groups$;
    this.groupsService.loadGroups().subscribe();
  }

  createGroup() {
    // Placeholder pour futures modales/créations
    alert('Création de groupe à implémenter.');
  }
}
