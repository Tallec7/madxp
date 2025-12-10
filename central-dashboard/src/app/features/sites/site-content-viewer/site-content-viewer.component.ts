import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SitesService } from '../../../core/services/sites.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SiteConfiguration, CategoryConfig, VideoConfig } from '../../../core/models/site-config.model';

interface LocalContentResponse {
  siteId: string;
  siteName: string;
  clubName: string;
  hasContent: boolean;
  lastSync: Date | null;
  configHash: string | null;
  configuration: SiteConfiguration | null;
}

@Component({
  selector: 'app-site-content-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="content-viewer">
      <div class="content-header">
        <h3>Contenu local du boitier</h3>
        <button class="btn btn-secondary" (click)="loadContent()" [disabled]="loading">
          {{ loading ? 'Chargement...' : 'Actualiser' }}
        </button>
      </div>

      <div class="loading" *ngIf="loading">
        <div class="spinner"></div>
        <p>Chargement du contenu...</p>
      </div>

      <div class="no-content" *ngIf="!loading && !hasContent">
        <div class="no-content-icon">📭</div>
        <p>Aucune synchronisation de contenu effectuée</p>
        <p class="hint">Le contenu sera synchronisé automatiquement lorsque le boitier sera connecté</p>
      </div>

      <div class="content-body" *ngIf="!loading && hasContent && configuration">
        <div class="sync-info">
          <div class="info-item">
            <span class="label">Dernière sync:</span>
            <span class="value">{{ formatLastSync(lastSync) }}</span>
          </div>
          <div class="info-item">
            <span class="label">Hash:</span>
            <code class="hash">{{ configHash }}</code>
          </div>
          <div class="info-item">
            <span class="label">Version config:</span>
            <span class="value">{{ configuration.version || 'N/A' }}</span>
          </div>
        </div>

        <div class="categories-list">
          <div class="category-card" *ngFor="let category of configuration.categories"
               [class.locked]="isLocked(category)">
            <div class="category-header">
              <div class="category-title">
                <span class="lock-icon" *ngIf="isLocked(category)" title="Contenu NEOPRO">🔒</span>
                <span class="owner-badge" [class]="category.owner || 'club'">
                  {{ category.owner === 'neopro' ? 'NEOPRO' : 'CLUB' }}
                </span>
                <h4>{{ category.name }}</h4>
              </div>
              <span class="video-count">{{ getTotalVideos(category) }} vidéo(s)</span>
            </div>

            <div class="category-content">
              <!-- Videos directes -->
              <div class="videos-section" *ngIf="category.videos?.length">
                <div class="video-item" *ngFor="let video of category.videos"
                     [class.locked]="video.locked">
                  <span class="video-icon">🎬</span>
                  <div class="video-info">
                    <span class="video-name">{{ video.name }}</span>
                    <span class="video-path">{{ video.path }}</span>
                  </div>
                  <span class="video-lock" *ngIf="video.locked">🔒</span>
                </div>
              </div>

              <!-- Sous-catégories -->
              <div class="subcategories" *ngIf="category.subCategories?.length">
                <div class="subcategory" *ngFor="let sub of category.subCategories"
                     [class.locked]="sub.locked">
                  <div class="subcategory-header">
                    <span class="lock-icon-small" *ngIf="sub.locked">🔒</span>
                    <span class="subcategory-name">{{ sub.name }}</span>
                    <span class="video-count-small">{{ (sub.videos && sub.videos.length) || 0 }}</span>
                  </div>
                  <div class="subcategory-videos" *ngIf="sub.videos?.length">
                    <div class="video-item small" *ngFor="let video of sub.videos"
                         [class.locked]="video.locked">
                      <span class="video-icon">🎬</span>
                      <span class="video-name">{{ video.name }}</span>
                      <span class="video-lock" *ngIf="video.locked">🔒</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="empty-category" *ngIf="!category.videos?.length && !category.subCategories?.length">
                <span class="empty-icon">📂</span>
                <span>Catégorie vide</span>
              </div>
            </div>
          </div>
        </div>

        <div class="no-categories" *ngIf="!configuration.categories?.length">
          <p>Aucune catégorie configurée</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .content-viewer {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
    }

    .content-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid #e2e8f0;
    }

    .content-header h3 {
      margin: 0;
      font-size: 1.125rem;
      color: #0f172a;
    }

    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }

    .btn-secondary {
      background: #e2e8f0;
      color: #475569;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #cbd5e1;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 3rem;
      color: #64748b;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .no-content {
      text-align: center;
      padding: 3rem;
      color: #64748b;
    }

    .no-content-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .no-content .hint {
      font-size: 0.875rem;
      color: #94a3b8;
      margin-top: 0.5rem;
    }

    .sync-info {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
      margin-bottom: 1.5rem;
    }

    .info-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .info-item .label {
      font-weight: 500;
      color: #64748b;
      font-size: 0.875rem;
    }

    .info-item .value {
      color: #0f172a;
    }

    .hash {
      background: #e2e8f0;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: monospace;
    }

    .categories-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .category-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }

    .category-card.locked {
      border-left: 3px solid #f59e0b;
    }

    .category-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    .category-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .category-title h4 {
      margin: 0;
      font-size: 1rem;
      color: #0f172a;
    }

    .lock-icon {
      font-size: 0.875rem;
    }

    .owner-badge {
      font-size: 0.625rem;
      font-weight: 700;
      padding: 0.125rem 0.5rem;
      border-radius: 10px;
      text-transform: uppercase;
    }

    .owner-badge.neopro {
      background: #fef3c7;
      color: #92400e;
    }

    .owner-badge.club {
      background: #dcfce7;
      color: #166534;
    }

    .video-count {
      font-size: 0.875rem;
      color: #64748b;
    }

    .category-content {
      padding: 1rem;
    }

    .videos-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .video-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem;
      background: #f8fafc;
      border-radius: 6px;
      transition: background 0.2s;
    }

    .video-item:hover {
      background: #f1f5f9;
    }

    .video-item.locked {
      border-left: 2px solid #f59e0b;
    }

    .video-item.small {
      padding: 0.375rem 0.5rem;
      font-size: 0.875rem;
    }

    .video-icon {
      font-size: 1rem;
    }

    .video-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .video-name {
      color: #0f172a;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .video-path {
      font-size: 0.75rem;
      color: #94a3b8;
      font-family: monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .video-lock {
      font-size: 0.75rem;
    }

    .subcategories {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }

    .subcategory {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }

    .subcategory.locked {
      border-left: 2px solid #f59e0b;
    }

    .subcategory-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #f1f5f9;
      border-bottom: 1px solid #e2e8f0;
    }

    .lock-icon-small {
      font-size: 0.75rem;
    }

    .subcategory-name {
      flex: 1;
      font-weight: 500;
      font-size: 0.875rem;
      color: #334155;
    }

    .video-count-small {
      font-size: 0.75rem;
      color: #94a3b8;
      background: white;
      padding: 0.125rem 0.5rem;
      border-radius: 10px;
    }

    .subcategory-videos {
      padding: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .empty-category {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #94a3b8;
      font-size: 0.875rem;
      padding: 1rem;
    }

    .no-categories {
      text-align: center;
      padding: 2rem;
      color: #64748b;
    }
  `]
})
export class SiteContentViewerComponent implements OnInit {
  @Input() siteId!: string;

  private readonly sitesService = inject(SitesService);
  private readonly notificationService = inject(NotificationService);

  loading = false;
  hasContent = false;
  lastSync: Date | null = null;
  configHash: string | null = null;
  configuration: SiteConfiguration | null = null;

  ngOnInit(): void {
    this.loadContent();
  }

  loadContent(): void {
    this.loading = true;
    this.sitesService.getLocalContent(this.siteId).subscribe({
      next: (response: LocalContentResponse) => {
        this.hasContent = response.hasContent;
        this.lastSync = response.lastSync;
        this.configHash = response.configHash;
        this.configuration = response.configuration;
        this.loading = false;
      },
      error: (error: { error?: { error?: string }; message: string }) => {
        this.notificationService.error('Erreur: ' + (error.error?.error || error.message));
        this.loading = false;
      }
    });
  }

  isLocked(item: CategoryConfig | VideoConfig | { locked?: boolean }): boolean {
    if (!item) return false;
    if ('locked' in item && item.locked) return true;
    if ('owner' in item && (item as CategoryConfig).owner === 'neopro') return true;
    return false;
  }

  getTotalVideos(category: CategoryConfig): number {
    let count = category.videos?.length || 0;
    if (category.subCategories) {
      for (const sub of category.subCategories) {
        count += sub.videos?.length || 0;
      }
    }
    return count;
  }

  formatLastSync(date: Date | null): string {
    if (!date) return 'Jamais';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffMins < 1440) return `Il y a ${Math.floor(diffMins / 60)}h`;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
