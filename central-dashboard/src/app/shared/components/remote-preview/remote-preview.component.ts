import { Component, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SiteConfiguration, CategoryConfig, LocalVideo } from '../../../core/models';

interface TimeCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

interface VideoItem {
  name: string;
  path: string;
  category?: string;
}

@Component({
  selector: 'app-remote-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="remote-preview">
      <div class="preview-header">
        <h4>
          <span class="section-icon">📱</span>
          Aperçu télécommande
        </h4>
        <p class="section-desc">Ce que le club verra sur son téléphone</p>
      </div>

      <!-- Mockup téléphone -->
      <div class="phone-mockup">
        <div class="phone-frame">
          <div class="phone-notch"></div>
          <div class="phone-screen">
            <!-- Header de l'app -->
            <div class="app-header">
              <div class="header-left">
                <span class="header-title">{{ config?.remote?.title || 'Télécommande' }}</span>
                <span class="header-club">{{ config?.auth?.clubName || 'Mon Club' }}</span>
              </div>
              <div class="header-right">
                <!-- Dropdown phase intégré comme sur /remote -->
                <select
                  class="phase-dropdown"
                  [(ngModel)]="selectedPhase"
                  (ngModelChange)="onPhaseChange($event)"
                >
                  <option *ngFor="let phase of phases" [value]="phase.id">
                    {{ phase.icon }} {{ phase.name }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Contenu de l'app -->
            <div class="app-content">
              <!-- Vue Home -->
              <div class="view-home" *ngIf="currentView === 'home'">
                <!-- Vidéo de boucle active -->
                <div class="section loop-section" *ngIf="currentLoopVideoCount > 0">
                  <div class="loop-banner">
                    <div class="loop-info">
                      <span class="loop-badge">🔄 En boucle ({{ currentLoopVideoCount }} vidéo{{ currentLoopVideoCount > 1 ? 's' : '' }})</span>
                      <span class="loop-name">{{ currentLoopVideoName }}</span>
                    </div>
                    <div class="loop-phase">{{ getPhaseLabel(selectedPhase) }}</div>
                  </div>
                </div>

                <!-- Vidéos récentes -->
                <div class="section recent-section" *ngIf="getRecentVideos().length > 0">
                  <div class="section-title">
                    <span class="icon">🕐</span>
                    Récemment lancées
                  </div>
                  <div class="recent-scroll">
                    <div
                      class="recent-card"
                      *ngFor="let video of getRecentVideos().slice(0, 3)"
                      [class.playing]="playingVideoPath === video.path"
                      (click)="simulatePlay(video)"
                    >
                      <div class="recent-thumb">
                        <span *ngIf="playingVideoPath !== video.path">▶</span>
                        <span *ngIf="playingVideoPath === video.path" class="playing-indicator">●</span>
                      </div>
                      <span class="recent-name">{{ video.name }}</span>
                    </div>
                  </div>
                </div>

                <!-- Action toutes les vidéos -->
                <button class="all-videos-btn" (click)="currentView = 'all-videos'">
                  <span class="btn-icon">🎬</span>
                  <div class="btn-content">
                    <span class="btn-title">Toutes les vidéos</span>
                    <span class="btn-count">{{ getTotalVideos() }} disponibles</span>
                  </div>
                  <span class="btn-arrow">›</span>
                </button>

                <!-- Catégories par temps -->
                <div class="section">
                  <div class="section-title">
                    <span class="icon">📚</span>
                    Organisation par temps
                  </div>
                  <div class="time-categories-grid">
                    <button
                      class="time-card"
                      *ngFor="let tc of timeCategories"
                      [class]="'time-card-' + tc.id"
                      (click)="selectTimeCategory(tc)"
                    >
                      <div class="time-card-header">
                        <span class="time-icon">{{ tc.icon }}</span>
                        <span class="time-arrow">›</span>
                      </div>
                      <div class="time-card-title">{{ tc.name }}</div>
                      <div class="time-card-desc">{{ tc.description }}</div>
                      <div class="time-card-stats">
                        {{ getCategoriesForTime(tc.id).length }} catégories •
                        {{ getVideosForTime(tc.id) }} vidéos
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Vue Catégories d'un temps -->
              <div class="view-categories" *ngIf="currentView === 'time-categories'">
                <div class="view-header">
                  <button class="back-btn" (click)="currentView = 'home'">‹</button>
                  <span class="view-title">{{ selectedTimeCategory?.name }}</span>
                </div>
                <div class="categories-list">
                  <button
                    class="category-card"
                    *ngFor="let cat of getCategoriesForTime(selectedTimeCategory?.id || '')"
                    (click)="selectCategory(cat)"
                  >
                    <span class="cat-icon">📁</span>
                    <div class="cat-info">
                      <span class="cat-name">{{ cat.name }}</span>
                      <span class="cat-count">{{ getVideoCountForCategory(cat) }} vidéos</span>
                    </div>
                    <span class="cat-arrow">›</span>
                  </button>
                  <div class="empty-state" *ngIf="getCategoriesForTime(selectedTimeCategory?.id || '').length === 0">
                    <span class="empty-icon">📂</span>
                    <span class="empty-text">Aucune catégorie</span>
                  </div>
                </div>
              </div>

              <!-- Vue Vidéos d'une catégorie -->
              <div class="view-videos" *ngIf="currentView === 'category-videos'">
                <div class="view-header">
                  <button class="back-btn" (click)="currentView = 'time-categories'">‹</button>
                  <span class="view-title">{{ selectedCategory?.name }}</span>
                </div>
                <div class="videos-list">
                  <button
                    class="video-card"
                    *ngFor="let video of getVideosForCategory(selectedCategory)"
                    [class.playing]="playingVideoPath === video.path"
                    (click)="simulatePlay(video)"
                  >
                    <div class="video-thumb">
                      <span *ngIf="playingVideoPath !== video.path">▶</span>
                      <span *ngIf="playingVideoPath === video.path" class="playing-indicator">●</span>
                    </div>
                    <div class="video-info">
                      <span class="video-name">{{ video.name }}</span>
                      <span class="video-cat">{{ selectedCategory?.name }}</span>
                    </div>
                    <span class="video-play" *ngIf="playingVideoPath !== video.path">▶</span>
                    <span class="video-playing-badge" *ngIf="playingVideoPath === video.path">En cours</span>
                  </button>
                  <div class="empty-state" *ngIf="getVideosForCategory(selectedCategory).length === 0">
                    <span class="empty-icon">🎬</span>
                    <span class="empty-text">Aucune vidéo</span>
                  </div>
                </div>
              </div>

              <!-- Vue Toutes les vidéos -->
              <div class="view-all-videos" *ngIf="currentView === 'all-videos'">
                <div class="view-header">
                  <button class="back-btn" (click)="currentView = 'home'">‹</button>
                  <span class="view-title">Toutes les vidéos</span>
                </div>
                <div class="videos-list">
                  <button
                    class="video-card"
                    *ngFor="let video of getAllVideos().slice(0, 10)"
                    [class.playing]="playingVideoPath === video.path"
                    (click)="simulatePlay(video)"
                  >
                    <div class="video-thumb">
                      <span *ngIf="playingVideoPath !== video.path">▶</span>
                      <span *ngIf="playingVideoPath === video.path" class="playing-indicator">●</span>
                    </div>
                    <div class="video-info">
                      <span class="video-name">{{ video.name }}</span>
                      <span class="video-cat">{{ video.category || 'Sans catégorie' }}</span>
                    </div>
                    <span class="video-play" *ngIf="playingVideoPath !== video.path">▶</span>
                    <span class="video-playing-badge" *ngIf="playingVideoPath === video.path">En cours</span>
                  </button>
                  <div class="more-indicator" *ngIf="getAllVideos().length > 10">
                    +{{ getAllVideos().length - 10 }} autres vidéos...
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .remote-preview {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .preview-header h4 {
      margin: 0 0 0.25rem 0;
      font-size: 1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .section-icon { font-size: 1.125rem; }

    .section-desc {
      margin: 0;
      font-size: 0.8125rem;
      color: #64748b;
    }

    .phone-mockup {
      display: flex;
      justify-content: center;
      padding: 1rem;
      background: #f8fafc;
      border-radius: 12px;
    }

    .phone-frame {
      width: 280px;
      height: 520px;
      background: #1e293b;
      border-radius: 32px;
      padding: 8px;
      position: relative;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }

    .phone-notch {
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      width: 100px;
      height: 24px;
      background: #1e293b;
      border-radius: 0 0 12px 12px;
      z-index: 10;
    }

    .phone-screen {
      width: 100%;
      height: 100%;
      background: #0f172a;
      border-radius: 24px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 32px 12px 8px 12px;
      background: linear-gradient(to bottom, rgba(15, 23, 42, 1), rgba(15, 23, 42, 0.8));
    }

    .header-left { display: flex; flex-direction: column; }
    .header-title { font-size: 0.875rem; font-weight: 600; color: white; }
    .header-club { font-size: 0.625rem; color: #94a3b8; }
    .header-right { display: flex; align-items: center; gap: 0.5rem; }

    .phase-dropdown {
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      font-size: 0.625rem;
      font-weight: 500;
      background: #334155;
      color: white;
      border: 1px solid #475569;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 4px center;
      padding-right: 18px;
    }

    .phase-dropdown:focus { outline: none; border-color: #3b82f6; }
    .phase-dropdown option { background: #1e293b; color: white; }

    .app-content { flex: 1; overflow-y: auto; padding: 8px; }
    .section { margin-bottom: 12px; }

    .section-title {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.6875rem;
      font-weight: 600;
      color: #94a3b8;
      margin-bottom: 6px;
      padding-left: 4px;
    }

    .section-title .icon { font-size: 0.75rem; }

    .loop-banner {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .loop-info { display: flex; flex-direction: column; gap: 2px; }
    .loop-badge { font-size: 0.5rem; color: rgba(255, 255, 255, 0.8); }

    .loop-name {
      font-size: 0.6875rem;
      font-weight: 600;
      color: white;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .loop-phase {
      font-size: 0.5rem;
      padding: 0.25rem 0.5rem;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      color: white;
    }

    .recent-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }

    .recent-card {
      flex-shrink: 0;
      width: 70px;
      background: #1e293b;
      border-radius: 8px;
      padding: 8px;
      text-align: center;
      cursor: pointer;
      transition: all 0.15s;
    }

    .recent-card:hover { background: #334155; }
    .recent-card.playing { background: #1e40af; box-shadow: 0 0 12px rgba(59, 130, 246, 0.4); }

    .recent-thumb {
      width: 100%;
      height: 36px;
      background: #334155;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      color: #94a3b8;
      margin-bottom: 4px;
    }

    .recent-card.playing .recent-thumb { background: rgba(255, 255, 255, 0.2); }

    .playing-indicator { color: #22c55e; animation: pulse 1s ease-in-out infinite; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .recent-name { font-size: 0.5rem; color: white; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .all-videos-btn {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      border: none;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 12px;
      cursor: pointer;
      text-align: left;
    }

    .all-videos-btn .btn-icon { font-size: 1rem; }
    .all-videos-btn .btn-content { flex: 1; display: flex; flex-direction: column; }
    .all-videos-btn .btn-title { font-size: 0.75rem; font-weight: 600; color: white; }
    .all-videos-btn .btn-count { font-size: 0.5625rem; color: rgba(255, 255, 255, 0.7); }
    .all-videos-btn .btn-arrow { font-size: 1rem; color: rgba(255, 255, 255, 0.7); }

    .time-categories-grid { display: flex; flex-direction: column; gap: 6px; }

    .time-card {
      width: 100%;
      background: #1e293b;
      border: none;
      border-radius: 10px;
      padding: 10px;
      cursor: pointer;
      text-align: left;
      transition: transform 0.15s;
    }

    .time-card:hover { transform: scale(1.02); }
    .time-card-before { border-left: 3px solid #f59e0b; }
    .time-card-during { border-left: 3px solid #22c55e; }
    .time-card-after { border-left: 3px solid #3b82f6; }

    .time-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .time-icon { font-size: 0.875rem; }
    .time-arrow { font-size: 0.75rem; color: #64748b; }
    .time-card-title { font-size: 0.6875rem; font-weight: 600; color: white; margin-bottom: 2px; }
    .time-card-desc { font-size: 0.5rem; color: #94a3b8; margin-bottom: 4px; }
    .time-card-stats { font-size: 0.5rem; color: #64748b; }

    .view-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #334155;
    }

    .back-btn {
      width: 24px;
      height: 24px;
      background: #334155;
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .view-title { font-size: 0.75rem; font-weight: 600; color: white; }

    .categories-list { display: flex; flex-direction: column; gap: 6px; }

    .category-card {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #1e293b;
      border: none;
      border-radius: 8px;
      padding: 10px;
      cursor: pointer;
      text-align: left;
    }

    .cat-icon { font-size: 0.875rem; }
    .cat-info { flex: 1; display: flex; flex-direction: column; }
    .cat-name { font-size: 0.6875rem; font-weight: 500; color: white; }
    .cat-count { font-size: 0.5rem; color: #94a3b8; }
    .cat-arrow { font-size: 0.75rem; color: #64748b; }

    .videos-list { display: flex; flex-direction: column; gap: 6px; }

    .video-card {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #1e293b;
      border: none;
      border-radius: 8px;
      padding: 8px;
      cursor: pointer;
      text-align: left;
    }

    .video-thumb {
      width: 40px;
      height: 28px;
      background: #334155;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.625rem;
      color: #64748b;
    }

    .video-info { flex: 1; display: flex; flex-direction: column; }
    .video-name { font-size: 0.625rem; font-weight: 500; color: white; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .video-cat { font-size: 0.5rem; color: #94a3b8; }

    .video-play {
      width: 20px;
      height: 20px;
      background: #2563eb;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.5rem;
      color: white;
    }

    .video-card.playing { background: #1e40af; box-shadow: 0 0 12px rgba(59, 130, 246, 0.4); }
    .video-card.playing .video-thumb { background: rgba(255, 255, 255, 0.2); }
    .video-card.playing .playing-indicator { color: #22c55e; }

    .video-playing-badge {
      font-size: 0.5rem;
      padding: 0.125rem 0.375rem;
      background: #22c55e;
      border-radius: 4px;
      color: white;
      font-weight: 500;
    }

    .more-indicator { text-align: center; font-size: 0.5rem; color: #64748b; padding: 8px; }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 20px;
      color: #64748b;
    }

    .empty-icon { font-size: 1.25rem; opacity: 0.5; }
    .empty-text { font-size: 0.625rem; }
  `]
})
export class RemotePreviewComponent implements OnChanges {
  @Input() config: SiteConfiguration | null = null;
  @Input() localVideos: LocalVideo[] = [];

  currentView: 'home' | 'time-categories' | 'category-videos' | 'all-videos' = 'home';
  selectedPhase: string = 'neutral';
  selectedTimeCategory: TimeCategory | null = null;
  selectedCategory: CategoryConfig | null = null;
  playingVideoPath: string | null = null;

  timeCategories: TimeCategory[] = [];
  cachedAllVideos: VideoItem[] = [];
  cachedRecentVideos: VideoItem[] = [];
  cachedTotalVideos: number = 0;
  cachedCategoriesForTime: Map<string, CategoryConfig[]> = new Map();
  cachedVideosForTime: Map<string, number> = new Map();

  readonly defaultTimeCategories: TimeCategory[] = [
    { id: 'before', name: 'Avant-match', icon: '🚩', color: 'amber', description: 'Échauffement, accueil' },
    { id: 'during', name: 'Match', icon: '▶️', color: 'green', description: 'Pendant le match' },
    { id: 'after', name: 'Après-match', icon: '🏆', color: 'blue', description: 'Célébrations, résumé' }
  ];

  readonly phases = [
    { id: 'neutral', name: 'Boucle', icon: '🔄' },
    { id: 'before', name: 'Avant', icon: '🚩' },
    { id: 'during', name: 'Match', icon: '▶️' },
    { id: 'after', name: 'Après', icon: '🏆' }
  ];

  private getDefaultIcon(id: string): string {
    const icons: Record<string, string> = { 'before': '🚩', 'during': '▶️', 'after': '🏆' };
    return icons[id] || '📁';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config'] || changes['localVideos']) {
      this.currentView = 'home';
      this.selectedTimeCategory = null;
      this.selectedCategory = null;
      this.rebuildCaches();
    }
  }

  private rebuildCaches(): void {
    if (this.config?.timeCategories && this.config.timeCategories.length > 0) {
      this.timeCategories = this.config.timeCategories.map(tc => ({
        id: tc.id,
        name: tc.name,
        icon: tc.icon || this.getDefaultIcon(tc.id),
        color: tc.color || '#2563eb',
        description: tc.description || ''
      }));
    } else {
      this.timeCategories = this.defaultTimeCategories;
    }

    this.cachedAllVideos = this.computeAllVideos();
    this.cachedRecentVideos = this.cachedAllVideos.slice(0, 5);
    this.cachedTotalVideos = this.cachedAllVideos.length;

    this.cachedCategoriesForTime.clear();
    this.cachedVideosForTime.clear();
    for (const tc of this.timeCategories) {
      const cats = this.computeCategoriesForTime(tc.id);
      this.cachedCategoriesForTime.set(tc.id, cats);
      this.cachedVideosForTime.set(tc.id, cats.reduce((sum, cat) => sum + this.getVideoCountForCategory(cat), 0));
    }
  }

  private computeAllVideos(): VideoItem[] {
    const videos: VideoItem[] = [];

    if (this.config?.categories) {
      this.config.categories.forEach(cat => {
        videos.push(...this.getVideosForCategory(cat));
      });
    }

    if (this.config?.sponsors) {
      videos.push(...this.config.sponsors.map(s => ({
        name: s.name,
        path: s.path,
        category: 'Sponsors'
      })));
    }

    const configPaths = new Set(videos.map(v => v.path));
    this.localVideos.forEach(lv => {
      if (!configPaths.has(lv.path)) {
        videos.push({
          name: lv.filename,
          path: lv.path,
          category: lv.category || 'Local'
        });
      }
    });

    return videos;
  }

  private computeCategoriesForTime(timeId: string): CategoryConfig[] {
    if (!this.config?.categories) return [];

    const timeCategory = this.config.timeCategories?.find(tc => tc.id === timeId);
    if (timeCategory && timeCategory.categoryIds?.length) {
      return this.config.categories.filter(c => timeCategory.categoryIds!.includes(c.id));
    }

    if (timeId === 'before') {
      return this.config.categories.slice(0, Math.ceil(this.config.categories.length / 3));
    }
    if (timeId === 'during') {
      return this.config.categories.slice(
        Math.ceil(this.config.categories.length / 3),
        Math.ceil(this.config.categories.length * 2 / 3)
      );
    }
    return this.config.categories.slice(Math.ceil(this.config.categories.length * 2 / 3));
  }

  getPhaseIcon(phase: string): string {
    const p = this.phases.find(ph => ph.id === phase);
    return p ? p.icon : '🔄';
  }

  selectPhase(phase: string): void {
    this.selectedPhase = phase;
    this.playingVideoPath = null;
  }

  onPhaseChange(phase: string): void {
    this.selectPhase(phase);
  }

  getPhaseLabel(phase: string): string {
    const labels: Record<string, string> = {
      'neutral': 'Boucle standard',
      'before': 'Avant-match',
      'during': 'Pendant le match',
      'after': 'Après-match'
    };
    return labels[phase] || phase;
  }

  get currentLoopVideoCount(): number {
    if (this.selectedPhase === 'neutral') {
      return this.config?.sponsors?.length ?? 0;
    }

    if (this.config?.timeCategories) {
      const tc = this.config.timeCategories.find(t => t.id === this.selectedPhase);
      if (tc?.loopVideos?.length) {
        return tc.loopVideos.length;
      }
    }

    return this.config?.sponsors?.length ?? 0;
  }

  get currentLoopVideoName(): string | null {
    if (this.selectedPhase === 'neutral') {
      if (this.config?.sponsors?.length) {
        return this.extractVideoName(this.config.sponsors[0].path);
      }
      return null;
    }

    if (this.config?.timeCategories) {
      const tc = this.config.timeCategories.find(t => t.id === this.selectedPhase);
      if (tc?.loopVideos?.length) {
        return this.extractVideoName(tc.loopVideos[0].path);
      }
    }

    if (this.config?.sponsors?.length) {
      return this.extractVideoName(this.config.sponsors[0].path);
    }

    return null;
  }

  private extractVideoName(path: string): string {
    const parts = path.split('/');
    const filename = parts[parts.length - 1];
    return filename.replace(/\.[^/.]+$/, '');
  }

  simulatePlay(video: VideoItem): void {
    if (this.playingVideoPath === video.path) {
      this.playingVideoPath = null;
    } else {
      this.playingVideoPath = video.path;
    }
  }

  selectTimeCategory(tc: TimeCategory): void {
    this.selectedTimeCategory = tc;
    this.currentView = 'time-categories';
  }

  selectCategory(cat: CategoryConfig): void {
    this.selectedCategory = cat;
    this.currentView = 'category-videos';
  }

  getCategoriesForTime(timeId: string): CategoryConfig[] {
    return this.cachedCategoriesForTime.get(timeId) || [];
  }

  getVideosForTime(timeId: string): number {
    return this.cachedVideosForTime.get(timeId) || 0;
  }

  getVideoCountForCategory(cat: CategoryConfig | null): number {
    if (!cat) return 0;
    let count = cat.videos?.length || 0;
    if (cat.subCategories) {
      count += cat.subCategories.reduce((sum, sc) => sum + (sc.videos?.length || 0), 0);
    }
    return count;
  }

  getVideosForCategory(cat: CategoryConfig | null): VideoItem[] {
    if (!cat) return [];
    const videos: VideoItem[] = [];

    if (cat.videos) {
      videos.push(...cat.videos.map(v => ({
        name: v.name,
        path: v.path,
        category: cat.name
      })));
    }

    if (cat.subCategories) {
      cat.subCategories.forEach(sc => {
        if (sc.videos) {
          videos.push(...sc.videos.map(v => ({
            name: v.name,
            path: v.path,
            category: sc.name
          })));
        }
      });
    }

    return videos;
  }

  getAllVideos(): VideoItem[] { return this.cachedAllVideos; }
  getTotalVideos(): number { return this.cachedTotalVideos; }
  getRecentVideos(): VideoItem[] { return this.cachedRecentVideos; }
}
