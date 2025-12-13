import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Configuration, TimeCategory } from '../../interfaces/configuration.interface';
import { Category } from '../../interfaces/category.interface';
import { Video } from '../../interfaces/video.interface';
import { SocketService } from '../../services/socket.service';
import { AnalyticsService } from '../../services/analytics.service';
import { DemoConfigService } from '../../services/demo-config.service';
import { ClubSelectorComponent } from '../club-selector/club-selector.component';

type ViewType = 'club-selector' | 'home' | 'time-categories' | 'subcategories' | 'videos';

@Component({
  selector: 'app-remote',
  standalone: true,
  imports: [CommonModule, ClubSelectorComponent],
  templateUrl: './remote.component.html',
  styleUrl: './remote.component.scss'
})
export class RemoteComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly socketService = inject(SocketService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly demoConfigService = inject(DemoConfigService);

  public configuration!: Configuration;
  public currentView: ViewType = 'home';
  public breadcrumb: string[] = ['Télécommande'];
  public isDemoMode = false;
  public isReloading = false;

  public selectedTimeCategory: TimeCategory | null = null;
  public selectedCategory: Category | null = null;
  public selectedSubCategory: Category | null = null;

  // Organisation par temps de match - valeurs par défaut si non définies dans la config
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

  public timeCategories: TimeCategory[] = [];

  public ngOnInit(): void {
    this.isDemoMode = this.demoConfigService.isDemoMode();

    if (this.isDemoMode) {
      // En mode démo, on commence par la sélection du club
      this.currentView = 'club-selector';
    } else {
      // Mode normal : charger la config depuis le resolver
      const data = this.route.snapshot.data['configuration'] as Configuration;
      this.initializeWithConfiguration(data);
    }
  }

  public onClubSelected(config: Configuration): void {
    this.initializeWithConfiguration(config);
    this.currentView = 'home';
    // Envoyer la nouvelle config à /tv et lancer la boucle partenaires
    this.socketService.emit('command', { type: 'reload-config', data: config });
  }

  private initializeWithConfiguration(config: Configuration): void {
    this.configuration = config;
    // Utiliser les timeCategories de la config, ou les valeurs par défaut
    this.timeCategories = this.configuration.timeCategories?.length
      ? this.configuration.timeCategories
      : this.defaultTimeCategories;
  }

  // Navigation
  public handleBack(): void {
    this.breadcrumb.pop();

    if (this.breadcrumb.length === 1) {
      this.currentView = 'home';
      this.selectedTimeCategory = null;
      this.selectedCategory = null;
      this.selectedSubCategory = null;
    } else if (this.breadcrumb.length === 2) {
      this.currentView = 'time-categories';
      this.selectedCategory = null;
      this.selectedSubCategory = null;
    } else if (this.breadcrumb.length === 3) {
      this.currentView = 'subcategories';
      this.selectedSubCategory = null;
    }
  }

  public backToClubSelector(): void {
    this.currentView = 'club-selector';
    this.breadcrumb = ['Télécommande'];
    this.selectedTimeCategory = null;
    this.selectedCategory = null;
    this.selectedSubCategory = null;
  }

  public selectTimeCategory(timeCategory: TimeCategory): void {
    this.selectedTimeCategory = timeCategory;
    this.breadcrumb.push(timeCategory.name);
    this.currentView = 'time-categories';
  }

  public selectCategory(category: Category): void {
    this.selectedCategory = category;
    this.breadcrumb.push(category.name);

    if (category.subCategories && category.subCategories.length > 0) {
      this.currentView = 'subcategories';
    } else {
      this.currentView = 'videos';
    }
  }

  public selectSubCategory(subCategory: Category): void {
    this.selectedSubCategory = subCategory;
    this.breadcrumb.push(subCategory.name);
    this.currentView = 'videos';
  }

  // Actions
  public launchSponsors(): void {
    console.log('emit sponsors loop');
    this.socketService.emit('command', { type: 'sponsors' });
  }

  public launchVideo(video: Video): void {
    console.log('emit video', video);
    // Tracker le déclenchement manuel
    this.analyticsService.trackManualTrigger(video);
    this.socketService.emit('command', { type: 'video', data: video });
  }

  // Helpers
  public getCategoriesForTimeCategory(timeCategory: TimeCategory): Category[] {
    const filteredCategories = this.configuration.categories.filter(cat =>
      timeCategory.categoryIds.includes(cat.id)
    );
    return this.sortByName(filteredCategories);
  }

  public getVideosCount(category: Category): number {
    if (category.videos) {
      return category.videos.length;
    }
    if (category.subCategories) {
      return category.subCategories.reduce((sum, sub) => {
        return sum + (sub.videos?.length || 0);
      }, 0);
    }
    return 0;
  }

  public getSubCategoriesCount(category: Category): number {
    return category.subCategories?.length || 0;
  }

  public getSubCategoriesForDisplay(category: Category): Category[] {
    return this.sortByName(category.subCategories ?? []);
  }

  public getCurrentVideos(): Video[] {
    const videos = this.selectedSubCategory?.videos ?? this.selectedCategory?.videos ?? [];
    return this.sortByName(videos);
  }

  public getTotalVideosForTimeCategory(timeCategory: TimeCategory): number {
    const categories = this.getCategoriesForTimeCategory(timeCategory);
    return categories.reduce((sum, cat) => sum + this.getVideosCount(cat), 0);
  }

  public getTotalCategoriesForTimeCategory(timeCategory: TimeCategory): number {
    const categories = this.getCategoriesForTimeCategory(timeCategory);
    return categories.reduce((sum, cat) => {
      if (cat.subCategories && cat.subCategories.length > 0) {
        return sum + cat.subCategories.length;
      }
      return sum + 1;
    }, 0);
  }

  /**
   * Charge une copie triée des éléments selon leur nom
   */
  private sortByName<T extends { name: string }>(items: T[] = []): T[] {
    return [...items].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  }

  /**
   * Recharge la configuration depuis le serveur (bypass cache)
   */
  public reloadConfiguration(): void {
    if (this.isReloading || this.isDemoMode) return;

    this.isReloading = true;
    const timestamp = Date.now();

    this.http.get<Configuration>(`/configuration.json?t=${timestamp}`).subscribe({
      next: (config) => {
        console.log('Configuration rechargée', config);
        const enrichedConfig = this.enrichVideosWithCategoryId(config);
        this.initializeWithConfiguration(enrichedConfig);
        // Revenir à la vue home pour refléter les changements
        this.currentView = 'home';
        this.breadcrumb = ['Télécommande'];
        this.selectedTimeCategory = null;
        this.selectedCategory = null;
        this.selectedSubCategory = null;
        this.isReloading = false;
      },
      error: (err) => {
        console.error('Erreur lors du rechargement de la configuration', err);
        this.isReloading = false;
      }
    });
  }

  /**
   * Enrichit les vidéos avec le categoryId de leur catégorie parente
   */
  private enrichVideosWithCategoryId(config: Configuration): Configuration {
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
}
