import { Injectable } from '@angular/core';
import { LocalVideo, CloudVideo, SiteSponsor } from '../../../../core/models';
import { VideoItem, VideoOwnerType, VideoContentStatus } from './video-library.types';

export interface ReconciliationInput {
  videos: LocalVideo[];
  cloudVideos: CloudVideo[];
  configVideoRoles: Map<string, Set<string>>;
  configVideoLabels: Map<string, string[]>;
  secondaryVariantVideoIds: Set<string>;
  videoVariantInfo: Map<string, { count: number; types: string[] }>;
  siteType: string;
  siteSponsors: SiteSponsor[];
}

export interface ReconciliationResult {
  allVideos: VideoItem[];
  configVideoFilenames: Set<string>;
  categories: string[];
  configLabelOptions: string[];
}

const NEOPRO_OWNER_TOKENS = ['SPONSORS', 'NEOPRO', 'PUBLICITES', 'ANIMATIONS', 'PUB_'];

/** Normalize a filename for fuzzy matching: lowercase, strip accents, strip extension, collapse spaces/dashes/underscores. */
export function normalizeFilename(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // É→e, È→e
    .replace(/\.[^.]+$/, '')                           // strip extension
    .replace(/[\s\-]+/g, '_')                          // spaces/dashes → underscore
    .replace(/^_+|_+$/g, '');                          // trim leading/trailing underscores
}

@Injectable({ providedIn: 'root' })
export class VideoReconciliationService {
  /**
   * Reconcile cloud + local Pi videos into a unified VideoItem list.
   * For SaaS sites, `videos` is typically empty (no Pi local storage).
   */
  reconcile(input: ReconciliationInput): ReconciliationResult {
    const configVideoFilenames = this.buildConfigFilenameIndex(input.configVideoRoles);

    // Index filename → ALL local videos with that name (preserves duplicates)
    const localByFilename = new Map<string, LocalVideo[]>();
    for (const v of input.videos) {
      const fnKey = v.filename.toLowerCase();
      if (!localByFilename.has(fnKey)) {
        localByFilename.set(fnKey, []);
      }
      localByFilename.get(fnKey)!.push(v);
    }
    const localByChecksum = new Map(
      input.videos.filter(v => v.checksum).map(v => [v.checksum!, v])
    );

    // Third-tier fallback: normalized filename (strips accents, collapses spaces↔underscores)
    const localByNormalizedName = new Map<string, LocalVideo[]>();
    for (const v of input.videos) {
      const normKey = normalizeFilename(v.filename);
      if (!localByNormalizedName.has(normKey)) {
        localByNormalizedName.set(normKey, []);
      }
      localByNormalizedName.get(normKey)!.push(v);
    }

    const seenCloudIds = new Set<string>();
    const matchedLocalPaths = new Set<string>();
    const cloudMapped: VideoItem[] = [];
    const isSaas = input.siteType === 'saas';

    for (const cloud of input.cloudVideos) {
      if (seenCloudIds.has(cloud.id)) continue;
      seenCloudIds.add(cloud.id);

      const filenameLower = cloud.filename.toLowerCase();
      let isOnPi = false;
      let localMatch: LocalVideo | undefined = cloud.checksum ? localByChecksum.get(cloud.checksum) : undefined;
      if (localMatch) {
        isOnPi = true;
      } else {
        const locals = localByFilename.get(filenameLower) || [];
        localMatch = locals.find(l => !matchedLocalPaths.has(l.path));
        if (localMatch) {
          isOnPi = true;
        } else {
          // Third tier: normalized name (accents + spaces↔underscores)
          const normKey = normalizeFilename(cloud.filename);
          const normLocals = localByNormalizedName.get(normKey) || [];
          localMatch = normLocals.find(l => !matchedLocalPaths.has(l.path));
          if (localMatch) {
            isOnPi = true;
          }
        }
      }
      if (localMatch) matchedLocalPaths.add(localMatch.path);

      const legacyOwner = this.detectOwner(cloud.filename);
      const effectivePath = cloud.url || cloud.filename;
      const configRoles = input.configVideoRoles.get(effectivePath)
        || this.lookupConfigRolesByFilename(cloud.filename, input.configVideoRoles);

      const item: VideoItem = {
        id: cloud.id,
        path: effectivePath,
        filename: cloud.filename,
        displayName: cloud.title || cloud.originalName || cloud.filename,
        category: cloud.category,
        subcategory: cloud.subcategory,
        size: cloud.size,
        duration: cloud.duration,
        isOnPi,
        owner: legacyOwner,
        ownerType: this.detectOwnerType(cloud, legacyOwner),
        contentStatus: 'available',
        source: 'cloud',
        lastModified: cloud.updatedAt?.toString(),
        uploadedForSiteId: cloud.uploadedForSiteId,
        piCategory: localMatch?.category ?? null,
        piSubcategory: localMatch?.subcategory ?? null,
        advertiserName: cloud.advertiserName ?? null,
        hasSecondaryVariant: input.secondaryVariantVideoIds.has(cloud.id),
        variantCount: input.videoVariantInfo.get(cloud.id)?.count
          ?? (input.secondaryVariantVideoIds.has(cloud.id) ? 1 : 0),
        variantTypes: input.videoVariantInfo.get(cloud.id)?.types
          ?? (input.secondaryVariantVideoIds.has(cloud.id) ? ['secondary'] : []),
        checksum: cloud.checksum ?? null,
        configRoles,
        thumbnailUrl: cloud.thumbnail_url ?? null,
        // ADR-103 Phase 3 v2 — propagate content type metadata for proactive UX.
        contentType: cloud.contentType ?? 'video',
        externalUrl: cloud.externalUrl ?? null,
      };
      item.contentStatus = this.computeContentStatus(item, isSaas, input.siteSponsors);
      cloudMapped.push(item);
    }

    const localOnlyMapped: VideoItem[] = input.videos
      .filter(local => !matchedLocalPaths.has(local.path))
      .map(local => {
        const legacyOwner = this.detectOwner(local.path);
        const configRoles = input.configVideoRoles.get(local.path);
        const item: VideoItem = {
          id: null,
          path: local.path,
          filename: local.filename,
          displayName: local.filename,
          category: local.category,
          subcategory: local.subcategory,
          size: local.size,
          duration: local.duration || null,
          isOnPi: true,
          owner: legacyOwner,
          ownerType: this.detectOwnerType(null, legacyOwner),
          contentStatus: 'available',
          source: 'local',
          lastModified: local.lastModified,
          checksum: local.checksum ?? null,
          configRoles,
        };
        item.contentStatus = this.computeContentStatus(item, isSaas, input.siteSponsors);
        return item;
      });

    const allVideos = [...cloudMapped, ...localOnlyMapped];

    const cats = new Set<string>();
    allVideos.forEach(v => {
      if (v.category) cats.add(v.category);
    });
    const categories = Array.from(cats).sort();

    const labelSet = new Set<string>();
    for (const labels of input.configVideoLabels.values()) {
      for (const label of labels) labelSet.add(label);
    }
    const configLabelOptions = Array.from(labelSet).sort();

    return { allVideos, configVideoFilenames, categories, configLabelOptions };
  }

