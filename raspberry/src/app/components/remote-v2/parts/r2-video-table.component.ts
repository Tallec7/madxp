import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Category } from '../../../interfaces/category.interface';
import { PiConfigVideoEntry } from '../../../interfaces/video.interface';
import { formatDuration, videoTags, VideoTag } from '../remote-v2-helpers';
import { R2IconComponent } from '../icons/r2-icon.component';

/**
 * Table vidéo en mode tableur dense pour le layout régie pro PC C
 * (SPEC-V2-LAYOUT-01 §5C).
 *
 * Colonnes : `# | NOM | TAGS | DURÉE | bouton play`.
 * Contenu : vidéos de la catégorie/sous-catégorie sélectionnée dans
 * la sidebar gauche (col 1), filtrées par phase.
 *
 * Affiche un breadcrumb `Catégorie › Sous-dossier · N vidéos` en header.
 * État playing matérialisé par un point rouge (à la place du chevron play)
 * + ligne accentuée.
 */
@Component({
  selector: 'app-r2-video-table',
  standalone: true,
  imports: [CommonModule, R2IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `
    <section class="r2-video-table" *ngIf="category">
      <header class="r2-video-table__header">
        <h2 class="r2-video-table__breadcrumb">
          <span class="r2-video-table__crumb-cat">{{ category.name }}</span>
          <ng-container *ngIf="subCategory">
            <span class="r2-video-table__crumb-sep" aria-hidden="true">›</span>
            <span class="r2-video-table__crumb-sub">{{ subCategory.name }}</span>
          </ng-container>
        </h2>
        <span class="r2-video-table__count">
          {{ visibleVideos.length }}
          {{ visibleVideos.length === 1 ? 'vidéo' : 'vidéos' }}
        </span>
      </header>

      <div class="r2-video-table__grid" role="table" aria-label="Liste vidéos">
        <div class="r2-video-table__head" role="row">
          <span class="r2-video-table__cell r2-video-table__cell--num" role="columnheader">#</span>
          <span class="r2-video-table__cell r2-video-table__cell--name" role="columnheader">Nom</span>
          <span class="r2-video-table__cell r2-video-table__cell--tags" role="columnheader">Tags</span>
          <span class="r2-video-table__cell r2-video-table__cell--duration" role="columnheader">Durée</span>
          <span class="r2-video-table__cell r2-video-table__cell--actions" role="columnheader" aria-label="Actions"></span>
        </div>

        <button
          *ngFor="let v of visibleVideos; let i = index; trackBy: trackById"
          class="r2-video-table__row"
          role="row"
          [class.is-playing]="playingVideoId === v.id"
          [class.is-errored]="!!v.id && erroredVideoIds.has(v.id)"
          (click)="playClick.emit(v)"
        >
          <span class="r2-video-table__cell r2-video-table__cell--num" role="cell">
            {{ i + 1 }}
          </span>
          <span class="r2-video-table__cell r2-video-table__cell--name" role="cell">
            {{ v.name }}
          </span>
          <span class="r2-video-table__cell r2-video-table__cell--tags" role="cell">
            <span
              *ngFor="let t of tags(v)"
              class="r2-video-table__tag"
              [class.is-secondary]="t === 'secondary'"
              [class.is-sponsor]="t === 'sponsor'"
              [class.is-link]="t === 'link'"
            >
              <ng-container [ngSwitch]="t">
                <ng-container *ngSwitchCase="'secondary'">2ⁿᵈ écran</ng-container>
                <ng-container *ngSwitchCase="'sponsor'">sponsor</ng-container>
                <ng-container *ngSwitchCase="'link'">lien</ng-container>
              </ng-container>
            </span>
          </span>
          <span class="r2-video-table__cell r2-video-table__cell--duration" role="cell">
            {{ formatDur(v.durationSeconds) || '—' }}
          </span>
          <span class="r2-video-table__cell r2-video-table__cell--actions" role="cell">
            <span class="r2-video-table__playing-dot" *ngIf="playingVideoId === v.id" aria-label="En lecture"></span>
            <app-r2-icon
              *ngIf="playingVideoId !== v.id"
              name="play"
              [size]="14"
              aria-hidden="true"
            ></app-r2-icon>
          </span>
        </button>

        <div class="r2-video-table__empty" *ngIf="visibleVideos.length === 0" role="row">
          Aucune vidéo dans cette sélection.
        </div>
      </div>
    </section>

    <section class="r2-video-table r2-video-table--placeholder" *ngIf="!category">
      <div class="r2-video-table__placeholder">
        <span class="r2-video-table__placeholder-eyebrow">Sélectionne une catégorie</span>
        <span class="r2-video-table__placeholder-text">
          Choisis une catégorie ou un sous-dossier dans le panneau de gauche pour
          afficher la liste des vidéos.
        </span>
      </div>
    </section>
  `,
})
export class R2VideoTableComponent {
  @Input() category: Category | null = null;
  @Input() subCategory: Category | null = null;
  @Input() playingVideoId: string | null = null;
  @Input() erroredVideoIds = new Set<string>();

  @Output() playClick = new EventEmitter<PiConfigVideoEntry>();

  get visibleVideos(): PiConfigVideoEntry[] {
    if (this.subCategory) return this.subCategory.videos || [];
    if (!this.category) return [];
    if ((this.category.subCategories?.length || 0) > 0) {
      // Sans sous-dossier sélectionné, on aplatit toutes les vidéos des subs
      // pour donner un aperçu complet de la catégorie.
      const fromSubs = (this.category.subCategories || [])
        .flatMap(s => s.videos || []);
      return [...(this.category.videos || []), ...fromSubs];
    }
    return this.category.videos || [];
  }

  formatDur(s?: number): string {
    return s ? formatDuration(s) : '';
  }

  tags(v: PiConfigVideoEntry): VideoTag[] {
    return videoTags(v);
  }

  trackById(_i: number, v: PiConfigVideoEntry): string {
    return v.id || v.path || '';
  }
}
