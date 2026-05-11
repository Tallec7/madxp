/**
 * Tests for ProfileService — switch profil offline
 */

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      readFile: jest.fn(),
      writeFile: jest.fn().mockResolvedValue(undefined),
      rename: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const fs = require('fs').promises;
const path = require('path');
const { NEOPRO_DIR } = require('../helpers');

const ProfileService = require('../services/profile.service');

// Chemins attendus
const PROFILES_DIR = path.join(NEOPRO_DIR, 'webapp', 'profiles');
const CLUBS_JSON_PATH = path.join(PROFILES_DIR, 'clubs.json');
const ACTIVE_PROFILE_PATH = path.join(PROFILES_DIR, 'active-profile');
const CONFIG_PATH = path.join(NEOPRO_DIR, 'webapp', 'configuration.json');

const SAMPLE_CLUBS = [
  { id: 'club-football', name: 'Football Club', city: 'Paris', sport: 'Football' },
  { id: 'club-basket', name: 'Basket Club', city: 'Lyon', sport: 'Basket' },
];

const SAMPLE_CONFIG = {
  settings: { language: 'fr', timezone: 'Europe/Paris' },
  siteId: 'site-abc',
  apiKey: 'key-secret',
  auth: { password: 'hashpass' },
  categories: [{ id: 'old-cat' }],
  sponsors: [],
};

const SAMPLE_PROFILE = {
  categories: [{ id: 'football-cat' }],
  sponsors: [{ id: 'sponsor-1' }],
  timeCategories: [],
};

function mockReadFile(overrides = {}) {
  fs.readFile.mockImplementation(async (filePath, _encoding) => {
    if (filePath === CLUBS_JSON_PATH) {
      if (overrides.clubs === null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return JSON.stringify(overrides.clubs ?? SAMPLE_CLUBS);
    }
    if (filePath === ACTIVE_PROFILE_PATH) {
      if (overrides.activeProfile === null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return overrides.activeProfile ?? 'club-football';
    }
    if (filePath === path.join(PROFILES_DIR, 'club-football.json')) {
      return JSON.stringify(overrides.profileContent ?? SAMPLE_PROFILE);
    }
    if (filePath === CONFIG_PATH) {
      if (overrides.config === null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return JSON.stringify(overrides.config ?? SAMPLE_CONFIG);
    }
    throw Object.assign(new Error('ENOENT: ' + filePath), { code: 'ENOENT' });
  });
}

describe('ProfileService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProfileService();
  });

  // ---------------------------------------------------------------------------
  // getProfiles
  // ---------------------------------------------------------------------------

  describe('getProfiles()', () => {
    it('retourne la liste des profils avec isActive', async () => {
      mockReadFile({ activeProfile: 'club-football' });
      const profiles = await service.getProfiles();
      expect(profiles).toHaveLength(2);
      expect(profiles[0]).toMatchObject({ id: 'club-football', name: 'Football Club', isActive: true });
      expect(profiles[1]).toMatchObject({ id: 'club-basket', isActive: false });
    });

    it('retourne [] si clubs.json absent', async () => {
      mockReadFile({ clubs: null });
      const profiles = await service.getProfiles();
      expect(profiles).toEqual([]);
    });

    it('marque isActive false si aucun profil actif', async () => {
      mockReadFile({ activeProfile: null });
      const profiles = await service.getProfiles();
      expect(profiles.every((p) => !p.isActive)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getActiveProfile
  // ---------------------------------------------------------------------------

  describe('getActiveProfile()', () => {
    it('retourne les métadonnées du profil actif', async () => {
      mockReadFile({ activeProfile: 'club-football' });
      const profile = await service.getActiveProfile();
      expect(profile).toMatchObject({ id: 'club-football', name: 'Football Club', city: 'Paris', sport: 'Football' });
    });

    it('retourne null si aucun profil actif', async () => {
      mockReadFile({ activeProfile: null, clubs: null });
      const profile = await service.getActiveProfile();
      expect(profile).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // hasProfiles
  // ---------------------------------------------------------------------------

  describe('hasProfiles()', () => {
    it('retourne true si >1 profil', async () => {
      mockReadFile({});
      expect(await service.hasProfiles()).toBe(true);
    });

    it('retourne false si 0 profil (legacy Pi)', async () => {
      mockReadFile({ clubs: null });
      expect(await service.hasProfiles()).toBe(false);
    });

    it('retourne false si exactement 1 profil', async () => {
      mockReadFile({ clubs: [SAMPLE_CLUBS[0]] });
      expect(await service.hasProfiles()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // switchProfile
  // ---------------------------------------------------------------------------

  describe('switchProfile()', () => {
    it('écrit active-profile et configuration.json', async () => {
      mockReadFile({ activeProfile: 'club-football' });

      const result = await service.switchProfile('club-football');

      expect(result).toEqual({ success: true, activeProfileId: 'club-football' });
      // Écriture atomique : writeFile vers .tmp puis rename
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('configuration.json.tmp'),
        expect.any(String),
        'utf8'
      );
      expect(fs.rename).toHaveBeenCalledWith(
        expect.stringContaining('configuration.json.tmp'),
        CONFIG_PATH
      );
      expect(fs.writeFile).toHaveBeenCalledWith(ACTIVE_PROFILE_PATH, 'club-football', 'utf8');
    });

    it('préserve les LOCAL_ONLY_KEYS depuis configuration.json', async () => {
      mockReadFile({ activeProfile: 'club-football' });

      await service.switchProfile('club-football');

      const tmpWriteCall = fs.writeFile.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('configuration.json.tmp')
      );
      const written = JSON.parse(tmpWriteCall[1]);

      // LOCAL_ONLY_KEYS préservés depuis SAMPLE_CONFIG
      expect(written.settings).toEqual(SAMPLE_CONFIG.settings);
      expect(written.siteId).toBe(SAMPLE_CONFIG.siteId);
      expect(written.apiKey).toBe(SAMPLE_CONFIG.apiKey);
      expect(written.auth).toEqual(SAMPLE_CONFIG.auth);

      // Contenu profil appliqué
      expect(written.categories).toEqual(SAMPLE_PROFILE.categories);
      expect(written.sponsors).toEqual(SAMPLE_PROFILE.sponsors);
    });

    it('throw NOT_FOUND si le profil n\'existe pas', async () => {
      fs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      await expect(service.switchProfile('unknown-id')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throw INVALID_ID si profileId contient ..', async () => {
      await expect(service.switchProfile('../etc/passwd')).rejects.toMatchObject({ code: 'INVALID_ID' });
    });

    it('throw INVALID_ID si profileId contient /', async () => {
      await expect(service.switchProfile('foo/bar')).rejects.toMatchObject({ code: 'INVALID_ID' });
    });

    it('throw INVALID_ID si profileId est vide', async () => {
      await expect(service.switchProfile('')).rejects.toMatchObject({ code: 'INVALID_ID' });
    });

    it('fonctionne si configuration.json est absent (Pi vierge)', async () => {
      mockReadFile({ config: null, activeProfile: 'club-football' });

      const result = await service.switchProfile('club-football');
      expect(result.success).toBe(true);

      const tmpWriteCall = fs.writeFile.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('configuration.json.tmp')
      );
      const written = JSON.parse(tmpWriteCall[1]);
      // Pas de LOCAL_ONLY_KEYS à préserver, le profil est appliqué tel quel
      expect(written.categories).toEqual(SAMPLE_PROFILE.categories);
    });
  });
});
