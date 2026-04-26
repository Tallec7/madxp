import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Category } from '../../../interfaces/category.interface';
import { PiConfigVideoEntry } from '../../../interfaces/video.interface';
import { categoryCount, hasSubCategories } from '../remote-v2-helpers';
import { R2VideoRowComponent } from './r2-video-row.component';

export type Phase = 'before' | 'during' | 'after';

/**
 * Carte "Parcourir · temps affiché" + accordéon de catégories.
 * Gère phase tabs, expansion/collapse, sous-catégories, et délègue le play au parent.
 */
@Component({
  selector: 'app-r2-browse',
  standalone: true,
  imports: [CommonModule, R2VideoRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `
    <section class="r2-browse-card" *ngIf="showPhaseTabs">
      <div class="r2-browse-eyebrow">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Parcourir · temps affiché</span>
        <button class="r2-align-btn" *ngIf="phaseDivergesFromLoop" (click)="alignPhase.emit()">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 2 21 6l-4 4"/><path d="M3 12V8a4 4 0 0 1 4-4h14"/>
            <path d="M7 22 3 18l4-4"/><path d="M21 12v4a4 4 0 0 1-4 4H3"/>
          </svg>
          Aligner sur boucle
        </button>
      </div>
      <nav class="r2-phase-tabs">
        <button [class.active]="phaseId === 'before'" (click)="setPhase.emit('before')">Avant</button>
        <button [class.active]="phaseId === 'during'" (click)="setPhase.emit('during')">Match</button>
        <button [class.active]="phaseId === 'after'" (click)="setPhase.emit('after')">Après</button>
      </nav>
    </section>

    <section class="r2-categories">
      <div class="r2-category" *ngFor="let cat of categories">
        <button class="r2-cat-header" (click)="toggleCategory.emit(cat.id)">
          <svg class="r2-cat-chev" [class.open]="expandedCategories[cat.id]"
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 6 6 6-6 6"/>
          </svg>
          <span class="r2-cat-name">{{ cat.name }}</span>
          <span class="r2-cat-folders" *ngIf="hasSubs(cat)">
            {{ cat.subCategories!.length }} dossiers
          </span>
          <span class="r2-cat-count">{{ count(cat) }}</span>
        </button>

        <div class="r2-cat-content" *ngIf="expandedCategories[cat.id]">
          <div class="r2-subcat" *ngFor="let sub of cat.subCategories">
            <button class="r2-subcat-header" (click)="toggleSub.emit(sub.id)">
              <svg class="r2-cat-chev" [class.open]="expandedSubs[sub.id]"
                width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 6 6 6-6 6"/>
              </svg>
              <span class="r2-subcat-name">{{ sub.name }}</span>
              <span class="r2-subcat-count">{{ sub.videos?.length || 0 }}</span>
            </button>
            <div class="r2-videos" *ngIf="expandedSubs[sub.id]">
              <app-r2-video-row
                *ngFor="let v of sub.videos"
                [video]="v"
                [active]="playingVideoId === v.id"
                [errored]="!!v.id && erroredVideoIds.has(v.id)"
                [useLocalThumbnails]="useLocalThumbnails"
                [cacheBuster]="cacheBuster"
                (playClick)="playVideo.emit($event)"
              ></app-r2-video-row>
            </div>
          </div>

          <div class="r2-videos" *ngIf="cat.videos?.length">
            <app-r2-video-row
              *ngFor="let v of cat.videos"
              [video]="v"
              [active]="playingVideoId === v.id"
              [errored]="!!v.id && erroredVideoIds.has(v.id)"
              [useLocalThumbnails]="useLocalThumbnails"
              [cacheBuster]="cacheBuster"
              (playClick)="playVideo.emit($event)"
            ></app-r2-video-row>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class R2BrowseComponent {
  @Input() categories: Category[] = [];
  @Input() phaseId: Phase = 'during';
  @Input() phaseDivergesFromLoop = false;
  @Input() showPhaseTabs = true;
  @Input() expandedCategories: Record<string, boolean> = {};
  @Input() expandedSubs: Record<string, boolean> = {};
  @Input() playingVideoId: string | null = null;
  @Input() erroredVideoIds: ReadonlySet<string> = new Set<string>();
  @Input() useLocalThumbnails = true;
  @Input() cacheBuster = Date.now();

  @Output() setPhase = new EventEmitter<Phase>();
  @Output() alignPhase = new EventEmitter<void>();
  @Output() toggleCategory = new EventEmitter<string>();
  @Output() toggleSub = new EventEmitter<string>();
  @Output() playVideo = new EventEmitter<PiConfigVideoEntry>();

  count = categoryCount;
  hasSubs = hasSubCategories;
}
