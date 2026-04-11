import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ElementRef,
  HostListener,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface VideoOptionGroup {
  key: string;
  label: string;
  icon: string;
  videos: VideoOptionItem[];
}

export interface VideoOptionItem {
  path: string;
  displayName: string;
  isOnPi?: boolean;
  size?: number;
  isNeopro?: boolean;
}

@Component({
  selector: 'app-video-search-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vss" [class.vss--open]="isOpen" [class.vss--invalid]="invalid" [class.vss--disabled]="disabled">
      <!-- Selected value display / search input -->
      <div class="vss__control" (click)="toggle()" [class.vss__control--placeholder]="!selectedPath">
        <input
          *ngIf="isOpen"
          #searchInput
          type="text"
          class="vss__search"
          [(ngModel)]="searchTerm"
          (ngModelChange)="filterVideos()"
          (click)="$event.stopPropagation()"
          (keydown)="onKeyDown($event)"
          [placeholder]="searchPlaceholder"
          autocomplete="off"
        />
        <span *ngIf="!isOpen" class="vss__value">
          {{ selectedLabel || placeholder }}
        </span>
        <span class="vss__arrow">{{ isOpen ? '▲' : '▼' }}</span>
      </div>

      <!-- Dropdown -->
      <div class="vss__dropdown" *ngIf="isOpen">
        <div class="vss__options" *ngIf="filteredGroups.length > 0">
          <ng-container *ngFor="let group of filteredGroups">
            <div class="vss__group-label" *ngIf="filteredGroups.length > 1 || group.label">
              {{ group.icon }} {{ group.label }}
            </div>
            <div
              *ngFor="let video of group.videos; let i = index"
              class="vss__option"
              [class.vss__option--selected]="video.path === selectedPath"
              [class.vss__option--highlighted]="isHighlighted(group, video)"
              (click)="selectVideo(video.path); $event.stopPropagation()"
              (mouseenter)="setHighlight(group, video)"
            >
              <span class="vss__option-name">{{ video.displayName }}</span>
              <span class="vss__option-meta">
                <span *ngIf="video.size" class="vss__option-size">{{ formatBytes(video.size) }}</span>
                <span *ngIf="showPiStatus && video.isOnPi === false" class="vss__option-badge pending">⏳</span>
                <span *ngIf="video.isNeopro" class="vss__option-badge neopro">🔒</span>
              </span>
            </div>
          </ng-container>
        </div>
        <div class="vss__empty" *ngIf="filteredGroups.length === 0">
          {{ emptyLabel }}
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .vss {
        position: relative;
        width: 100%;
        font-size: 0.875rem;
      }

      .vss__control {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        background: white;
        cursor: pointer;
        transition: border-color 0.2s, box-shadow 0.2s;
        min-height: 38px;
      }

      .vss__control:hover {
        border-color: #cbd5e1;
      }

      .vss--open .vss__control {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
      }

      .vss--invalid .vss__control {
        border-color: #ef4444;
      }

      .vss--disabled .vss__control {
        background: #f1f5f9;
        cursor: not-allowed;
        opacity: 0.7;
      }

      .vss__control--placeholder .vss__value {
        color: #94a3b8;
      }

      .vss__value {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .vss__search {
        flex: 1;
        border: none;
        outline: none;
        font-size: 0.875rem;
        background: transparent;
        min-width: 0;
      }

      .vss__arrow {
        font-size: 0.625rem;
        color: #94a3b8;
        flex-shrink: 0;
      }

      .vss__dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #2563eb;
        border-top: none;
        border-bottom-left-radius: 6px;
        border-bottom-right-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        max-height: 280px;
        overflow-y: auto;
      }

      .vss__group-label {
        padding: 0.375rem 0.75rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        background: #f8fafc;
        border-top: 1px solid #f1f5f9;
        position: sticky;
        top: 0;
      }

      .vss__option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        transition: background 0.1s;
      }

      .vss__option:hover,
      .vss__option--highlighted {
        background: #f1f5f9;
      }

      .vss__option--selected {
        background: #eff6ff;
        color: #2563eb;
        font-weight: 500;
      }

      .vss__option-name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .vss__option-meta {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        flex-shrink: 0;
        margin-left: 0.5rem;
      }

      .vss__option-size {
        font-size: 0.75rem;
        color: #94a3b8;
      }

      .vss__option-badge {
        font-size: 0.75rem;
      }

      .vss__empty {
        padding: 1rem;
        text-align: center;
        color: #94a3b8;
        font-style: italic;
      }
    `,
  ],
})
export class VideoSearchSelectComponent implements OnChanges {
  @Input() groups: VideoOptionGroup[] = [];
  @Input() selectedPath: string = '';
  @Input() placeholder: string = '-- Sélectionner --';
  @Input() disabled: boolean = false;
  @Input() invalid: boolean = false;
  @Input() showPiStatus: boolean = true;
  @Input() searchPlaceholder: string = '';
  @Input() emptyLabel: string = '';

  @Output() pathChange = new EventEmitter<string>();

  isOpen = false;
  searchTerm = '';
  filteredGroups: VideoOptionGroup[] = [];
  selectedLabel = '';

  private highlightedPath = '';

  constructor(
    private elementRef: ElementRef,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['groups'] || changes['selectedPath']) {
      this.filterVideos();
      this.updateSelectedLabel();
    }
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  toggle(): void {
    if (this.disabled) return;
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    this.isOpen = true;
    this.searchTerm = '';
    this.filterVideos();
    this.cdr.markForCheck();
    setTimeout(() => {
      const input = this.elementRef.nativeElement.querySelector('.vss__search');
      if (input) input.focus();
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.searchTerm = '';
    this.highlightedPath = '';
    this.cdr.markForCheck();
  }

  selectVideo(path: string): void {
    this.selectedPath = path;
    this.pathChange.emit(path);
    this.updateSelectedLabel();
    this.close();
  }

  filterVideos(): void {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) {
      this.filteredGroups = this.groups;
      return;
    }

    this.filteredGroups = this.groups
      .map((group) => ({
        ...group,
        videos: group.videos.filter((v) =>
          v.displayName.toLowerCase().includes(term)
        ),
      }))
      .filter((group) => group.videos.length > 0);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
      return;
    }
    if (event.key === 'Enter' && this.highlightedPath) {
      this.selectVideo(this.highlightedPath);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
    }
  }

  isHighlighted(group: VideoOptionGroup, video: VideoOptionItem): boolean {
    return this.highlightedPath === video.path;
  }

  setHighlight(group: VideoOptionGroup, video: VideoOptionItem): void {
    this.highlightedPath = video.path;
  }

  private moveHighlight(direction: number): void {
    const allVideos = this.filteredGroups.flatMap((g) => g.videos);
    if (allVideos.length === 0) return;

    const currentIndex = allVideos.findIndex(
      (v) => v.path === this.highlightedPath
    );
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = allVideos.length - 1;
    if (nextIndex >= allVideos.length) nextIndex = 0;

    this.highlightedPath = allVideos[nextIndex].path;
    this.cdr.markForCheck();
  }

  private updateSelectedLabel(): void {
    if (!this.selectedPath) {
      this.selectedLabel = '';
      return;
    }
    for (const group of this.groups) {
      const video = group.videos.find((v) => v.path === this.selectedPath);
      if (video) {
        this.selectedLabel = video.displayName;
        return;
      }
    }
    // Path not found in groups — show the raw path
    this.selectedLabel = this.selectedPath;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
