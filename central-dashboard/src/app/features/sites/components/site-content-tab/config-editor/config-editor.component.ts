import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SiteConfiguration, CategoryConfig, LocalVideo, SiteSponsor } from '../../../../../core/models';
import { UnifiedVideoOption, VideoOptionGroupEntry, OrphanedVideoDetail } from '../content-tab.models';
import { TranslateModule } from '@ngx-translate/core';
import { LoopManagerComponent } from '../../loop-manager/loop-manager.component';
import { VideoSearchSelectComponent } from '../../../../../shared/components/video-search-select/video-search-select.component';

@Component({
  selector: 'app-config-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, LoopManagerComponent, VideoSearchSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './config-editor.component.html',
  styleUrls: ['./config-editor.component.scss']
})
export class ConfigEditorComponent {
  @Input() siteType: string = '';
  @Input() isClubUser = false;
  @Input() subscriptionPlan: string | null = null;
  @Input() featureOverrides: Record<string, boolean> | null = null;
  @Input() config!: SiteConfiguration;
  @Input() localVideos: LocalVideo[] = [];
  @Input() cloudVideos: { length: number } = { length: 0 };
  @Input() videoOptionGroups: VideoOptionGroupEntry[] = [];
  @Input() cloudVideoPaths: Set<string> = new Set();
  @Input() allKnownVideoPaths: Set<string> = new Set();
  @Input() videoDurations: Map<string, number> = new Map();
  @Input() siteSponsors: SiteSponsor[] = [];
  @Input() secondaryDisplayEnabled = false;
  @Input() unifiedVideoOptions: UnifiedVideoOption[] = [];
  @Input() cachedTimeCategories: { id: string; name: string; icon: string; description: string }[] = [];
  @Input() orphanedVideoCount = 0;
  @Input() repairableOrphanCount = 0;
  @Input() orphanedVideoDetails: OrphanedVideoDetail[] = [];

  @Output() configChanged = new EventEmitter<void>();
  @Output() repairOrphans = new EventEmitter<void>();
  @Output() openVariant = new EventEmitter<{ cloudId: string; displayName: string }>();

  expandedCategories: boolean[] = [];
  showJson = false;
  configJsonString = '';
  jsonError = '';

  get totalVideoCount(): number {
    return this.localVideos.length + (this.cloudVideos?.length || 0);
  }

  constructor(private cdr: ChangeDetectorRef) {}

  emitConfigChanged(): void {
    this.configChanged.emit();
  }

