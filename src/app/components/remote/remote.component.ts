import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Configuration } from '../../interfaces/configuration.interface';
import { Category } from '../../interfaces/category.interface';
import { Video } from '../../interfaces/video.interface';
import { SocketService } from '../../services/socket.service';
import { AnalyticsService } from '../../services/analytics.service';

type ViewType = 'home' | 'time-categories' | 'subcategories' | 'videos';

interface TimeCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  categories: string[]; // IDs des catégories de configuration.json
}

@Component({
  selector: 'app-remote',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './remote.component.html',
  styleUrl: './remote.component.scss'
})
export class RemoteComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly socketService = inject(SocketService);
  private readonly analyticsService = inject(AnalyticsService);

  public configuration!: Configuration;
  public currentView: ViewType = 'home';
  public breadcrumb: string[] = ['Télécommande'];

  public selectedTimeCategory: TimeCategory | null = null;
  public selectedCategory: Category | null = null;
  public selectedSubCategory: Category | null = null;

  // Organisation par temps de match
  public timeCategories: TimeCategory[] = [
    {
      id: 'before',
      name: 'Avant-match',
      icon: '🏁',
      color: 'from-blue-500 to-blue-600',
      description: 'Échauffement & présentation',
      categories: ['Focus-partenaires', 'Info-club']
    },
    {
      id: 'during',
      name: 'Match',
      icon: '▶️',
      color: 'from-green-500 to-green-600',
      description: 'Live & animations',
      categories: ['Match_SM1', 'Match_SF']
    },
    {
      id: 'after',
      name: 'Après-match',
      icon: '🏆',
      color: 'from-purple-500 to-purple-600',
      description: 'Résultats & remerciements',
      categories: ['Focus-partenaires', 'Info-club']
    }
  ];

  public ngOnInit(): void {
    const data = this.route.snapshot.data['configuration'] as Configuration;
    this.configuration = data;
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
    return this.configuration.categories.filter(cat =>
      timeCategory.categories.includes(cat.id)
    );
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

  public getCurrentVideos(): Video[] {
    if (this.selectedSubCategory?.videos) {
      return this.selectedSubCategory.videos;
    }
    if (this.selectedCategory?.videos) {
      return this.selectedCategory.videos;
    }
    return [];
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
}
