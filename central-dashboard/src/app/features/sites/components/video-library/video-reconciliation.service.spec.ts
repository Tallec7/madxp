import { TestBed } from '@angular/core/testing';
import { VideoReconciliationService, ReconciliationInput, normalizeFilename } from './video-reconciliation.service';
import { LocalVideo, CloudVideo, SiteSponsor } from '../../../../core/models';

describe('VideoReconciliationService', () => {
  let service: VideoReconciliationService;

  const baseInput = (overrides: Partial<ReconciliationInput> = {}): ReconciliationInput => ({
    videos: [],
    cloudVideos: [],
    configVideoRoles: new Map(),
    configVideoLabels: new Map(),
    secondaryVariantVideoIds: new Set(),
    videoVariantInfo: new Map(),
    siteType: 'pi',
    siteSponsors: [],
    ...overrides,
  });

  const mkLocal = (over: Partial<LocalVideo>): LocalVideo => ({
    filename: 'a.mp4',
    path: '/videos/a.mp4',
    category: 'default',
    subcategory: null,
    size: 1024,
    duration: 10,
    lastModified: '2026-01-01T00:00:00Z',
    checksum: null,
    ...over,
  });

  const mkCloud = (over: Partial<CloudVideo>): CloudVideo => ({
    id: 'c1',
    filename: 'a.mp4',
    originalName: 'a.mp4',
    title: 'A',
    category: 'default',
    subcategory: null,
    size: 1024,
    duration: 10,
    checksum: null,
    url: 'https://cdn/a.mp4',
    uploadedForSiteId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VideoReconciliationService);
  });

  it('marks cloud video as on Pi when checksum matches a local video', () => {
    const local = mkLocal({ checksum: 'abc', path: '/local/a.mp4' });
    const cloud = mkCloud({ checksum: 'abc' });
    const result = service.reconcile(baseInput({ videos: [local], cloudVideos: [cloud] }));

    expect(result.allVideos.length).toBe(1);
    expect(result.allVideos[0].isOnPi).toBeTrue();
    expect(result.allVideos[0].source).toBe('cloud');
  });

  it('falls back to filename matching when checksum is absent', () => {
    const local = mkLocal({ filename: 'b.mp4', path: '/local/b.mp4' });
    const cloud = mkCloud({ filename: 'B.MP4', checksum: null });
    const result = service.reconcile(baseInput({ videos: [local], cloudVideos: [cloud] }));

    expect(result.allVideos[0].isOnPi).toBeTrue();
  });

  it('preserves multiple local videos with same filename via matchedLocalPaths guard', () => {
    const local1 = mkLocal({ filename: 'dup.mp4', path: '/local/dup1.mp4' });
    const local2 = mkLocal({ filename: 'dup.mp4', path: '/local/dup2.mp4' });
    const cloud = mkCloud({ id: 'c1', filename: 'dup.mp4', checksum: null });
    const result = service.reconcile(baseInput({
      videos: [local1, local2],
      cloudVideos: [cloud],
    }));

    // 1 cloud match + 1 local-only remaining
    expect(result.allVideos.length).toBe(2);
    expect(result.allVideos.filter(v => v.source === 'local').length).toBe(1);
  });

  it('deduplicates cloud videos by id', () => {
    const cloud1 = mkCloud({ id: 'same' });
    const cloud2 = mkCloud({ id: 'same', filename: 'other.mp4' });
    const result = service.reconcile(baseInput({ cloudVideos: [cloud1, cloud2] }));

    expect(result.allVideos.length).toBe(1);
    expect(result.allVideos[0].filename).toBe('a.mp4');
  });

  it('marks contentStatus as "to_deploy" only on Pi sites for cloud-only videos', () => {
    const cloud = mkCloud({ checksum: null });
    const piResult = service.reconcile(baseInput({ cloudVideos: [cloud], siteType: 'pi' }));
    const saasResult = service.reconcile(baseInput({ cloudVideos: [cloud], siteType: 'saas' }));

    expect(piResult.allVideos[0].contentStatus).toBe('to_deploy');
    expect(saasResult.allVideos[0].contentStatus).toBe('available');
  });

  it('derives contentStatus "loop" from configRoles boucle/match', () => {
    const cloud = mkCloud({ url: 'videos/loop.mp4', filename: 'loop.mp4' });
    const roles = new Map([['videos/loop.mp4', new Set(['boucle'])]]);
    const result = service.reconcile(baseInput({ cloudVideos: [cloud], configVideoRoles: roles }));

    expect(result.allVideos[0].contentStatus).toBe('loop');
  });

  it('derives contentStatus "category" from configRoles action', () => {
    const cloud = mkCloud({ url: 'videos/cat.mp4', filename: 'cat.mp4' });
    const roles = new Map([['videos/cat.mp4', new Set(['action'])]]);
    const result = service.reconcile(baseInput({ cloudVideos: [cloud], configVideoRoles: roles }));

    expect(result.allVideos[0].contentStatus).toBe('category');
  });

  it('detects neopro owner from path tokens', () => {
    const cloud = mkCloud({ filename: 'NEOPRO/x.mp4' });
    const result = service.reconcile(baseInput({ cloudVideos: [cloud] }));

    expect(result.allVideos[0].owner).toBe('neopro');
    expect(result.allVideos[0].ownerType).toBe('neopro');
  });

  it('detects sponsor ownerType when advertiserName is present and not legacy neopro', () => {
    const cloud = mkCloud({ filename: 'club/x.mp4', advertiserName: 'Acme' });
    const result = service.reconcile(baseInput({ cloudVideos: [cloud] }));

    expect(result.allVideos[0].ownerType).toBe('sponsor');
  });

  it('builds configVideoFilenames index from configVideoRoles paths', () => {
    const roles = new Map([
      ['videos/a/file1.mp4', new Set(['boucle'])],
      ['videos/b/FILE2.mp4', new Set(['action'])],
    ]);
    const result = service.reconcile(baseInput({ configVideoRoles: roles }));

    expect(result.configVideoFilenames.has('file1.mp4')).toBeTrue();
    expect(result.configVideoFilenames.has('file2.mp4')).toBeTrue();
  });

  it('returns sorted distinct categories and config label options', () => {
    const cloud1 = mkCloud({ id: 'c1', category: 'zeta' });
    const cloud2 = mkCloud({ id: 'c2', category: 'alpha' });
    const labels = new Map([
      ['p1', ['Boucle : Accueil', 'Action : Goal']],
      ['p2', ['Boucle : Accueil']],
    ]);
    const result = service.reconcile(baseInput({
      cloudVideos: [cloud1, cloud2],
      configVideoLabels: labels,
    }));

    expect(result.categories).toEqual(['alpha', 'zeta']);
    expect(result.configLabelOptions).toEqual(['Action : Goal', 'Boucle : Accueil']);
  });

  it('propagates secondary variant info from videoVariantInfo map', () => {
    const cloud = mkCloud({ id: 'cv' });
    const result = service.reconcile(baseInput({
      cloudVideos: [cloud],
      secondaryVariantVideoIds: new Set(['cv']),
      videoVariantInfo: new Map([['cv', { count: 3, types: ['secondary', 'led'] }]]),
    }));

    expect(result.allVideos[0].variantCount).toBe(3);
    expect(result.allVideos[0].variantTypes).toEqual(['secondary', 'led']);
    expect(result.allVideos[0].hasSecondaryVariant).toBeTrue();
  });

  // Regression guard: spaces vs underscores + accents (NLF Bottière site, 109 unmatched Pi videos)
  it('matches cloud "ENTREE.mp4" to Pi local "ENTRÉE.mp4" via normalizeFilename fallback', () => {
    const local = mkLocal({ filename: 'ENTRÉE.mp4', path: '/local/ENTRÉE.mp4', checksum: null });
    const cloud = mkCloud({ filename: 'ENTREE.mp4', checksum: null });
    const result = service.reconcile(baseInput({ videos: [local], cloudVideos: [cloud] }));

    expect(result.allVideos.length).toBe(1);
    expect(result.allVideos[0].isOnPi).toBeTrue();
  });

  it('matches cloud "00_neopro.mp4" to Pi local "00 neopro.mp4" via normalizeFilename fallback', () => {
    const local = mkLocal({ filename: '00 neopro.mp4', path: '/local/00 neopro.mp4', checksum: null });
    const cloud = mkCloud({ filename: '00_neopro.mp4', checksum: null });
    const result = service.reconcile(baseInput({ videos: [local], cloudVideos: [cloud] }));

    expect(result.allVideos.length).toBe(1);
    expect(result.allVideos[0].isOnPi).toBeTrue();
  });

  describe('normalizeFilename', () => {
    it('lowercases, strips accents, strips extension, collapses separators', () => {
      expect(normalizeFilename('ENTRÉE.mp4')).toBe('entree');
      expect(normalizeFilename('00 neopro.mp4')).toBe('00_neopro');
      expect(normalizeFilename('00_neopro.mp4')).toBe('00_neopro');
      expect(normalizeFilename('Côte d\'Ivoire.mp4')).toBe('cote_d\'ivoire');
    });

    it('treats spaces, dashes and underscores as equivalent', () => {
      expect(normalizeFilename('foo bar.mp4')).toBe(normalizeFilename('foo_bar.mp4'));
      expect(normalizeFilename('foo-bar.mp4')).toBe(normalizeFilename('foo_bar.mp4'));
    });
  });

  it('marks contentStatus "sponsor" when advertiser is linked to a site sponsor with videos', () => {
    const cloud = mkCloud({ filename: 'club/x.mp4', advertiserName: 'Acme' });
    const sponsors: SiteSponsor[] = [{
      id: 's1', site_id: 'site1', advertiser_id: null, name: 'Acme',
      contact_name: null, contact_email: null, contact_phone: null,
      logo_url: null, contract_amount: null, contract_start: null, contract_end: null,
      source: 'neopro', status: 'active', metadata: {},
      created_at: '', updated_at: '', video_filenames: ['x.mp4'],
    }];
    const result = service.reconcile(baseInput({
      cloudVideos: [cloud],
      siteSponsors: sponsors,
    }));

    expect(result.allVideos[0].contentStatus).toBe('sponsor');
  });
});