  scrollToSection(sectionId: string): void {
    const el = document.getElementById('section-' + sectionId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  hasPhaseLoops(): boolean {
    if (!this.config) return false;
    const phases = this.config.timeCategories || [];
    return phases.some(tc => tc.loopVideos && tc.loopVideos.length > 0);
  }

  getAssignedCategoryCount(): number {
    if (!this.config) return 0;
    const phases = this.config.timeCategories || [];
    const allIds = new Set<string>();
    phases.forEach(tc => tc.categoryIds?.forEach(id => allIds.add(id)));
    return allIds.size;
  }

  getUnmappedAnalyticsCount(): number {
    if (!this.config?.categories) return 0;
    let unmapped = 0;
    for (const cat of this.config.categories) {
      if (cat.subCategories?.length) {
        for (const sub of cat.subCategories) {
          if (!this.config.categoryMappings?.[sub.id]) unmapped++;
        }
      } else {
        if (!this.config.categoryMappings?.[cat.id]) unmapped++;
      }
    }
    return unmapped;
  }

  getTrackedVideoCount(): number {
    if (!this.config) return 0;
    const phases = this.config.timeCategories || [];
    return phases.reduce((sum, tc) => sum + (tc.loopVideos?.length || 0), 0);
  }

  getFallbackVideoCount(): number {
    if (!this.config) return 0;
    return this.config.sponsors?.length || 0;
  }

  addCategory(): void {
    if (!this.config.categories) this.config.categories = [];
    this.config.categories.push({
      id: this.generateId(),
      name: '',
      owner: 'club',
      locked: false,
      videos: [],
      subCategories: []
    });
    this.expandedCategories.push(true);
    this.emitConfigChanged();
  }

  removeCategory(index: number): void {
    this.config.categories?.splice(index, 1);
    this.expandedCategories.splice(index, 1);
    this.emitConfigChanged();
  }

  toggleCategory(index: number): void {
    this.expandedCategories[index] = !this.expandedCategories[index];
  }

  getCategoryVideoCount(cat: CategoryConfig): number {
    let count = cat.videos?.length || 0;
    for (const subcat of cat.subCategories || []) {
      count += subcat.videos?.length || 0;
    }
    return count;
  }

  addVideoToCategory(catIndex: number): void {
    const cat = this.config.categories?.[catIndex];
    if (!cat) return;
    if (!cat.videos) cat.videos = [];
    cat.videos.push({ name: '', path: '', type: 'video/mp4', owner: 'club', locked: false });
    this.emitConfigChanged();
  }

  removeVideoFromCategory(catIndex: number, vidIndex: number): void {
    this.config.categories?.[catIndex]?.videos?.splice(vidIndex, 1);
    this.emitConfigChanged();
  }

  addSubcategory(catIndex: number): void {
    const cat = this.config.categories?.[catIndex];
    if (!cat) return;
    if (!cat.subCategories) cat.subCategories = [];
    cat.subCategories.push({ id: this.generateId(), name: '', videos: [] });
    this.emitConfigChanged();
  }

  removeSubcategory(catIndex: number, subIndex: number): void {
    this.config.categories?.[catIndex]?.subCategories?.splice(subIndex, 1);
    this.emitConfigChanged();
  }

  addVideoToSubcategory(catIndex: number, subIndex: number): void {
    const subcat = this.config.categories?.[catIndex]?.subCategories?.[subIndex];
    if (!subcat) return;
    if (!subcat.videos) subcat.videos = [];
    subcat.videos.push({ name: '', path: '', type: 'video/mp4', owner: 'club', locked: false });
    this.emitConfigChanged();
  }

  removeVideoFromSubcategory(catIndex: number, subIndex: number, vidIndex: number): void {
    this.config.categories?.[catIndex]?.subCategories?.[subIndex]?.videos?.splice(vidIndex, 1);
    this.emitConfigChanged();
  }

  isCloudVideoPath(path: string): boolean {
    const video = this.unifiedVideoOptions.find(v => v.path === path);
    return video ? !video.isOnPi : false;
  }

  isOrphanedVideoPath(videoPath: string): boolean {
    if (!videoPath) return false;
    return this.allKnownVideoPaths.size > 0 && !this.allKnownVideoPaths.has(videoPath);
  }

  hasSecondaryVariantForPath(path: string): boolean {
    if (!this.secondaryDisplayEnabled) return false;
    const video = this.unifiedVideoOptions.find(v => v.path === path);
    return video?.hasSecondaryVariant ?? false;
  }

  canAddVariantForPath(path: string): boolean {
    if (!this.secondaryDisplayEnabled) return false;
    const video = this.unifiedVideoOptions.find(v => v.path === path);
    return !!video?.cloudId;
  }

  onOpenVariant(path: string): void {
    const video = this.unifiedVideoOptions.find(v => v.path === path);
    if (!video?.cloudId) return;
    this.openVariant.emit({ cloudId: video.cloudId, displayName: video.displayName });
  }

  getSecondaryPlaylistVideos(): { path: string; displayName: string; hasVariant: boolean }[] {
    if (!this.config || !this.secondaryDisplayEnabled) return [];
    const allPaths = new Set<string>();
    for (const s of this.config.sponsors || []) {
      if (s.path) allPaths.add(s.path);
    }
    for (const tc of this.config.timeCategories || []) {
      for (const lv of tc.loopVideos || []) {
        if (lv.path) allPaths.add(lv.path);
      }
    }
    return Array.from(allPaths).map(p => {
      const video = this.unifiedVideoOptions.find(v => v.path === p);
      return {
        path: p,
        displayName: video?.displayName || p.split('/').pop() || p,
        hasVariant: video?.hasSecondaryVariant ?? false,
      };
    });
  }

  getCategorySponsor(videoPath: string): SiteSponsor | null {
    if (!videoPath || this.siteSponsors.length === 0) return null;
    const parts = videoPath.split('/');
    const bareFilename = parts[parts.length - 1] || videoPath;
    const exact = this.siteSponsors.find(sp => sp.video_filenames?.includes(bareFilename));
    if (exact) return exact;
    const withoutPrefix = bareFilename.replace(/^\d+_/, '');
    if (withoutPrefix !== bareFilename) {
      return this.siteSponsors.find(
        sp => sp.video_filenames?.some(f => {
          const fBare = f.split('/').pop() || f;
          return fBare === withoutPrefix || fBare === bareFilename;
        })
      ) ?? null;
    }
    return null;
  }

  isCategoryInTimeCategory(categoryId: string, timeCategoryId: string): boolean {
    const tc = this.config.timeCategories?.find(t => t.id === timeCategoryId);
    return tc?.categoryIds?.includes(categoryId) || false;
  }

  toggleCategoryInTimeCategory(categoryId: string, timeCategoryId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.ensureTimeCategories();
    const tc = this.config.timeCategories!.find(t => t.id === timeCategoryId);
    if (!tc) return;
    if (!tc.categoryIds) tc.categoryIds = [];
    if (checked && !tc.categoryIds.includes(categoryId)) {
      tc.categoryIds.push(categoryId);
    } else if (!checked) {
      tc.categoryIds = tc.categoryIds.filter(id => id !== categoryId);
    }
    this.emitConfigChanged();
  }

  getCategoryAnalyticsType(categoryId: string): string {
    return this.config.categoryMappings?.[categoryId] || '';
  }

  setCategoryAnalyticsType(categoryId: string, analyticsType: string): void {
    if (!this.config.categoryMappings) this.config.categoryMappings = {};
    if (analyticsType) {
      this.config.categoryMappings[categoryId] = analyticsType;
    } else {
      delete this.config.categoryMappings[categoryId];
    }
    this.emitConfigChanged();
  }

  suggestAnalyticsType(categoryName: string): string {
    if (!categoryName) return '';
    const name = categoryName.toLowerCase().trim();
    const sponsorKeywords = ['sponsor', 'partenaire', 'pub', 'annonce', 'focus partenaire', 'publicité'];
    const jingleKeywords = ['jingle', 'intro', 'générique', 'transition', 'habillage'];
    const ambianceKeywords = ['ambiance', 'animation', 'divertissement', 'musique', 'fond'];
    if (sponsorKeywords.some(k => name.includes(k))) return 'sponsor';
    if (jingleKeywords.some(k => name.includes(k))) return 'jingle';
    if (ambianceKeywords.some(k => name.includes(k))) return 'ambiance';
    return '';
  }

  trackByGroupKey(_index: number, group: { key: string }): string {
    return group.key;
  }

  trackByVideoPath(_index: number, video: UnifiedVideoOption): string {
    return video.path;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private ensureTimeCategories(): void {
    if (!this.config.timeCategories || this.config.timeCategories.length === 0) {
      this.config.timeCategories = [
        { id: 'before', name: 'Avant-match', icon: '🏁', color: '#f59e0b', description: 'Échauffement & présentation', categoryIds: [] },
        { id: 'during', name: 'Match', icon: '▶️', color: '#22c55e', description: 'Live & animations', categoryIds: [] },
        { id: 'after', name: 'Après-match', icon: '🏆', color: '#3b82f6', description: 'Résultats & remerciements', categoryIds: [] }
      ];
    }
  }

  // ============================================================================
  // JSON Editor
  // ============================================================================

  toggleJsonView(): void {
    this.showJson = !this.showJson;
    if (this.showJson) {
      this.syncJsonFromConfig();
    }
    this.cdr.markForCheck();
  }

  onJsonInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.configJsonString = value;
    try {
      const parsed = JSON.parse(value) as SiteConfiguration;
      this.jsonError = '';
      Object.assign(this.config, parsed);
      this.emitConfigChanged();
    } catch (e) {
      this.jsonError = `JSON invalide: ${e instanceof Error ? e.message : 'Erreur inconnue'}`;
    }
  }

  formatJson(): void {
    try {
      const parsed = JSON.parse(this.configJsonString);
      this.configJsonString = JSON.stringify(parsed, null, 2);
      this.jsonError = '';
    } catch (e) {
      this.jsonError = `JSON invalide: ${e instanceof Error ? e.message : 'Erreur inconnue'}`;
    }
  }

  copyJson(): void {
    navigator.clipboard.writeText(this.configJsonString).then(() => {
      // Feedback visuel optionnel
    });
  }

  syncJsonFromConfig(): void {
    this.configJsonString = JSON.stringify(this.config, null, 2);
    this.jsonError = '';
  }
}
