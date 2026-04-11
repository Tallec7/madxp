import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LocalVideo } from '../../../core/models';
import { VideoSearchSelectComponent, VideoOptionGroup } from '../video-search-select/video-search-select.component';

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
  imports: [CommonModule, TranslateModule, VideoSearchSelectComponent],
  template: `
    <div class="video-selector">
      <app-video-search-select
        [groups]="videoGroups"
        [selectedPath]="selectedPath"
        (pathChange)="onSelectionChange($event)"
        [placeholder]="placeholder"
        [disabled]="disabled"
        [invalid]="required && !selectedPath"
        [compact]="compact"
        [searchPlaceholder]="'common.searchVideoPlaceholder' | translate"
        [emptyLabel]="'common.noVideoFound' | translate"
      ></app-video-search-select>

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
  `]
})
export class VideoSelectorComponent implements OnChanges {
  @Input() videos: LocalVideo[] = [];
  @Input() selectedPath: string = '';
  @Input() placeholder: string = '-- Sélectionner une vidéo --';
  @Input() disabled: boolean = false;
  @Input() required: boolean = false;
  @Input() showValidation: boolean = true;
  @Input() compact: boolean = false;

  @Output() pathChange = new EventEmitter<string>();
  @Output() videoSelected = new EventEmitter<VideoOption | null>();

  videoGroups: VideoOptionGroup[] = [];

  private videoOptionsMap: Map<string, VideoOption[]> = new Map();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['videos']) {
      this.buildGroups();
    }
  }

  private buildGroups(): void {
    this.videoOptionsMap = new Map();

    const videoOptions: VideoOption[] = this.videos.map(v => ({
      path: v.path,
      filename: v.filename,
      category: v.category,
      subcategory: v.subcategory,
      size: v.size,
      isOnPi: true,
      isNeopro: this.isNeoProPath(v.path)
    }));

    videoOptions.sort((a, b) => {
      const catA = a.category || '';
      const catB = b.category || '';
      if (catA !== catB) return catA.localeCompare(catB);
      return a.filename.localeCompare(b.filename);
    });

    for (const video of videoOptions) {
      const category = video.category || 'Autres';
      if (!this.videoOptionsMap.has(category)) {
        this.videoOptionsMap.set(category, []);
      }
      this.videoOptionsMap.get(category)!.push(video);
    }

    this.videoGroups = Array.from(this.videoOptionsMap.entries()).map(([category, videos]) => ({
      key: category,
      label: category,
      icon: '',
      videos: videos.map(v => ({
        path: v.path,
        displayName: `${v.filename} (${this.formatBytes(v.size)})`,
        isOnPi: v.isOnPi,
        size: v.size,
        isNeopro: v.isNeopro,
      })),
    }));
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
    for (const videos of this.videoOptionsMap.values()) {
      const found = videos.find(v => v.path === path);
      if (found) return found;
    }
    return undefined;
  }

  isPathValid(): boolean {
    if (!this.selectedPath) return true;
    return this.findVideoByPath(this.selectedPath) !== undefined;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
