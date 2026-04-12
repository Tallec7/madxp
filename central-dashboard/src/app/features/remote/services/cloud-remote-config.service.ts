/**
 * CloudRemoteConfigService — Configuration enrichment, video helpers, search and recent videos.
 * Extracted from CloudRemoteComponent (ADR-043).
 */
import { Injectable } from '@angular/core';
import { Category, Video, TimeCategory } from './cloud-remote-navigation.service';

export interface Configuration {
  remote?: { title?: string };
  categories: Category[];
  sponsors: Video[];
  timeCategories?: TimeCategory[];
  liveScoreEnabled?: boolean;
}

@Injectable()
export class CloudRemoteConfigService {
  public configuration!: Configuration;
  public timeCategories: TimeCategory[] = [];
  public liveScoreEnabled = false;

  private secondaryVariantPaths: Set<string> = new Set();

  // Search
  public searchQuery = '';
  public readonly searchPlaceholder = 'Rechercher une vid\u00e9o...';
  public searchResults: Video[] = [];
  public isSearching = false;

  // Recent videos
  public recentVideos: Video[] = [];
  private readonly MAX_RECENT_VIDEOS = 5;

  private readonly defaultTimeCategories: TimeCategory[] = [
    {
      id: 'before',
      name: 'Avant-match',
      icon: '🏁',
      color: 'from-blue-500 to-blue-600',
      description: 'Échauffement & présentation',
      categoryIds: []
    },
    {
      id: 'during',
      name: 'Match',
      icon: '▶️',
      color: 'from-green-500 to-green-600',
      description: 'Live & animations',
      categoryIds: []
    },
    {
      id: 'after',
      name: 'Après-match',
      icon: '🏆',
      color: 'from-purple-500 to-purple-600',
      description: 'Résultats & remerciements',
      categoryIds: []
    }
  ];

  public setSecondaryVariantPaths(paths: string[]): void {
    this.secondaryVariantPaths = new Set(paths);
  }

  public initializeWithConfiguration(config: Configuration): void {
    this.configuration = config;
    this.timeCategories = config.timeCategories?.length
      ? config.timeCategories
      : this.defaultTimeCategories;
    this.liveScoreEnabled = config.liveScoreEnabled ?? false;
  }

  public buildConfiguration(siteName: string, stateConfig: { categories?: Category[]; sponsors?: Video[]; timeCategories?: TimeCategory[]; liveScoreEnabled?: boolean } | undefined): Configuration {
    return {
      remote: { title: siteName },
      categories: stateConfig?.categories || [],
      sponsors: stateConfig?.sponsors || [],
      timeCategories: stateConfig?.timeCategories || [],
      liveScoreEnabled: stateConfig?.liveScoreEnabled || false,
    };
  }

  /**
   * Marque les vidéos ayant une variante secondaire pour affichage dans la télécommande.
   */
  public markSecondaryVariants(config: Configuration): Configuration {
    if (this.secondaryVariantPaths.size === 0) return config;

    const markVideo = (video: Video): Video =>
      this.secondaryVariantPaths.has(video.path)
        ? { ...video, hasSecondaryVariant: true }
        : video;

    const markCategory = (cat: Category): Category => ({
      ...cat,
      videos: cat.videos?.map(markVideo),
      subCategories: cat.subCategories?.map(markCategory),
    });

    return {
      ...config,
      sponsors: config.sponsors?.map(markVideo) || [],
      categories: config.categories?.map(markCategory) || [],
      timeCategories: config.timeCategories?.map(tc => ({
        ...tc,
        loopVideos: tc.loopVideos?.map(markVideo),
      })) || [],
    };
  }

  public enrichVideosWithCategoryId(config: Configuration): Configuration {
    const enrichCategory = (category: Category): Category => ({
      ...category,
      videos: category.videos?.map(video => ({
        ...video,
        categoryId: category.id
      })),
      subCategories: category.subCategories?.map(sub => enrichCategory(sub))
    });

    return {
      ...config,
      categories: config.categories?.map(cat => enrichCategory(cat)) || []
    };
  }

  // Video helpers

  public getVideoCategoryName(video: Video): string {
    if (!video.categoryId) return '';

    const findCategory = (categories: Category[]): string => {
      for (const cat of categories) {
        if (cat.id === video.categoryId) return cat.name;
        if (cat.subCategories) {
          const found = findCategory(cat.subCategories);
          if (found) return found;
        }
      }
      return '';
    };

    return findCategory(this.configuration?.categories || []);
  }

