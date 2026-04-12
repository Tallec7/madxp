/**
 * CloudRemoteNavigationService — View navigation, breadcrumb and category selection.
 * Extracted from CloudRemoteComponent (ADR-043).
 */
import { Injectable } from '@angular/core';

export type ViewType = 'home' | 'time-categories' | 'subcategories' | 'videos' | 'all-videos' | 'options';

export interface Category {
  id: string;
  name: string;
  videos?: Video[];
  subCategories?: Category[];
}

export interface Video {
  name: string;
  path: string;
  type?: string;
  categoryId?: string;
  hasSecondaryVariant?: boolean;
}

export interface TimeCategory {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  categoryIds?: string[];
  loopVideos?: Video[];
}

@Injectable()
export class CloudRemoteNavigationService {
  public currentView: ViewType = 'home';
  public breadcrumb: string[] = ['Télécommande'];

  public selectedTimeCategory: TimeCategory | null = null;
  public selectedCategory: Category | null = null;
  public selectedSubCategory: Category | null = null;

  // Swipe gesture tracking
  private touchStartX = 0;
  private touchStartY = 0;
  private readonly SWIPE_THRESHOLD = 50;

  public handleBack(isSearching: boolean, clearSearchFn: () => void): void {
    if (isSearching) {
      clearSearchFn();
      return;
    }

    if (this.currentView === 'all-videos' || this.currentView === 'options') {
      this.currentView = 'home';
      this.breadcrumb = ['Télécommande'];
      return;
    }

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

  public showAllVideos(): void {
    this.currentView = 'all-videos';
    this.breadcrumb = ['Télécommande', 'Toutes les vidéos'];
  }

  public openOptions(liveScoreEnabled: boolean, closeHeaderMenuFn: () => void): boolean {
    if (!liveScoreEnabled) {
      closeHeaderMenuFn();
      return false;
    }
    this.currentView = 'options';
    this.breadcrumb = ['Télécommande', 'Options'];
    closeHeaderMenuFn();
    return true;
  }

  public resetToHome(): void {
    this.currentView = 'home';
    this.breadcrumb = ['Télécommande'];
    this.selectedTimeCategory = null;
    this.selectedCategory = null;
    this.selectedSubCategory = null;
  }

  // Swipe gestures
  public onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
  }

  public onTouchEnd(event: TouchEvent, isSearching: boolean, clearSearchFn: () => void): void {
    const touchEndX = event.changedTouches[0].clientX;
    const touchEndY = event.changedTouches[0].clientY;

    const deltaX = touchEndX - this.touchStartX;
    const deltaY = touchEndY - this.touchStartY;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > this.SWIPE_THRESHOLD) {
      if (deltaX > 0) {
        // Swipe right → back
        if (this.currentView !== 'home' || isSearching) {
          this.handleBack(isSearching, clearSearchFn);
        }
      }
    }
  }

  public getCurrentVideos(): Video[] {
    const videos = this.selectedSubCategory?.videos ?? this.selectedCategory?.videos ?? [];
    return this.sortByName(videos);
  }

  public getSubCategoriesForDisplay(category: Category): Category[] {
    return this.sortByName(category.subCategories ?? []);
  }

  private sortByName<T extends { name: string }>(items: T[] = []): T[] {
    return [...items].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  }
}
