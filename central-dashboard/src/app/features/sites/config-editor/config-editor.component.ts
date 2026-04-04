import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';
import {
  SiteConfiguration,
  ConfigHistory,
  ConfigDiff,
  ConfigValidationResult,
  CategoryConfig,
  VideoConfig,
  DEFAULT_CONFIG,
  AnalyticsCategory,
  LocalVideo,
} from '../../../core/models';
import { VideoSelectorComponent } from '../../../shared/components/video-selector/video-selector.component';
import { RemotePreviewComponent } from '../../../shared/components/remote-preview/remote-preview.component';
import { ConfigEditorDataService } from './config-editor-data.service';


@Component({
  selector: 'app-config-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, VideoSelectorComponent, RemotePreviewComponent, TranslateModule],
  templateUrl: './config-editor.component.html',
  styleUrls: ['./config-editor.component.scss']
})
export class ConfigEditorComponent implements OnInit, OnDestroy {
  @Input() siteId!: string;
  @Input() siteName!: string;
  @Input() isConnected: boolean = false;
  @Output() configDeployed = new EventEmitter<void>();

  // Vidéos disponibles sur le Pi (chargées automatiquement)
  localVideos: LocalVideo[] = [];

  activeTab: 'form' | 'json' | 'history' = 'form';
  // Use signal for loading state to ensure Angular detects changes
  readonly isLoading = signal(false);
  // Keep loading as getter/setter for compatibility
  get loading(): boolean {
    return this.isLoading();
  }
  set loading(value: boolean) {
    this.isLoading.set(value);
  }
  deploying = false;
  hasChanges = false;
  isValid = true;

  // Simple config object - use configCategories for template binding
  config: SiteConfiguration = {
    version: '1.0',
    remote: { title: '' },
    auth: { password: '', clubName: '', sessionDuration: 28800000 },
    sync: { enabled: true, serverUrl: 'https://neopro-central-production.up.railway.app', siteName: '', clubName: '' },
    sponsors: [],
    categories: [],
    timeCategories: [],
  };

  // Separate array for template binding (workaround for Angular change detection issue)
  configCategories: CategoryConfig[] = [];
  // Cached array for analytics mapping (avoid creating new array on each change detection)
  private _allVideoCategories: { id: string; name: string }[] = [];
  originalConfig: SiteConfiguration | null = null;
  jsonString = '';
  jsonError = '';
  jsonPlaceholder = JSON.stringify(DEFAULT_CONFIG, null, 2);

  // Validation
  validationResult: ConfigValidationResult | null = null;
  validationErrors: Map<string, string> = new Map();

  // History
  history: ConfigHistory[] = [];
  historyCount = 0;
  loadingHistory = false;
  selectedHistoryId: string | null = null;

  // Diff
  showDiffModal = false;
  diffLoading = false;
  diffItems: ConfigDiff[] = [];
  deployMode: 'replace' | 'merge' = 'replace';

  // Categories UI
  expandedCategory: number | null = null;

  // Analytics Categories
  analyticsCategories: AnalyticsCategory[] = [];
  loadingAnalyticsCategories = false;

  // Subscriptions
  private configLoadSubscription?: Subscription;

