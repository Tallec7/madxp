import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SitesService } from '../../../../core/services/sites.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { LoggerService } from '../../../../core/services/logger.service';
import { ErrorExtractor } from '../../../../core/utils/error-extractor';
import { LocalVideo, LocalStorage } from '../../../../core/models';

@Component({
  selector: 'app-site-debug-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="debug-tab">
      <!-- Fichiers sur le Pi -->
      <div class="debug-card">
        <div class="debug-header" (click)="showFiles = !showFiles">
          <span class="expand-icon">{{ showFiles ? '▼' : '▶' }}</span>
          <span class="debug-icon">📂</span>
          <h4>Fichiers sur le Pi</h4>
          <span class="debug-stats" *ngIf="localVideos.length > 0">
            {{ localVideos.length }} fichiers | {{ formatBytes(getTotalSize()) }}
          </span>
        </div>

        <div class="debug-content" *ngIf="showFiles">
          <div class="storage-bar" *ngIf="localStorage">
            <div class="storage-info">
              <span>{{ formatBytes(localStorage.used) }} utilisé sur {{ formatBytes(localStorage.total) }}</span>
              <span>{{ formatBytes(localStorage.free) }} libre</span>
            </div>
            <div class="storage-progress">
              <div class="storage-fill" [style.width.%]="getStoragePercent()"></div>
            </div>
          </div>

          <div class="files-list" *ngIf="localVideos.length > 0">
            <div class="file-row header">
              <span class="file-name">Fichier</span>
              <span class="file-category">Catégorie</span>
              <span class="file-size">Taille</span>
            </div>
            <div class="file-row" *ngFor="let video of localVideos">
              <span class="file-name" [title]="video.path">{{ video.filename }}</span>
              <span class="file-category">{{ video.category || '-' }}</span>
              <span class="file-size">{{ formatBytes(video.size) }}</span>
            </div>
          </div>
          <p class="empty-hint" *ngIf="localVideos.length === 0">
            Aucun fichier synchronisé. Le boîtier doit être connecté pour remonter sa liste de fichiers.
          </p>

          <div class="sync-info" *ngIf="lastVideoSync">
            <span class="sync-label">Dernière synchronisation:</span>
            <span class="sync-value">{{ lastVideoSync | date:'dd/MM/yyyy HH:mm' }}</span>
          </div>
        </div>
      </div>

      <!-- Test lecture vidéo -->
      <div class="debug-card">
        <div class="debug-header">
          <span class="debug-icon">🎬</span>
          <h4>Tester la lecture</h4>
        </div>
        <div class="debug-content always-visible">
          <div class="play-controls">
            <select [(ngModel)]="selectedVideoPath" class="form-select">
              <option value="">-- Choisir une vidéo --</option>
              <optgroup *ngFor="let cat of getVideoCategories()" [label]="cat || 'Sans catégorie'">
                <option *ngFor="let video of getVideosByCategory(cat)" [value]="video.path">
                  {{ video.filename }}
                </option>
              </optgroup>
            </select>
            <button
              class="btn btn-primary"
              (click)="playVideo()"
              [disabled]="!selectedVideoPath || playingVideo || !isConnected"
            >
              {{ playingVideo ? 'Lecture...' : (isConnected ? '▶ Lire' : '📥 File d'attente') }}
            </button>
          </div>
          <p class="hint" *ngIf="!isConnected">
            ⚠️ Site hors ligne. La commande sera exécutée à la reconnexion.
          </p>
        </div>
      </div>

      <!-- Configuration JSON -->
      <div class="debug-card">
        <div class="debug-header" (click)="showJson = !showJson">
          <span class="expand-icon">{{ showJson ? '▼' : '▶' }}</span>
          <span class="debug-icon">📋</span>
          <h4>Configuration JSON</h4>
          <span class="debug-stats" *ngIf="configHash">Hash: {{ configHash.substring(0, 8) }}...</span>
        </div>

        <div class="debug-content" *ngIf="showJson">
          <div class="json-actions">
            <button class="btn btn-secondary btn-sm" (click)="copyJson()">📋 Copier</button>
            <button class="btn btn-secondary btn-sm" (click)="downloadJson()">💾 Télécharger</button>
          </div>
          <pre class="json-viewer">{{ configJson }}</pre>
        </div>
      </div>

      <!-- Informations de synchronisation -->
      <div class="debug-card">
        <div class="debug-header" (click)="showSyncInfo = !showSyncInfo">
          <span class="expand-icon">{{ showSyncInfo ? '▼' : '▶' }}</span>
          <span class="debug-icon">🔗</span>
          <h4>Informations de synchronisation</h4>
        </div>

        <div class="debug-content" *ngIf="showSyncInfo">
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Site ID</span>
              <span class="info-value monospace">{{ siteId }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Hash configuration</span>
              <span class="info-value monospace">{{ configHash || 'N/A' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Dernière sync config</span>
              <span class="info-value">{{ lastConfigSync | date:'dd/MM/yyyy HH:mm:ss' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Dernière sync vidéos</span>
              <span class="info-value">{{ lastVideoSync | date:'dd/MM/yyyy HH:mm:ss' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .debug-tab {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .debug-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .debug-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem 1.5rem;
      cursor: pointer;
      transition: background 0.15s;
    }

    .debug-header:hover {
      background: #f8fafc;
    }

    .debug-header h4 {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      flex: 1;
    }

    .expand-icon {
      font-size: 0.75rem;
      color: #64748b;
      width: 16px;
    }

    .debug-icon {
      font-size: 1.125rem;
    }

    .debug-stats {
      font-size: 0.75rem;
      color: #64748b;
      background: #f1f5f9;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }

    .debug-content {
      padding: 0 1.5rem 1.5rem 1.5rem;
      border-top: 1px solid #f1f5f9;
    }

    .debug-content.always-visible {
      border-top: none;
      padding-top: 0;
    }

    /* Storage */
    .storage-bar {
      margin-bottom: 1rem;
    }

    .storage-info {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 0.25rem;
    }

    .storage-progress {
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .storage-fill {
      height: 100%;
      background: #2563eb;
      border-radius: 4px;
      transition: width 0.3s;
    }

    /* Files list */
    .files-list {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
    }

    .file-row {
      display: grid;
      grid-template-columns: 1fr 120px 80px;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.8125rem;
    }

    .file-row:last-child {
      border-bottom: none;
    }

    .file-row.header {
      background: #f8fafc;
      font-weight: 600;
      color: #475569;
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    .file-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-category {
      color: #64748b;
    }

    .file-size {
      text-align: right;
      color: #64748b;
    }

    .sync-info {
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid #e2e8f0;
      font-size: 0.8125rem;
      display: flex;
      gap: 0.5rem;
    }

    .sync-label {
      color: #64748b;
    }

    .sync-value {
      font-weight: 500;
    }

    /* Play controls */
    .play-controls {
      display: flex;
      gap: 0.5rem;
    }

    .form-select {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;
    }

    .hint {
      margin: 0.5rem 0 0 0;
      font-size: 0.8125rem;
      color: #f59e0b;
    }

    /* JSON viewer */
    .json-actions {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      padding-top: 1rem;
    }

    .json-viewer {
      background: #1e293b;
      color: #e2e8f0;
      padding: 1rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-family: 'SF Mono', Monaco, monospace;
      max-height: 400px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Info grid */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      padding-top: 1rem;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .info-label {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
    }

    .info-value {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .info-value.monospace {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.8125rem;
      word-break: break-all;
    }

    .empty-hint {
      margin: 0;
      padding: 1rem;
      text-align: center;
      color: #64748b;
      font-size: 0.8125rem;
      background: #f8fafc;
      border-radius: 6px;
    }

    /* Buttons */
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      border: none;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.8125rem;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #475569;
    }

    .btn-secondary:hover {
      background: #e2e8f0;
    }
  `]
})
export class SiteDebugTabComponent implements OnInit {
  @Input() siteId!: string;
  @Input() isConnected: boolean = false;

  localVideos: LocalVideo[] = [];
  localStorage: LocalStorage | null = null;
  lastVideoSync: string | null = null;
  lastConfigSync: string | null = null;
  configHash: string | null = null;
  configJson: string = '{}';

  showFiles: boolean = false;
  showJson: boolean = false;
  showSyncInfo: boolean = false;

  selectedVideoPath: string = '';
  playingVideo: boolean = false;

  constructor(
    private sitesService: SitesService,
    private notificationService: NotificationService,
    private logger: LoggerService
  ) {}

  ngOnInit(): void {
    this.loadDebugInfo();
  }

  private loadDebugInfo(): void {
    if (!this.siteId) return;

    this.sitesService.getLocalContent(this.siteId).subscribe({
      next: (response) => {
        this.localVideos = response.localVideos || [];
        this.localStorage = response.localStorage || null;
        this.lastVideoSync = response.lastVideoSync || null;
        this.lastConfigSync = response.lastSync ? new Date(response.lastSync).toISOString() : null;
        this.configHash = response.configHash || null;

        if (response.configuration) {
          this.configJson = JSON.stringify(response.configuration, null, 2);
        }
      },
      error: (error) => {
        const message = ErrorExtractor.getMessage(error);
        this.logger.error('Failed to load debug info', { error: message, siteId: this.siteId });
      }
    });
  }

  getTotalSize(): number {
    return this.localVideos.reduce((sum, v) => sum + v.size, 0);
  }

  getStoragePercent(): number {
    if (!this.localStorage || !this.localStorage.total) return 0;
    return (this.localStorage.used / this.localStorage.total) * 100;
  }

  formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getVideoCategories(): string[] {
    const cats = new Set<string>();
    this.localVideos.forEach(v => cats.add(v.category || ''));
    return Array.from(cats).sort();
  }

  getVideosByCategory(category: string): LocalVideo[] {
    return this.localVideos.filter(v => (v.category || '') === category);
  }

  playVideo(): void {
    if (!this.selectedVideoPath) return;

    this.playingVideo = true;
    this.sitesService.sendCommand(this.siteId, 'play_video', { path: this.selectedVideoPath }).subscribe({
      next: () => {
        this.playingVideo = false;
        this.notificationService.success(
          this.isConnected ? 'Lecture lancée !' : '📥 Commande mise en file d\'attente'
        );
      },
      error: (error) => {
        this.playingVideo = false;
        const message = ErrorExtractor.getMessage(error);
        this.notificationService.error(`Erreur: ${message}`);
      }
    });
  }

  copyJson(): void {
    navigator.clipboard.writeText(this.configJson);
    this.notificationService.success('JSON copié !');
  }

  downloadJson(): void {
    const blob = new Blob([this.configJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `config-${this.siteId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
