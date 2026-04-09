import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SitesService } from '../../../../core/services/sites.service';
import { SiteSponsorService } from '../../../../core/services/site-sponsor.service';
import {
  SiteSponsor,
  SiteSponsorStatsResponse,
  GeneratedReport,
  SiteSponsorBenchmarkResponse,
  CloudVideo,
  SiteConfiguration,
} from '../../../../core/models';

@Injectable({ providedIn: 'root' })
export class SiteSponsorsTabDataService {
  private readonly sitesService = inject(SitesService);
  private readonly sponsorService = inject(SiteSponsorService);

  // ── List ──────────────────────────────────────────────────────────────────

  listSponsors(siteId: string, includeVideos: boolean): Observable<{ sponsors: SiteSponsor[] }> {
    return this.sponsorService.listSiteSponsors(siteId, includeVideos);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  createSponsor(siteId: string, payload: Partial<SiteSponsor>): Observable<SiteSponsor> {
    return this.sponsorService.createSiteSponsor(siteId, payload);
  }

  updateSponsor(siteId: string, sponsorId: string, payload: Partial<SiteSponsor>): Observable<SiteSponsor> {
    return this.sponsorService.updateSiteSponsor(siteId, sponsorId, payload);
  }

  deleteSponsor(siteId: string, sponsorId: string): Observable<void> {
    return this.sponsorService.deleteSiteSponsor(siteId, sponsorId);
  }

  // ── Detail / Stats ────────────────────────────────────────────────────────

  getSponsorStats(siteId: string, sponsorId: string): Observable<SiteSponsorStatsResponse> {
    return this.sponsorService.getSiteSponsorStats(siteId, sponsorId);
  }

  getSponsorReports(sponsorId: string): Observable<GeneratedReport[]> {
    return this.sponsorService.getSponsorReports(sponsorId);
  }

  getBenchmark(siteId: string): Observable<SiteSponsorBenchmarkResponse> {
    return this.sponsorService.getSiteSponsorBenchmark(siteId);
  }

  // ── Report generation ─────────────────────────────────────────────────────

  generateReport(siteId: string, sponsorId: string, periodStart: string, periodEnd: string): Observable<unknown> {
    return this.sponsorService.generateSponsorReport(siteId, sponsorId, periodStart, periodEnd);
  }

  // ── Access Link ───────────────────────────────────────────────────────────

  createAccessLink(siteId: string, sponsorId: string): Observable<{
    accessUrl: string;
    expiresAt: string;
    emailSent: boolean;
    sentTo: string | null;
  }> {
    return this.sponsorService.createSponsorAccessLink(siteId, sponsorId);
  }

  // ── Video association ─────────────────────────────────────────────────────

  addVideo(siteId: string, sponsorId: string, filename: string): Observable<unknown> {
    return this.sponsorService.addVideoToSiteSponsor(siteId, sponsorId, filename);
  }

  removeVideo(siteId: string, sponsorId: string, filename: string): Observable<unknown> {
    return this.sponsorService.removeVideoFromSiteSponsor(siteId, sponsorId, filename);
  }

  // ── Site content ──────────────────────────────────────────────────────────

  loadSiteContent(siteId: string): Observable<{ configuration: SiteConfiguration | null }> {
    return this.sitesService.getLocalContent(siteId);
  }

  // ── Config parsing helpers ────────────────────────────────────────────────

  /**
   * Extracts all unique video filenames deployed in the site config
   * and returns them as CloudVideo-compatible objects for dropdowns.
   */
  extractDeployedVideos(config: SiteConfiguration | null): CloudVideo[] {
    if (!config) return [];
    const seen = new Map<string, string>();

    const addVideo = (path: string, displayName?: string): void => {
      if (!path) return;
      const parts = path.split('/');
      const filename = parts[parts.length - 1];
      if (filename && !seen.has(filename)) {
        seen.set(filename, displayName || '');
      }
    };

    for (const v of config.sponsors ?? []) {
      addVideo(v.path, v.name);
    }
    for (const tc of config.timeCategories ?? []) {
      for (const v of tc.loopVideos ?? []) {
        addVideo(v.path, v.name);
      }
    }
    for (const cat of config.categories ?? []) {
      for (const v of cat.videos ?? []) {
        addVideo(v.path, v.name);
      }
      for (const sub of cat.subCategories ?? []) {
        for (const v of sub.videos ?? []) {
          addVideo(v.path, v.name);
        }
      }
    }

    return Array.from(seen.entries()).map(([filename, displayName]) => ({
      id: '',
      filename,
      originalName: filename,
      title: displayName || filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
      category: null,
      subcategory: null,
      size: 0,
      duration: null,
      checksum: null,
      url: '',
      uploadedForSiteId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  /**
   * Builds a Set of all video filenames present in the site configuration
   * (loops and categories). Used for "video not in loop" warnings.
   */
  buildVideosInLoopsSet(config: SiteConfiguration | null): Set<string> {
    const videosInLoops = new Set<string>();
    if (!config) return videosInLoops;

    const extractFilename = (path: string): string => {
      const parts = path.split('/');
      return parts[parts.length - 1];
    };

    const addToSet = (path?: string, name?: string): void => {
      if (path) {
        videosInLoops.add(path);
        videosInLoops.add(extractFilename(path));
      }
      if (name) {
        videosInLoops.add(name);
      }
    };

    for (const loopVideo of config.sponsors ?? []) {
      addToSet(loopVideo.path, loopVideo.name);
    }
    for (const tc of config.timeCategories ?? []) {
      for (const loopVideo of tc.loopVideos ?? []) {
        addToSet(loopVideo.path, loopVideo.name);
      }
    }
    for (const cat of config.categories ?? []) {
      for (const video of cat.videos ?? []) {
        addToSet(video.path, video.name);
      }
      for (const subCat of cat.subCategories ?? []) {
        for (const video of subCat.videos ?? []) {
          addToSet(video.path, video.name);
        }
      }
    }

    return videosInLoops;
  }

  /**
   * Checks if a filename (possibly a full path) matches any entry in the set.
   */
  isFilenameInLoop(filename: string, videosInLoops: Set<string>): boolean {
    if (videosInLoops.has(filename)) return true;
    const bare = filename.split('/').pop() || filename;
    return bare !== filename && videosInLoops.has(bare);
  }
}
