import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { RemotionTemplate } from './remotion-templates.types';
import { ConfirmDialogService } from '../../../core/services/confirm-dialog.service';
import { MODAL_MESSAGES } from './studio-v3/vocabulary.constants';

/**
 * Carte d'un template dans la grille de sélection.
 * Affiche thumbnail, nom, description, badges et (admin) le bouton publier/dépublier.
 */
@Component({
  selector: 'app-template-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="template-card"
      [class.selected]="selected"
      [attr.role]="'button'"
      [attr.tabindex]="0"
      [attr.aria-pressed]="selected"
      (click)="onSelect()"
      (keydown.enter)="onSelect()"
      (keydown.space)="$event.preventDefault(); onSelect()"
    >
      <div class="tpl-thumb" *ngIf="template.thumbnail_url; else placeholder">
        <img [src]="template.thumbnail_url" [alt]="template.name" />
      </div>
      <ng-template #placeholder>
        <div class="tpl-thumb tpl-thumb-placeholder" aria-hidden="true">
          <span>🎬</span>
        </div>
      </ng-template>

      <div class="tpl-info">
        <div class="tpl-name">{{ template.name }}</div>
        <div class="tpl-desc">{{ template.description }}</div>
        <div class="tpl-badges">
          <span class="badge badge-published" *ngIf="template.published">Publié</span>
          <span class="badge badge-draft" *ngIf="!template.published && isAdmin">Brouillon</span>
          <span class="badge badge-club" *ngIf="template.site_id" title="Template perso (club)">Club</span>
          <!--
            Quick task 260507-les — Template versioning UI (audit P0 #4).
            Marker discret signalant qu'un historique est disponible (le compte
            réel des snapshots ADR-055 est chargé à l'ouverture du drawer pour
            éviter un round-trip par card). Visible uniquement aux admins parce
            que le drawer + restore sont gated admin/super_admin côté API.
          -->
          <span
            class="badge badge-version"
            *ngIf="template.published && isAdmin"
            data-testid="template-version-badge"
            title="Historique des versions disponible"
            >📜 versions</span
          >
          <!--
            Quick task 260507-obe — Audit P1 #10 / usedByCount badge.
            Affiche, pour chaque template listé, combien de références actives
            le pointent (template_packshot_refs + render_jobs pending/running),
            calculé côté API en une seule query agrégée. Aide le super_admin
            à décider publier/dépublier/supprimer sans aller à l'aveugle.
            "Inutilisé" (gris/--text-muted) vs "Utilisé par N référence(s)"
            (accent --studio-accent-*).
          -->
          <span
            class="badge tc__used-by"
            [class.tc__used-by--zero]="(template.usedByCount ?? 0) === 0"
            [attr.data-testid]="'template-used-by-count-' + template.id"
            [title]="(template.usedByCount ?? 0) === 0
              ? 'Aucune référence active'
              : (template.usedByCount + ' référence(s) active(s) (packshots + rendus en cours)')"
          >
            {{ (template.usedByCount ?? 0) === 0 ? 'Inutilisé' : 'Utilisé par ' + template.usedByCount + ' référence(s)' }}
          </span>
        </div>
      </div>

      <div class="tpl-admin-actions" *ngIf="isAdmin">
        <!--
          ADR-110 / Phase 03 / Plan 05 / PUB-01 — when the template is
          already published AND the user is super_admin, the publish
          button becomes a guarded "Dépublier" entry that opens the
          shared ConfirmDialogService modal (FR copy from MODAL_MESSAGES).
          Native browser confirm dialogs are forbidden — Phase 1 i18n decision.
        -->
        <button
          *ngIf="template.published && currentUserRole === 'super_admin'"
          type="button"
          class="btn-publish active tc__unpublish"
          [attr.aria-label]="'Dépublier ' + template.name"
          (click)="onUnpublishClick($event)"
          data-testid="card-unpublish-btn"
        >
          Dépublier
        </button>
        <button
          *ngIf="!(template.published && currentUserRole === 'super_admin')"
          type="button"
          class="btn-publish"
          [class.active]="template.published"
          [attr.aria-label]="template.published ? 'Dépublier ' + template.name : 'Publier ' + template.name"
          (click)="onTogglePublish($event)"
        >
          {{ template.published ? '✓ Publié' : 'Publier' }}
        </button>
        <button
          type="button"
          class="btn-duplicate"
          [attr.aria-label]="'Dupliquer ' + template.name"
          [disabled]="duplicating"
          (click)="onDuplicate($event)"
          data-testid="card-duplicate-btn"
        >
          {{ duplicating ? 'Duplication…' : '⎘ Dupliquer' }}
        </button>
        <!--
          Quick task 260507-gxd — DELETE template end-to-end (P0 #1 + #2).
          Visible only to super_admin (the parent component gates the click via
          isSuperAdmin). The actual typed-name confirmation modal lives in the
          parent (RemotionTemplatesComponent) — this button just emits the intent.
        -->
        <button
          *ngIf="currentUserRole === 'super_admin'"
          type="button"
          class="btn-delete"
          [attr.aria-label]="'Supprimer ' + template.name"
          [attr.data-testid]="'template-delete-btn-' + template.id"
          (click)="onDelete($event)"
        >
          🗑 Supprimer
        </button>
        <!--
          Quick task 260507-les — bouton ouvrant le drawer historique versions.
          Visible aux admins (l'API restore est gated admin / super_admin). La
          modale de confirmation typed-name vit dans le drawer parent.
        -->
        <button
          type="button"
          class="btn-history"
          [attr.aria-label]="historyButtonLabel(template.name)"
          [attr.data-testid]="'template-versions-button-' + template.id"
          (click)="onOpenVersions($event)"
          title="Historique des versions"
        >
          📜 Historique
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .template-card {
      border: 2px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      transition: border-color .15s, box-shadow .15s;
      background: var(--card-bg);
      outline: none;
    }
    .template-card:hover, .template-card:focus-visible {
      border-color: var(--primary-color);
      box-shadow: 0 2px 8px color-mix(in srgb, var(--primary-color) 15%, transparent);
    }
    .template-card.selected {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 20%, transparent);
    }
    .tpl-thumb {
      height: 140px;
      background: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .tpl-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .tpl-thumb-placeholder span { font-size: 40px; }
    .tpl-info { padding: 12px; }
    .tpl-name { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
    .tpl-desc { font-size: 12px; color: #666; margin-bottom: 8px; }
    .tpl-badges { display: flex; gap: 6px; }
    .badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; }
    .badge-published { background: #d1fae5; color: #065f46; }
    .badge-draft { background: #fef3c7; color: #92400e; }
    .badge-club { background: var(--studio-accent-100); color: var(--studio-accent-700); }
    .tpl-admin-actions { padding: 8px 12px; border-top: 1px solid #f3f4f6; }
    .btn-publish {
      font-size: 12px;
      padding: 4px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
    }
    .btn-publish.active { background: #d1fae5; border-color: #6ee7b7; color: #065f46; }
    .btn-duplicate {
      font-size: 12px;
      padding: 4px 12px;
      margin-left: 6px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
    }
    .btn-duplicate:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-duplicate:hover:not(:disabled) { background: #f3f4f6; }
    .btn-delete {
      font-size: 12px;
      padding: 4px 12px;
      margin-left: 6px;
      border: 1px solid var(--danger-border, #fca5a5);
      border-radius: 6px;
      background: var(--danger-bg, #fee2e2);
      color: var(--danger-color, #b91c1c);
      cursor: pointer;
    }
    .btn-delete:hover { background: var(--danger-hover, #fecaca); }
    /* Quick task 260507-les — badge + button "Historique versions". */
    .badge-version {
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
      color: var(--primary-color);
    }
    .btn-history {
      font-size: 12px;
      padding: 4px 12px;
      margin-left: 6px;
      min-width: 40px;
      min-height: 32px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--card-bg);
      color: var(--text-color, inherit);
      cursor: pointer;
    }
    .btn-history:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, transparent);
      border-color: var(--primary-color);
    }
    /* Quick task 260507-obe — usedByCount badge (design tokens, post PR #884). */
    .tc__used-by {
      background: var(--studio-accent-100);
      color: var(--studio-accent-700);
    }
    .tc__used-by--zero {
      background: transparent;
      color: var(--text-muted);
      border: 1px solid var(--border-color);
    }
  `],
})
export class TemplateCardComponent {
  @Input({ required: true }) template!: RemotionTemplate;
  @Input() selected = false;
  @Input() isAdmin = false;
  @Input() duplicating = false;
  /**
   * ADR-110 / Phase 03 / Plan 05 / PUB-01 — only super_admin sees the
   * "Dépublier" CTA on a published template. Other admin roles still see
   * the legacy publish toggle.
   */
  @Input() currentUserRole: string | null = null;

  @Output() cardSelect = new EventEmitter<RemotionTemplate>();
  @Output() publishToggle = new EventEmitter<RemotionTemplate>();
  @Output() duplicateRequested = new EventEmitter<RemotionTemplate>();
  @Output() unpublishRequested = new EventEmitter<RemotionTemplate>();
  /** Quick task 260507-gxd — emits when super_admin clicks "Supprimer" on the card. */
  @Output() deleteRequested = new EventEmitter<RemotionTemplate>();
  /** Quick task 260507-les — emits when admin clicks "Historique" on the card. */
  @Output() openVersions = new EventEmitter<RemotionTemplate>();

  private confirmDialog = inject(ConfirmDialogService);
  protected readonly MODAL_MESSAGES = MODAL_MESSAGES;

  onSelect(): void {
    this.cardSelect.emit(this.template);
  }

  onTogglePublish(event: Event): void {
    event.stopPropagation();
    this.publishToggle.emit(this.template);
  }

  /**
   * ADR-110 / Phase 03 / Plan 05 / PUB-01 — guarded unpublish click.
   *
   * Opens the shared ConfirmDialog (NO native browser confirm — Phase 1 ban) with
   * FR copy bound to MODAL_MESSAGES. On confirm, emits unpublishRequested
   * — the parent list calls dataService.unpublishTemplate() and reloads.
   */
  async onUnpublishClick(event: Event): Promise<void> {
    event.stopPropagation();
    const confirmed = await this.confirmDialog.confirm(MODAL_MESSAGES.unpublish_confirm_body, {
      title: MODAL_MESSAGES.unpublish_confirm_title,
      confirmLabel: MODAL_MESSAGES.unpublish_confirm_cta,
      cancelLabel: MODAL_MESSAGES.unpublish_cancel_cta,
      confirmStyle: 'danger',
    });
    if (!confirmed) return;
    this.unpublishRequested.emit(this.template);
  }

  onDuplicate(event: Event): void {
    event.stopPropagation();
    this.duplicateRequested.emit(this.template);
  }

  /**
   * Quick task 260507-gxd — emit delete intent. The parent shows the
   * typed-name confirmation modal (GitHub repo-delete pattern).
   */
  onDelete(event: Event): void {
    event.stopPropagation();
    this.deleteRequested.emit(this.template);
  }

  /**
   * Quick task 260507-les — emit "open history drawer" intent. The parent
   * mounts <app-template-versions-drawer> when its state is non-null.
   */
  onOpenVersions(event: Event): void {
    event.stopPropagation();
    this.openVersions.emit(this.template);
  }

  /** Sortie en méthode pour éviter les double-quotes / backslashes inline. */
  historyButtonLabel(name: string): string {
    return `Voir l'historique des versions de ${name}`;
  }
}
