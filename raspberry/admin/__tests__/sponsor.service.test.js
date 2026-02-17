/**
 * Tests for SponsorService
 */

const SponsorService = require('../services/sponsor.service');
const { NotFoundError, ValidationError, DuplicateError } = require('../services/errors');

// ---------------------------------------------------------------------------
// Mock fs (for ConfigurationService)
// ---------------------------------------------------------------------------

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      stat: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
    },
  };
});

const fs = require('fs').promises;

// ---------------------------------------------------------------------------
// Mock cache
// ---------------------------------------------------------------------------

function createMockCache() {
  return {
    getOrSet: jest.fn(async (_ns, _key, factory) => factory()),
    invalidateNamespace: jest.fn(),
    delete: jest.fn(),
  };
}

const NAMESPACES = { CONFIG: 'config', VIDEOS: 'videos' };

// ---------------------------------------------------------------------------
// ConfigurationService mock (simple stub)
// ---------------------------------------------------------------------------

function createMockConfigService(initialConfig) {
  let config = JSON.parse(JSON.stringify(initialConfig));
  return {
    loadConfig: jest.fn(async () => JSON.parse(JSON.stringify(config))),
    saveConfig: jest.fn(async (newConfig) => {
      config = JSON.parse(JSON.stringify(newConfig));
    }),
    _getConfig: () => config,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_CONFIG = {
  settings: { language: 'fr' },
  categories: [],
  sponsors: [],
  localSponsors: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SponsorService', () => {
  let sponsorService;
  let configService;

  beforeEach(() => {
    configService = createMockConfigService(BASE_CONFIG);
    sponsorService = new SponsorService({ configService });
  });

  // =========================================================================
  // CREATE
  // =========================================================================

  describe('createSponsor', () => {
    it('should create a local sponsor with generated localId', async () => {
      const sponsor = await sponsorService.createSponsor({
        name: 'Boulangerie Dupont',
        contactEmail: 'contact@dupont.fr',
      });

      expect(sponsor.localId).toMatch(/^ls_\d+_[a-f0-9]{6}$/);
      expect(sponsor.name).toBe('Boulangerie Dupont');
      expect(sponsor.contactEmail).toBe('contact@dupont.fr');
      expect(sponsor.centralId).toBeNull();
      expect(sponsor.source).toBe('local');
      expect(sponsor.isActive).toBe(true);
      expect(sponsor.videoFilenames).toEqual([]);
      expect(configService.saveConfig).toHaveBeenCalled();
    });

    it('should throw ValidationError when name is empty', async () => {
      await expect(sponsorService.createSponsor({ name: '' }))
        .rejects.toThrow(ValidationError);
      await expect(sponsorService.createSponsor({ name: '   ' }))
        .rejects.toThrow(ValidationError);
    });

    it('should throw DuplicateError for duplicate name (case-insensitive)', async () => {
      await sponsorService.createSponsor({ name: 'Mon Sponsor' });
      await expect(sponsorService.createSponsor({ name: 'mon sponsor' }))
        .rejects.toThrow(DuplicateError);
    });

    it('should trim name and contact fields', async () => {
      const sponsor = await sponsorService.createSponsor({
        name: '  Test Sponsor  ',
        contactEmail: '  test@test.fr  ',
        contactPhone: '  0612345678  ',
      });

      expect(sponsor.name).toBe('Test Sponsor');
      expect(sponsor.contactEmail).toBe('test@test.fr');
      expect(sponsor.contactPhone).toBe('0612345678');
    });
  });

  // =========================================================================
  // LIST / GET
  // =========================================================================

  describe('listSponsors', () => {
    it('should return empty array when no sponsors', async () => {
      const sponsors = await sponsorService.listSponsors();
      expect(sponsors).toEqual([]);
    });

    it('should return local sponsors with source and inLoop', async () => {
      await sponsorService.createSponsor({ name: 'Sponsor A' });
      const sponsors = await sponsorService.listSponsors();

      expect(sponsors.length).toBeGreaterThanOrEqual(1);
      const local = sponsors.find(s => s.source === 'local');
      expect(local).toBeDefined();
      expect(local.name).toBe('Sponsor A');
      expect(local.inLoop).toBe(false);
    });

    it('should return NEOPRO sponsors as read-only', async () => {
      configService = createMockConfigService({
        ...BASE_CONFIG,
        sponsors: [
          { path: 'neopro_ad.mp4', locked: true, owner: 'neopro', site_sponsor_id: 'uuid-1' },
        ],
      });
      sponsorService = new SponsorService({ configService });

      const sponsors = await sponsorService.listSponsors();
      const neopro = sponsors.find(s => s.source === 'neopro');
      expect(neopro).toBeDefined();
      expect(neopro.inLoop).toBe(true);
    });
  });

  describe('getSponsor', () => {
    it('should return a sponsor by localId', async () => {
      const created = await sponsorService.createSponsor({ name: 'Test' });
      const fetched = await sponsorService.getSponsor(created.localId);
      expect(fetched.name).toBe('Test');
    });

    it('should throw NotFoundError for invalid localId', async () => {
      await expect(sponsorService.getSponsor('nonexistent'))
        .rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // UPDATE
  // =========================================================================

  describe('updateSponsor', () => {
    it('should update sponsor fields', async () => {
      const created = await sponsorService.createSponsor({ name: 'Original' });
      const updated = await sponsorService.updateSponsor(created.localId, {
        name: 'Updated',
        contactEmail: 'new@test.fr',
      });

      expect(updated.name).toBe('Updated');
      expect(updated.contactEmail).toBe('new@test.fr');
    });

    it('should throw NotFoundError for nonexistent sponsor', async () => {
      await expect(sponsorService.updateSponsor('nope', { name: 'X' }))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw DuplicateError when renaming to existing name', async () => {
      await sponsorService.createSponsor({ name: 'A' });
      const b = await sponsorService.createSponsor({ name: 'B' });
      await expect(sponsorService.updateSponsor(b.localId, { name: 'A' }))
        .rejects.toThrow(DuplicateError);
    });
  });

  // =========================================================================
  // DELETE
  // =========================================================================

  describe('deleteSponsor', () => {
    it('should remove sponsor from localSponsors', async () => {
      const created = await sponsorService.createSponsor({ name: 'ToDelete' });
      await sponsorService.deleteSponsor(created.localId);

      await expect(sponsorService.getSponsor(created.localId))
        .rejects.toThrow(NotFoundError);
    });

    it('should remove loop entries when deleting', async () => {
      const created = await sponsorService.createSponsor({ name: 'WithLoop' });
      await sponsorService.linkVideo(created.localId, 'video.mp4');
      await sponsorService.addToLoop(created.localId);

      // Verify in loop
      let sponsor = await sponsorService.getSponsor(created.localId);
      expect(sponsor.inLoop).toBe(true);

      // Delete
      await sponsorService.deleteSponsor(created.localId);

      // Verify loop entry removed
      const config = configService._getConfig();
      const loopEntries = (config.sponsors || []).filter(s => s._sponsorLocalId === created.localId);
      expect(loopEntries.length).toBe(0);
    });

    it('should throw NotFoundError for nonexistent sponsor', async () => {
      await expect(sponsorService.deleteSponsor('nope'))
        .rejects.toThrow(NotFoundError);
    });
  });

  // =========================================================================
  // VIDEO LINKING
  // =========================================================================

  describe('linkVideo / unlinkVideo', () => {
    it('should add and remove video filenames', async () => {
      const created = await sponsorService.createSponsor({ name: 'S' });

      const linked = await sponsorService.linkVideo(created.localId, 'spot.mp4');
      expect(linked.videoFilenames).toContain('spot.mp4');

      const unlinked = await sponsorService.unlinkVideo(created.localId, 'spot.mp4');
      expect(unlinked.videoFilenames).not.toContain('spot.mp4');
    });

    it('should not duplicate video filenames', async () => {
      const created = await sponsorService.createSponsor({ name: 'S' });
      await sponsorService.linkVideo(created.localId, 'spot.mp4');
      await sponsorService.linkVideo(created.localId, 'spot.mp4');

      const sponsor = await sponsorService.getSponsor(created.localId);
      const count = sponsor.videoFilenames.filter(f => f === 'spot.mp4').length;
      expect(count).toBe(1);
    });

    it('should throw ValidationError for empty filename', async () => {
      const created = await sponsorService.createSponsor({ name: 'S' });
      await expect(sponsorService.linkVideo(created.localId, ''))
        .rejects.toThrow(ValidationError);
    });
  });

  // =========================================================================
  // LOOP MANAGEMENT
  // =========================================================================

  describe('addToLoop / removeFromLoop', () => {
    it('should add video entries to sponsors[] array', async () => {
      const created = await sponsorService.createSponsor({ name: 'Loop' });
      await sponsorService.linkVideo(created.localId, 'loop1.mp4');
      await sponsorService.linkVideo(created.localId, 'loop2.mp4');

      const result = await sponsorService.addToLoop(created.localId);
      expect(result.inLoop).toBe(true);

      const config = configService._getConfig();
      const entries = config.sponsors.filter(s => s._sponsorLocalId === created.localId);
      expect(entries.length).toBe(2);
      expect(entries[0].owner).toBe('club');
      expect(entries[0].locked).toBe(false);
    });

    it('should remove video entries from sponsors[] array', async () => {
      const created = await sponsorService.createSponsor({ name: 'Loop' });
      await sponsorService.linkVideo(created.localId, 'loop1.mp4');
      await sponsorService.addToLoop(created.localId);

      const result = await sponsorService.removeFromLoop(created.localId);
      expect(result.inLoop).toBe(false);

      const config = configService._getConfig();
      const entries = config.sponsors.filter(s => s._sponsorLocalId === created.localId);
      expect(entries.length).toBe(0);
    });

    it('should include centralId as site_sponsor_id in loop entries', async () => {
      configService = createMockConfigService({
        ...BASE_CONFIG,
        localSponsors: [{
          localId: 'ls_test',
          centralId: 'central-uuid-123',
          name: 'Resolved',
          videoFilenames: ['ad.mp4'],
          isActive: true,
        }],
      });
      sponsorService = new SponsorService({ configService });

      await sponsorService.addToLoop('ls_test');

      const config = configService._getConfig();
      const entry = config.sponsors.find(s => s._sponsorLocalId === 'ls_test');
      expect(entry.site_sponsor_id).toBe('central-uuid-123');
    });

    it('should throw NotFoundError for nonexistent sponsor', async () => {
      await expect(sponsorService.addToLoop('nope'))
        .rejects.toThrow(NotFoundError);
    });
  });
});