  public getCategoriesForTimeCategory(timeCategory: TimeCategory): Category[] {
    const filteredCategories = (this.configuration?.categories ?? []).filter(cat =>
      timeCategory.categoryIds?.includes(cat.id)
    );
    return this.sortByName(filteredCategories);
  }

  public getVideosCount(category: Category): number {
    let count = category.videos?.length || 0;
    if (category.subCategories) {
      count += category.subCategories.reduce((sum, sub) => {
        return sum + this.getVideosCount(sub);
      }, 0);
    }
    return count;
  }

  public getSubCategoriesCount(category: Category): number {
    return category.subCategories?.length || 0;
  }

  public getTotalVideosForTimeCategory(timeCategory: TimeCategory): number {
    const categories = this.getCategoriesForTimeCategory(timeCategory);
    return categories.reduce((sum, cat) => sum + this.getVideosCount(cat), 0);
  }

  public getTotalCategoriesForTimeCategory(timeCategory: TimeCategory): number {
    return this.getCategoriesForTimeCategory(timeCategory).length;
  }

  public getAllVideos(): Video[] {
    const videos: Video[] = [];

    const extractVideos = (category: Category) => {
      if (category.videos) {
        videos.push(...category.videos);
      }
      if (category.subCategories) {
        category.subCategories.forEach(sub => extractVideos(sub));
      }
    };

    this.configuration?.categories?.forEach(cat => extractVideos(cat));
    return this.sortByName(videos);
  }

  public getTotalVideosCount(): number {
    return this.getAllVideos().length;
  }

  // Search

  public onSearch(): void {
    if (!this.searchQuery.trim()) {
      this.clearSearch();
      return;
    }

    this.isSearching = true;
    const query = this.searchQuery.toLowerCase().trim();
    const filtered = this.getAllVideos().filter(video =>
      video.name.toLowerCase().includes(query)
    );
    this.searchResults = this.sortByName(filtered);
  }

  public clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.isSearching = false;
  }

  // Recent videos

  public loadRecentVideos(): void {
    try {
      const stored = localStorage.getItem('cloudRemoteRecentVideos');
      if (stored) {
        this.recentVideos = JSON.parse(stored);
      }
    } catch {
      this.recentVideos = [];
    }
  }

  public addToRecentVideos(video: Video): void {
    this.recentVideos = this.recentVideos.filter(v => v.path !== video.path);
    this.recentVideos.unshift(video);
    this.recentVideos = this.recentVideos.slice(0, this.MAX_RECENT_VIDEOS);
    localStorage.setItem('cloudRemoteRecentVideos', JSON.stringify(this.recentVideos));
  }

  // Phase helpers

  public getPhaseLabel(phase: 'neutral' | 'before' | 'during' | 'after'): string {
    const labels: Record<string, string> = {
      'neutral': 'Boucle par défaut',
      'before': 'Avant-match',
      'during': 'Match',
      'after': 'Après-match'
    };
    return labels[phase] || phase;
  }

  public getPhaseIcon(phase: 'neutral' | 'before' | 'during' | 'after'): string {
    const icons: Record<string, string> = {
      'neutral': '🔄',
      'before': '🏁',
      'during': '▶️',
      'after': '🏆'
    };
    return icons[phase] || '🔄';
  }

  public hasLoopForPhase(phase: 'neutral' | 'before' | 'during' | 'after'): boolean {
    if (phase === 'neutral') {
      return (this.configuration?.sponsors?.length || 0) > 0;
    }
    const timeCategory = this.timeCategories.find(tc => tc.id === phase);
    return (timeCategory?.loopVideos?.length || 0) > 0;
  }

  public getLoopVideoCount(phase: 'neutral' | 'before' | 'during' | 'after'): number {
    if (phase === 'neutral') {
      return this.configuration?.sponsors?.length || 0;
    }
    const timeCategory = this.timeCategories.find(tc => tc.id === phase);
    if (timeCategory?.loopVideos?.length) {
      return timeCategory.loopVideos.length;
    }
    return this.configuration?.sponsors?.length || 0;
  }

  // Thumbnails (not available in cloud — fallback)

  public getVideoThumbnailUrl(_video: Video): string | null {
    return null;
  }

  public onThumbnailError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
      const parent = img.parentElement;
      if (parent) {
        parent.classList.add('thumbnail-error');
      }
    }
  }

  private sortByName<T extends { name: string }>(items: T[] = []): T[] {
    return [...items].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  }
}
