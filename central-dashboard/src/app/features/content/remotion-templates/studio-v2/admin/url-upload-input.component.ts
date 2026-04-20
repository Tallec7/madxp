import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  ElementRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../../../../core/services/notification.service';
import { RemotionTemplatesDataService } from '../../remotion-templates-data.service';

/**
 * ADR-075 V2 — Input URL + bouton upload (📁) qui pousse le fichier vers
 * `template-assets/studio/` via `POST /api/remotion-templates/:id/assets`
 * et remplit automatiquement l'URL retournée. Utilisé dans variants / layers.
 */
@Component({
  selector: 'app-url-upload-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="uui">
      <input
        type="text"
        class="uui__input"
        [placeholder]="placeholder"
        [ngModel]="value"
        (ngModelChange)="onInput($event)"
      />
      <button
        type="button"
        class="uui__btn"
        [disabled]="uploading || !templateId"
        (click)="fileInput.click()"
        [title]="uploading ? 'Upload en cours...' : 'Uploader un fichier'"
      >
        {{ uploading ? '…' : '📁' }}
      </button>
      <input
        #fileInput
        type="file"
        [accept]="accept"
        hidden
        (change)="onFile($event)"
      />
    </div>
  `,
  styles: [`
    .uui { display: flex; align-items: center; gap: 4px; flex: 1; }
    .uui__input { flex: 1; padding: 2px 4px; border: 1px solid #d1d5db; border-radius: 3px; font-size: 12px; }
    .uui__btn { padding: 2px 8px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 3px; cursor: pointer; font-size: 12px; }
    .uui__btn:disabled { opacity: 0.5; cursor: not-allowed; }
  `],
})
export class UrlUploadInputComponent {
  @Input({ required: true }) templateId!: string;
  @Input() value: string | null = '';
  @Input() placeholder = 'URL';
  @Input() accept = 'video/*';
  @Output() valueChange = new EventEmitter<string>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  uploading = false;

  private api = inject(RemotionTemplatesDataService);
  private notifications = inject(NotificationService);

  onInput(v: string): void {
    this.value = v;
    this.valueChange.emit(v);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading = true;
    this.api.uploadStudioAsset(this.templateId, file).subscribe({
      next: (res) => {
        this.uploading = false;
        this.value = res.url;
        this.valueChange.emit(res.url);
        this.notifications.success('Fichier uploadé');
        input.value = '';
      },
      error: () => {
        this.uploading = false;
        this.notifications.error('Échec upload');
        input.value = '';
      },
    });
  }
}
