/**
 * Tests unitaires pour config-profiles.controller
 *
 * Teste les endpoints du controller de profils de configuration :
 * - getProfiles
 * - getProfile
 * - createProfile
 * - updateProfile
 * - deleteProfile
 * - deployProfile
 * - syncProfiles
 */

import { Response } from 'express';

// Mock dependencies BEFORE imports
jest.mock('../config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../services/socket.service', () => ({
  default: {
    triggerPendingConfigSync: jest.fn().mockResolvedValue(undefined),
    sendCommand: jest.fn().mockResolvedValue(undefined),
  },
  triggerPendingConfigSync: jest.fn().mockResolvedValue(undefined),
  sendCommand: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

jest.mock('../services/sponsor-auto-resolution.service', () => ({
  autoResolveSponsorIds: jest.fn().mockResolvedValue({ configuration: { sponsors: [] }, resolved: 0 }),
}));

jest.mock('../utils/config-secondary-variants', () => ({
  enrichConfigWithDisplayVariants: jest.fn().mockResolvedValue({ enrichedCount: 0 }),
}));

jest.mock('../utils/config-analytics-metadata', () => ({
  enrichConfigWithAnalyticsMetadata: jest.fn().mockResolvedValue({ enrichedCount: 0 }),
}));

import {
  getProfiles,
  getProfile,
  createProfile,
  updateProfile,
  updateProfileConfiguration,
  deleteProfile,
  deployProfile,
  syncProfiles,
} from './config-profiles.controller';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../types';
import socketService from '../services/socket.service';

// Helper to create mock response
const createMockResponse = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

// Helper to create authenticated request
const createAuthRequest = (overrides: Partial<AuthRequest> = {}): AuthRequest =>
  ({
    user: { id: 'user-123', email: 'admin@example.com', role: 'admin' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as AuthRequest);

describe('Config Profiles Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // getProfiles
  // --------------------------------------------------------------------------

  describe('getProfiles', () => {
    it('should return profiles for a site', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-1' } });
      const res = createMockResponse();

      (query as jest.Mock)
        // findSiteBasic
        .mockResolvedValueOnce({ rows: [{ id: 'site-1', site_name: 'Club Alpha' }] })
        // findBySite
        .mockResolvedValueOnce({
          rows: [
            { id: 'p1', name: 'Default', is_default: true },
            { id: 'p2', name: 'Tournoi', is_default: false },
          ],
        });

      await getProfiles(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          site_id: 'site-1',
          count: 2,
          profiles: expect.any(Array),
        })
      );
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({ params: { siteId: 'nonexistent' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getProfiles(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Site non trouve' });
    });
  });

  // --------------------------------------------------------------------------
  // getProfile
  // --------------------------------------------------------------------------

  describe('getProfile', () => {
    it('should return a single profile', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-1', profileId: 'p1' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'p1', site_id: 'site-1', name: 'Default', configuration: {} }],
      });

      await getProfile(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', name: 'Default' })
      );
    });

    it('should return 404 if profile not found', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-1', profileId: 'nonexistent' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Profil non trouve' });
    });
  });

  // --------------------------------------------------------------------------
  // createProfile
  // --------------------------------------------------------------------------

  describe('createProfile', () => {
    it('should create a profile with valid data', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1' },
        body: {
          name: 'Tournoi U15',
          display_name: 'Tournoi U15',
          city: 'Lyon',
          sport: 'Football',
          configuration: { sponsors: [] },
        },
      });
      const res = createMockResponse();

      (query as jest.Mock)
        // findSiteBasic
        .mockResolvedValueOnce({ rows: [{ id: 'site-1', site_name: 'Club Alpha' }] })
        // countBySite
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        // create
        .mockResolvedValueOnce({
          rows: [{ id: 'p-new', site_id: 'site-1', name: 'Tournoi U15', is_default: false }],
        });

      await createProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p-new', name: 'Tournoi U15' })
      );
    });

    it('should force is_default=true for first profile', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1' },
        body: { name: 'First', configuration: {} },
      });
      const res = createMockResponse();

      (query as jest.Mock)
        // findSiteBasic
        .mockResolvedValueOnce({ rows: [{ id: 'site-1' }] })
        // countBySite — 0 profiles
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        // create
        .mockResolvedValueOnce({ rows: [{ id: 'p1', is_default: true }] });

      await createProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      // Verify that the INSERT was called with isDefault=true
      const createCall = (query as jest.Mock).mock.calls[2];
      const params = createCall[1];
      // is_default param is at index 6
      expect(params[6]).toBe(true);
    });

    it('should return 400 on validation error', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1' },
        body: { configuration: {} }, // missing name
      });
      const res = createMockResponse();

      await createProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({
        params: { siteId: 'nonexistent' },
        body: { name: 'Test', configuration: {} },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await createProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should unset old default when creating a new default profile', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1' },
        body: { name: 'New Default', is_default: true, configuration: {} },
      });
      const res = createMockResponse();

      (query as jest.Mock)
        // findSiteBasic
        .mockResolvedValueOnce({ rows: [{ id: 'site-1' }] })
        // countBySite — 1 existing profile
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        // findDefaultForSite
        .mockResolvedValueOnce({ rows: [{ id: 'p-old', is_default: true }] })
        // update old default (findById then UPDATE)
        .mockResolvedValueOnce({ rows: [{ id: 'p-old', is_default: false }] })
        // create new profile
        .mockResolvedValueOnce({ rows: [{ id: 'p-new', is_default: true }] });

      await createProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  // --------------------------------------------------------------------------
  // updateProfile
  // --------------------------------------------------------------------------

  describe('updateProfile', () => {
    it('should update a profile with valid data', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'p1' },
        body: { name: 'Renamed' },
      });
      const res = createMockResponse();

      (query as jest.Mock)
        // findById (existing check)
        .mockResolvedValueOnce({ rows: [{ id: 'p1', site_id: 'site-1', is_default: false }] })
        // update
        .mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'Renamed' }] });

      await updateProfile(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', name: 'Renamed' })
      );
    });

    it('should return 404 if profile not found', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'nonexistent' },
        body: { name: 'X' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 404 if profile belongs to different site', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'p1' },
        body: { name: 'X' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'p1', site_id: 'site-other' }],
      });

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 on empty body', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'p1' },
        body: {},
      });
      const res = createMockResponse();

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // --------------------------------------------------------------------------
  // updateProfileConfiguration
  // --------------------------------------------------------------------------

  describe('updateProfileConfiguration', () => {
    it('should update only the configuration of a profile', async () => {
      const newConfig = { sponsors: [{ id: 's1' }], categories: [] };
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'p1' },
        body: { configuration: newConfig },
      });
      const res = createMockResponse();

      (query as jest.Mock)
        // findById
        .mockResolvedValueOnce({
          rows: [{ id: 'p1', site_id: 'site-1', name: 'Default', configuration: { sponsors: [] } }],
        })
        // update
        .mockResolvedValueOnce({
          rows: [{ id: 'p1', site_id: 'site-1', name: 'Default', configuration: newConfig }],
        })
        // siteRepository.findById (for SaaS notification check)
        .mockResolvedValueOnce({ rows: [{ id: 'site-1', site_type: 'pi' }] });

      await updateProfileConfiguration(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', configuration: newConfig })
      );
    });

    it('should return 404 if profile not found', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'nonexistent' },
        body: { configuration: { sponsors: [] } },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await updateProfileConfiguration(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 if configuration missing', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'p1' },
        body: {},
      });
      const res = createMockResponse();

      await updateProfileConfiguration(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // --------------------------------------------------------------------------
  // deleteProfile
  // --------------------------------------------------------------------------

  describe('deleteProfile', () => {
    it('should delete a non-default profile', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'p2' },
      });
      const res = createMockResponse();

      (query as jest.Mock)
        // findById
        .mockResolvedValueOnce({ rows: [{ id: 'p2', site_id: 'site-1', name: 'Tournoi', is_default: false }] })
        // countBySite
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        // deleteById
        .mockResolvedValueOnce({ rowCount: 1 });

      await deleteProfile(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Profil supprime' });
    });

    it('should refuse to delete the last profile', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'p1' },
      });
      const res = createMockResponse();

      (query as jest.Mock)
        // findById
        .mockResolvedValueOnce({ rows: [{ id: 'p1', site_id: 'site-1', is_default: true }] })
        // countBySite
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      await deleteProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('dernier profil') })
      );
    });

    it('should promote next profile to default when deleting the default', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'p1' },
      });
      const res = createMockResponse();

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
        release: jest.fn(),
      };
      (getClient as jest.Mock).mockResolvedValue(mockClient);

      (query as jest.Mock)
        // findById
        .mockResolvedValueOnce({ rows: [{ id: 'p1', site_id: 'site-1', name: 'Default', is_default: true }] })
        // countBySite
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        // deleteById
        .mockResolvedValueOnce({ rowCount: 1 })
        // findBySite (remaining profiles)
        .mockResolvedValueOnce({ rows: [{ id: 'p2', name: 'Tournoi', is_default: false }] });

      await deleteProfile(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Profil supprime' });
      // setDefault was called via transaction
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE config_profiles SET is_default = true WHERE id = $1 AND site_id = $2',
        ['p2', 'site-1']
      );
    });

    it('should return 404 if profile not found', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'nonexistent' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await deleteProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // --------------------------------------------------------------------------
  // deployProfile
  // --------------------------------------------------------------------------

  describe('deployProfile', () => {
    it('should deploy a profile and trigger sync', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'p1' },
      });
      const res = createMockResponse();

      (query as jest.Mock)
        // findById (profile)
        .mockResolvedValueOnce({
          rows: [{ id: 'p1', site_id: 'site-1', name: 'Default', configuration: { sponsors: [] } }],
        })
        // findLastVersion
        .mockResolvedValueOnce({ rows: [{ id: 'v-old' }] })
        // insertVersion
        .mockResolvedValueOnce({ rows: [{ id: 'mock-uuid' }] })
        // updateSitePendingConfigVersion
        .mockResolvedValueOnce({ rowCount: 1 })
        // findBySite (for auto-sync when > 1 profile)
        .mockResolvedValueOnce({
          rows: [
            { id: 'p1', site_id: 'site-1', name: 'Default', display_name: null, city: null, sport: null, is_default: true, configuration: { sponsors: [] } },
            { id: 'p2', site_id: 'site-1', name: 'Match', display_name: null, city: null, sport: null, is_default: false, configuration: { sponsors: [] } },
          ],
        });

      await deployProfile(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          version_id: 'mock-uuid',
          profile_id: 'p1',
          profile_name: 'Default',
        })
      );
      expect(socketService.triggerPendingConfigSync).toHaveBeenCalledWith('site-1');
      // Verify sync_profiles command was also sent (auto-sync)
      expect(socketService.sendCommand).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({ type: 'sync_profiles' })
      );
    });

    it('should return 404 if profile not found', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'nonexistent' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await deployProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 404 if profile belongs to different site', async () => {
      const req = createAuthRequest({
        params: { siteId: 'site-1', profileId: 'p1' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'p1', site_id: 'site-other' }],
      });

      await deployProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // --------------------------------------------------------------------------
  // syncProfiles
  // --------------------------------------------------------------------------

  describe('syncProfiles', () => {
    it('should sync all profiles to the Pi', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-1' } });
      const res = createMockResponse();

      (query as jest.Mock)
        // findSiteBasic
        .mockResolvedValueOnce({ rows: [{ id: 'site-1', site_name: 'Club Alpha' }] })
        // findBySite
        .mockResolvedValueOnce({
          rows: [
            { id: 'p1', name: 'Default', display_name: 'Club Alpha', city: 'Paris', sport: 'Football', is_default: true, configuration: { sponsors: [] } },
            { id: 'p2', name: 'Tournoi', display_name: 'Tournoi U18', city: 'Lyon', sport: 'Football', is_default: false, configuration: { sponsors: [{ id: 's1' }] } },
          ],
        });

      await syncProfiles(req, res);

      expect(socketService.sendCommand).toHaveBeenCalledWith(
        'site-1',
        expect.objectContaining({
          type: 'sync_profiles',
          data: expect.objectContaining({
            profiles: expect.arrayContaining([
              expect.objectContaining({ id: 'p1', name: 'Default' }),
              expect.objectContaining({ id: 'p2', name: 'Tournoi' }),
            ]),
          }),
        })
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          profile_count: 2,
        })
      );
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({ params: { siteId: 'nonexistent' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await syncProfiles(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 if no profiles to sync', async () => {
      const req = createAuthRequest({ params: { siteId: 'site-1' } });
      const res = createMockResponse();

      (query as jest.Mock)
        // findSiteBasic
        .mockResolvedValueOnce({ rows: [{ id: 'site-1' }] })
        // findBySite — empty
        .mockResolvedValueOnce({ rows: [] });

      await syncProfiles(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Aucun profil') })
      );
    });
  });
});
