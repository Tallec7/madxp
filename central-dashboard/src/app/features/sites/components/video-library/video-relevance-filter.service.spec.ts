import { TestBed } from '@angular/core/testing';
import { VideoRelevanceFilterService, RelevanceContext } from './video-relevance-filter.service';
import { VideoItem } from './video-library.types';

describe('VideoRelevanceFilterService', () => {
  let service: VideoRelevanceFilterService;

  const mkVideo = (over: Partial<VideoItem>): VideoItem => ({
    id: 'v1',
    path: 'videos/x.mp4',
    filename: 'x.mp4',
    displayName: 'x',
    category: null,
    subcategory: null,
    size: 0,
    duration: 0,
    isOnPi: false,
    owner: 'club',
    ownerType: 'club',
    contentStatus: 'available',
    source: 'cloud',
    ...over,
  });

  const baseCtx = (over: Partial<RelevanceContext> = {}): RelevanceContext => ({
    configVideoRoles: new Map(),
    configVideoFilenames: new Set(),
    siteId: null,
    pendingDeploymentVideoIds: new Set(),
    ...over,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VideoRelevanceFilterService);
  });

  it('returns true when video is on Pi', () => {
    expect(service.isRelevant(mkVideo({ isOnPi: true }), baseCtx())).toBeTrue();
  });

  it('returns true when video path is referenced in configVideoRoles', () => {
    const ctx = baseCtx({ configVideoRoles: new Map([['videos/x.mp4', new Set(['boucle'])]]) });
    expect(service.isRelevant(mkVideo({}), ctx)).toBeTrue();
  });

  it('returns true via filename fallback when path is not in configVideoRoles', () => {
    const ctx = baseCtx({ configVideoFilenames: new Set(['x.mp4']) });
    expect(service.isRelevant(mkVideo({ path: 'other/path.mp4' }), ctx)).toBeTrue();
  });

  it('matches filename case-insensitively', () => {
    const ctx = baseCtx({ configVideoFilenames: new Set(['x.mp4']) });
    expect(service.isRelevant(mkVideo({ filename: 'X.MP4' }), ctx)).toBeTrue();
  });

  it('returns true when uploadedForSiteId matches current site', () => {
    const ctx = baseCtx({ siteId: 'site-42' });
    expect(service.isRelevant(mkVideo({ uploadedForSiteId: 'site-42' }), ctx)).toBeTrue();
  });

  it('returns false when uploadedForSiteId differs from current site', () => {
    const ctx = baseCtx({ siteId: 'site-42' });
    expect(service.isRelevant(mkVideo({ uploadedForSiteId: 'other' }), ctx)).toBeFalse();
  });

  it('returns true when video has a pending deployment', () => {
    const ctx = baseCtx({ pendingDeploymentVideoIds: new Set(['v1']) });
    expect(service.isRelevant(mkVideo({}), ctx)).toBeTrue();
  });

  it('returns false when no condition matches', () => {
    expect(service.isRelevant(mkVideo({}), baseCtx())).toBeFalse();
  });
});
