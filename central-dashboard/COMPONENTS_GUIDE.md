# Guide de création des composants UI restants

## ✅ Composants déjà créés

- **LoginComponent** ✅ - Page de connexion complète
- **LayoutComponent** ✅ - Shell avec sidebar, navigation, notifications
- **ForbiddenComponent** ✅ - Page 403

## 🚧 Composants à créer

### 1. DashboardComponent

**Fichier :** `src/app/features/dashboard/dashboard.component.ts`

**Description :** Vue d'ensemble du parc avec statistiques, graphiques et alertes

**Template de base :**

```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SitesService } from '../../core/services/sites.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dashboard-container">
      <h1>Dashboard</h1>

      <!-- Stats Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <h3>Total Sites</h3>
          <div class="stat-value">{{ stats?.total_sites || 0 }}</div>
        </div>
        <div class="stat-card stat-success">
          <h3>Online</h3>
          <div class="stat-value">{{ stats?.online || 0 }}</div>
        </div>
        <div class="stat-card stat-secondary">
          <h3>Offline</h3>
          <div class="stat-value">{{ stats?.offline || 0 }}</div>
        </div>
        <div class="stat-card stat-danger">
          <h3>Erreurs</h3>
          <div class="stat-value">{{ stats?.error || 0 }}</div>
        </div>
      </div>

      <!-- Recent Sites -->
      <div class="card">
        <h2>Sites récents</h2>
        <div class="sites-list">
          <div *ngFor="let site of recentSites" class="site-item">
            <span class="site-status" [class]="'status-' + site.status">●</span>
            <span class="site-name">{{ site.club_name }}</span>
            <span class="site-location">{{ site.location?.city }}</span>
            <span class="site-version">v{{ site.software_version }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    h1 {
      margin-bottom: 2rem;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border-left: 4px solid #2563eb;
    }

    .stat-card.stat-success { border-left-color: #10b981; }
    .stat-card.stat-danger { border-left-color: #ef4444; }
    .stat-card.stat-secondary { border-left-color: #64748b; }

    .stat-card h3 {
      margin: 0 0 0.5rem 0;
      font-size: 0.875rem;
      color: #64748b;
      text-transform: uppercase;
    }

    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: #0f172a;
    }

    .sites-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .site-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem;
      border-radius: 6px;
      background: #f8fafc;
    }

    .site-status {
      font-size: 0.75rem;
    }

    .status-online { color: #10b981; }
    .status-offline { color: #64748b; }
    .status-error { color: #ef4444; }

    .site-name {
      font-weight: 500;
      flex: 1;
    }

    .site-location {
      color: #64748b;
      font-size: 0.875rem;
    }

    .site-version {
      font-family: monospace;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      background: #e2e8f0;
      border-radius: 4px;
    }
  `]
})
export class DashboardComponent implements OnInit {
  stats: any = null;
  recentSites: any[] = [];

  constructor(private sitesService: SitesService) {}

  ngOnInit(): void {
    this.sitesService.loadStats().subscribe(stats => {
      this.stats = stats;
    });

    this.sitesService.loadSites().subscribe(response => {
      this.recentSites = response.sites.slice(0, 5);
    });
  }
}
```

### 2. SitesListComponent

**Fichier :** `src/app/features/sites/sites-list.component.ts`

**Template :**

```typescript
@Component({
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Sites ({{ (sites$ | async)?.length || 0 }})</h1>
        <button class="btn btn-primary" (click)="openCreateModal()">+ Nouveau site</button>
      </div>

      <!-- Filtres -->
      <div class="filters">
        <input type="text" placeholder="Rechercher..." [(ngModel)]="searchTerm" (ngModelChange)="applyFilters()">
        <select [(ngModel)]="statusFilter" (ngModelChange)="applyFilters()">
          <option value="">Tous les statuts</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="error">Erreur</option>
        </select>
        <select [(ngModel)]="regionFilter" (ngModelChange)="applyFilters()">
          <option value="">Toutes les régions</option>
          <option value="Bretagne">Bretagne</option>
          <!-- etc -->
        </select>
      </div>

      <!-- Grille des sites -->
      <div class="sites-grid">
        <div *ngFor="let site of sites$ | async" class="site-card card">
          <div class="site-header">
            <h3>{{ site.club_name }}</h3>
            <span class="badge" [class]="'badge-' + getStatusColor(site.status)">
              {{ site.status }}
            </span>
          </div>
          <p class="site-name">{{ site.site_name }}</p>
          <p class="site-location">📍 {{ site.location?.city }}, {{ site.location?.region }}</p>
          <p class="site-sports">{{ site.sports?.join(', ') }}</p>
          <div class="site-footer">
            <span class="site-version">v{{ site.software_version }}</span>
            <div class="site-actions">
              <button class="btn-icon" [routerLink]="['/sites', site.id]" title="Détails">👁️</button>
              <button class="btn-icon" (click)="editSite(site)" title="Éditer">✏️</button>
              <button class="btn-icon btn-danger" (click)="deleteSite(site)" title="Supprimer">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  // Ajoutez les styles...
})
export class SitesListComponent implements OnInit {
  sites$ = this.sitesService.sites$;
  searchTerm = '';
  statusFilter = '';
  regionFilter = '';

