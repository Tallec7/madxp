import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SitesService } from '../../../core/services/sites.service';
import type { Site } from '../../../core/models';
import { TemplatesStudioService } from '../templates-studio.service';
import type {
  RenderDistributionMode,
  RenderDistributionResult,
} from '../templates-studio.types';

/**
 * Modal de distribution multi-sites d'un render `ready`.
 *
 * Le user choisit entre :
 *  - **Push** : crée 1 row `videos` taguée par site cible (1 ligne par site).
 *    Chaque club voit la vidéo dans sa bibliothèque comme un asset propre.
 *  - **Grant** : crée 1 row globale (admin) + N grants ADR-082. Les clubs
 *    cibles peuvent ajouter la vidéo à leur config sans pouvoir la supprimer
 *    (asset partagé géré par les admins).
 *
 * Idempotent côté backend : re-cliquer "Distribuer" avec les mêmes site_ids
 * ne crée pas de doublons (push vérifie storage_path, grant utilise
 * `INSERT ... ON CONFLICT DO NOTHING`).
 */
@Component({
  selector: 'app-distribute-render-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="drm__backdrop" (click)="onBackdrop($event)" data-testid="distribute-render-modal">
      <div class="drm__dialog" role="dialog" aria-modal="true">
        <header class="drm__header">
          <h3>Distribuer le render</h3>
          <button type="button" class="drm__close" (click)="onCancel()" aria-label="Fermer">
            ×
          </button>
        </header>

        <div class="drm__body">
          @if (loadingSites()) {
            <p class="drm__muted">Chargement des sites…</p>
          } @else if (loadError()) {
            <p class="drm__error">{{ loadError() }}</p>
          } @else {
            <fieldset class="drm__field">
              <legend>Mode de distribution</legend>
              <label class="drm__radio">
                <input
                  type="radio"
                  name="mode"
                  value="push"
                  [(ngModel)]="mode"
                />
                <span>
                  <strong>Pousser dans la bibliothèque de chaque site</strong>
                  <small>
                    Une copie indépendante par club (chacun peut renommer / supprimer).
                  </small>
                </span>
              </label>
              <label class="drm__radio">
                <input
                  type="radio"
                  name="mode"
                  value="grant"
                  [(ngModel)]="mode"
                />
                <span>
                  <strong>Asset global partagé via grants</strong>
                  <small>
                    Une vidéo unique côté admin, les clubs cibles peuvent l'ajouter à
                    leur config (pattern ADR-082, pas de duplication).
                  </small>
                </span>
              </label>
            </fieldset>

            <label class="drm__field">
              <span>Catégorie</span>
              <input
                type="text"
                [(ngModel)]="category"
                placeholder="STUDIO_RENDER"
                maxlength="80"
              />
            </label>

            <fieldset class="drm__field">
              <legend>
                Sites cibles
                @if (selectedIds().length > 0) {
                  <span class="drm__counter">({{ selectedIds().length }})</span>
                }
              </legend>
              <input
                type="search"
                class="drm__search"
                [(ngModel)]="filterText"
                placeholder="Filtrer par nom de club…"
              />
              <div class="drm__site-list" data-testid="distribute-render-modal-sites">
                @for (s of filteredSites(); track s.id) {
                  <label class="drm__site">
                    <input
                      type="checkbox"
                      [checked]="isSelected(s.id)"
                      (change)="toggleSite(s.id)"
                    />
                    <span class="drm__site-name">
                      {{ s.club_name || s.site_name }}
                    </span>
                    <small class="drm__site-meta">{{ s.site_name }}</small>
                  </label>
                }
                @if (filteredSites().length === 0) {
                  <p class="drm__muted">Aucun site ne correspond.</p>
                }
              </div>
            </fieldset>

            @if (submitError()) {
              <p class="drm__error">{{ submitError() }}</p>
            }
          }
        </div>

        <footer class="drm__footer">
          <button type="button" class="drm__btn drm__btn--ghost" (click)="onCancel()">
            Annuler
          </button>
          <button
            type="button"
            class="drm__btn drm__btn--primary"
            (click)="onSubmit()"
            [disabled]="!canSubmit()"
            data-testid="distribute-render-submit"
          >
            @if (submitting()) {
              Distribution…
            } @else {
              Distribuer
            }
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .drm__backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 16px;
      }
      .drm__dialog {
        background: #0d1117;
        color: #e6edf3;
        border: 1px solid #30363d;
        border-radius: 10px;
        width: min(560px, 100%);
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
      }
      .drm__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        border-bottom: 1px solid #30363d;
        h3 {
          margin: 0;
          font-size: 1.05rem;
        }
      }
      .drm__close {
        background: transparent;
        color: #8b949e;
        border: none;
        font-size: 1.5rem;
        line-height: 1;
        cursor: pointer;
      }
      .drm__body {
        padding: 16px 20px;
        overflow: auto;
      }
      .drm__field {
        display: block;
        border: none;
        padding: 0;
        margin: 0 0 16px;
        legend {
          padding: 0;
          font-weight: 600;
          margin-bottom: 8px;
        }
      }
      .drm__radio {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid #30363d;
        border-radius: 8px;
        margin-bottom: 8px;
        cursor: pointer;
        small {
          display: block;
          color: #8b949e;
          font-size: 0.8rem;
          margin-top: 2px;
        }
      }
      .drm__field input[type='text'],
      .drm__search {
        display: block;
        width: 100%;
        background: #161b22;
        color: #e6edf3;
        border: 1px solid #30363d;
        border-radius: 6px;
        padding: 8px 10px;
        font-size: 0.9rem;
        margin-top: 6px;
      }
      .drm__counter {
        color: #58a6ff;
        font-weight: 500;
        margin-left: 4px;
      }
      .drm__site-list {
        max-height: 240px;
        overflow-y: auto;
        border: 1px solid #30363d;
        border-radius: 6px;
        padding: 4px;
        margin-top: 6px;
      }
      .drm__site {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        &:hover {
          background: #161b22;
        }
      }
      .drm__site-name {
        flex: 1;
      }
      .drm__site-meta {
        color: #8b949e;
        font-size: 0.75rem;
      }
      .drm__muted {
        color: #8b949e;
        font-size: 0.85rem;
        margin: 8px 0;
      }
      .drm__error {
        color: #f85149;
        background: #f8514920;
        border: 1px solid #f85149;
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 0.85rem;
        margin: 8px 0;
      }
      .drm__footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 20px;
        border-top: 1px solid #30363d;
      }
      .drm__btn {
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 0.9rem;
        cursor: pointer;
        border: 1px solid transparent;
      }
      .drm__btn--ghost {
        background: transparent;
        color: #e6edf3;
        border-color: #30363d;
      }
      .drm__btn--primary {
        background: #238636;
        color: #fff;
        &:hover:not(:disabled) {
          background: #2ea043;
        }
        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    `,
  ],
})
export class DistributeRenderModalComponent implements OnInit {
  private sitesService = inject(SitesService);
  private studio = inject(TemplatesStudioService);

  @Input({ required: true }) renderId!: string;

  @Output() distributed = new EventEmitter<RenderDistributionResult>();
  @Output() cancelled = new EventEmitter<void>();

  mode: RenderDistributionMode = 'push';
  category = 'STUDIO_RENDER';
  filterText = '';

  sites = signal<Site[]>([]);
  selectedIds = signal<string[]>([]);
  loadingSites = signal(true);
  loadError = signal<string | null>(null);

  submitting = signal(false);
  submitError = signal<string | null>(null);

  ngOnInit(): void {
    this.sitesService.loadSites({ limit: 200 }).subscribe({
      next: (res) => {
        this.sites.set(res.sites);
        this.loadingSites.set(false);
      },
      error: (err) => {
        this.loadError.set(err?.error?.error ?? 'Erreur lors du chargement des sites');
        this.loadingSites.set(false);
      },
    });
  }

  filteredSites(): Site[] {
    const f = this.filterText.trim().toLowerCase();
    const all = this.sites();
    if (!f) return all;
    return all.filter(
      (s) =>
        (s.club_name?.toLowerCase().includes(f) ?? false) ||
        (s.site_name?.toLowerCase().includes(f) ?? false),
    );
  }

  isSelected(siteId: string): boolean {
    return this.selectedIds().includes(siteId);
  }

  toggleSite(siteId: string): void {
    const cur = this.selectedIds();
    if (cur.includes(siteId)) {
      this.selectedIds.set(cur.filter((id) => id !== siteId));
    } else {
      this.selectedIds.set([...cur, siteId]);
    }
  }

  canSubmit(): boolean {
    return (
      !this.submitting() &&
      !this.loadingSites() &&
      this.selectedIds().length > 0 &&
      !!this.renderId
    );
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.submitError.set(null);
    const payload = {
      mode: this.mode,
      site_ids: this.selectedIds(),
      category: this.category?.trim() || undefined,
    };
    this.studio.distributeRender(this.renderId, payload).subscribe({
      next: (result) => {
        this.submitting.set(false);
        this.distributed.emit(result);
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err?.error?.error ?? 'Erreur lors de la distribution');
      },
    });
  }

  onCancel(): void {
    if (this.submitting()) return;
    this.cancelled.emit();
  }

  onBackdrop(event: MouseEvent): void {
    // Close uniquement si le user clique sur le backdrop, pas le dialog.
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }
}
