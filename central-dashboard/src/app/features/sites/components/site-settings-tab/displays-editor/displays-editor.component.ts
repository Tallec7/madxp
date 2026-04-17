import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DisplayConfig } from '../../../../../core/models';

interface DisplayTemplate {
  icon: string;
  label: string;
  type: string;
  resolution: string;
}

const DISPLAY_TEMPLATES: DisplayTemplate[] = [
  { icon: '📺', label: 'TV classique', type: 'tv', resolution: '1920x1080' },
  { icon: '🖥️', label: 'Bandeau LED horizontal', type: 'led-banner', resolution: '1920x384' },
  { icon: '📱', label: 'Totem portrait', type: 'totem', resolution: '1080x1920' },
  { icon: '🖥️', label: 'Mur LED', type: 'led-wall', resolution: '1920x1080' },
];

@Component({
  selector: 'app-displays-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="displays-list">
      <div class="display-row" *ngFor="let display of displays; trackBy: trackByIndex">
        <span class="display-index">#{{ display.index }}</span>
        <span class="display-icon">{{ getDisplayIcon(display.type) }}</span>
        <input
          class="display-name-input"
          type="text"
          [(ngModel)]="display.name"
          (blur)="onDisplayChanged()"
          placeholder="Nom de l'ecran"
        />
        <span class="display-type-label">{{ display.type }}</span>
        <span class="display-resolution" *ngIf="display.resolution">{{ display.resolution }}</span>
        <button
          class="btn-remove"
          *ngIf="display.index !== 0"
          (click)="removeDisplay(display.index)"
          title="Remove display"
        >&times;</button>
        <span class="display-locked" *ngIf="display.index === 0" title="Ecran principal (non supprimable)">🔒</span>
      </div>
    </div>

    <div class="add-display" *ngIf="!showCustomForm">
      <div class="add-display-trigger" (click)="showTemplateMenu = !showTemplateMenu">
        + Ajouter un ecran
      </div>
      <div class="template-menu" *ngIf="showTemplateMenu">
        <button
          class="template-option"
          *ngFor="let tpl of templates"
          (click)="addFromTemplate(tpl)"
        >
          {{ tpl.icon }} {{ tpl.label }} <span class="tpl-resolution">({{ tpl.resolution }})</span>
        </button>
        <button class="template-option template-custom" (click)="openCustomForm()">
          ⚙️ Personnalise...
        </button>
      </div>
    </div>

    <div class="custom-form" *ngIf="showCustomForm">
      <div class="custom-form-row">
        <input class="form-input" type="text" [(ngModel)]="customName" placeholder="Nom (ex: TV Buvette)" />
        <input class="form-input" type="text" [(ngModel)]="customType" placeholder="Type (ex: led-banner)" />
        <input class="form-input" type="text" [(ngModel)]="customResolution" placeholder="Resolution (ex: 1920x384)" />
      </div>
      <div class="custom-form-actions">
        <button class="btn btn-primary btn-sm" (click)="addCustomDisplay()" [disabled]="!customName || !customType">Ajouter</button>
        <button class="btn btn-secondary btn-sm" (click)="showCustomForm = false">Annuler</button>
      </div>
    </div>
  `,
  styles: [`
    .displays-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .display-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }

    .display-index {
      font-size: 0.75rem;
      font-weight: 600;
      color: #94a3b8;
      min-width: 1.5rem;
    }

    .display-icon {
      font-size: 1rem;
    }

    .display-name-input {
      flex: 1;
      border: 1px solid transparent;
      background: transparent;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #1e293b;
      min-width: 0;
    }

    .display-name-input:hover,
    .display-name-input:focus {
      border-color: #cbd5e1;
      background: white;
      outline: none;
    }

    .display-type-label {
      font-size: 0.75rem;
      color: #64748b;
      background: #e2e8f0;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      white-space: nowrap;
    }

    .display-resolution {
      font-size: 0.75rem;
      color: #94a3b8;
      white-space: nowrap;
    }

    .btn-remove {
      background: none;
      border: none;
      color: #dc2626;
      font-size: 1.25rem;
      cursor: pointer;
      padding: 0 0.25rem;
      line-height: 1;
      opacity: 0.5;
    }

    .btn-remove:hover {
      opacity: 1;
    }

    .display-locked {
      font-size: 0.75rem;
      opacity: 0.5;
    }

    .add-display {
      margin-top: 0.75rem;
      position: relative;
    }

    .add-display-trigger {
      display: inline-flex;
      align-items: center;
      padding: 0.375rem 0.75rem;
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      cursor: pointer;
      color: #64748b;
      font-size: 0.8125rem;
      transition: border-color 0.2s, color 0.2s;
    }

    .add-display-trigger:hover {
      border-color: #3b82f6;
      color: #3b82f6;
    }

    .template-menu {
      margin-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    .template-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border: none;
      background: none;
      cursor: pointer;
      font-size: 0.8125rem;
      color: #334155;
      border-radius: 4px;
      text-align: left;
    }

    .template-option:hover {
      background: #f1f5f9;
    }

    .template-custom {
      border-top: 1px solid #e2e8f0;
      margin-top: 0.25rem;
      padding-top: 0.625rem;
    }

    .tpl-resolution {
      color: #94a3b8;
      font-size: 0.75rem;
    }

    .custom-form {
      margin-top: 0.75rem;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
    }

    .custom-form-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .custom-form-row .form-input {
      flex: 1;
      min-width: 120px;
      padding: 0.375rem 0.5rem;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.8125rem;
    }

    .custom-form-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .btn { padding: 0.375rem 0.75rem; border-radius: 6px; font-size: 0.8125rem; font-weight: 500; cursor: pointer; border: none; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
    .btn-primary { background: #3b82f6; color: white; }
    .btn-primary:hover:not(:disabled) { background: #2563eb; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: #e2e8f0; color: #475569; }
    .btn-secondary:hover { background: #cbd5e1; }

    @media (max-width: 768px) {
      .display-row { flex-wrap: wrap; }
      .custom-form-row { flex-direction: column; }
      .custom-form-row .form-input { min-width: unset; }
    }
  `]
})
export class DisplaysEditorComponent {
  @Input() displays: DisplayConfig[] = [];
  @Output() displaysChange = new EventEmitter<DisplayConfig[]>();

  readonly templates = DISPLAY_TEMPLATES;
  showTemplateMenu = false;
  showCustomForm = false;
  customName = '';
  customType = '';
  customResolution = '';

  trackByIndex(_: number, display: DisplayConfig): number {
    return display.index;
  }

  getDisplayIcon(type: string): string {
    const tpl = DISPLAY_TEMPLATES.find(t => t.type === type);
    return tpl?.icon || '🖥️';
  }

  addFromTemplate(tpl: DisplayTemplate): void {
    const nextIndex = this.getNextIndex();
    this.displays = [
      ...this.displays,
      { index: nextIndex, name: tpl.label, type: tpl.type, resolution: tpl.resolution },
    ];
    this.showTemplateMenu = false;
    this.displaysChange.emit(this.displays);
  }

  openCustomForm(): void {
    this.showTemplateMenu = false;
    this.showCustomForm = true;
    this.customName = '';
    this.customType = '';
    this.customResolution = '';
  }

  addCustomDisplay(): void {
    if (!this.customName || !this.customType) return;
    const slug = this.customType.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const nextIndex = this.getNextIndex();
    this.displays = [
      ...this.displays,
      { index: nextIndex, name: this.customName, type: slug, resolution: this.customResolution || undefined },
    ];
    this.showCustomForm = false;
    this.displaysChange.emit(this.displays);
  }

  removeDisplay(index: number): void {
    this.displays = this.displays.filter(d => d.index !== index);
    this.displaysChange.emit(this.displays);
  }

  onDisplayChanged(): void {
    this.displaysChange.emit(this.displays);
  }

  private getNextIndex(): number {
    if (this.displays.length === 0) return 0;
    return Math.max(...this.displays.map(d => d.index)) + 1;
  }
}
