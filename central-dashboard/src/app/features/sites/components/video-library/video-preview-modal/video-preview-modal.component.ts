import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VideoItem } from '../video-library.types';
import { formatBytes, formatDuration } from '../video-library.utils';

/**
 * Full-screen overlay that autoplays the selected video.
 * Extracted from `VideoLibraryComponent` as part of the decomposition
 * chantier (Phase B). Pure presentation: the parent owns the modal
 * state (which video to show) and subscribes to `closeModal` to reset.
 */
@Component({
  selector: 'app-video-preview-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-preview-modal.component.html',
  styleUrls: ['./video-preview-modal.component.scss'],
})
export class VideoPreviewModalComponent {
  @Input() video: VideoItem | null = null;
  @Input() siteType: string = '';

  @Output() closeModal = new EventEmitter<void>();

  readonly formatBytes = formatBytes;
  readonly formatDuration = formatDuration;

  onClose(): void {
    this.closeModal.emit();
  }

  onStopPropagation(event: Event): void {
    event.stopPropagation();
  }
}
