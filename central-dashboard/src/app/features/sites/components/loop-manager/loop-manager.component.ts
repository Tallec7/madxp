import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { SiteConfiguration, LoopVideoConfig, LocalVideo, SiteSponsor } from '../../../../core/models';
import { FeatureGateService } from '../../../../core/services/feature-gate.service';
import { VideoSearchSelectComponent, VideoOptionGroup } from '../../../../shared/components/video-search-select/video-search-select.component';

interface LoopTab {
  id: string;
  name: string;
  icon: string;
  isFallback: boolean;
}

interface SponsorWeightGroup {
  sponsorId: string;
  sponsorName: string;
  weight: number;
  percentage: number;
  videoCount: number;
}

@Component({
  selector: 'app-loop-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, VideoSearchSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loop-manager.component.html',
  styleUrls: ['./loop-manager.component.scss']
})
export class LoopManagerComponent implements OnInit, OnChanges {
  @Input() siteType: string = '';
  @Input() isClubUser = false;
  @Input() subscriptionPlan: string | null = null;
  @Input() featureOverrides: Record<string, boolean> | null = null;

  constructor(private gate: FeatureGateService) {}

  get canUseWeightedRotation(): boolean {
    return this.gate.canAccess('weighted_rotation', {
      subscription_plan: this.subscriptionPlan,
      feature_overrides: this.featureOverrides,
    });
  }
  @Input() config!: SiteConfiguration;
  @Input() videoOptionGroups: { key: string; label: string; icon: string; videos: { path: string; displayName: string; isOnPi: boolean }[] }[] = [];
  @Input() cloudVideoPaths: Set<string> = new Set();
  @Input() allKnownVideoPaths: Set<string> = new Set();
  @Input() localVideos: LocalVideo[] = [];
  @Input() videoDurations: Map<string, number> = new Map();
  @Input() siteSponsors: SiteSponsor[] = [];
  @Output() configChanged = new EventEmitter<void>();

  activeTab = 'default';

  tabs: LoopTab[] = [
    { id: 'before', name: 'Avant-match', icon: '🏁', isFallback: false },
    { id: 'during', name: 'Match', icon: '▶️', isFallback: false },
    { id: 'after', name: 'Après-match', icon: '🏆', isFallback: false },
    { id: 'default', name: 'Défaut (fallback)', icon: '🔄', isFallback: true }
  ];

