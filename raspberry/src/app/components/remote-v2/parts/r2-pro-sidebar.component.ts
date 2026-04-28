import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Category } from '../../../interfaces/category.interface';

export type Phase = 'before' | 'during' | 'after';

/**
 * Sidebar light du layout régie pro PC C (SPEC-V2-LAYOUT-01 §5C).
 *
 * Pattern master-detail :
 * - Top : tabs Avant / Match / Après (segmented control)
 * - Section "PHASE DE NAVIGATION"
 * - Section "CATÉGORIES" : liste catégories cliquables avec compteurs
 *   et sous-dossiers. Clic = sélection, émet `selectCategory` /
 *   `selectSubCategory` au parent qui filtre la zone détail (col 2).
 *
 * Theme light volontairement (sur fond dark global) — réduction de la
 * fatigue visuelle pour l'opérateur full-time qui scanne la nav.
 */
@Component({
  selector: 'app-r2-pro-sidebar',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `
    <aside class="r2-pro-sidebar">
      <div class="r2-pro-sidebar__section-title">Phase de navigation</div>
      <nav class="r2-pro-sidebar__phases" role="tablist" aria-label="Phase">
        <button
          role="tab"
          [class.is-active]="phaseId === 'before'"
          [attr.aria-selected]="phaseId === 'before'"
          (click)="phaseChange.emit('before')"
        >Avant</button>
        <button
          role="tab"
          [class.is-active]="phaseId === 'during'"
          [attr.aria-selected]="phaseId === 'during'"
          (click)="phaseChange.emit('during')"
        >Match</button>
        <button
          role="tab"
          [class.is-active]="phaseId === 'after'"
          [attr.aria-selected]="phaseId === 'after'"
          (click)="phaseChange.emit('after')"
        >Après</button>
      </nav>

      <div class="r2-pro-sidebar__section-title">Catégories</div>
      <ul class="r2-pro-sidebar__cats" role="tree">
        <li
          *ngFor="let cat of categories"
          class="r2-pro-sidebar__cat"
          [class.is-selected]="selectedCategoryId === cat.id && !selectedSubId"
          [class.is-open]="cat.id === selectedCategoryId"
        >
          <button
            class="r2-pro-sidebar__cat-btn"
            (click)="onCategoryClick(cat)"
          >
            <span class="r2-pro-sidebar__cat-name">{{ cat.name }}</span>
            <span class="r2-pro-sidebar__cat-count">{{ countCategory(cat) }}</span>
          </button>

          <ul
            class="r2-pro-sidebar__subs"
            *ngIf="cat.id === selectedCategoryId && (cat.subCategories?.length || 0) > 0"
            role="group"
          >
            <li
              *ngFor="let sub of cat.subCategories"
              class="r2-pro-sidebar__sub"
              [class.is-selected]="selectedSubId === sub.id"
            >
              <button
                class="r2-pro-sidebar__sub-btn"
                (click)="selectSubCategory.emit({ categoryId: cat.id, subId: sub.id })"
              >
                <span class="r2-pro-sidebar__sub-name">{{ sub.name }}</span>
                <span class="r2-pro-sidebar__sub-count">{{ sub.videos?.length || 0 }}</span>
              </button>
            </li>
          </ul>
        </li>
        <li *ngIf="categories.length === 0" class="r2-pro-sidebar__empty">
          Aucune catégorie pour cette phase.
        </li>
      </ul>
    </aside>
  `,
})
export class R2ProSidebarComponent {
  @Input() phaseId: Phase = 'during';
  @Input() categories: Category[] = [];
  @Input() selectedCategoryId: string | null = null;
  @Input() selectedSubId: string | null = null;

  @Output() phaseChange = new EventEmitter<Phase>();
  @Output() selectCategory = new EventEmitter<string>();
  @Output() selectSubCategory = new EventEmitter<{ categoryId: string; subId: string }>();

  countCategory(cat: Category): number {
    const direct = cat.videos?.length || 0;
    const subs = (cat.subCategories || []).reduce((acc, s) => acc + (s.videos?.length || 0), 0);
    return direct + subs;
  }

  onCategoryClick(cat: Category): void {
    // Si la catégorie a des sous-dossiers, on ouvre/ferme l'accordéon
    // sans affecter la sélection détaillée. Sinon clic = sélection.
    this.selectCategory.emit(cat.id);
  }
}