  private readonly dataService = inject(ConfigEditorDataService);
  private readonly notificationService = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.reloadConfig();
    this.loadHistoryCount();
    this.loadAnalyticsCategories();
  }

  ngOnDestroy(): void {
    this.configLoadSubscription?.unsubscribe();
  }

  get diffCounts() {
    return this.diffItems.reduce(
      (acc, item) => {
        if (item.type === 'added') acc.added += 1;
        if (item.type === 'removed') acc.removed += 1;
        if (item.type === 'changed') acc.changed += 1;
        return acc;
      },
      { added: 0, removed: 0, changed: 0 } as { added: number; removed: number; changed: number }
    );
  }

  private getEmptyConfig(): SiteConfiguration {
    return this.dataService.getEmptyConfig();
  }

  private resetToEmptyConfig(): void {
    this.loading = false;
    this.config = this.getEmptyConfig();
    this.originalConfig = null;
    this.syncJsonFromConfig();
    this.hasChanges = false;
  }

  reloadConfig(): void {
    this.loading = true;
    this.configLoadSubscription?.unsubscribe();

    this.configLoadSubscription = this.dataService.loadConfigFromPi(this.siteId, this.isConnected).subscribe({
      next: (result) => {
        this.loading = false;
        this.localVideos = result.localVideos;
        if (result.config) {
          this.setConfig(result.config);
        } else {
          this.resetToEmptyConfig();
        }
      },
      error: () => {
        this.resetToEmptyConfig();
      },
    });
  }

  private setConfig(configuration: SiteConfiguration): void {
    this.config = this.dataService.normalizeConfig(configuration);

    // Update configCategories for template binding
    this.configCategories = [...this.config.categories];

    // Update the cached array for analytics mapping
    this.updateAllVideoCategoriesCache();

    this.originalConfig = JSON.parse(JSON.stringify(this.config));
    this.syncJsonFromConfig();
    this.hasChanges = false;
    this.validate();

    // Force Angular to detect changes
    this.cdr.detectChanges();
  }

  private syncJsonFromConfig(): void {
    this.jsonString = JSON.stringify(this.config, null, 2);
    this.jsonError = '';
  }

  onConfigChange(): void {
    this.syncJsonFromConfig();
    this.hasChanges = JSON.stringify(this.config) !== JSON.stringify(this.originalConfig);
    this.validate();
  }

  onJsonChange(): void {
    try {
      const parsed = JSON.parse(this.jsonString) as Record<string, unknown>;
      this.config = this.dataService.normalizeConfigFromJson(parsed);
      this.jsonError = '';
      this.hasChanges = JSON.stringify(this.config) !== JSON.stringify(this.originalConfig);
      this.validate();
    } catch (e) {
      this.jsonError = `Erreur de syntaxe JSON: ${e instanceof Error ? e.message : 'Unknown error'}`;
      this.isValid = false;
    }
  }

  formatJsonInput(): void {
    try {
      const parsed = JSON.parse(this.jsonString);
      this.jsonString = JSON.stringify(parsed, null, 2);
      this.jsonError = '';
    } catch (e) {
      this.jsonError = `Erreur de syntaxe JSON: ${e instanceof Error ? e.message : 'Unknown error'}`;
    }
  }

  validateJson(): void {
    try {
      JSON.parse(this.jsonString);
      this.validate();
      if (this.isValid) {
        this.notificationService.success('Configuration valide');
      }
    } catch (e) {
      this.jsonError = `Erreur de syntaxe JSON: ${e instanceof Error ? e.message : 'Unknown error'}`;
      this.notificationService.error('JSON invalide');
    }
  }

  private validate(): void {
    this.validationErrors.clear();

    this.validationResult = this.dataService.validateConfig(this.config);

    // Populate validationErrors map for template field-level error display
    for (const error of this.validationResult.errors) {
      this.validationErrors.set(error.field, error.message);
    }

    this.isValid = this.validationResult.valid;
  }

  hasError(field: string): boolean {
    return this.validationErrors.has(field);
  }

  getError(field: string): string {
    return this.validationErrors.get(field) || '';
  }

  // Sponsors
  addSponsor(): void {
    this.config.sponsors.push({ name: '', path: '', type: 'video/mp4' });
    this.onConfigChange();
  }

  removeSponsor(index: number): void {
    this.config.sponsors.splice(index, 1);
    this.onConfigChange();
  }

  // Categories
  addCategory(): void {
    const newCategory = {
      id: `category-${Date.now()}`,
      name: '',
      videos: [],
      subCategories: [],
    };
    this.config.categories.push(newCategory);
    this.configCategories = [...this.config.categories];
    this.updateAllVideoCategoriesCache();
    this.onConfigChange();
  }

  removeCategory(index: number): void {
    const category = this.config.categories[index];

    // Nettoyer les mappings analytics de la catégorie et ses sous-catégories
    if (this.config.categoryMappings) {
      // Supprimer le mapping de la catégorie
      if (category.id) {
        delete this.config.categoryMappings[category.id];
      }
      // Supprimer les mappings des sous-catégories
      if (category.subCategories) {
        for (const subcat of category.subCategories) {
          if (subcat.id) {
            delete this.config.categoryMappings[subcat.id];
          }
        }
      }
    }

    this.config.categories.splice(index, 1);
    this.configCategories = [...this.config.categories];
    this.updateAllVideoCategoriesCache();
    if (this.expandedCategory === index) {
      this.expandedCategory = null;
    } else if (this.expandedCategory !== null && this.expandedCategory > index) {
      this.expandedCategory--;
    }
    this.onConfigChange();
  }

  toggleCategory(index: number): void {
    this.expandedCategory = this.expandedCategory === index ? null : index;
  }

  addSubcategory(catIndex: number): void {
    const category = this.config.categories[catIndex];
    const hadNoSubcategories = !category.subCategories || category.subCategories.length === 0;

    if (!category.subCategories) {
      category.subCategories = [];
    }
    category.subCategories.push({
      id: `subcategory-${Date.now()}`,
      name: '',
      videos: [],
    });

    // Si c'est la première sous-catégorie, supprimer le mapping de la catégorie parente
    // (le mapping se fait maintenant au niveau des sous-catégories)
    if (hadNoSubcategories && this.config.categoryMappings?.[category.id]) {
      delete this.config.categoryMappings[category.id];
    }

    this.updateAllVideoCategoriesCache();
    this.onConfigChange();
  }

  removeSubcategory(catIndex: number, subIndex: number): void {
    const category = this.config.categories[catIndex];
    if (category.subCategories) {
      const subcatId = category.subCategories[subIndex]?.id;

      // Supprimer le mapping de la sous-catégorie
      if (subcatId && this.config.categoryMappings?.[subcatId]) {
        delete this.config.categoryMappings[subcatId];
      }

      category.subCategories.splice(subIndex, 1);
      this.updateAllVideoCategoriesCache();
      this.onConfigChange();
    }
  }

  removeVideo(catIndex: number, subIndex: number | null, vidIndex: number): void {
    const category = this.config.categories[catIndex];
    if (subIndex === null) {
      // Remove from category's direct videos
      if (category.videos) {
        category.videos.splice(vidIndex, 1);
      }
    } else {
      // Remove from subcategory
      if (category.subCategories && category.subCategories[subIndex]?.videos) {
        category.subCategories[subIndex].videos.splice(vidIndex, 1);
      }
    }
    this.onConfigChange();
  }

  // Videos CRUD
  addVideo(catIndex: number, subIndex: number | null): void {
    const newVideo: VideoConfig = {
      name: '',
      path: '',
      type: 'video/mp4',
    };

    const category = this.config.categories[catIndex];
    if (subIndex === null) {
      if (!category.videos) {
        category.videos = [];
      }
      category.videos.push(newVideo);
    } else {
      if (category.subCategories && category.subCategories[subIndex]) {
        if (!category.subCategories[subIndex].videos) {
          category.subCategories[subIndex].videos = [];
        }
        category.subCategories[subIndex].videos.push(newVideo);
      }
    }
    this.onConfigChange();
  }

  updateVideo(catIndex: number, subIndex: number | null, vidIndex: number, field: 'name' | 'path', value: string): void {
    const category = this.config.categories[catIndex];
    let video: VideoConfig | undefined;

    if (subIndex === null) {
      video = category.videos?.[vidIndex];
    } else {
      video = category.subCategories?.[subIndex]?.videos?.[vidIndex];
    }

    if (video) {
      video[field] = value;
      this.onConfigChange();
    }
  }

  // TimeCategories management
  toggleCategoryInTimeCategory(timeCatIndex: number, categoryId: string): void {
    const timeCategory = this.config.timeCategories?.[timeCatIndex];
    if (!timeCategory) return;

    const index = timeCategory.categoryIds.indexOf(categoryId);
    if (index === -1) {
      timeCategory.categoryIds.push(categoryId);
    } else {
      timeCategory.categoryIds.splice(index, 1);
    }
    this.onConfigChange();
  }

  isCategoryInTimeCategory(timeCatIndex: number, categoryId: string): boolean {
    return this.config.timeCategories?.[timeCatIndex]?.categoryIds.includes(categoryId) || false;
  }

  getCategoriesInTimeCategory(timeCatIndex: number): CategoryConfig[] {
    const categoryIds = this.config.timeCategories?.[timeCatIndex]?.categoryIds || [];
    return this.config.categories.filter(cat => categoryIds.includes(cat.id));
  }

  getUnassignedCategories(): CategoryConfig[] {
    const allAssignedIds = new Set<string>();
    this.config.timeCategories?.forEach(tc => {
      tc.categoryIds.forEach(id => allAssignedIds.add(id));
    });
    return this.config.categories.filter(cat => !allAssignedIds.has(cat.id));
  }

  getUnassignedCategoriesNames(): string {
    return this.getUnassignedCategories()
      .map(c => c.name || '(Sans nom)')
      .join(', ');
  }

  // ============================================================================
  // Loop Videos per Phase (loopVideos)
  // ============================================================================

  // Drag-drop state for loop videos
  draggingLoopIndex: { tcIndex: number; vidIndex: number } | null = null;

  /**
   * Retourne le nombre de vidéos dans la boucle d'une phase
   */
  getLoopVideoCount(tcIndex: number): number {
    return this.config.timeCategories?.[tcIndex]?.loopVideos?.length || 0;
  }

  /**
   * Ajoute une vidéo à la boucle d'une phase
   */
  addLoopVideo(tcIndex: number): void {
    const timeCategory = this.config.timeCategories?.[tcIndex];
    if (!timeCategory) return;

    if (!timeCategory.loopVideos) {
      timeCategory.loopVideos = [];
    }

    timeCategory.loopVideos.push({
      name: '',
      path: '',
      type: 'video/mp4'
    });

    this.onConfigChange();
  }

  /**
   * Met à jour une vidéo dans la boucle d'une phase
   */
  updateLoopVideo(tcIndex: number, vidIndex: number, field: 'name' | 'path', value: string): void {
    const video = this.config.timeCategories?.[tcIndex]?.loopVideos?.[vidIndex];
    if (video) {
      video[field] = value;
      this.onConfigChange();
    }
  }

  /**
   * Supprime une vidéo de la boucle d'une phase
   */
  removeLoopVideo(tcIndex: number, vidIndex: number): void {
    const timeCategory = this.config.timeCategories?.[tcIndex];
    if (timeCategory?.loopVideos) {
      timeCategory.loopVideos.splice(vidIndex, 1);
      this.onConfigChange();
    }
  }

  /**
   * Copie les sponsors globaux vers la boucle d'une phase
   */
  copySponsorsToLoop(tcIndex: number): void {
    const timeCategory = this.config.timeCategories?.[tcIndex];
    if (!timeCategory) return;

    timeCategory.loopVideos = this.config.sponsors.map(s => ({
      name: s.name,
      path: s.path,
      type: s.type
    }));

    this.onConfigChange();
  }

  /**
   * Efface la boucle d'une phase (revient à utiliser la boucle par défaut)
   */
  clearLoopVideos(tcIndex: number): void {
    const timeCategory = this.config.timeCategories?.[tcIndex];
    if (timeCategory) {
      timeCategory.loopVideos = [];
      this.onConfigChange();
    }
  }

  /**
   * Drag-drop handlers pour réordonner les vidéos de la boucle
   */
  onLoopDragStart(event: DragEvent, tcIndex: number, vidIndex: number): void {
    this.draggingLoopIndex = { tcIndex, vidIndex };
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onLoopDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onLoopDrop(event: DragEvent, tcIndex: number, targetIndex: number): void {
    event.preventDefault();

    if (!this.draggingLoopIndex || this.draggingLoopIndex.tcIndex !== tcIndex) {
      this.draggingLoopIndex = null;
      return;
    }

    const sourceIndex = this.draggingLoopIndex.vidIndex;
    const loopVideos = this.config.timeCategories?.[tcIndex]?.loopVideos;

    if (loopVideos && sourceIndex !== targetIndex) {
      const [movedItem] = loopVideos.splice(sourceIndex, 1);
      loopVideos.splice(targetIndex, 0, movedItem);
      this.onConfigChange();
    }

    this.draggingLoopIndex = null;
  }

  // History
  loadHistoryCount(): void {
    this.dataService.loadHistoryCount(this.siteId).subscribe({
      next: (total) => {
        this.historyCount = total;
      },
      error: () => {
        this.historyCount = 0;
      }
    });
  }

  loadHistory(): void {
    this.loadingHistory = true;
    this.dataService.loadHistory(this.siteId).subscribe({
      next: (result) => {
        this.history = result.history;
        this.historyCount = result.total;
        this.loadingHistory = false;
      },
      error: () => {
        this.loadingHistory = false;
        this.notificationService.error('Erreur lors du chargement de l\'historique');
      }
    });
  }

  viewHistoryVersion(item: ConfigHistory): void {
    this.selectedHistoryId = item.id;
    this.setConfig(item.configuration);
    this.activeTab = 'form';
    this.hasChanges = true; // Car différent de la config actuelle du site
  }

  restoreVersion(item: ConfigHistory): void {
    if (!item.configuration) {
      this.notificationService.error('Configuration non disponible pour cette version');
      return;
    }

    if (confirm(`Restaurer la configuration du ${new Date(item.deployed_at).toLocaleString()} ?`)) {
      this.setConfig(item.configuration);
      this.hasChanges = true;
      this.activeTab = 'form';
      this.notificationService.info('Configuration restaurée. Cliquez sur "Déployer" pour appliquer.');
    }
  }

  // Deploy
  previewAndDeploy(): void {
    if (!this.isValid) {
      this.notificationService.error('Veuillez corriger les erreurs de validation');
      return;
    }

    this.showDiffModal = true;
    this.diffLoading = true;

    this.dataService.previewDiff(this.siteId, this.config).subscribe({
      next: (diffItems) => {
        this.diffItems = diffItems;
        this.diffLoading = false;
      },
      error: () => {
        this.diffLoading = false;
        // Si pas d'historique, on peut quand meme deployer
        this.diffItems = [];
      }
    });
  }

  confirmDeploy(): void {
    // Validation : verifier que la config n'est pas vide
    if (!this.config || Object.keys(this.config).length === 0) {
      this.notificationService.error('Configuration vide - impossible de deployer');
      return;
    }

    this.deploying = true;

    this.dataService.deployConfig(this.siteId, this.config, this.deployMode).subscribe({
      next: () => {
        this.deploying = false;
        this.showDiffModal = false;
        this.originalConfig = JSON.parse(JSON.stringify(this.config));
        this.hasChanges = false;
        this.loadHistoryCount();
        this.notificationService.success('Configuration deployee avec succes');
        this.configDeployed.emit();
      },
      error: (error) => {
        this.deploying = false;
        this.notificationService.error('Erreur lors du deploiement: ' + (error.error?.error || error.message));
      }
    });
  }

  formatJson(value: unknown): string {
    return this.dataService.formatJson(value);
  }

  ownershipLabel(value: unknown): 'neopro' | 'club' | null {
    return this.dataService.ownershipLabel(value);
  }

  formatDiffValue(value: unknown): string {
    return this.dataService.formatDiffValue(value);
  }

  // ============================================================================
  // Analytics Categories Mapping
  // ============================================================================

  loadAnalyticsCategories(): void {
    this.loadingAnalyticsCategories = true;
    this.dataService.loadAnalyticsCategories().subscribe({
      next: (categories) => {
        this.analyticsCategories = categories;
        this.loadingAnalyticsCategories = false;
      },
      error: () => {
        this.loadingAnalyticsCategories = false;
        // Silencieux - fallback sur categories par defaut
      }
    });
  }

  /**
   * Récupère toutes les catégories de vidéos (catégories + sous-catégories)
   * Retourne un tableau caché pour éviter de créer un nouveau tableau à chaque change detection
   */
  getAllVideoCategories(): { id: string; name: string }[] {
    return this._allVideoCategories;
  }

  /**
   * Met à jour le cache des catégories pour le mapping analytics
   */
  private updateAllVideoCategoriesCache(): void {
    const result: { id: string; name: string }[] = [];

    for (const category of this.configCategories) {
      result.push({ id: category.id, name: category.name });

      // Ajouter les sous-catégories
      if (category.subCategories) {
        for (const subcat of category.subCategories) {
          result.push({
            id: subcat.id,
            name: `${category.name} > ${subcat.name}`
          });
        }
      }
    }

    this._allVideoCategories = result;
  }

  /**
   * Récupère le mapping analytics pour une catégorie donnée
   */
  getCategoryMapping(categoryId: string): string {
    return this.config.categoryMappings?.[categoryId] || '';
  }

  /**
   * Définit le mapping analytics pour une catégorie
   */
  setCategoryMapping(categoryId: string, analyticsCategoryId: string): void {
    if (!this.config.categoryMappings) {
      this.config.categoryMappings = {};
    }

    if (analyticsCategoryId) {
      this.config.categoryMappings[categoryId] = analyticsCategoryId;
    } else {
      delete this.config.categoryMappings[categoryId];
    }

    this.onConfigChange();
  }

  /**
   * Récupère la couleur d'une catégorie analytics
   */
  getAnalyticsCategoryColor(analyticsCategoryId: string): string {
    const category = this.analyticsCategories.find(c => c.id === analyticsCategoryId);
    return category?.color || '#6B7280';
  }

}
