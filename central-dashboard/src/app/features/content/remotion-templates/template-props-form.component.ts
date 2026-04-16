import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../../core/services/notification.service';
import type { RemotionTemplate, TemplatePropDef } from './remotion-templates.types';

/**
 * Formulaire dynamique basé sur le `props_schema` d'un template.
 * Émet un event à chaque changement ; la persistance et l'upload d'assets
 * sont gérés par le parent.
 *
 * canRender() — contrairement à la version monolithique, valide TOUS les
 * types de props required (text, image, asset, number), pas uniquement text.
 */
@Component({
  selector: 'app-template-props-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3 class="section-title">Personnalisation</h3>

    <ng-container *ngFor="let prop of visibleProps">
      <div class="form-field">
        <label [for]="prop.key">
          {{ prop.label }}
          <span class="required" *ngIf="prop.required" aria-label="requis">*</span>
        </label>

        <!-- Texte -->
        <input
          *ngIf="prop.type === 'text'"
          [id]="prop.key"
          type="text"
          [ngModel]="propValues[prop.key]"
          (ngModelChange)="onChange(prop.key, $event)"
          [placeholder]="prop.placeholder || ''"
          class="form-input"
        />

        <!-- Nombre (slider + input) -->
        <div *ngIf="prop.type === 'number'" class="number-field">
          <input
            type="range"
            [id]="prop.key"
            [min]="prop.min ?? 100"
            [max]="prop.max ?? 1000"
            [step]="prop.step ?? 10"
            [ngModel]="propValues[prop.key]"
            (ngModelChange)="onChange(prop.key, +$event)"
            class="range-input"
          />
          <input
            type="number"
            [min]="prop.min ?? 100"
            [max]="prop.max ?? 1000"
            [ngModel]="propValues[prop.key]"
            (ngModelChange)="onChange(prop.key, +$event)"
            class="form-input number-input"
            [attr.aria-label]="prop.label"
          />
        </div>

        <!-- Asset (WebM admin) -->
        <div *ngIf="prop.type === 'asset'" class="asset-field">
          <div class="asset-current" *ngIf="propValues[prop.key]">
            <span class="asset-ok">✓ Asset uploadé</span>
            <button
              type="button"
              class="btn-remove-asset"
              (click)="removeAsset(prop.key)"
            >Retirer</button>
          </div>
          <label
            *ngIf="!assetUploading[prop.key]"
            class="asset-upload-btn"
            [for]="'asset_' + prop.key"
          >
            {{ propValues[prop.key] ? '↺ Remplacer la vidéo' : '⬆ Uploader une vidéo (WebM/MP4)' }}
          </label>
          <span *ngIf="assetUploading[prop.key]" class="asset-uploading">Upload en cours...</span>
          <input
            [id]="'asset_' + prop.key"
            type="file"
            accept="video/webm,video/mp4"
            (change)="onAssetSelect($event, prop.key)"
            hidden
          />
        </div>

        <!-- Image -->
        <div *ngIf="prop.type === 'image'" class="image-field">
          <div class="image-preview" *ngIf="imageUrls[prop.key]">
            <img [src]="imageUrls[prop.key]" [alt]="prop.label" />
            <button
              type="button"
              class="btn-remove"
              [attr.aria-label]="'Retirer ' + prop.label"
              (click)="removeImage(prop.key)"
            >✕</button>
          </div>
          <label
            *ngIf="!imageUrls[prop.key]"
            class="image-upload-btn"
            [for]="'img_' + prop.key"
          >📷 Choisir un logo</label>
          <input
            [id]="'img_' + prop.key"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            (change)="onImageSelect($event, prop.key)"
            hidden
          />
        </div>
      </div>
    </ng-container>

    <div class="form-field">
      <label for="videoTitle">Titre de la vidéo</label>
      <input
        id="videoTitle"
        type="text"
        [ngModel]="videoTitle"
        (ngModelChange)="videoTitleChange.emit($event)"
        [placeholder]="template.name"
        class="form-input"
      />
    </div>

    <p class="validation-hint" *ngIf="missingRequiredCount > 0">
      ⚠ {{ missingRequiredCount }} champ(s) requis manquant(s)
    </p>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 14px; }
    .section-title {
      font-size: 13px; font-weight: 600; color: #6b7280;
      text-transform: uppercase; letter-spacing: .05em; margin: 0 0 16px;
    }
    .form-field label {
      display: block; font-size: 13px; font-weight: 500;
      margin-bottom: 6px; color: #374151;
    }
    .required { color: #ef4444; margin-left: 2px; }
    .form-input {
      width: 100%; padding: 8px 12px;
      border: 1px solid #d1d5db; border-radius: 8px;
      font-size: 14px; box-sizing: border-box;
    }
    .number-field { display: flex; align-items: center; gap: 10px; }
    .range-input { flex: 1; cursor: pointer; accent-color: #8b5cf6; }
    .number-input { width: 80px; flex: none; }
    .asset-field { display: flex; flex-direction: column; gap: 6px; }
    .asset-current {
      display: flex; align-items: center; gap: 10px;
      padding: 6px 10px; background: #f0fdf4; border-radius: 6px;
    }
    .asset-ok { font-size: 12px; color: #16a34a; font-weight: 500; flex: 1; }
    .btn-remove-asset {
      font-size: 11px; color: #6b7280; background: none;
      border: 1px solid #d1d5db; border-radius: 4px;
      padding: 2px 8px; cursor: pointer;
    }
    .asset-upload-btn {
      display: inline-block; padding: 8px 14px;
      border: 1px dashed #a78bfa; border-radius: 8px;
      cursor: pointer; font-size: 12px; color: #7c3aed; background: #f5f3ff;
    }
    .asset-upload-btn:hover { background: #ede9fe; }
    .asset-uploading { font-size: 12px; color: #8b5cf6; }
    .image-preview { position: relative; display: inline-block; }
    .image-preview img { height: 80px; border-radius: 8px; border: 1px solid #e5e7eb; }
    .btn-remove {
      position: absolute; top: -6px; right: -6px;
      background: #ef4444; color: #fff; border: none;
      border-radius: 50%; width: 20px; height: 20px;
      font-size: 11px; cursor: pointer;
    }
    .image-upload-btn {
      display: inline-block; padding: 8px 16px;
      border: 1px dashed #d1d5db; border-radius: 8px;
      cursor: pointer; font-size: 13px; color: #6b7280;
    }
    .validation-hint {
      font-size: 12px; color: #b91c1c; margin: 0;
      padding: 6px 10px; background: #fef2f2; border-radius: 6px;
    }
  `],
})
export class TemplatePropsFormComponent {
  @Input({ required: true }) template!: RemotionTemplate;
  @Input() propValues: Record<string, unknown> = {};
  @Input() imageUrls: Record<string, string> = {};
  @Input() assetUploading: Record<string, boolean> = {};
  @Input() videoTitle = '';
  @Input() isAdmin = false;

  @Output() propChange = new EventEmitter<{ key: string; value: unknown }>();
  @Output() videoTitleChange = new EventEmitter<string>();
  @Output() imageSelect = new EventEmitter<{ key: string; file: File }>();
  @Output() imageRemove = new EventEmitter<string>();
  @Output() assetSelect = new EventEmitter<{ key: string; file: File }>();
  @Output() assetRemove = new EventEmitter<string>();

  private notifications = inject(NotificationService);

  get visibleProps(): TemplatePropDef[] {
    return this.template.props_schema.filter((p) => !p.admin_only || this.isAdmin);
  }

  /**
   * Compte les props required (tous types confondus) non remplies.
   * Correction du bug de `canRender()` historique qui ne validait que les champs texte.
   */
  get missingRequiredCount(): number {
    return this.template.props_schema
      .filter((p) => p.required && (!p.admin_only || this.isAdmin))
      .filter((p) => !this.isPropFilled(p))
      .length;
  }

  canRender(): boolean {
    return this.missingRequiredCount === 0;
  }

  private isPropFilled(prop: TemplatePropDef): boolean {
    const value = this.propValues[prop.key];
    if (prop.type === 'text') {
      return !!(value as string | undefined)?.trim();
    }
    if (prop.type === 'number') {
      return typeof value === 'number' && !Number.isNaN(value);
    }
    // image / asset : on considère rempli si non-null / non-vide
    return value !== null && value !== undefined && value !== '';
  }

  onChange(key: string, value: unknown): void {
    this.propChange.emit({ key, value });
  }

  onImageSelect(event: Event, key: string): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.imageSelect.emit({ key, file });
  }

  removeImage(key: string): void {
    this.imageRemove.emit(key);
  }

  onAssetSelect(event: Event, key: string): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    // Garde-fou : limite 50 MB pour éviter un upload excessif côté serveur.
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      this.notifications.error('Fichier trop volumineux (max 50 MB)');
      return;
    }
    this.assetSelect.emit({ key, file });
  }

  removeAsset(key: string): void {
    this.assetRemove.emit(key);
  }
}
