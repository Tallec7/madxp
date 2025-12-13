import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AnalyticsCategory } from '../../../core/models';

@Component({
  selector: 'app-analytics-categories',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <div>
          <h1>Catégories Analytics</h1>
          <p class="subtitle">Gérez les catégories utilisées pour classifier les lectures vidéo dans les rapports analytics.</p>
        </div>
        <button class="btn btn-primary" (click)="openCreateModal()">
          + Nouvelle catégorie
        </button>
      </div>

      <!-- Categories List -->
      <div class="categories-grid" *ngIf="categories.length > 0 && !loading">
        <div
          class="category-card card"
          *ngFor="let category of categories"
          [class.is-default]="category.is_default"
        >
          <div class="category-header">
            <div
              class="category-color"
              [style.background-color]="category.color || '#6B7280'"
            ></div>
            <div class="category-info">
              <h3>{{ category.name }}</h3>
              <code class="category-id">{{ category.id }}</code>
            </div>
            <span class="badge badge-secondary" *ngIf="category.is_default">Par défaut</span>
          </div>
          <p class="category-description" *ngIf="category.description">
            {{ category.description }}
          </p>
          <div class="category-actions">
            <button class="btn btn-sm btn-secondary" (click)="openEditModal(category)">
              Modifier
            </button>
            <button
              class="btn btn-sm btn-danger"
              (click)="deleteCategory(category)"
              [disabled]="category.is_default"
              [title]="category.is_default ? 'Les catégories par défaut ne peuvent pas être supprimées' : 'Supprimer'"
            >
              Supprimer
            </button>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-state" *ngIf="loading">
        <div class="spinner"></div>
        <p>Chargement des catégories...</p>
      </div>

      <!-- Empty State -->
      <div class="empty-state card" *ngIf="categories.length === 0 && !loading">
        <div class="empty-icon">📊</div>
        <h3>Aucune catégorie</h3>
        <p>Créez votre première catégorie analytics pour commencer à classifier les vidéos.</p>
        <button class="btn btn-primary" (click)="openCreateModal()">
          + Nouvelle catégorie
        </button>
      </div>

      <!-- Create/Edit Modal -->
      <div class="modal" *ngIf="showModal" (click)="closeModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>{{ editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie' }}</h2>
            <button class="modal-close" (click)="closeModal()">×</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="categoryId">ID *</label>
              <input
                type="text"
                id="categoryId"
                [(ngModel)]="form.id"
                [disabled]="!!editingCategory"
                placeholder="ex: sponsor, jingle, ambiance"
                pattern="[a-z0-9_-]+"
              >
              <small class="form-hint">Identifiant unique (lettres minuscules, chiffres, tirets)</small>
            </div>
            <div class="form-group">
              <label for="categoryName">Nom *</label>
              <input
                type="text"
                id="categoryName"
                [(ngModel)]="form.name"
                placeholder="ex: Sponsor, Jingle, Ambiance"
              >
            </div>
            <div class="form-group">
              <label for="categoryDescription">Description</label>
              <textarea
                id="categoryDescription"
                [(ngModel)]="form.description"
                placeholder="Description de la catégorie..."
                rows="3"
              ></textarea>
            </div>
            <div class="form-group">
              <label for="categoryColor">Couleur</label>
              <div class="color-picker-row">
                <input
                  type="color"
                  id="categoryColor"
                  [(ngModel)]="form.color"
                  class="color-input"
                >
                <input
                  type="text"
                  [(ngModel)]="form.color"
                  placeholder="#6B7280"
                  class="color-text-input"
                >
                <div class="color-presets">
                  <button
                    type="button"
                    *ngFor="let color of presetColors"
                    class="color-preset"
                    [style.background-color]="color"
                    [class.selected]="form.color === color"
                    (click)="form.color = color"
                  ></button>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="closeModal()">Annuler</button>
            <button
              class="btn btn-primary"
              (click)="saveCategory()"
              [disabled]="!canSave() || saving"
            >
              {{ saving ? 'Enregistrement...' : (editingCategory ? 'Mettre à jour' : 'Créer') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 2rem;
      margin: 0 0 0.5rem 0;
      color: #0f172a;
    }

    .subtitle {
      color: #64748b;
      margin: 0;
    }

    .categories-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.5rem;
    }

    .category-card {
      padding: 1.5rem;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .category-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .category-card.is-default {
      background: linear-gradient(to bottom right, #f8fafc, #f1f5f9);
      border: 1px solid #e2e8f0;
    }

    .category-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .category-color {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      flex-shrink: 0;
    }

    .category-info {
      flex: 1;
      min-width: 0;
    }

    .category-info h3 {
      margin: 0 0 0.25rem 0;
      font-size: 1.125rem;
      color: #0f172a;
    }

    .category-id {
      font-size: 0.75rem;
      color: #64748b;
      background: #f1f5f9;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
    }

    .category-description {
      color: #64748b;
      font-size: 0.875rem;
      margin: 0 0 1rem 0;
      line-height: 1.5;
    }

    .category-actions {
      display: flex;
      gap: 0.5rem;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .default-hint {
      font-size: 0.75rem;
      color: #94a3b8;
      font-style: italic;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
      color: #64748b;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
    }

    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    .empty-state h3 {
      font-size: 1.5rem;
      margin: 0 0 0.5rem 0;
      color: #0f172a;
    }

    .empty-state p {
      color: #64748b;
      margin-bottom: 2rem;
    }

    /* Modal */
    .modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 2rem;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      max-width: 500px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 2rem;
      color: #94a3b8;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .modal-close:hover {
      background: #f1f5f9;
      color: #64748b;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      padding: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group:last-child {
      margin-bottom: 0;
    }

    .form-group label {
      display: block;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: #334155;
    }

    .form-group input[type="text"],
    .form-group textarea {
      width: 100%;
      padding: 0.625rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      font-family: inherit;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .form-group input:disabled {
      background: #f1f5f9;
      color: #64748b;
      cursor: not-allowed;
    }

    .form-hint {
      display: block;
      margin-top: 0.25rem;
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .color-picker-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .color-input {
      width: 48px;
      height: 40px;
      padding: 2px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      cursor: pointer;
    }

    .color-text-input {
      width: 100px;
      padding: 0.5rem 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .color-presets {
      display: flex;
      gap: 0.5rem;
    }

    .color-preset {
      width: 28px;
      height: 28px;
      border: 2px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      transition: transform 0.15s, border-color 0.15s;
    }

    .color-preset:hover {
      transform: scale(1.1);
    }

    .color-preset.selected {
      border-color: #0f172a;
    }

    /* Common styles */
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.625rem 1.25rem;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.875rem;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: #2563eb;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #e2e8f0;
    }

    .btn-danger {
      background: #fee2e2;
      color: #dc2626;
    }

    .btn-danger:hover:not(:disabled) {
      background: #fecaca;
    }

    .btn-sm {
      padding: 0.5rem 0.875rem;
      font-size: 0.8125rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .badge-secondary {
      background: #e2e8f0;
      color: #64748b;
    }

    @media (max-width: 768px) {
      .page-header {
        flex-direction: column;
        gap: 1rem;
      }

      .categories-grid {
        grid-template-columns: 1fr;
      }

      .color-picker-row {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `]
})
export class AnalyticsCategoriesComponent implements OnInit {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly notificationService = inject(NotificationService);

  categories: AnalyticsCategory[] = [];
  loading = true;
  saving = false;
  showModal = false;
  editingCategory: AnalyticsCategory | null = null;

  form = {
    id: '',
    name: '',
    description: '',
    color: '#6B7280'
  };

  presetColors = [
    '#3B82F6', // blue
    '#10B981', // green
    '#8B5CF6', // purple
    '#F59E0B', // amber
    '#EF4444', // red
    '#EC4899', // pink
    '#6366F1', // indigo
    '#14B8A6', // teal
    '#6B7280'  // gray
  ];

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    this.loading = true;
    this.analyticsService.getAnalyticsCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading categories:', error);
        this.notificationService.error('Erreur lors du chargement des catégories');
        this.loading = false;
      }
    });
  }

  openCreateModal(): void {
    this.editingCategory = null;
    this.form = {
      id: '',
      name: '',
      description: '',
      color: '#6B7280'
    };
    this.showModal = true;
  }

  openEditModal(category: AnalyticsCategory): void {
    this.editingCategory = category;
    this.form = {
      id: category.id,
      name: category.name,
      description: category.description || '',
      color: category.color || '#6B7280'
    };
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.editingCategory = null;
  }

  canSave(): boolean {
    return !!(this.form.id.trim() && this.form.name.trim());
  }

  saveCategory(): void {
    if (!this.canSave() || this.saving) return;

    this.saving = true;

    if (this.editingCategory) {
      // Update existing
      this.analyticsService.updateAnalyticsCategory(this.form.id, {
        name: this.form.name,
        description: this.form.description || undefined,
        color: this.form.color || undefined
      }).subscribe({
        next: () => {
          this.notificationService.success('Catégorie mise à jour');
          this.loadCategories();
          this.closeModal();
          this.saving = false;
        },
        error: (error) => {
          console.error('Error updating category:', error);
          this.notificationService.error('Erreur lors de la mise à jour');
          this.saving = false;
        }
      });
    } else {
      // Create new
      this.analyticsService.createAnalyticsCategory({
        id: this.form.id.toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
        name: this.form.name,
        description: this.form.description || undefined,
        color: this.form.color || undefined
      }).subscribe({
        next: () => {
          this.notificationService.success('Catégorie créée');
          this.loadCategories();
          this.closeModal();
          this.saving = false;
        },
        error: (error) => {
          console.error('Error creating category:', error);
          this.notificationService.error(error.error?.error || 'Erreur lors de la création');
          this.saving = false;
        }
      });
    }
  }

  deleteCategory(category: AnalyticsCategory): void {
    if (category.is_default) {
      this.notificationService.warning('Les catégories par défaut ne peuvent pas être supprimées');
      return;
    }

    if (confirm(`Supprimer la catégorie "${category.name}" ?\n\nLes sites utilisant cette catégorie devront être reconfigurés.`)) {
      this.analyticsService.deleteAnalyticsCategory(category.id).subscribe({
        next: () => {
          this.notificationService.success('Catégorie supprimée');
          this.loadCategories();
        },
        error: (error) => {
          console.error('Error deleting category:', error);
          this.notificationService.error('Erreur lors de la suppression');
        }
      });
    }
  }
}
