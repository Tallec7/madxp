/**
 * Page super_admin regroupant les outils du chantier templates JOUEUR :
 *   - Photo cropper (auto_crop POC)
 *   - Backgrounds manager (catalogue + grants)
 *   - Version manager (publish / fork / rollback) — nécessite un templateId actif
 *
 * Accessible via /super-admin/joueur-tools (route à câbler dans app.routes.ts).
 */

import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplateBackgroundsManagerComponent } from './template-backgrounds-manager.component';
import {
  TemplatePhotoCropperComponent,
  type PhotoCropFinalized,
} from './template-photo-cropper.component';
import { TemplateVersionManagerComponent } from './template-version-manager.component';

@Component({
  selector: 'app-joueur-tools-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TemplateBackgroundsManagerComponent,
    TemplatePhotoCropperComponent,
    TemplateVersionManagerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Outils super_admin — chantier JOUEUR</h1>
        <p class="muted">
          Préparation du déploiement des templates JOUEUR Simple / But.
          Refs : <a href="https://github.com/Tallec7/neopro/pull/757" target="_blank" rel="noopener">PR #757</a>,
          <a href="https://github.com/Tallec7/neopro/pull/760" target="_blank" rel="noopener">PR #760</a>.
        </p>
      </header>

      <nav class="tabs">
        <button
          type="button"
          class="tab"
          [class.active]="tab() === 'cropper'"
          (click)="tab.set('cropper')"
        >📸 Auto-crop photo</button>
        <button
          type="button"
          class="tab"
          [class.active]="tab() === 'backgrounds'"
          (click)="tab.set('backgrounds')"
        >🎨 Backgrounds</button>
        <button
          type="button"
          class="tab"
          [class.active]="tab() === 'versions'"
          (click)="tab.set('versions')"
        >🔒 Versions</button>
      </nav>

      <ng-container [ngSwitch]="tab()">
        <ng-container *ngSwitchCase="'cropper'">
          <app-template-photo-cropper (cropFinalized)="onCropFinalized($event)" />
          <div class="footer-info" *ngIf="lastCrop() as c">
            ✅ Cadrage validé : offset_x = {{ (c.offset_x * 100).toFixed(0) }}% — utilisable côté image_slot.
          </div>
        </ng-container>

        <ng-container *ngSwitchCase="'backgrounds'">
          <app-template-backgrounds-manager />
        </ng-container>

        <ng-container *ngSwitchCase="'versions'">
          <div class="version-host">
            <label>
              ID du template :
              <input
                type="text"
                [(ngModel)]="templateIdInput"
                (ngModelChange)="onTemplateIdChange($event)"
                placeholder="UUID du template"
              />
            </label>
            <label>
              Version courante (optionnel) :
              <input type="text" [(ngModel)]="currentVersion" placeholder="ex: 1.0" />
            </label>
            <label>
              Statut (optionnel) :
              <select [(ngModel)]="status">
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <app-template-version-manager
              *ngIf="templateId()"
              [templateId]="templateId()!"
              [currentVersion]="currentVersion"
              [status]="status"
              (versionChanged)="onVersionChanged($event)"
            />
            <p class="muted" *ngIf="!templateId()">Saisis un ID pour charger les versions.</p>
          </div>
        </ng-container>
      </ng-container>
    </div>
  `,
  styles: [`
    :host { display: block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; }
    .page { max-width: 1200px; margin: 0 auto; }
    .page-header h1 { margin: 0 0 4px; font-size: 20px; }
    .page-header .muted { color: #6b7280; font-size: 13px; margin: 0 0 20px; }
    .page-header a { color: #1d4ed8; }

    .tabs { display: flex; gap: 4px; border-bottom: 1px solid #e5e7eb; margin-bottom: 16px; }
    .tab {
      background: transparent; border: none; padding: 10px 16px; cursor: pointer;
      font-size: 13px; color: #6b7280; border-bottom: 2px solid transparent;
    }
    .tab.active { color: #1d4ed8; border-bottom-color: #1d4ed8; font-weight: 600; }

    .footer-info { margin-top: 12px; padding: 10px; background: #d1fae5; border-radius: 6px; font-size: 13px; color: #065f46; }

    .version-host { display: flex; flex-direction: column; gap: 12px; }
    .version-host label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
    .version-host input, .version-host select { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; min-width: 280px; font-family: 'SF Mono', monospace; }
  `],
})
export class JoueurToolsPageComponent {
  tab = signal<'cropper' | 'backgrounds' | 'versions'>('cropper');
  lastCrop = signal<PhotoCropFinalized | null>(null);

  templateIdInput = '';
  templateId = signal<string | null>(null);
  currentVersion = '';
  status: 'draft' | 'published' | 'archived' = 'draft';

  onCropFinalized(crop: PhotoCropFinalized): void {
    this.lastCrop.set(crop);
  }

  onTemplateIdChange(value: string): void {
    const v = value.trim();
    this.templateId.set(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null);
  }

  onVersionChanged(ev: { action: string; version: string; templateId: string }): void {
    if (ev.action === 'set-default' || ev.action === 'publish') {
      this.currentVersion = ev.version;
    }
  }
}
