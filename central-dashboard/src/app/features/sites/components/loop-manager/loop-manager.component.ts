import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SiteConfiguration, LoopVideoConfig, LocalVideo, SiteSponsor } from '../../../../core/models';

interface LoopTab {
  id: string;
  name: string;
  icon: string;
  isFallback: boolean;
}

interface SponsorWeightGroup {
  sponsorId: string;
  sponsorName: string;
  weight: number;
  percentage: number;
  videoCount: number;
}

@Component({
  selector: 'app-loop-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="loop-manager">
      <!-- Header -->
      <div class="loop-manager-header">
        <h4>
          <span class="section-icon">🔄</span>
          Boucles Vidéo
        </h4>
      </div>

      <!-- Tabs -->
      <div class="loop-tabs">
        <button
          *ngFor="let tab of tabs"
          class="loop-tab"
          [class.active]="activeTab === tab.id"
          [class.fallback]="tab.isFallback"
          (click)="activeTab = tab.id"
        >
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-name">{{ tab.name }}</span>
          <span class="tab-count">{{ getVideoCount(tab.id) }} vidéo(s)</span>
          <span class="tab-tracking ok" *ngIf="!tab.isFallback && getVideoCount(tab.id) > 0">✅</span>
          <span class="tab-tracking warn" *ngIf="tab.isFallback && getVideoCount(tab.id) > 0">⚠️</span>
        </button>
      </div>

      <!-- Warning: boucle par défaut sans boucles par phase = pas d'analytics -->
      <div class="default-loop-warning" *ngIf="activeTab === 'default' && showDefaultLoopWarning()">
        <span class="default-loop-warning-icon">⚠️</span>
        <div class="default-loop-warning-content">
          <strong>Analytics désactivés</strong> — Les {{ config.sponsors.length }} vidéos de cette boucle ne génèrent pas de données de tracking.
          Déplacez-les dans les boucles par phase (avant-match / match / après-match) pour activer les analytics sponsors.
          <div class="default-loop-warning-actions">
            <button class="btn btn-sm btn-primary" (click)="distributeToAllPhases()">
              Répartir dans les 3 phases
            </button>
          </div>
        </div>
      </div>

      <!-- Contenu du tab actif : tab Défaut -->
      <div class="loop-content" *ngIf="activeTab === 'default'">
        <p class="loop-desc">
          Vidéos diffusées quand aucune boucle par phase n'est définie. <strong>Pas de tracking analytics.</strong>
        </p>
        <div class="loop-videos" *ngIf="config.sponsors && config.sponsors.length > 0">
          <div
            class="loop-video-row"
            *ngFor="let video of config.sponsors; let i = index"
            [class.neopro]="video.owner === 'neopro'"
            [class.has-error]="!video.path"
            [class.orphaned]="isOrphanedVideo(video.path)"
          >
            <span class="video-order">{{ i + 1 }}</span>
            <div class="video-fields">
              <input
                type="text"
                [(ngModel)]="video.name"
                (ngModelChange)="onChanged()"
                placeholder="Nom"
                class="video-name-input"
              />
              <select
                [(ngModel)]="video.path"
                (ngModelChange)="onChanged()"
                class="video-select"
                [class.input-error]="!video.path"
                [class.has-cloud-video]="isCloudVideo(video.path)"
              >
                <option value="">-- Sélectionner --</option>
                <optgroup *ngFor="let group of videoOptionGroups" [label]="group.icon + ' ' + group.label">
                  <option *ngFor="let v of group.videos" [value]="v.path">
                    {{ v.displayName }}{{ v.isOnPi ? '' : ' ⏳' }}
                  </option>
                </optgroup>
              </select>
              <span class="cloud-hint" *ngIf="isCloudVideo(video.path)">⏳ Sera déployée</span>
              <span class="error-hint" *ngIf="!video.path">Vidéo requise</span>
              <span class="sponsor-badge-readonly" *ngIf="getAutoDetectedSponsor(video.path) as sponsor"
                    [title]="'Associé au sponsor ' + sponsor.name + ' (onglet Sponsors)'">
                🔗 {{ sponsor.name }}
              </span>
            </div>
            <span class="video-duration" *ngIf="getVideoDuration(video.path) as dur">{{ formatDuration(dur) }}</span>
            <div class="video-owner">
              <label class="owner-radio">
                <input type="radio" [name]="'owner-default-' + i" [(ngModel)]="video.owner" value="club" (ngModelChange)="onChanged()"/>
                <span class="owner-label club">Club</span>
              </label>
              <label class="owner-radio">
                <input type="radio" [name]="'owner-default-' + i" [(ngModel)]="video.owner" value="neopro" (ngModelChange)="onChanged()"/>
                <span class="owner-label neopro">NEOPRO</span>
              </label>
            </div>
            <button class="btn-remove" (click)="removeDefaultVideo(i)">×</button>
          </div>
        </div>
        <div class="loop-empty" *ngIf="!config.sponsors || config.sponsors.length === 0">
          <p>Aucune vidéo dans la boucle par défaut</p>
        </div>
        <div class="loop-add">
          <button class="btn btn-sm btn-secondary" (click)="addDefaultVideo()">+ Ajouter</button>
        </div>
      </div>

      <!-- Contenu du tab actif : tabs Phase -->
      <div class="loop-content" *ngIf="activeTab !== 'default'">
        <ng-container *ngIf="getPhaseVideos().length > 0">
          <div class="loop-videos">
            <div
              class="loop-video-row"
              *ngFor="let video of getPhaseVideos(); let i = index"
              [class.orphaned]="isOrphanedVideo(video.path)"
            >
              <span class="video-order">{{ i + 1 }}</span>
              <div class="video-fields">
                <input
                  type="text"
                  [value]="video.name"
                  (input)="updatePhaseVideo(i, 'name', $any($event.target).value)"
                  placeholder="Nom"
                  class="video-name-input"
                />
                <select
                  class="video-select"
                  [ngModel]="video.path"
                  (ngModelChange)="updatePhaseVideo(i, 'path', $event)"
                  [class.has-cloud-video]="isCloudVideo(video.path)"
                >
                  <option value="">-- Sélectionner --</option>
                  <optgroup *ngFor="let group of videoOptionGroups" [label]="group.icon + ' ' + group.label">
                    <option *ngFor="let v of group.videos" [value]="v.path">
                      {{ v.displayName }}{{ v.isOnPi ? '' : ' ⏳' }}
                    </option>
                  </optgroup>
                </select>
                <span class="cloud-badge" *ngIf="isCloudVideo(video.path)" title="Sera déployée automatiquement">⏳</span>
                <span class="sponsor-badge-readonly" *ngIf="getAutoDetectedSponsor(video.path) as sponsor"
                      [title]="'Associé au sponsor ' + sponsor.name + ' (onglet Sponsors)'">
                  🔗 {{ sponsor.name }}
                </span>
              </div>
              <div class="weight-control-inline" *ngIf="getVideoSponsorId(video) as sid">
                <button class="weight-btn" (click)="updateSponsorWeight(sid, (video.weight || 1) - 1)" [disabled]="(video.weight || 1) <= 1">−</button>
                <span class="weight-value">×{{ video.weight || 1 }}</span>
                <button class="weight-btn" (click)="updateSponsorWeight(sid, (video.weight || 1) + 1)" [disabled]="(video.weight || 1) >= 10">+</button>
                <span class="weight-pct-inline">{{ getWeightPercentage(sid) }}%</span>
              </div>
              <span class="video-duration" *ngIf="getVideoDuration(video.path) as dur">{{ formatDuration(dur) }}</span>
              <button class="btn-remove-sm" (click)="removePhaseVideo(i)">×</button>
            </div>
          </div>
        </ng-container>

        <!-- Empty state pour la phase -->
        <div class="phase-empty" *ngIf="getPhaseVideos().length === 0">
          <span class="loop-hint">→ Utilise la boucle par défaut ({{ config.sponsors.length }} vidéos)</span>
          <div class="phase-empty-actions" *ngIf="config.sponsors.length > 0">
            <button class="btn btn-sm btn-secondary" (click)="copyDefaultToCurrentPhase()">
              Copier la boucle par défaut
            </button>
          </div>
        </div>

        <div class="loop-add">
          <button class="btn btn-sm btn-secondary" (click)="addPhaseVideo()">+ Ajouter</button>
          <button
            class="btn btn-sm btn-outline"
            *ngIf="getPhaseVideos().length > 0"
            (click)="clearCurrentPhase()"
          >
            Effacer (utiliser boucle par défaut)
          </button>
        </div>

        <!-- Prévisualisation playlist pondérée -->
        <div class="playlist-preview" *ngIf="getPlaylistPreview().length > 1">
          <div class="playlist-preview-header">
            <span class="preview-icon">📺</span>
            <span class="preview-title">Ordre de diffusion ({{ getPlaylistPreview().length }} passages)</span>
          </div>
          <div class="playlist-preview-track">
            <div
              *ngFor="let item of getPlaylistPreview(); let i = index"
              class="preview-chip"
              [style.background-color]="item.color"
              [title]="(i + 1) + '. ' + item.name + (item.sponsorName ? ' (' + item.sponsorName + ')' : '')"
            >
              <span class="preview-chip-index">{{ i + 1 }}</span>
            </div>
          </div>
          <div class="playlist-preview-legend">
            <div *ngFor="let entry of getPlaylistLegend()" class="preview-legend-item">
              <span class="preview-legend-dot" [style.background-color]="entry.color"></span>
              <span class="preview-legend-name">{{ entry.name }}</span>
              <span class="preview-legend-pct">{{ entry.percentage }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer durée totale -->
      <div class="loop-footer" *ngIf="getActiveTabTotalDuration() > 0">
        <span class="loop-total">
          Durée totale : {{ formatDuration(getActiveTabTotalDuration()) }}
          · ~{{ getRotationsPerHour() }} rotations/heure
        </span>
      </div>
    </div>
  `,
  styles: [`
    .loop-manager {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
    }

    .loop-manager-header {
      padding: 1rem 1.25rem 0;
    }

    .loop-manager-header h4 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .section-icon {
      font-size: 1.125rem;
    }

    /* Tabs */
    .loop-tabs {
      display: flex;
      gap: 0;
      padding: 0.75rem 1.25rem 0;
      border-bottom: 2px solid #e2e8f0;
    }

    .loop-tab {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.5rem 1rem;
      border: none;
      background: none;
      font-size: 0.8125rem;
      color: #64748b;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all 0.15s;
    }

    .loop-tab:hover {
      color: #334155;
      background: #f8fafc;
    }

    .loop-tab.active {
      color: #1e40af;
      border-bottom-color: #3b82f6;
      font-weight: 600;
    }

    .loop-tab.fallback {
      margin-left: auto;
      color: #92400e;
      font-size: 0.75rem;
    }

    .loop-tab.fallback.active {
      border-bottom-color: #f59e0b;
      color: #92400e;
    }

    .tab-icon {
      font-size: 0.875rem;
    }

    .tab-count {
      font-size: 0.6875rem;
      color: #94a3b8;
    }

    .loop-tab.active .tab-count {
      color: #60a5fa;
    }

    .tab-tracking {
      font-size: 0.75rem;
    }

    .tab-tracking.warn {
      font-size: 0.625rem;
    }

    /* Warning */
    .default-loop-warning {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      margin: 1rem 1.25rem 0;
      padding: 0.75rem;
      border-radius: 6px;
      font-size: 0.8125rem;
      line-height: 1.4;
      background: #fef3c7;
      border: 1px solid #fcd34d;
      color: #92400e;
    }

    .default-loop-warning-icon {
      flex-shrink: 0;
      font-size: 1rem;
    }

    .default-loop-warning-content {
      flex: 1;
    }

    .default-loop-warning-content strong {
      font-weight: 600;
    }

    .default-loop-warning-actions {
      margin-top: 0.5rem;
    }

    /* Content */
    .loop-content {
      padding: 1rem 1.25rem 1.25rem;
    }

    .loop-desc {
      font-size: 0.8125rem;
      color: #64748b;
      margin: 0 0 0.75rem;
    }

    .loop-videos {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .loop-video-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .loop-video-row.neopro {
      background: #fefce8;
      border-color: #fde047;
    }

    .loop-video-row.orphaned {
      background: #fef2f2;
      border-color: #fca5a5;
      border-left: 3px solid #dc2626;
    }

    .video-order {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e2e8f0;
      border-radius: 50%;
      font-size: 0.75rem;
      font-weight: 600;
      color: #475569;
    }

    .video-fields {
      flex: 1;
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .video-name-input {
      width: 150px;
      padding: 0.375rem 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.8125rem;
    }

    .video-select {
      flex: 1;
      padding: 0.375rem 0.5rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 0.8125rem;
    }

    .video-select.has-cloud-video {
      border-color: #f59e0b;
      background: #fffbeb;
    }

    .cloud-hint {
      font-size: 0.6875rem;
      color: #92400e;
      background: #fef3c7;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      white-space: nowrap;
    }

    .cloud-badge {
      font-size: 0.75rem;
      color: #92400e;
    }

    .sponsor-badge-readonly {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border: 1px solid #93c5fd;
      border-radius: 4px;
      font-size: 0.7rem;
      color: #1e40af;
      background: #dbeafe;
      font-weight: 600;
      white-space: nowrap;
      cursor: help;
    }

    .error-hint {
      font-size: 0.6875rem;
      color: #dc2626;
    }

    .video-owner {
      display: flex;
      gap: 0.5rem;
    }

    .owner-radio {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      cursor: pointer;
    }

    .owner-radio input {
      margin: 0;
    }

    .owner-label {
      font-size: 0.625rem;
      font-weight: 600;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
    }

    .owner-label.club {
      background: #dbeafe;
      color: #1e40af;
    }

    .owner-label.neopro {
      background: #fef3c7;
      color: #92400e;
    }

    .btn-remove, .btn-remove-sm {
      border: none;
      border-radius: 4px;
      background: #fee2e2;
      color: #dc2626;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-remove {
      width: 28px;
      height: 28px;
      font-size: 1.25rem;
    }

    .btn-remove-sm {
      width: 24px;
      height: 24px;
      font-size: 1rem;
    }

    .btn-remove:hover, .btn-remove-sm:hover {
      background: #fecaca;
    }

    /* Empty state */
    .loop-empty, .phase-empty {
      padding: 1rem;
      text-align: center;
      color: #64748b;
      font-size: 0.8125rem;
    }

    .phase-empty-actions {
      margin-top: 0.5rem;
    }

    .loop-hint {
      font-size: 0.8125rem;
      color: #64748b;
    }

    /* Add actions */
    .loop-add {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    /* Duration */
    .video-duration {
      font-size: 0.75rem;
      color: #64748b;
      min-width: 40px;
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .loop-footer {
      padding: 0.5rem 1.25rem 0.75rem;
      border-top: 1px solid #e2e8f0;
      font-size: 0.8125rem;
      color: #64748b;
    }

    .loop-total {
      font-weight: 500;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      border: 1px solid transparent;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.75rem;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }

    .btn-primary:hover {
      background: #2563eb;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
      border-color: #e2e8f0;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
    }

    .btn-outline {
      background: transparent;
      color: #64748b;
      border-color: #e2e8f0;
    }

    .btn-outline:hover {
      background: #f8fafc;
      color: #334155;
    }

    /* Inline sponsor weight controls */
    .weight-control-inline {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .weight-btn {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #93c5fd;
      border-radius: 3px;
      background: #eff6ff;
      color: #1e40af;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      padding: 0;
    }

    .weight-btn:hover:not(:disabled) {
      background: #dbeafe;
    }

    .weight-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .weight-value {
      font-size: 0.75rem;
      font-weight: 600;
      color: #1e40af;
      min-width: 20px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .weight-pct-inline {
      font-size: 0.625rem;
      color: #64748b;
      min-width: 24px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    /* Playlist preview */
    .playlist-preview {
      margin: 0.75rem 1.25rem;
      padding: 0.75rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }

    .playlist-preview-header {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      margin-bottom: 0.5rem;
    }

    .preview-icon {
      font-size: 0.875rem;
    }

    .preview-title {
      font-size: 0.6875rem;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .playlist-preview-track {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin-bottom: 0.5rem;
    }

    .preview-chip {
      width: 24px;
      height: 20px;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: default;
      transition: transform 0.1s;
    }

    .preview-chip:hover {
      transform: scale(1.2);
      z-index: 1;
    }

    .preview-chip-index {
      font-size: 0.5625rem;
      font-weight: 600;
      color: white;
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      font-variant-numeric: tabular-nums;
    }

    .playlist-preview-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.625rem;
    }

    .preview-legend-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .preview-legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .preview-legend-name {
      font-size: 0.625rem;
      color: #475569;
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .preview-legend-pct {
      font-size: 0.625rem;
      font-weight: 600;
      color: #1e40af;
      font-variant-numeric: tabular-nums;
    }
  `]
})
export class LoopManagerComponent implements OnInit, OnChanges {
  @Input() config!: SiteConfiguration;
  @Input() videoOptionGroups: { key: string; label: string; icon: string; videos: { path: string; displayName: string; isOnPi: boolean }[] }[] = [];
  @Input() cloudVideoPaths: Set<string> = new Set();
  @Input() allKnownVideoPaths: Set<string> = new Set();
  @Input() localVideos: LocalVideo[] = [];
  @Input() videoDurations: Map<string, number> = new Map();
  @Input() siteSponsors: SiteSponsor[] = [];
  @Output() configChanged = new EventEmitter<void>();

  activeTab = 'default';

  tabs: LoopTab[] = [
    { id: 'before', name: 'Avant-match', icon: '🏁', isFallback: false },
    { id: 'during', name: 'Match', icon: '▶️', isFallback: false },
    { id: 'after', name: 'Après-match', icon: '🏆', isFallback: false },
    { id: 'default', name: 'Défaut (fallback)', icon: '🔄', isFallback: true }
  ];

  ngOnInit(): void {
    this.selectDefaultTab();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      this.selectDefaultTab();
    }
  }

  private selectDefaultTab(): void {
    if (!this.config) return;
    // Si des boucles par phase existent, sélectionner la première avec du contenu
    const phases = this.config.timeCategories || [];
    const firstWithContent = phases.find(tc => tc.loopVideos && tc.loopVideos.length > 0);
    if (firstWithContent) {
      this.activeTab = firstWithContent.id;
    } else {
      this.activeTab = 'default';
    }
  }

  getVideoCount(tabId: string): number {
    if (tabId === 'default') {
      return this.config.sponsors?.length || 0;
    }
    const tc = this.config.timeCategories?.find(t => t.id === tabId);
    return tc?.loopVideos?.length || 0;
  }

  isCloudVideo(path: string): boolean {
    return this.cloudVideoPaths.has(path);
  }

  isOrphanedVideo(path: string): boolean {
    if (!path) return false;
    return this.allKnownVideoPaths.size > 0 && !this.allKnownVideoPaths.has(path);
  }

  // === Default loop ===

  showDefaultLoopWarning(): boolean {
    if (!this.config.sponsors || this.config.sponsors.length === 0) return false;
    const phases = this.config.timeCategories || [];
    return phases.every(tc => !tc.loopVideos || tc.loopVideos.length === 0);
  }

  addDefaultVideo(): void {
    if (!this.config.sponsors) {
      this.config.sponsors = [];
    }
    this.config.sponsors.push({ name: '', path: '', type: 'video/mp4', owner: 'club' });
    this.onChanged();
  }

  removeDefaultVideo(index: number): void {
    this.config.sponsors.splice(index, 1);
    this.onChanged();
  }

  distributeToAllPhases(): void {
    this.ensureTimeCategories();
    for (const tc of this.config.timeCategories!) {
      tc.loopVideos = this.config.sponsors.map(s => ({
        name: s.name,
        path: s.path,
        type: s.type || 'video/mp4'
      }));
    }
    // Garder seulement les vidéos NEOPRO dans la boucle par défaut
    this.config.sponsors = this.config.sponsors.filter(s => s.owner === 'neopro');
    this.activeTab = 'before';
    this.onChanged();
  }

  // === Phase loops ===

  getPhaseVideos(): LoopVideoConfig[] {
    const tc = this.config.timeCategories?.find(t => t.id === this.activeTab);
    return tc?.loopVideos || [];
  }

  addPhaseVideo(): void {
    this.ensureTimeCategories();
    const tc = this.config.timeCategories!.find(t => t.id === this.activeTab);
    if (!tc) return;
    if (!tc.loopVideos) {
      tc.loopVideos = [];
    }
    tc.loopVideos.push({ name: '', path: '', type: 'video/mp4' });
    this.onChanged();
  }

  updatePhaseVideo(index: number, field: 'name' | 'path', value: string): void {
    const tc = this.config.timeCategories?.find(t => t.id === this.activeTab);
    if (!tc?.loopVideos?.[index]) return;
    const video = tc.loopVideos[index];
    if (field === 'name') video.name = value;
    else if (field === 'path') video.path = value;

    // Auto-remplir le nom si on change le path et que le nom est vide
    if (field === 'path' && value && !tc.loopVideos[index].name) {
      const video = this.localVideos.find(v => v.path === value);
      tc.loopVideos[index].name = video?.filename || value.split('/').pop() || 'Vidéo';
    }

    this.onChanged();
  }

  removePhaseVideo(index: number): void {
    const tc = this.config.timeCategories?.find(t => t.id === this.activeTab);
    if (!tc?.loopVideos) return;
    tc.loopVideos.splice(index, 1);
    this.onChanged();
  }

  copyDefaultToCurrentPhase(): void {
    this.ensureTimeCategories();
    const tc = this.config.timeCategories!.find(t => t.id === this.activeTab);
    if (!tc || !this.config.sponsors) return;
    tc.loopVideos = this.config.sponsors.map(s => ({
      name: s.name,
      path: s.path,
      type: s.type || 'video/mp4'
    }));
    this.onChanged();
  }

  clearCurrentPhase(): void {
    const tc = this.config.timeCategories?.find(t => t.id === this.activeTab);
    if (!tc) return;
    tc.loopVideos = [];
    this.onChanged();
  }

  // === Sponsor weight management ===

  /**
   * Retourne le sponsor ID d'une vidéo (site_sponsor_id ou auto-détection).
   * Retourne null si pas de sponsor → pas de contrôle de poids.
   */
  getVideoSponsorId(video: LoopVideoConfig): string | null {
    return video.site_sponsor_id || this.getAutoDetectedSponsor(video.path)?.id || null;
  }

  /**
   * Calcule le % de temps d'antenne d'un sponsor dans la phase active.
   */
  getWeightPercentage(sponsorId: string): number {
    const groups = this.getSponsorGroups();
    const totalWeight = groups.reduce((sum, g) => sum + g.weight, 0);
    const group = groups.find(g => g.sponsorId === sponsorId);
    if (!group || totalWeight === 0) return 0;
    return Math.round((group.weight / totalWeight) * 100);
  }

  /**
   * Regroupe les vidéos par sponsor détecté (site_sponsor_id ou auto-détection par filename).
   * Les vidéos sans sponsor sont exclues — pas de contrôle de poids dessus.
   */
  getSponsorGroups(): SponsorWeightGroup[] {
    const videos = this.getPhaseVideos();
    if (videos.length === 0) return [];

    const groupMap = new Map<string, { name: string; weight: number; count: number }>();

    for (const video of videos) {
      // Identifier le sponsor : d'abord site_sponsor_id, sinon auto-détection par filename
      const sponsorId = video.site_sponsor_id || this.getAutoDetectedSponsor(video.path)?.id;
      if (!sponsorId) continue; // Vidéo sans sponsor → pas de pondération

      if (!groupMap.has(sponsorId)) {
        const sponsor = this.siteSponsors.find(sp => sp.id === sponsorId);
        groupMap.set(sponsorId, {
          name: sponsor?.name || video.name || video.path?.split('/').pop() || 'Sponsor',
          weight: video.weight || 1,
          count: 0,
        });
      }
      groupMap.get(sponsorId)!.count++;
    }

    const totalWeight = Array.from(groupMap.values()).reduce((sum, g) => sum + g.weight, 0);

    return Array.from(groupMap.entries()).map(([sponsorId, data]) => ({
      sponsorId,
      sponsorName: data.name,
      weight: data.weight,
      percentage: totalWeight > 0 ? Math.round((data.weight / totalWeight) * 100) : 0,
      videoCount: data.count,
    }));
  }

  updateSponsorWeight(sponsorId: string, newWeight: number): void {
    const weight = Math.max(1, Math.min(10, Math.round(newWeight)));
    const videos = this.getPhaseVideos();
    for (const video of videos) {
      // Matcher par site_sponsor_id ou auto-détection
      const videoSponsorId = video.site_sponsor_id || this.getAutoDetectedSponsor(video.path)?.id;
      if (videoSponsorId === sponsorId) {
        video.weight = weight;
      }
    }
    this.onChanged();
  }

  // === Sponsor auto-detection ===

  /**
   * Extracts the bare filename from a video path and matches it against
   * siteSponsors[].video_filenames[] to find an auto-detected sponsor.
   * Returns the SiteSponsor if found, null otherwise.
   */
  getAutoDetectedSponsor(videoPath: string): SiteSponsor | null {
    if (!videoPath || this.siteSponsors.length === 0) return null;
    const parts = videoPath.split('/');
    const bareFilename = parts[parts.length - 1] || videoPath;
    return this.siteSponsors.find(
      sp => sp.video_filenames?.includes(bareFilename)
    ) ?? null;
  }

  // === Helpers ===

  private ensureTimeCategories(): void {
    if (!this.config.timeCategories || this.config.timeCategories.length === 0) {
      this.config.timeCategories = [
        { id: 'before', name: 'Avant-match', icon: '🏁', color: '#f59e0b', description: 'Échauffement & présentation', categoryIds: [] },
        { id: 'during', name: 'Match', icon: '▶️', color: '#22c55e', description: 'Live & animations', categoryIds: [] },
        { id: 'after', name: 'Après-match', icon: '🏆', color: '#3b82f6', description: 'Résultats & remerciements', categoryIds: [] }
      ];
    }
  }

  // === Duration helpers ===

  getVideoDuration(path: string): number | null {
    return this.videoDurations.get(path) ?? null;
  }

  formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getActiveTabTotalDuration(): number {
    const videos = this.activeTab === 'default'
      ? (this.config.sponsors || [])
      : this.getPhaseVideos();
    return videos.reduce((sum, v) => sum + (this.videoDurations.get(v.path) || 0), 0);
  }

  getRotationsPerHour(): number {
    const total = this.getActiveTabTotalDuration();
    if (total <= 0) return 0;
    return Math.round(3600 / total);
  }

  // === Playlist preview (Bresenham simulation) ===

  private static readonly SPONSOR_COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  ];

  private static readonly NON_SPONSOR_COLOR = '#94a3b8';

  /**
   * Simule l'algorithme Bresenham du Pi pour afficher l'ordre de diffusion.
   * Retourne un tableau de pastilles avec couleur et nom.
   */
  getPlaylistPreview(): Array<{ name: string; sponsorName: string; color: string }> {
    const videos = this.getPhaseVideos();
    if (videos.length === 0) return [];

    // Assigner une couleur par sponsor
    const colorMap = this.buildSponsorColorMap(videos);

    // Vérifier si tous les poids sont 1 → retourner l'ordre brut
    const allDefault = videos.every(v => !v.weight || v.weight <= 1);
    if (allDefault) {
      return videos.map(v => {
        const sid = this.getVideoSponsorId(v);
        return {
          name: v.name || v.path?.split('/').pop() || 'Vidéo',
          sponsorName: sid ? (this.siteSponsors.find(sp => sp.id === sid)?.name || '') : '',
          color: sid ? (colorMap.get(sid) || LoopManagerComponent.NON_SPONSOR_COLOR) : LoopManagerComponent.NON_SPONSOR_COLOR,
        };
      });
    }

    // Bresenham smooth scheduling (même algo que le Pi)
    const entries = videos.map(v => {
      const w = v.weight && v.weight >= 1 ? Math.round(v.weight) : 1;
      const sid = this.getVideoSponsorId(v);
      return {
        video: v,
        weight: w,
        remaining: w,
        accumulator: 0,
        sponsorId: sid || v.path || '',
      };
    });

    const totalSlots = entries.reduce((sum, e) => sum + e.remaining, 0);
    const result: Array<{ name: string; sponsorName: string; color: string }> = [];
    let lastSponsorId = '';

    for (let i = 0; i < totalSlots; i++) {
      for (const entry of entries) {
        if (entry.remaining > 0) {
          entry.accumulator += entry.weight;
        }
      }

      let bestIdx = -1;
      let bestAcc = -Infinity;

      for (let j = 0; j < entries.length; j++) {
        if (entries[j].remaining <= 0) continue;
        if (entries[j].sponsorId === lastSponsorId && entries.some(e => e.remaining > 0 && e.sponsorId !== lastSponsorId)) continue;
        if (entries[j].accumulator > bestAcc) {
          bestAcc = entries[j].accumulator;
          bestIdx = j;
        }
      }

      if (bestIdx === -1) {
        bestIdx = entries.findIndex(e => e.remaining > 0);
      }

      const picked = entries[bestIdx];
      const sid = picked.sponsorId;
      result.push({
        name: picked.video.name || picked.video.path?.split('/').pop() || 'Vidéo',
        sponsorName: sid ? (this.siteSponsors.find(sp => sp.id === sid)?.name || '') : '',
        color: sid ? (colorMap.get(sid) || LoopManagerComponent.NON_SPONSOR_COLOR) : LoopManagerComponent.NON_SPONSOR_COLOR,
      });
      picked.remaining--;
      picked.accumulator -= totalSlots;
      lastSponsorId = picked.sponsorId;
    }

    return result;
  }

  /**
   * Légende des sponsors pour la preview.
   */
  getPlaylistLegend(): Array<{ name: string; color: string; percentage: number }> {
    const preview = this.getPlaylistPreview();
    if (preview.length === 0) return [];

    const countMap = new Map<string, { name: string; color: string; count: number }>();
    for (const item of preview) {
      const key = item.color;
      if (!countMap.has(key)) {
        countMap.set(key, { name: item.sponsorName || item.name, color: item.color, count: 0 });
      }
      countMap.get(key)!.count++;
    }

    return Array.from(countMap.values()).map(entry => ({
      name: entry.name,
      color: entry.color,
      percentage: Math.round((entry.count / preview.length) * 100),
    }));
  }

  private buildSponsorColorMap(videos: LoopVideoConfig[]): Map<string, string> {
    const colorMap = new Map<string, string>();
    let colorIdx = 0;
    for (const video of videos) {
      const sid = this.getVideoSponsorId(video);
      if (sid && !colorMap.has(sid)) {
        colorMap.set(sid, LoopManagerComponent.SPONSOR_COLORS[colorIdx % LoopManagerComponent.SPONSOR_COLORS.length]);
        colorIdx++;
      }
    }
    return colorMap;
  }

  onChanged(): void {
    this.configChanged.emit();
  }
}
