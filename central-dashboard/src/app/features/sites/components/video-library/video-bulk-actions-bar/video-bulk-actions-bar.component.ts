import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-video-bulk-actions-bar',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-bulk-actions-bar.component.html',
  styleUrls: ['./video-bulk-actions-bar.component.scss'],
})
export class VideoBulkActionsBarComponent {
  @Input() siteType: string = '';
  @Input() selectedCount = 0;
  @Input() deployableCount = 0;
  @Input() deletableCount = 0;

  @Output() bulkDeploy = new EventEmitter<void>();
  @Output() bulkDelete = new EventEmitter<void>();
  @Output() deselectAll = new EventEmitter<void>();
}
