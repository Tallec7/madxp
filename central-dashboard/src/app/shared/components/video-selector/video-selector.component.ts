import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocalVideo } from '../../../core/models';

export interface VideoOption {
  path: string;
  filename: string;
  category: string | null;
  subcategory: string | null;
  size: number;
  isOnPi: boolean;
  isNeopro?: boolean;
}

@Component({
  selector: 'app-video-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="video-selector" [class.invalid]="required && !selectedPath">
      <select
        [ngModel]="selectedPath"
        (ngModelChange)="onSelectionChange($event)"
        [disabled]="disabled"
        class="video-select"
        [class.placeholder]="!selectedPath"
      >
        <option value="">{{ placeholder }}</option>
        <optgroup *ngFor="let category of groupedVideos | keyvalue" [label]="category.key || 'Sans catégorie'">
          <option *ngFor="let video of category.value" [value]="video.path">
            {{ video.filename }} ({{ formatBytes(video.size) }})
            {{ video.isOnPi ? '✅' : '⏳' }}
            {{ video.isNeopro ? '🔒' : '' }}
          </option>
        </optgroup>
      </select>

      <div class="validation-message" *ngIf="showValidation && selectedPath && !isPathValid()">
        <span class="warning-icon">⚠️</span>
        <span>Cette vidéo n'existe pas sur le boîtier</span>
      </div>
    </div>
  `,
  styles: [`
    .video-selector {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .video-select {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 0.875rem;
      background: white;
      cursor: pointer;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .video-select:hover:not(:disabled) {
      border-color: #cbd5e1;
    }

    .video-select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .video-select:disabled {
      background: #f1f5f9;
      cursor: not-allowed;
      opacity: 0.7;
    }

    .video-select.placeholder {
      color: #94a3b8;
    }

    .video-selector.invalid .video-select {
      border-color: #ef4444;
    }

    .validation-message {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      color: #f59e0b;
    }

    .warning-icon {
      font-size: 0.875rem;
    }

    optgroup {
      font-weight: 600;
      color: #334155;
    }

    option {
      font-weight: 400;
      padding: 0.25rem;
    }
  `]
})
export class VideoSelectorComponent implements OnChanges {
  @Input() videos: LocalVideo[] = [];
  @Input() selectedPath: string = '';
  @Input() placeholder: string = '-- Sélectionner une vidéo --';
  @Input() disabled: boolean = false;
  @Input() required: boolean = false;
  @Input() showValidation: boolean = true;

  @Output() pathChange = new EventEmitter<string>();
  @Output() videoSelected = new EventEmitter<VideoOption | null>();

  groupedVideos: Map<string, VideoOption[]> = new Map();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['videos']) {
      this.groupVideosByCategory();
    }
  }

  private groupVideosByCategory(): void {
    this.groupedVideos = new Map();

    const videoOptions: VideoOption[] = this.videos.map(v => ({
      path: v.path,
      filename: v.filename,
      category: v.category,
      subcategory: v.subcategory,
      size: v.size,
      isOnPi: true,
      isNeopro: this.isNeoProPath(v.path)
    }));

    // Sort by category then filename
    videoOptions.sort((a, b) => {
      const catA = a.category || '';
      const catB = b.category || '';
      if (catA !== catB) return catA.localeCompare(catB);
      return a.filename.localeCompare(b.filename);
    });

    // Group by category
    for (const video of videoOptions) {
      const category = video.category || 'Autres';
      if (!this.groupedVideos.has(category)) {
        this.groupedVideos.set(category, []);
      }
      this.groupedVideos.get(category)!.push(video);
    }
  }

  private isNeoProPath(path: string): boolean {
    const neoproPaths = ['SPONSORS', 'NEOPRO', 'PUBLICITES', 'ANIMATIONS'];
    return neoproPaths.some(p => path.toUpperCase().includes(p));
  }

  onSelectionChange(path: string): void {
    this.selectedPath = path;
    this.pathChange.emit(path);

    if (path) {
      const video = this.findVideoByPath(path);
      this.videoSelected.emit(video || null);
    } else {
      this.videoSelected.emit(null);
    }
  }

  private findVideoByPath(path: string): VideoOption | undefined {
    for (const videos of this.groupedVideos.values()) {
      const found = videos.find(v => v.path === path);
      if (found) return found;
    }
    return undefined;
  }

  isPathValid(): boolean {
    if (!this.selectedPath) return true;
    return this.findVideoByPath(this.selectedPath) !== undefined;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
