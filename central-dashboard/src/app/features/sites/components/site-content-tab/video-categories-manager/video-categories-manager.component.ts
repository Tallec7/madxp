import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { VideoCategoryService } from '../../../../../core/services/video-category.service';
import { NotificationService } from '../../../../../core/services/notification.service';
import { VideoCategory, VideoCategoryType, CreateVideoCategoryDto, UpdateVideoCategoryDto } from '../../../../../core/models/video-category.model';

interface CategoryForm {
  name: string;
  type: VideoCategoryType;
  icon: string;
}

const DEFAULT_FORM: CategoryForm = { name: '', type: 'action', icon: '🎬' };

const CATEGORY_TYPE_LABELS: Record<VideoCategoryType, string> = {
  action: 'Catégorie action',
  loop: 'Boucle',
  match: 'Phase de match',
};

const CATEGORY_TYPE_ICONS: Record<VideoCategoryType, string> = {
  action: '🎬',
  loop: '🔄',
  match: '⚽',
};

@Component({
  selector: 'app-video-categories-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-categories-manager.component.html',
  styleUrls: ['./video-categories-manager.component.scss'],
})
export class VideoCategoriesManagerComponent implements OnInit, OnChanges {
  @Input() siteId!: string;
  @Output() categoriesChanged = new EventEmitter<VideoCategory[]>();

  private readonly categoryService = inject(VideoCategoryService);
  private readonly notif = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  categories: VideoCategory[] = [];
  loading = false;

  showForm = false;
  editingId: string | null = null;
  form: CategoryForm = { ...DEFAULT_FORM };
  saving = false;

  readonly typeLabels = CATEGORY_TYPE_LABELS;
  readonly typeOptions: VideoCategoryType[] = ['action', 'loop', 'match'];
  readonly typeIcons = CATEGORY_TYPE_ICONS;

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['siteId'] && !changes['siteId'].firstChange) {
      this.load();
    }
  }

  private load(): void {
    if (!this.siteId) return;
    this.loading = true;
    this.categoryService.list(this.siteId).subscribe({
      next: cats => {
        this.categories = cats;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  openCreateForm(): void {
    this.editingId = null;
    this.form = { ...DEFAULT_FORM };
    this.showForm = true;
  }

  openEditForm(cat: VideoCategory): void {
    this.editingId = cat.id;
    this.form = { name: cat.name, type: cat.type, icon: cat.icon ?? CATEGORY_TYPE_ICONS[cat.type] };
    this.showForm = true;
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingId = null;
  }

  onTypeChange(): void {
    if (!this.form.icon || Object.values(CATEGORY_TYPE_ICONS).includes(this.form.icon)) {
      this.form.icon = CATEGORY_TYPE_ICONS[this.form.type];
    }
  }

  save(): void {
    const name = this.form.name.trim();
    if (!name) return;

    this.saving = true;

    if (this.editingId) {
      const dto: UpdateVideoCategoryDto = {
        name,
        type: this.form.type,
        icon: this.form.icon || null,
      };
      this.categoryService.update(this.siteId, this.editingId, dto).subscribe({
        next: updated => {
          this.categories = this.categories.map(c => c.id === updated.id ? updated : c);
          this.notif.success(`Catégorie "${updated.name}" mise à jour`);
          this.cancelForm();
          this.saving = false;
          this.categoriesChanged.emit(this.categories);
          this.cdr.markForCheck();
        },
        error: () => {
          this.saving = false;
          this.cdr.markForCheck();
        },
      });
    } else {
      const dto: CreateVideoCategoryDto = {
        name,
        type: this.form.type,
        icon: this.form.icon || null,
      };
      this.categoryService.create(this.siteId, dto).subscribe({
        next: created => {
          this.categories = [...this.categories, created];
          this.notif.success(`Catégorie "${created.name}" créée`);
          this.cancelForm();
          this.saving = false;
          this.categoriesChanged.emit(this.categories);
          this.cdr.markForCheck();
        },
        error: () => {
          this.saving = false;
          this.cdr.markForCheck();
        },
      });
    }
  }

  deleteCategory(cat: VideoCategory): void {
    if (!confirm(`Supprimer la catégorie "${cat.name}" ?`)) return;
    this.categoryService.delete(this.siteId, cat.id).subscribe({
      next: () => {
        this.categories = this.categories.filter(c => c.id !== cat.id);
        this.notif.success(`Catégorie "${cat.name}" supprimée`);
        this.categoriesChanged.emit(this.categories);
        this.cdr.markForCheck();
      },
    });
  }

  moveUp(index: number): void {
    if (index === 0) return;
    this.reorder(index, index - 1);
  }

  moveDown(index: number): void {
    if (index === this.categories.length - 1) return;
    this.reorder(index, index + 1);
  }

  private reorder(from: number, to: number): void {
    const cats = [...this.categories];
    [cats[from], cats[to]] = [cats[to], cats[from]];
    this.categories = cats;
    cats.forEach((cat, idx) => {
      if (cat.sortOrder !== idx) {
        this.categoryService.update(this.siteId, cat.id, { sort_order: idx }).subscribe();
      }
    });
    this.cdr.markForCheck();
  }
}
