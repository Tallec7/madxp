import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClubTemplatesDataService } from './club-templates-data.service';
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
        <button type="button" class="mt__back" (click)="closeStudio()">
          ← Retour
        </button>
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
  `],
})
export class MyTemplatesComponent implements OnInit {
  private clubApi = inject(ClubTemplatesDataService);
  private notifications = inject(NotificationService);

  templates = signal<RemotionTemplate[]>([]);
  loading = signal<boolean>(true);
  selected = signal<string | null>(null);
  view = signal<TemplateStudioView | null>(null);

  ngOnInit(): void {
    this.loadList();
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
  }
}