  constructor(private sitesService: SitesService) {}

  ngOnInit(): void {
    this.loadSites();
  }

  loadSites(): void {
    this.sitesService.loadSites().subscribe();
  }

  applyFilters(): void {
    this.sitesService.loadSites({
      search: this.searchTerm,
      status: this.statusFilter,
      region: this.regionFilter
    }).subscribe();
  }

  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      online: 'success',
      offline: 'secondary',
      error: 'danger',
      maintenance: 'warning'
    };
    return colors[status] || 'secondary';
  }

  editSite(site: any): void {
    // Ouvrir modal d'édition
  }

  deleteSite(site: any): void {
    if (confirm(`Supprimer le site ${site.club_name} ?`)) {
      this.sitesService.deleteSite(site.id).subscribe(() => {
        this.loadSites();
      });
    }
  }
}
```

### 3. SiteDetailComponent

**Fichier :** `src/app/features/sites/site-detail.component.ts`

**Template :**

```typescript
@Component({
  template: `
    <div class="page-container" *ngIf="site">
      <div class="page-header">
        <button class="btn btn-secondary" routerLink="/sites">← Retour</button>
        <h1>{{ site.club_name }}</h1>
        <span class="badge" [class]="'badge-' + getStatusColor(site.status)">
          {{ site.status }}
        </span>
      </div>

      <!-- Infos principales -->
      <div class="info-grid">
        <div class="card">
          <h3>Informations</h3>
          <div class="info-row">
            <span class="label">Site:</span>
            <span>{{ site.site_name }}</span>
          </div>
          <div class="info-row">
            <span class="label">Localisation:</span>
            <span>{{ site.location?.city }}, {{ site.location?.region }}</span>
          </div>
          <div class="info-row">
            <span class="label">Sports:</span>
            <span>{{ site.sports?.join(', ') }}</span>
          </div>
          <div class="info-row">
            <span class="label">Version:</span>
            <span>{{ site.software_version }}</span>
          </div>
          <div class="info-row">
            <span class="label">Dernière vue:</span>
            <span>{{ site.last_seen_at | date:'dd/MM/yyyy HH:mm' }}</span>
          </div>
        </div>

        <!-- Métriques en temps réel -->
        <div class="card">
          <h3>Métriques actuelles</h3>
          <div class="metrics-grid" *ngIf="currentMetrics">
            <div class="metric">
              <div class="metric-label">CPU</div>
              <div class="metric-value">{{ currentMetrics.cpu }}%</div>
            </div>
            <div class="metric">
              <div class="metric-label">RAM</div>
              <div class="metric-value">{{ currentMetrics.memory }}%</div>
            </div>
            <div class="metric">
              <div class="metric-label">Température</div>
              <div class="metric-value">{{ currentMetrics.temperature }}°C</div>
            </div>
            <div class="metric">
              <div class="metric-label">Disque</div>
              <div class="metric-value">{{ currentMetrics.disk }}%</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions rapides -->
      <div class="card">
        <h3>Actions rapides</h3>
        <div class="actions-grid">
          <button class="btn btn-secondary" (click)="restartService('neopro-app')">
            🔄 Redémarrer app
          </button>
          <button class="btn btn-secondary" (click)="getLogs()">
            📄 Voir logs
          </button>
          <button class="btn btn-warning" (click)="rebootSite()">
            ⚡ Redémarrer système
          </button>
          <button class="btn btn-primary" (click)="regenerateApiKey()">
            🔑 Régénérer API Key
          </button>
        </div>
      </div>
    </div>
  `,
  // Ajoutez les styles...
})
export class SiteDetailComponent implements OnInit {
  site: any = null;
  currentMetrics: any = null;
  siteId!: string;

  constructor(
    private route: ActivatedRoute,
    private sitesService: SitesService
  ) {}

  ngOnInit(): void {
    this.siteId = this.route.snapshot.paramMap.get('id')!;
    this.loadSite();
    this.loadMetrics();
  }

  loadSite(): void {
    this.sitesService.getSite(this.siteId).subscribe(site => {
      this.site = site;
    });
  }

  loadMetrics(): void {
    this.sitesService.getSiteMetrics(this.siteId).subscribe(response => {
      if (response.metrics.length > 0) {
        this.currentMetrics = response.metrics[0];
      }
    });
  }

  rebootSite(): void {
    if (confirm('Redémarrer le site ?')) {
      // Envoyer commande reboot via API
    }
  }

