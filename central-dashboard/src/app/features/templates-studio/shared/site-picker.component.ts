import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplatesStudioContextService } from '../templates-studio-context.service';

/**
 * Picker de site partagé par les 3 pages Templates Studio (Brand Kit,
 * Players, Studio).
 *
 * Visible uniquement pour les internal roles (super_admin/admin/operator)
 * via `ctx.showPicker()`. Les club users ne voient rien (leur `site_id`
 * est inféré du JWT).
 *
 * La sélection est persistée dans `localStorage` par
 * `TemplatesStudioContextService` et propagée à toutes les pages via le
 * signal `activeSiteId()`.
 */
@Component({
  selector: 'app-templates-studio-site-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (ctx.showPicker()) {
      <div class="ts-picker">
        <label for="ts-picker-select">Site actif :</label>
        <select
          id="ts-picker-select"
          [ngModel]="ctx.activeSiteId()"
          (ngModelChange)="onChange($event)"
          [disabled]="ctx.loading()"
        >
          @for (s of ctx.availableSites(); track s.id) {
            <option [value]="s.id">{{ s.label }}</option>
          }
        </select>
        @if (ctx.loading()) {
          <span class="ts-picker__loading">Chargement…</span>
        }
      </div>
    }
  `,
  styles: [
    `
      .ts-picker {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        margin-bottom: 1rem;
        font-size: 0.95rem;
      }

      .ts-picker label {
        color: var(--text-secondary, #aaa);
        white-space: nowrap;
      }

      .ts-picker select {
        flex: 1;
        padding: 0.5rem 0.75rem;
        background: var(--bg-elevated, #1a1f2e);
        color: var(--text-primary, #e5e7eb);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        font-size: 0.9rem;
      }

      .ts-picker__loading {
        color: var(--text-tertiary, #888);
        font-size: 0.85rem;
        font-style: italic;
      }
    `,
  ],
})
export class SitePickerComponent {
  ctx = inject(TemplatesStudioContextService);

  onChange(siteId: string): void {
    this.ctx.setActiveSiteId(siteId);
  }
}
