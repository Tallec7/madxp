import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ClubTemplatesDataService,
  type ClubTemplateQuota,
} from './club-templates-data.service';
import { AdminStudioPanelComponent } from './studio-v2/admin/admin-studio-panel.component';
import { NotificationService } from '../../../core/services/notification.service';
import type {
  RemotionTemplate,
  TemplateStudioView,
} from './remotion-templates.types';

/**
 * ADR-075 V3 Phase B — Page club "Mes templates".
 *
 * Liste les templates scopés au site de l'utilisateur club (site_id match)
 * et ouvre le studio v2 en mode restreint (`clubMode=true`) : pas de gestion
 * variants/layers, pas de création de champ — drag + rename + font/color seulement.
 */
@Component({
  selector: 'app-my-templates',
  standalone: true,
  imports: [CommonModule, AdminStudioPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mt" data-testid="my-templates">
      <header class="mt__head">
        <h1>Mes templates</h1>
        <p class="mt__hint">
          Personnalisez vos templates vidéo (Premium). Drag &amp; drop pour repositionner,
          éditez les textes, changez le format.
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
              <button
                type="button"
                class="mt__open"
                [attr.data-testid]="'my-templates-open-' + t.id"
                (click)="open(t.id)"
              >
                Ouvrir le studio
              </button>
            </li>
          </ul>
        </ng-container>
        <ng-template #loadingTpl>
          <div class="mt__loading">Chargement…</div>
        </ng-template>
      </section>

      <section class="mt__studio" *ngIf="selected() && view()">
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
    </div>
  `,
  styles: [`
    .mt { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .mt__head h1 { margin: 0; font-size: 22px; color: #111827; }
    .mt__hint { margin: 4px 0 0; color: #6b7280; font-size: 13px; }
    .mt__grid { list-style: none; padding: 0; margin: 0; display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .mt__card { padding: 14px; border: 1px solid #e5e7eb; border-radius: 6px;
      background: #fff; display: flex; flex-direction: column; gap: 8px; }
    .mt__card h3 { margin: 0; font-size: 15px; color: #111827; }
    .mt__card p { margin: 0; font-size: 12px; color: #6b7280; }
    .mt__open { align-self: flex-start; padding: 6px 12px; font-size: 12px;
      border: 1px solid #6d28d9; background: #6d28d9; color: #fff; border-radius: 4px;
      cursor: pointer; }
    .mt__open:hover { background: #5b21b6; }
    .mt__empty, .mt__loading { padding: 20px; text-align: center; color: #6b7280;
      border: 1px dashed #d1d5db; border-radius: 6px; }
    .mt__back { align-self: flex-start; padding: 4px 10px; font-size: 12px;
      border: 1px solid #d1d5db; background: #f9fafb; border-radius: 4px; cursor: pointer; }
    .mt__back:hover { background: #f3f4f6; }
    .mt__studio-head { display: flex; justify-content: space-between; align-items: center;
      gap: 12px; margin-bottom: 12px; }
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
  `],
})
export class MyTemplatesComponent implements OnInit {
  private clubApi = inject(ClubTemplatesDataService);
  private notifications = inject(NotificationService);

  templates = signal<RemotionTemplate[]>([]);
  loading = signal<boolean>(true);
  selected = signal<string | null>(null);
  view = signal<TemplateStudioView | null>(null);
  uploading = signal<boolean>(false);
  quota = signal<ClubTemplateQuota | null>(null);

  ngOnInit(): void {
    this.loadList();
    this.loadQuota();
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

  open(id: string): void {
    this.selected.set(id);
    this.reloadView();
  }

  reloadView(): void {
    const id = this.selected();
    if (!id) return;
    this.clubApi.getStudioView(id).subscribe({
      next: (v) => this.view.set(v),
      error: () => this.notifications.error('Impossible de charger le studio'),
    });
  }

  closeStudio(): void {
    this.selected.set(null);
    this.view.set(null);
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
}