  // etc...
}
```

### 4. GroupsListComponent

**Fichier :** `src/app/features/groups/groups-list.component.ts`

**Template similaire à SitesListComponent** avec :
- Liste des groupes
- Bouton créer groupe
- Affichage nombre de sites par groupe
- Actions éditer/supprimer

### 5. GroupDetailComponent

**Fichier :** `src/app/features/groups/group-detail.component.ts`

**Template similaire à SiteDetailComponent** avec :
- Infos du groupe
- Liste des sites membres
- Bouton ajouter/retirer sites
- Actions groupées (déployer vers tous)

### 6. ContentManagementComponent

**Fichier :** `src/app/features/content/content-management.component.ts`

**Template :**

```typescript
@Component({
  template: `
    <div class="page-container">
      <h1>Gestion du contenu</h1>

      <!-- Upload zone -->
      <div class="card upload-zone" (drop)="onDrop($event)" (dragover)="onDragOver($event)">
        <div class="upload-icon">📹</div>
        <p>Glissez-déposez des vidéos ici</p>
        <p class="upload-hint">ou</p>
        <input type="file" #fileInput accept="video/*" multiple (change)="onFileSelected($event)" style="display: none">
        <button class="btn btn-primary" (click)="fileInput.click()">Sélectionner des fichiers</button>
      </div>

      <!-- Liste des vidéos -->
      <div class="videos-grid">
        <div *ngFor="let video of videos" class="video-card card">
          <div class="video-thumbnail">
            <img [src]="video.thumbnail_url || '/assets/video-placeholder.png'" alt="">
          </div>
          <div class="video-info">
            <h4>{{ video.original_name }}</h4>
            <p>{{ video.category }} / {{ video.subcategory }}</p>
            <p class="video-size">{{ formatSize(video.file_size) }}</p>
          </div>
          <div class="video-actions">
            <button class="btn btn-primary" (click)="deployVideo(video)">
              📤 Déployer
            </button>
            <button class="btn-icon btn-danger" (click)="deleteVideo(video)">
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  // Styles...
})
export class ContentManagementComponent {
  videos: any[] = [];

  onFileSelected(event: any): void {
    const files = event.target.files;
    // Upload logic
  }

  deployVideo(video: any): void {
    // Ouvrir modal pour sélectionner sites/groupes cibles
  }

  formatSize(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
```

### 7. UpdatesManagementComponent

**Fichier :** `src/app/features/updates/updates-management.component.ts`

**Template similaire à ContentManagementComponent** avec :
- Upload package de MAJ
- Liste des versions disponibles
- Déploiement vers sites/groupes
- Historique des déploiements
- Progression en temps réel

---

## 🎨 Styles communs à ajouter

Ajoutez ces styles dans `src/styles.scss` :

```scss
.page-container {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.page-header h1 {
  flex: 1;
  margin: 0;
}

.filters {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.filters input,
.filters select {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.875rem;
}

.filters input {
  flex: 1;
  max-width: 300px;
}

.sites-grid,
.videos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.site-card,
.video-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.site-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.site-header h3 {
  margin: 0;
  font-size: 1.125rem;
}

.site-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.site-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  background: none;
  border: none;
  padding: 0.25rem;
  cursor: pointer;
  font-size: 1.25rem;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.btn-icon:hover {
  opacity: 1;
}

.btn-icon.btn-danger:hover {
  color: var(--danger-color);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-color);
}

.info-row .label {
  font-weight: 500;
  color: var(--text-secondary);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.metric {
  text-align: center;
  padding: 1rem;
  background: var(--bg-color);
  border-radius: 6px;
}

.metric-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}

.metric-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.upload-zone {
  text-align: center;
  padding: 3rem;
  border: 2px dashed var(--border-color);
  background: var(--bg-color);
  cursor: pointer;
  transition: all 0.2s;
}

.upload-zone:hover {
  border-color: var(--primary-color);
  background: rgba(37, 99, 235, 0.05);
}

.upload-zone.drag-over {
  border-color: var(--primary-color);
  background: rgba(37, 99, 235, 0.1);
}

.upload-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.upload-hint {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin: 0.5rem 0;
}
```

---

## 🚀 Ordre de création recommandé

1. ✅ LoginComponent (fait)
2. ✅ LayoutComponent (fait)
3. ✅ ForbiddenComponent (fait)
4. **DashboardComponent** - Vue d'ensemble essentielle
5. **SitesListComponent** - Gestion de base
6. **SiteDetailComponent** - Détails et actions
7. **GroupsListComponent** - Gestion groupes
8. **GroupDetailComponent** - Détails groupe
9. **ContentManagementComponent** - Fonctionnalité avancée
10. **UpdatesManagementComponent** - Fonctionnalité avancée

---

## 📝 Notes importantes

- **Tous les services sont prêts** : utilisez directement `sitesService`, `groupsService`, etc.
- **WebSocket temps réel** : écoutez `socketService.events$` pour les mises à jour
- **Routing configuré** : les routes lazy-load sont déjà définies
- **Types TypeScript** : tous les models sont dans `core/models/index.ts`

Le dashboard est **100% fonctionnel** une fois ces composants créés !