  private buildConfigFilenameIndex(configVideoRoles: Map<string, Set<string>>): Set<string> {
    const index = new Set<string>();
    for (const path of configVideoRoles.keys()) {
      const fn = path.split('/').pop()?.toLowerCase();
      if (fn) index.add(fn);
    }
    return index;
  }

  private lookupConfigRolesByFilename(
    filename: string,
    configVideoRoles: Map<string, Set<string>>,
  ): Set<string> | undefined {
    const fnLower = filename.toLowerCase();
    for (const [path, roles] of configVideoRoles) {
      const pathFilename = path.split('/').pop()?.toLowerCase();
      if (pathFilename === fnLower) return roles;
    }
    return undefined;
  }

  private detectOwner(pathOrFilename: string): 'club' | 'neopro' {
    return NEOPRO_OWNER_TOKENS.some(p => pathOrFilename.toUpperCase().includes(p)) ? 'neopro' : 'club';
  }

  /** ADR-050: enriched owner type from upload metadata */
  private detectOwnerType(cloud: CloudVideo | null, legacyOwner: 'club' | 'neopro'): VideoOwnerType {
    if (legacyOwner === 'neopro') return 'neopro';
    if (cloud?.advertiserName) return 'sponsor';
    if (cloud?.uploadedForSiteId) return 'club';
    if (cloud) return 'admin';
    return 'club';
  }

  /** ADR-050: content status from config roles + deploy state */
  private computeContentStatus(
    video: { configRoles?: Set<string>; isOnPi: boolean; advertiserName?: string | null },
    isSaas: boolean,
    siteSponsors: SiteSponsor[],
  ): VideoContentStatus {
    if (video.configRoles?.has('boucle') || video.configRoles?.has('match')) return 'loop';
    if (video.configRoles?.has('action')) return 'category';
    if (video.advertiserName && this.isVideoSponsorLinked(siteSponsors)) return 'sponsor';
    if (!isSaas && !video.isOnPi) return 'to_deploy';
    return 'available';
  }

  private isVideoSponsorLinked(siteSponsors: SiteSponsor[]): boolean {
    return siteSponsors.some(s => s.video_filenames?.length);
  }
}
