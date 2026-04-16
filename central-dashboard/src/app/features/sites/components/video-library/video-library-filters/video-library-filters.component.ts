import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type {
  VideoStatusFilter,
  VideoOwnerFilter,
  VideoViewMode,
} from '../video-library.types';

/**
 * Toolbar above the library list: search input, status/owner/category
 * selects, selection-mode toggle, CSV export, and grid/list view switch.
 * Extracted from `VideoLibraryComponent` as part of the decomposition
 * chantier (Phase C). Stateless: parent owns the filter values and
 * subscribes to `filtersChange` to re-run `applyFilters()`.
 */
@Component({
  selector: 'app-video-library-filters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-library-filters.component.html',
  styleUrls: ['./video-library-filters.component.scss'],
})
export class VideoLibraryFiltersComponent {
  // Two-way bound state — values round-trip to the parent via `*Change` outputs
  @Input() searchQuery: string = '';
  @Input() statusFilter: VideoStatusFilter = 'relevant';
  @Input() ownerFilter: VideoOwnerFilter = 'all';
  @Input() categoryFilter: string = 'all';
  @Input() viewMode: VideoViewMode = 'grid';

  // One-way inputs — read-only context from the parent
  @Input() siteType: string = '';
  @Input() categories: string[] = [];
  @Input() configLabelOptions: string[] = [];
  @Input() selectionMode: boolean = false;

  // Two-way binding outputs
  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() statusFilterChange = new EventEmitter<VideoStatusFilter>();
  @Output() ownerFilterChange = new EventEmitter<VideoOwnerFilter>();
  @Output() categoryFilterChange = new EventEmitter<string>();
  @Output() viewModeChange = new EventEmitter<VideoViewMode>();

  // Action events
  @Output() filtersChange = new EventEmitter<void>();
  @Output() toggleSelection = new EventEmitter<void>();
  @Output() exportCsv = new EventEmitter<void>();

  onSearchQueryChange(value: string): void {
    this.searchQuery = value;
    this.searchQueryChange.emit(value);
    this.filtersChange.emit();
  }

  onStatusFilterChange(value: VideoStatusFilter): void {
    this.statusFilter = value;
    this.statusFilterChange.emit(value);
    this.filtersChange.emit();
  }

  onOwnerFilterChange(value: VideoOwnerFilter): void {
    this.ownerFilter = value;
    this.ownerFilterChange.emit(value);
    this.filtersChange.emit();
  }

  onCategoryFilterChange(value: string): void {
    this.categoryFilter = value;
    this.categoryFilterChange.emit(value);
    this.filtersChange.emit();
  }

  onViewModeChange(mode: VideoViewMode): void {
    this.viewMode = mode;
    this.viewModeChange.emit(mode);
  }

  onToggleSelection(): void {
    this.toggleSelection.emit();
  }

  onExportCsv(): void {
    this.exportCsv.emit();
  }
}
