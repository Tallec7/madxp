import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ClubTemplatesDataService,
  type ClubTemplateQuota,
} from './club-templates-data.service';
import { AdminStudioPanelComponent } from './studio-v2/admin/admin-studio-panel.component';
import { StudioV2EditorComponent } from './studio-v2/studio-v2-editor.component';
import { NotificationService } from '../../../core/services/notification.service';
import type {
  RemotionTemplate,
  RenderJobPhase,
  RenderJobSnapshot,
  RenderResult,
  RenderTemplateRequestV2,
  TemplateStudioView,
} from './remotion-templates.types';

type StudioMode = 'edit' | 'render';

/**
 * ADR-075 V3 Phase B — Page club "Mes templates".
 *
 * Liste les templates scopés au site de l'utilisateur club (site_id match)
 * et propose deux flows :
 *   - **Personnaliser** (mode `edit`) : studio v2 en mode restreint
 *     (`clubMode=true`) — drag + rename + font/color seulement.
 *   - **Créer une vidéo** (mode `render`) : formulaire V2 (variants + text +
 *     images + options) + bouton de rendu async + polling status.
 *     Réutilise `StudioV2EditorComponent` pour la cohérence avec l'admin.
 */
@Component({
  selector: 'app-my-templates',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AdminStudioPanelComponent,
    StudioV2EditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mt" data-testid="my-templates">
      <header class="mt__head">
        <h1>Mes templates</h1>
        <p class="mt__hint">
          Créez vos vidéos depuis vos templates ou personnalisez leur apparence.
        </p>
        <div class="mt__quota" *ngIf="quota() as q" data-testid="my-templates-quota">
          <span
            class="mt__badge"
            [class.mt__badge--warn]="q.templates.remaining === 0"
            data-testid="my-templates-quota-templates"
          >
            {{ q.templates.used }}/{{ q.templates.limit }} templates
          </span>
          <span
            class="mt__badge"
            [class.mt__badge--warn]="q.renders.remaining === 0"
            data-testid="my-templates-quota-renders"
          >
            {{ q.renders.used }}/{{ q.renders.limit }} rendus / 24h
          </span>
        </div>
      </header>

      <section class="mt__list" *ngIf="!selected()">
        <ng-container *ngIf="!loading(); else loadingTpl">
          <div class="mt__empty" *ngIf="!templates().length">
            Aucun template n'est encore associé à votre club. Contactez le support NEOPRO.
          </div>
          <ul class="mt__grid" *ngIf="templates().length">
            <li *ngFor="let t of templates()" class="mt__card">
              <h3>{{ t.name }}</h3>
              <p>{{ t.description || 'Sans description' }}</p>
              <div class="mt__card-actions">
                <button
                  type="button"
                  class="mt__btn mt__btn--primary"
                  [attr.data-testid]="'my-templates-render-' + t.id"
                  [disabled]="rendersExhausted()"
                  [title]="rendersExhausted() ? 'Quota de rendus atteint' : ''"
                  (click)="open(t.id, 'render')"
                >
                  ▶ Créer une vidéo
                </button>
                <button
                  type="button"
                  class="mt__btn mt__btn--ghost"
                  [attr.data-testid]="'my-templates-edit-' + t.id"
                  (click)="open(t.id, 'edit')"
                >
                  ✎ Personnaliser
                </button>
              </div>
            </li>
          </ul>
        </ng-container>
        <ng-template #loadingTpl>
          <div class="mt__loading">Chargement…</div>
        </ng-template>
      </section>

      <!-- MODE ÉDITION : studio v2 clubMode (drag + font + color) -->
      <section class="mt__studio" *ngIf="selected() && mode() === 'edit' && view()">
        <div class="mt__studio-head">
          <button type="button" class="mt__back" (click)="closeStudio()">
            ← Retour
          </button>
          <label class="mt__bg-upload" [class.mt__bg-upload--busy]="uploading()">
            <input
              type="file"
              accept="video/mp4,video/webm"
              (change)="onBackgroundSelected($event)"
              [disabled]="uploading()"
              data-testid="my-templates-bg-upload"
            />
            <span>{{ uploading() ? 'Upload…' : 'Changer la vidéo de fond' }}</span>
          </label>
        </div>
        <app-admin-studio-panel
          [view]="view()!"
          [clubMode]="true"
          (changed)="reloadView()"
        ></app-admin-studio-panel>
      </section>

      <!-- MODE RENDU : formulaire de création vidéo -->
      <section class="mt__render" *ngIf="selected() && mode() === 'render' && view()">
        <div class="mt__studio-head">
          <button type="button" class="mt__back" (click)="closeStudio()">
            ← Retour
          </button>
          <input
            type="text"
            class="mt__title-input"
            [ngModel]="videoTitle()"
            (ngModelChange)="videoTitle.set($event)"
            [placeholder]="view()!.name + ' — vidéo'"
            aria-label="Titre de la vidéo"
            data-testid="my-templates-render-title"
          />
        </div>

        <app-studio-v2-editor
          [view]="view()!"
          (payloadChange)="onPayloadChange($event)"
          (readyChange)="onReadyChange($event)"
        ></app-studio-v2-editor>

        <div class="mt__render-bar">
          <div class="mt__render-status" *ngIf="rendering() || lastResult()">
            <ng-container *ngIf="rendering()">
              <progress
                [value]="renderProgress()"
                max="100"
                class="mt__progress"
                data-testid="my-templates-render-progress"
              ></progress>
              <p class="mt__render-msg">{{ renderStatusMessage() }}</p>
            </ng-container>
            <div
              *ngIf="!rendering() && lastResult() as r"
              class="mt__render-done"
              data-testid="my-templates-render-done"
            >
              <span class="mt__render-ok">✓ Vidéo générée et ajoutée à la bibliothèque</span>
              <a
                *ngIf="r.url"
                [href]="r.url"
                target="_blank"
                rel="noopener noreferrer"
                class="mt__render-link"
              >Voir la vidéo</a>
            </div>
          </div>

          <button
            type="button"
            class="mt__btn mt__btn--primary mt__render-btn"
            [disabled]="!canRender() || rendering() || rendersExhausted()"
            [title]="renderButtonTooltip()"
            (click)="render()"
            data-testid="my-templates-render-submit"
          >
            <ng-container *ngIf="!rendering()">▶ Lancer le rendu</ng-container>
            <ng-container *ngIf="rendering()">⏳ Rendu en cours…</ng-container>
          </button>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .mt { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .mt__head h1 { margin: 0; font-size: 22px; color: #111827; }
    .mt__hint { margin: 4px 0 0; color: #6b7280; font-size: 13px; }
    .mt__grid { list-style: none; padding: 0; margin: 0; display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
    .mt__card { padding: 14px; border: 1px solid #e5e7eb; border-radius: 6px;
      background: #fff; display: flex; flex-direction: column; gap: 8px; }
    .mt__card h3 { margin: 0; font-size: 15px; color: #111827; }
    .mt__card p { margin: 0; font-size: 12px; color: #6b7280; flex: 1; }
    .mt__card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .mt__btn { padding: 6px 12px; font-size: 12px; border-radius: 4px;
      cursor: pointer; border: 1px solid transparent; }
    .mt__btn:disabled { opacity: .55; cursor: not-allowed; }
    .mt__btn--primary { background: #6d28d9; color: #fff; border-color: #6d28d9; }
    .mt__btn--primary:hover:not(:disabled) { background: #5b21b6; }
    .mt__btn--ghost { background: #fff; color: #374151; border-color: #d1d5db; }
    .mt__btn--ghost:hover:not(:disabled) { background: #f9fafb; }
    .mt__empty, .mt__loading { padding: 20px; text-align: center; color: #6b7280;
      border: 1px dashed #d1d5db; border-radius: 6px; }
    .mt__back { align-self: flex-start; padding: 4px 10px; font-size: 12px;
      border: 1px solid #d1d5db; background: #f9fafb; border-radius: 4px; cursor: pointer; }
    .mt__back:hover { background: #f3f4f6; }
    .mt__studio-head { display: flex; justify-content: space-between; align-items: center;
      gap: 12px; margin-bottom: 12px; }
    .mt__title-input { flex: 1; max-width: 360px; padding: 6px 10px;
      border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; }
    .mt__bg-upload { display: inline-flex; align-items: center; padding: 6px 12px;
      font-size: 12px; border: 1px solid #6d28d9; background: #fff; color: #6d28d9;
      border-radius: 4px; cursor: pointer; }
    .mt__bg-upload:hover { background: #f5f3ff; }
    .mt__bg-upload input { display: none; }
    .mt__bg-upload--busy { opacity: 0.6; cursor: wait; }
    .mt__quota { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .mt__badge { display: inline-flex; align-items: center; padding: 4px 10px;
      font-size: 12px; font-weight: 500; color: #374151; background: #f3f4f6;
      border: 1px solid #e5e7eb; border-radius: 999px; }
    .mt__badge--warn { color: #b45309; background: #fef3c7; border-color: #fcd34d; }
    .mt__render { display: flex; flex-direction: column; gap: 16px; }
    .mt__render-bar { display: flex; justify-content: space-between; align-items: center;
      gap: 16px; padding: 12px 16px; background: #f9fafb; border: 1px solid #e5e7eb;
      border-radius: 6px; flex-wrap: wrap; }
    .mt__render-status { flex: 1; min-width: 240px; display: flex; flex-direction: column;
      gap: 6px; }
    .mt__progress { width: 100%; height: 8px; }
    .mt__render-msg { margin: 0; font-size: 12px; color: #4b5563; }
    .mt__render-done { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .mt__render-ok { font-size: 13px; color: #15803d; font-weight: 500; }
    .mt__render-link { font-size: 12px; color: #6d28d9; text-decoration: underline; }
    .mt__render-btn { font-size: 14px; padding: 10px 20px; min-width: 180px; }
  `],
})
export class MyTemplatesComponent implements OnInit, OnDestroy {
  private clubApi = inject(ClubTemplatesDataService);
  private notifications = inject(NotificationService);

  templates = signal<RemotionTemplate[]>([]);
  loading = signal<boolean>(true);
  selected = signal<string | null>(null);
  mode = signal<StudioMode | null>(null);
  view = signal<TemplateStudioView | null>(null);
  uploading = signal<boolean>(false);
  quota = signal<ClubTemplateQuota | null>(null);

  // Render state
  videoTitle = signal<string>('');
  renderPayload = signal<RenderTemplateRequestV2 | null>(null);
  ready = signal<boolean>(false);
  rendering = signal<boolean>(false);
  renderProgress = signal<number>(0);
  renderStatusMessage = signal<string>('');
  currentJobId = signal<string | null>(null);
  lastResult = signal<RenderResult | null>(null);

  rendersExhausted = computed(() => {
    const q = this.quota();
    return q !== null && q.renders.remaining === 0;
  });

  private readonly POLL_INTERVAL_MS = 2000;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadList();
    this.loadQuota();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  loadQuota(): void {
    this.clubApi.getQuota().subscribe({
      next: (q) => this.quota.set(q),
      error: () => { /* quota is informational — silent fail */ },
    });
  }

  loadList(): void {
    this.loading.set(true);
    this.clubApi.list().subscribe({
      next: (list) => {
        this.templates.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.notifications.error('Impossible de charger vos templates');
        this.loading.set(false);
      },
    });
  }

  open(id: string, targetMode: StudioMode): void {
    this.selected.set(id);
    this.mode.set(targetMode);
    this.resetRenderState();
    this.reloadView();
  }

  reloadView(): void {
    const id = this.selected();
    if (!id) return;
    this.clubApi.getStudioView(id).subscribe({
      next: (v) => {
        this.view.set(v);
        if (this.mode() === 'render') {
          this.videoTitle.set(v.name);
        }
      },
      error: () => this.notifications.error('Impossible de charger le studio'),
    });
  }

  closeStudio(): void {
    this.stopPolling();
    this.selected.set(null);
    this.mode.set(null);
    this.view.set(null);
    this.resetRenderState();
    this.loadList();
    this.loadQuota();
  }

  onBackgroundSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const templateId = this.selected();
    if (!file || !templateId) return;
    this.uploading.set(true);
    this.clubApi.uploadVariantBackground(templateId, file).subscribe({
      next: () => {
        this.notifications.success('Vidéo de fond mise à jour');
        this.uploading.set(false);
        input.value = '';
        this.reloadView();
      },
      error: () => {
        this.notifications.error('Échec upload vidéo');
        this.uploading.set(false);
        input.value = '';
      },
    });
  }

  // ─── Render flow (mode === 'render') ─────────────────────────────────────

  onPayloadChange(payload: RenderTemplateRequestV2): void {
    this.renderPayload.set(payload);
  }

  onReadyChange(ready: boolean): void {
    this.ready.set(ready);
  }

  canRender(): boolean {
    return this.ready() && this.renderPayload() !== null;
  }

  renderButtonTooltip(): string {
    if (this.rendersExhausted()) return 'Quota de rendus atteint (24h)';
    if (this.rendering()) return 'Rendu en cours…';
    if (!this.canRender()) return 'Remplissez les champs requis';
    return '';
  }

  render(): void {
    const templateId = this.selected();
    const payload = this.renderPayload();
    if (!templateId || !payload || !this.canRender()) return;
    if (this.rendersExhausted()) {
      this.notifications.error('Quota de rendus atteint (24h)');
      return;
    }

    this.stopPolling();
    this.rendering.set(true);
    this.renderProgress.set(2);
    this.renderStatusMessage.set('Envoi au serveur…');
    this.lastResult.set(null);

    const title = this.videoTitle().trim() || this.view()?.name || 'Vidéo';

    this.clubApi.enqueueRenderV2(templateId, payload, title).subscribe({
      next: (job) => {
        this.currentJobId.set(job.job_id);
        this.renderProgress.set(Math.max(5, job.progress));
        this.renderStatusMessage.set('Rendu en file d\'attente…');
        this.pollJob();
      },
      error: (err) => {
        this.rendering.set(false);
        const msg = (err?.error?.detail as string) || 'Erreur lors du rendu';
        this.notifications.error(msg);
      },
    });
  }

  private pollJob(): void {
    const jobId = this.currentJobId();
    if (!jobId) return;
    this.pollTimer = setTimeout(() => {
      const id = this.currentJobId();
      if (!id) return;
      this.clubApi.pollRenderJob(id).subscribe({
        next: (snapshot) => this.applyJobSnapshot(snapshot),
        error: (err) => {
          const status = err?.status;
          if (status === 404 || status === 403) {
            this.rendering.set(false);
            this.stopPolling();
            this.notifications.error('Rendu introuvable');
          } else {
            // Transient error — keep polling
            this.pollJob();
          }
        },
      });
    }, this.POLL_INTERVAL_MS);
  }

  private applyJobSnapshot(snapshot: RenderJobSnapshot): void {
    this.renderProgress.set(Math.max(this.renderProgress(), snapshot.progress));
    this.renderStatusMessage.set(this.statusMessageFor(snapshot.status, snapshot.phase));

    if (snapshot.status === 'completed') {
      this.stopPolling();
      this.rendering.set(false);
      this.renderProgress.set(100);
      if (snapshot.video_id && snapshot.video_url) {
        this.lastResult.set({
          video_id: snapshot.video_id,
          url: snapshot.video_url,
          title: this.videoTitle() || this.view()?.name || '',
          file_size: snapshot.file_size ?? 0,
        });
      }
      this.notifications.success('Vidéo générée et ajoutée à la bibliothèque !');
      this.loadQuota();
      return;
    }

    if (snapshot.status === 'failed') {
      this.stopPolling();
      this.rendering.set(false);
      this.notifications.error(snapshot.error_message || 'Erreur lors du rendu');
      return;
    }

    this.pollJob();
  }

  private statusMessageFor(status: string, phase: RenderJobPhase): string {
    if (status === 'pending') return 'En file d\'attente…';
    switch (phase) {
      case 'bundling': return 'Préparation du moteur de rendu…';
      case 'selecting': return 'Analyse de la composition…';
      case 'rendering': return 'Rendu des images en cours…';
      case 'uploading': return 'Téléversement de la vidéo…';
      default: return 'Rendu en cours…';
    }
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.currentJobId.set(null);
  }

  private resetRenderState(): void {
    this.renderPayload.set(null);
    this.ready.set(false);
    this.rendering.set(false);
    this.renderProgress.set(0);
    this.renderStatusMessage.set('');
    this.lastResult.set(null);
    this.videoTitle.set('');
  }
}
