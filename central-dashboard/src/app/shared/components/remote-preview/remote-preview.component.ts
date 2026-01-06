import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SiteConfiguration, CategoryConfig, LocalVideo } from '../../../core/models';

interface PhasePreview {
  id: string;
  name: string;
  icon: string;
  loopVideosCount: number;
  usesDefault: boolean;
  categories: CategoryConfig[];
}

interface ValidationAlert {
  type: 'error' | 'warning';
  message: string;
}

@Component({
  selector: 'app-remote-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="remote-preview">
      <div class="preview-header">
        <span class="preview-icon">📱</span>
        <span class="preview-title">Aperçu Télécommande</span>
        <span class="preview-subtitle">Ce que le club verra sur /remote</span>
      </div>

      <div class="preview-content">
        <!-- Phases -->
        <div class="phases-grid">
          <div
            class="phase-card"
            *ngFor="let phase of phases"
            [class.active]="selectedPhase === phase.id"
            (click)="selectedPhase = phase.id"
          >
            <div class="phase-header">
              <span class="phase-icon">{{ phase.icon }}</span>
              <span class="phase-name">{{ phase.name }}</span>
            </div>
            <div class="phase-details">
              <div class="phase-loop">
                <span class="loop-icon">🔄</span>
                <span *ngIf="phase.usesDefault">Boucle par défaut ({{ defaultLoopCount }} vidéos)</span>
                <span *ngIf="!phase.usesDefault">Boucle custom ({{ phase.loopVideosCount }} vidéos)</span>
              </div>
              <div class="phase-categories">
                <span class="cat-count">{{ phase.categories.length }} catégories</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Détail de la phase sélectionnée -->
        <div class="selected-phase-detail" *ngIf="getSelectedPhase() as phase">
          <h4>📁 Catégories visibles en phase "{{ phase.name }}"</h4>
          <div class="categories-preview">
            <div
              class="category-preview-item"
              *ngFor="let cat of phase.categories"
              [class.neopro]="cat.owner === 'neopro'"
            >
              <span class="cat-icon">📂</span>
              <span class="cat-name">{{ cat.name || '(Sans nom)' }}</span>
              <span class="cat-videos">{{ getCategoryVideoCount(cat) }} vidéos</span>
              <span class="cat-owner" *ngIf="cat.owner === 'neopro'">🔒</span>
            </div>
            <div class="empty-categories" *ngIf="phase.categories.length === 0">
              Aucune catégorie assignée à cette phase
            </div>
          </div>
        </div>

        <!-- Alertes de validation -->
        <div class="validation-alerts" *ngIf="alerts.length > 0">
          <div
            class="alert"
            *ngFor="let alert of alerts"
            [class.error]="alert.type === 'error'"
            [class.warning]="alert.type === 'warning'"
          >
            <span class="alert-icon">{{ alert.type === 'error' ? '❌' : '⚠️' }}</span>
            <span class="alert-message">{{ alert.message }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .remote-preview {
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      border-radius: 12px;
      overflow: hidden;
      color: white;
    }

    .preview-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .preview-icon {
      font-size: 1.25rem;
    }

    .preview-title {
      font-weight: 600;
      font-size: 1rem;
    }

    .preview-subtitle {
      margin-left: auto;
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.6);
    }

    .preview-content {
      padding: 1rem;
    }

    .phases-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .phase-card {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 0.75rem;
      cursor: pointer;
      transition: all 0.2s;
      border: 2px solid transparent;
    }

    .phase-card:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .phase-card.active {
      background: rgba(37, 99, 235, 0.3);
      border-color: #2563eb;
    }

    .phase-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .phase-icon {
      font-size: 1.25rem;
    }

    .phase-name {
      font-weight: 600;
      font-size: 0.875rem;
    }

    .phase-details {
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.7);
    }

    .phase-loop {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-bottom: 0.25rem;
    }

    .loop-icon {
      font-size: 0.75rem;
    }

    .phase-categories .cat-count {
      color: rgba(255, 255, 255, 0.5);
    }

    .selected-phase-detail {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }

    .selected-phase-detail h4 {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .categories-preview {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .category-preview-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      font-size: 0.8125rem;
    }

    .category-preview-item.neopro {
      background: rgba(234, 179, 8, 0.2);
    }

    .cat-icon {
      font-size: 1rem;
    }

    .cat-name {
      flex: 1;
    }

    .cat-videos {
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.75rem;
    }

    .cat-owner {
      font-size: 0.75rem;
    }

    .empty-categories {
      text-align: center;
      color: rgba(255, 255, 255, 0.4);
      font-size: 0.8125rem;
      padding: 1rem;
    }

    .validation-alerts {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .alert {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      font-size: 0.8125rem;
    }

    .alert.error {
      background: rgba(239, 68, 68, 0.2);
      color: #fca5a5;
    }

    .alert.warning {
      background: rgba(245, 158, 11, 0.2);
      color: #fcd34d;
    }

    .alert-icon {
      font-size: 0.875rem;
    }
  `]
})
export class RemotePreviewComponent implements OnChanges {
  @Input() config!: SiteConfiguration;
  @Input() localVideos: LocalVideo[] = [];

  phases: PhasePreview[] = [];
  selectedPhase: string = 'before';
  alerts: ValidationAlert[] = [];
  defaultLoopCount: number = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config'] || changes['localVideos']) {
      this.buildPreview();
      this.validateConfig();
    }
  }

  private buildPreview(): void {
    if (!this.config) return;

    this.defaultLoopCount = this.config.sponsors?.length || 0;

    // Build phases from timeCategories
    this.phases = (this.config.timeCategories || []).map(tc => {
      const assignedCategories = this.config.categories?.filter(
        cat => tc.categoryIds?.includes(cat.id)
      ) || [];

      return {
        id: tc.id,
        name: tc.name,
        icon: tc.icon || this.getDefaultIcon(tc.id),
        loopVideosCount: tc.loopVideos?.length || 0,
        usesDefault: !tc.loopVideos?.length,
        categories: assignedCategories
      };
    });

    // Default phases if no timeCategories defined
    if (this.phases.length === 0) {
      this.phases = [
        { id: 'before', name: 'Avant-match', icon: '⏰', loopVideosCount: 0, usesDefault: true, categories: this.config.categories || [] },
        { id: 'during', name: 'Match', icon: '⚽', loopVideosCount: 0, usesDefault: true, categories: this.config.categories || [] },
        { id: 'after', name: 'Après-match', icon: '🎉', loopVideosCount: 0, usesDefault: true, categories: this.config.categories || [] }
      ];
    }

    // Select first phase by default
    if (this.phases.length > 0 && !this.phases.find(p => p.id === this.selectedPhase)) {
      this.selectedPhase = this.phases[0].id;
    }
  }

  private getDefaultIcon(phaseId: string): string {
    const icons: Record<string, string> = {
      'before': '⏰',
      'during': '⚽',
      'after': '🎉',
      'neutral': '📺'
    };
    return icons[phaseId] || '📺';
  }

  private validateConfig(): void {
    this.alerts = [];

    if (!this.config) return;

    // Check for missing videos
    const localPaths = new Set(this.localVideos.map(v => v.path));

    // Check sponsors
    const missingSponsors = (this.config.sponsors || []).filter(
      s => s.path && !localPaths.has(s.path)
    );
    if (missingSponsors.length > 0) {
      this.alerts.push({
        type: 'error',
        message: `${missingSponsors.length} vidéo(s) de boucle introuvable(s) sur le Pi`
      });
    }

    // Check categories for missing videos
    let missingCategoryVideos = 0;
    for (const cat of this.config.categories || []) {
      for (const video of cat.videos || []) {
        if (video.path && !localPaths.has(video.path)) {
          missingCategoryVideos++;
        }
      }
      for (const subcat of cat.subCategories || []) {
        for (const video of subcat.videos || []) {
          if (video.path && !localPaths.has(video.path)) {
            missingCategoryVideos++;
          }
        }
      }
    }
    if (missingCategoryVideos > 0) {
      this.alerts.push({
        type: 'error',
        message: `${missingCategoryVideos} vidéo(s) de catégorie introuvable(s) sur le Pi`
      });
    }

    // Check for empty categories
    const emptyCategories = (this.config.categories || []).filter(
      cat => (cat.videos?.length || 0) === 0 && (cat.subCategories?.length || 0) === 0
    );
    if (emptyCategories.length > 0) {
      this.alerts.push({
        type: 'warning',
        message: `${emptyCategories.length} catégorie(s) vide(s)`
      });
    }

    // Check for unassigned categories
    const assignedIds = new Set<string>();
    for (const tc of this.config.timeCategories || []) {
      for (const id of tc.categoryIds || []) {
        assignedIds.add(id);
      }
    }
    const unassigned = (this.config.categories || []).filter(
      cat => !assignedIds.has(cat.id)
    );
    if (unassigned.length > 0 && (this.config.timeCategories?.length || 0) > 0) {
      this.alerts.push({
        type: 'warning',
        message: `${unassigned.length} catégorie(s) non assignée(s) à une phase`
      });
    }

    // Check if default loop is empty
    if (this.defaultLoopCount === 0) {
      this.alerts.push({
        type: 'warning',
        message: 'Boucle par défaut vide (aucune vidéo)'
      });
    }
  }

  getSelectedPhase(): PhasePreview | undefined {
    return this.phases.find(p => p.id === this.selectedPhase);
  }

  getCategoryVideoCount(cat: CategoryConfig): number {
    let count = cat.videos?.length || 0;
    for (const subcat of cat.subCategories || []) {
      count += subcat.videos?.length || 0;
    }
    return count;
  }
}