  ngOnInit(): void {
    this.selectDefaultTab();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      this.selectDefaultTab();
    }
  }

  private selectDefaultTab(): void {
    if (!this.config) return;
    // Si des boucles par phase existent, sélectionner la première avec du contenu
    const phases = this.config.timeCategories || [];
    const firstWithContent = phases.find(tc => tc.loopVideos && tc.loopVideos.length > 0);
    if (firstWithContent) {
      this.activeTab = firstWithContent.id;
    } else {
      this.activeTab = 'default';
    }
  }

  getVideoCount(tabId: string): number {
    if (tabId === 'default') {
      return this.config.sponsors?.length || 0;
    }
    const tc = this.config.timeCategories?.find(t => t.id === tabId);
    return tc?.loopVideos?.length || 0;
  }

  isCloudVideo(path: string): boolean {
    return this.cloudVideoPaths.has(path);
  }

  isOrphanedVideo(path: string): boolean {
    if (!path) return false;
    return this.allKnownVideoPaths.size > 0 && !this.allKnownVideoPaths.has(path);
  }

  // === Default loop ===

  showDefaultLoopWarning(): boolean {
    if (!this.config.sponsors || this.config.sponsors.length === 0) return false;
    const phases = this.config.timeCategories || [];
    return phases.every(tc => !tc.loopVideos || tc.loopVideos.length === 0);
  }

  addDefaultVideo(): void {
    if (!this.config.sponsors) {
      this.config.sponsors = [];
    }
    this.config.sponsors.push({ name: '', path: '', type: 'video/mp4', owner: 'club' });
    this.onChanged();
  }

  removeDefaultVideo(index: number): void {
    this.config.sponsors.splice(index, 1);
    this.onChanged();
  }

  distributeToAllPhases(): void {
    this.ensureTimeCategories();
    for (const tc of this.config.timeCategories!) {
      tc.loopVideos = this.config.sponsors.map(s => ({
        name: s.name,
        path: s.path,
        type: s.type || 'video/mp4'
      }));
    }
    // Garder seulement les vidéos NEOPRO dans la boucle par défaut
    this.config.sponsors = this.config.sponsors.filter(s => s.owner === 'neopro');
    this.activeTab = 'before';
    this.onChanged();
  }

  // === Phase loops ===

  getPhaseVideos(): LoopVideoConfig[] {
    const tc = this.config.timeCategories?.find(t => t.id === this.activeTab);
    return tc?.loopVideos || [];
  }

  addPhaseVideo(): void {
    this.ensureTimeCategories();
    const tc = this.config.timeCategories!.find(t => t.id === this.activeTab);
    if (!tc) return;
    if (!tc.loopVideos) {
      tc.loopVideos = [];
    }
    tc.loopVideos.push({ name: '', path: '', type: 'video/mp4' });
    this.onChanged();
  }

  updatePhaseVideo(index: number, field: 'name' | 'path', value: string): void {
    const tc = this.config.timeCategories?.find(t => t.id === this.activeTab);
    if (!tc?.loopVideos?.[index]) return;
    const video = tc.loopVideos[index];
    if (field === 'name') video.name = value;
    else if (field === 'path') video.path = value;

    // Auto-remplir le nom si on change le path et que le nom est vide
    if (field === 'path' && value && !tc.loopVideos[index].name) {
      const video = this.localVideos.find(v => v.path === value);
      tc.loopVideos[index].name = video?.filename || value.split('/').pop() || 'Vidéo';
    }

    this.onChanged();
  }

  removePhaseVideo(index: number): void {
    const tc = this.config.timeCategories?.find(t => t.id === this.activeTab);
    if (!tc?.loopVideos) return;
    tc.loopVideos.splice(index, 1);
    this.onChanged();
  }

  copyDefaultToCurrentPhase(): void {
    this.ensureTimeCategories();
    const tc = this.config.timeCategories!.find(t => t.id === this.activeTab);
    if (!tc || !this.config.sponsors) return;
    tc.loopVideos = this.config.sponsors.map(s => ({
      name: s.name,
      path: s.path,
      type: s.type || 'video/mp4'
    }));
    this.onChanged();
  }

  clearCurrentPhase(): void {
    const tc = this.config.timeCategories?.find(t => t.id === this.activeTab);
    if (!tc) return;
    tc.loopVideos = [];
    this.onChanged();
  }

  // === Sponsor weight management ===

  /**
   * Retourne le sponsor ID d'une vidéo (site_sponsor_id ou auto-détection).
   * Retourne null si pas de sponsor → pas de contrôle de poids.
   */
  getVideoSponsorId(video: LoopVideoConfig): string | null {
    return video.site_sponsor_id || this.getAutoDetectedSponsor(video.path)?.id || null;
  }

  /**
   * Calcule le % de temps d'antenne d'un sponsor dans la phase active.
   */
  getWeightPercentage(sponsorId: string): number {
    const groups = this.getSponsorGroups();
    const totalWeight = groups.reduce((sum, g) => sum + g.weight, 0);
    const group = groups.find(g => g.sponsorId === sponsorId);
    if (!group || totalWeight === 0) return 0;
    return Math.round((group.weight / totalWeight) * 100);
  }

  /**
   * Regroupe les vidéos par sponsor détecté (site_sponsor_id ou auto-détection par filename).
   * Les vidéos sans sponsor sont exclues — pas de contrôle de poids dessus.
   */
  getSponsorGroups(): SponsorWeightGroup[] {
    const videos = this.getPhaseVideos();
    if (videos.length === 0) return [];

    const groupMap = new Map<string, { name: string; weight: number; count: number }>();

    for (const video of videos) {
      // Identifier le sponsor : d'abord site_sponsor_id, sinon auto-détection par filename
      const sponsorId = video.site_sponsor_id || this.getAutoDetectedSponsor(video.path)?.id;
      if (!sponsorId) continue; // Vidéo sans sponsor → pas de pondération

      if (!groupMap.has(sponsorId)) {
        const sponsor = this.siteSponsors.find(sp => sp.id === sponsorId);
        groupMap.set(sponsorId, {
          name: sponsor?.name || video.name || video.path?.split('/').pop() || 'Sponsor',
          weight: video.weight || 1,
          count: 0,
        });
      }
      groupMap.get(sponsorId)!.count++;
    }

    const totalWeight = Array.from(groupMap.values()).reduce((sum, g) => sum + g.weight, 0);

    return Array.from(groupMap.entries()).map(([sponsorId, data]) => ({
      sponsorId,
      sponsorName: data.name,
      weight: data.weight,
      percentage: totalWeight > 0 ? Math.round((data.weight / totalWeight) * 100) : 0,
      videoCount: data.count,
    }));
  }

  togglePinVideo(index: number): void {
    const tc = this.config.timeCategories?.find(t => t.id === this.activeTab);
    if (!tc?.loopVideos?.[index]) return;
    tc.loopVideos[index].pinned = !tc.loopVideos[index].pinned;
    this.onChanged();
  }

  updateSponsorWeight(sponsorId: string, newWeight: number): void {
    if (!this.canUseWeightedRotation) return;
    const weight = Math.max(1, Math.min(10, Math.round(newWeight)));
    const videos = this.getPhaseVideos();
    for (const video of videos) {
      // Matcher par site_sponsor_id ou auto-détection
      const videoSponsorId = video.site_sponsor_id || this.getAutoDetectedSponsor(video.path)?.id;
      if (videoSponsorId === sponsorId) {
        video.weight = weight;
      }
    }
    this.onChanged();
  }

  // === Sponsor auto-detection ===

  /**
   * Extracts the bare filename from a video path and matches it against
   * siteSponsors[].video_filenames[] to find an auto-detected sponsor.
   * Returns the SiteSponsor if found, null otherwise.
   */
  getAutoDetectedSponsor(videoPath: string): SiteSponsor | null {
    if (!videoPath || this.siteSponsors.length === 0) return null;
    const parts = videoPath.split('/');
    const bareFilename = parts[parts.length - 1] || videoPath;
    // Try exact match first
    const exact = this.siteSponsors.find(
      sp => sp.video_filenames?.includes(bareFilename)
    );
    if (exact) return exact;
    // Fallback: strip numeric prefix (e.g. "07_A_L_AFFUT.mp4" → "A_L_AFFUT.mp4")
    // Loop videos often have numbered prefixes that don't match category filenames
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

  // === Helpers ===

  private ensureTimeCategories(): void {
    if (!this.config.timeCategories || this.config.timeCategories.length === 0) {
      this.config.timeCategories = [
        { id: 'before', name: 'Avant-match', icon: '🏁', color: '#f59e0b', description: 'Échauffement & présentation', categoryIds: [] },
        { id: 'during', name: 'Match', icon: '▶️', color: '#22c55e', description: 'Live & animations', categoryIds: [] },
        { id: 'after', name: 'Après-match', icon: '🏆', color: '#3b82f6', description: 'Résultats & remerciements', categoryIds: [] }
      ];
    }
  }

  // === Duration helpers ===

  getVideoDuration(path: string): number | null {
    return this.videoDurations.get(path) ?? null;
  }

  formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getActiveTabTotalDuration(): number {
    const videos = this.activeTab === 'default'
      ? (this.config.sponsors || [])
      : this.getPhaseVideos();
    return videos.reduce((sum, v) => sum + (this.videoDurations.get(v.path) || 0), 0);
  }

  getRotationsPerHour(): number {
    const total = this.getActiveTabTotalDuration();
    if (total <= 0) return 0;
    return Math.round(3600 / total);
  }

  // === Playlist preview (Bresenham simulation) ===

  private static readonly SPONSOR_COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  ];

  private static readonly NON_SPONSOR_COLOR = '#94a3b8';

  /**
   * Simule l'algorithme Bresenham du Pi pour afficher l'ordre de diffusion.
   * Retourne un tableau de pastilles avec couleur et nom.
   */
  getPlaylistPreview(): Array<{ name: string; sponsorName: string; color: string; pinned?: boolean }> {
    const videos = this.getPhaseVideos();
    if (videos.length === 0) return [];

    // Assigner une couleur par sponsor
    const colorMap = this.buildSponsorColorMap(videos);

    const toChip = (v: LoopVideoConfig, isPinned?: boolean): { name: string; sponsorName: string; color: string; pinned?: boolean } => {
      const sid = this.getVideoSponsorId(v);
      return {
        name: v.name || v.path?.split('/').pop() || 'Vidéo',
        sponsorName: sid ? (this.siteSponsors.find(sp => sp.id === sid)?.name || '') : '',
        color: sid ? (colorMap.get(sid) || LoopManagerComponent.NON_SPONSOR_COLOR) : LoopManagerComponent.NON_SPONSOR_COLOR,
        pinned: isPinned || undefined,
      };
    };

    // Séparer les vidéos épinglées des vidéos mobiles
    const pinnedSlots = new Map<number, LoopVideoConfig>();
    const mobileVideos: LoopVideoConfig[] = [];
    const hasPinned = videos.some(v => v.pinned);

    for (let i = 0; i < videos.length; i++) {
      if (videos[i].pinned) {
        pinnedSlots.set(i, videos[i]);
      } else {
        mobileVideos.push(videos[i]);
      }
    }

    // Vérifier si tous les poids mobiles sont 1 ET pas de pinned → retourner l'ordre brut
    const allDefault = mobileVideos.every(v => !v.weight || v.weight <= 1);
    if (allDefault && !hasPinned) {
      return videos.map(v => toChip(v));
    }

    // Si toutes les vidéos sont épinglées, retourner l'ordre original
    if (mobileVideos.length === 0) {
      return videos.map(v => toChip(v, true));
    }

    // Bresenham smooth scheduling sur les vidéos mobiles uniquement
    const entries = mobileVideos.map(v => {
      const w = v.weight && v.weight >= 1 ? Math.round(v.weight) : 1;
      const sid = this.getVideoSponsorId(v);
      return {
        video: v,
        weight: w,
        remaining: w,
        accumulator: 0,
        sponsorId: sid || v.path || '',
      };
    });

    const totalSlots = entries.reduce((sum, e) => sum + e.remaining, 0);
    const bresenhamResult: Array<{ name: string; sponsorName: string; color: string; pinned?: boolean }> = [];
    let lastSponsorId = '';

    for (let i = 0; i < totalSlots; i++) {
      for (const entry of entries) {
        if (entry.remaining > 0) {
          entry.accumulator += entry.weight;
        }
      }

      let bestIdx = -1;
      let bestAcc = -Infinity;

      for (let j = 0; j < entries.length; j++) {
        if (entries[j].remaining <= 0) continue;
        if (entries[j].sponsorId === lastSponsorId && entries.some(e => e.remaining > 0 && e.sponsorId !== lastSponsorId)) continue;
        if (entries[j].accumulator > bestAcc) {
          bestAcc = entries[j].accumulator;
          bestIdx = j;
        }
      }

      if (bestIdx === -1) {
        bestIdx = entries.findIndex(e => e.remaining > 0);
      }

      const picked = entries[bestIdx];
      bresenhamResult.push(toChip(picked.video));
      picked.remaining--;
      picked.accumulator -= totalSlots;
      lastSponsorId = picked.sponsorId;
    }

    // Fusionner : insérer les vidéos épinglées à leurs positions
    if (pinnedSlots.size === 0) {
      this.fixPreviewWrapAround(bresenhamResult, entries);
      return bresenhamResult;
    }

    const mergedLength = bresenhamResult.length + pinnedSlots.size;
    const result: Array<{ name: string; sponsorName: string; color: string; pinned?: boolean }> = [];
    let bresenhamIdx = 0;

    for (let i = 0; i < mergedLength; i++) {
      if (pinnedSlots.has(i)) {
        result.push(toChip(pinnedSlots.get(i)!, true));
      } else if (bresenhamIdx < bresenhamResult.length) {
        result.push(bresenhamResult[bresenhamIdx]);
        bresenhamIdx++;
      }
    }
    while (bresenhamIdx < bresenhamResult.length) {
      result.push(bresenhamResult[bresenhamIdx]);
      bresenhamIdx++;
    }

    this.fixPreviewWrapAround(result, entries);
    return result;
  }

  /**
   * Corrige le wrap-around : si premier et dernier ont le même sponsor,
   * déplace le dernier au milieu pour éviter un double passage à la jonction.
   */
  private fixPreviewWrapAround(
    result: Array<{ name: string; sponsorName: string; color: string }>,
    entries: Array<{ video: LoopVideoConfig; sponsorId: string }>,
  ): void {
    if (result.length <= 2) return;

    // Retrouver le sponsorId du premier et dernier via les entries
    const firstVideo = entries.find(e => (e.video.name || e.video.path?.split('/').pop() || 'Vidéo') === result[0].name);
    const lastVideo = entries.find(e => (e.video.name || e.video.path?.split('/').pop() || 'Vidéo') === result[result.length - 1].name);
    if (!firstVideo || !lastVideo || firstVideo.sponsorId !== lastVideo.sponsorId) return;

    const removedSid = lastVideo.sponsorId;
    const removed = result.pop()!;
    const mid = Math.floor(result.length / 2);

    for (let offset = 0; offset <= result.length; offset++) {
      const candidates = offset === 0 ? [mid] : [mid + offset, mid - offset];
      for (const pos of candidates) {
        if (pos < 1 || pos >= result.length) continue;
        const prevEntry = entries.find(e => (e.video.name || e.video.path?.split('/').pop() || 'Vidéo') === result[pos - 1].name);
        const nextEntry = entries.find(e => (e.video.name || e.video.path?.split('/').pop() || 'Vidéo') === result[pos].name);
        if (prevEntry?.sponsorId !== removedSid && nextEntry?.sponsorId !== removedSid) {
          result.splice(pos, 0, removed);
          return;
        }
      }
    }

    result.push(removed);
  }

  /**
   * Légende des sponsors pour la preview.
   */
  getPlaylistLegend(): Array<{ name: string; color: string; percentage: number }> {
    const preview = this.getPlaylistPreview();
    if (preview.length === 0) return [];

    const countMap = new Map<string, { name: string; color: string; count: number }>();
    for (const item of preview) {
      const key = item.color;
      if (!countMap.has(key)) {
        countMap.set(key, { name: item.sponsorName || item.name, color: item.color, count: 0 });
      }
      countMap.get(key)!.count++;
    }

    return Array.from(countMap.values()).map(entry => ({
      name: entry.name,
      color: entry.color,
      percentage: Math.round((entry.count / preview.length) * 100),
    }));
  }

  private buildSponsorColorMap(videos: LoopVideoConfig[]): Map<string, string> {
    const colorMap = new Map<string, string>();
    let colorIdx = 0;
    for (const video of videos) {
      const sid = this.getVideoSponsorId(video);
      if (sid && !colorMap.has(sid)) {
        colorMap.set(sid, LoopManagerComponent.SPONSOR_COLORS[colorIdx % LoopManagerComponent.SPONSOR_COLORS.length]);
        colorIdx++;
      }
    }
    return colorMap;
  }

  onChanged(): void {
    this.configChanged.emit();
  }

  // === ADR-050: Card coloring by sponsor/weight ===

  /** Returns a subtle background color for the card based on its sponsor color and weight */
  getCardBackground(video: LoopVideoConfig): string | null {
    const sid = this.getVideoSponsorId(video);
    if (!sid) return null;
    const videos = this.activeTab === 'default' ? this.config.sponsors : this.getPhaseVideos();
    const colorMap = this.buildSponsorColorMap(videos);
    const color = colorMap.get(sid);
    if (!color) return null;
    // Convert hex to rgba with low opacity scaled by weight (0.04 base + 0.02 per weight)
    const weight = video.weight || 1;
    const opacity = Math.min(0.04 + (weight - 1) * 0.02, 0.15);
    return this.hexToRgba(color, opacity);
  }

  /** Returns the sponsor accent color for the left border */
  getCardBorderColor(video: LoopVideoConfig): string | null {
    const sid = this.getVideoSponsorId(video);
    if (!sid) return null;
    const videos = this.activeTab === 'default' ? this.config.sponsors : this.getPhaseVideos();
    const colorMap = this.buildSponsorColorMap(videos);
    return colorMap.get(sid) || null;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // === ADR-050 Phase 3: Drag & drop reorder ===

  dragIndex: number | null = null;
  dragOverIndex: number | null = null;
  dragContext: 'default' | 'phase' | null = null;

  getFilename(path: string): string {
    if (!path) return '';
    return path.split('/').pop() || path;
  }

  onDragStart(event: DragEvent, index: number, context: 'default' | 'phase'): void {
    this.dragIndex = index;
    this.dragContext = context;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDragEnter(index: number, context: 'default' | 'phase'): void {
    if (this.dragContext === context) {
      this.dragOverIndex = index;
    }
  }

  onDragEnd(): void {
    this.dragIndex = null;
    this.dragOverIndex = null;
    this.dragContext = null;
  }

  onDropDefault(event: DragEvent): void {
    event.preventDefault();
    if (this.dragIndex === null || this.dragOverIndex === null || this.dragContext !== 'default') {
      this.onDragEnd();
      return;
    }
    const arr = this.config.sponsors;
    if (!arr || this.dragIndex === this.dragOverIndex) {
      this.onDragEnd();
      return;
    }
    const [moved] = arr.splice(this.dragIndex, 1);
    arr.splice(this.dragOverIndex, 0, moved);
    this.onDragEnd();
    this.onChanged();
  }

  onDropPhase(event: DragEvent): void {
    event.preventDefault();
    if (this.dragIndex === null || this.dragOverIndex === null || this.dragContext !== 'phase') {
      this.onDragEnd();
      return;
    }
    const tc = this.config.timeCategories?.find(t => t.id === this.activeTab);
    const arr = tc?.loopVideos;
    if (!arr || this.dragIndex === this.dragOverIndex) {
      this.onDragEnd();
      return;
    }
    const [moved] = arr.splice(this.dragIndex, 1);
    arr.splice(this.dragOverIndex, 0, moved);
    this.onDragEnd();
    this.onChanged();
  }
}
