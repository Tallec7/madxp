import { Response } from 'express';
import {
  getSites,
  getSite,
  createSite,
  updateSite,
  deleteSite,
  regenerateApiKey,
  getSiteStats,
  getSiteMetrics,
  sendCommand,
  getCommandStatus,
} from './sites.controller';
import { query } from '../config/database';
import { AuthRequest } from '../types';

// Mock socket service
jest.mock('../services/socket.service', () => ({
  default: {
    isConnected: jest.fn(),
    sendCommand: jest.fn(),
  },
}));

const mockSocketService = require('../services/socket.service').default;

// Helper to create mock response
const createMockResponse = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

// Helper to create authenticated request
const createAuthRequest = (overrides: Partial<AuthRequest> = {}): AuthRequest => ({
  user: { id: 'user-123', email: 'admin@example.com', role: 'admin' },
  params: {},
  query: {},
  body: {},
  ...overrides,
} as AuthRequest);

describe('Sites Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketService.isConnected.mockReset();
    mockSocketService.sendCommand.mockReset();
  });

  describe('getSites', () => {
    it('should return all sites without filters', async () => {
      const req = createAuthRequest({ query: {} });
      const res = createMockResponse();

      const mockSites = [
        { id: '1', site_name: 'Site A', status: 'online' },
        { id: '2', site_name: 'Site B', status: 'offline' },
      ];

      // getSites makes 2 parallel queries: data + count
      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockSites })  // data query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] });  // count query

      await getSites(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: mockSites,
        pagination: expect.objectContaining({ total: 2 }),
      }));
    });

    it('should filter sites by status', async () => {
      const req = createAuthRequest({ query: { status: 'online' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: '1', status: 'online' }] });

      await getSites(req, res);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('AND status = $1'),
        ['online']
      );
    });

    it('should filter sites by search term', async () => {
      const req = createAuthRequest({ query: { search: 'test' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getSites(req, res);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        ['%test%']
      );
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ query: {} });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await getSites(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Erreur lors de la récupération des sites',
      });
    });
  });

  describe('getSite', () => {
    it('should return site by id', async () => {
      const req = createAuthRequest({ params: { id: 'site-123' } });
      const res = createMockResponse();

      const mockSite = { id: 'site-123', site_name: 'Test Site' };
      (query as jest.Mock).mockResolvedValueOnce({ rows: [mockSite] });

      await getSite(req, res);

      expect(query).toHaveBeenCalledWith('SELECT * FROM sites WHERE id = $1', ['site-123']);
      expect(res.json).toHaveBeenCalledWith(mockSite);
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({ params: { id: 'nonexistent' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getSite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Site non trouvé' });
    });
  });

  describe('createSite', () => {
    it('should create a new site with generated API key', async () => {
      const req = createAuthRequest({
        body: {
          site_name: 'New Site',
          club_name: 'Test Club',
          location: { city: 'Paris' },
          sports: ['volleyball'],
        },
      });
      const res = createMockResponse();

      // Mock for checking existing sites
      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] })
        // Mock for INSERT
        .mockResolvedValueOnce({
          rows: [{
            id: 'new-site-id',
            site_name: 'New Site',
            club_name: 'Test Club',
            status: 'offline',
          }],
        });

      await createSite(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          site_name: 'New Site',
          api_key: expect.any(String),
        })
      );
    });

    it('should generate unique name if duplicate exists', async () => {
      const req = createAuthRequest({
        body: {
          site_name: 'Existing Site',
          club_name: 'Test Club',
        },
      });
      const res = createMockResponse();

      // Mock for checking existing sites - site exists
      (query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{ site_name: 'Existing Site' }],
        })
        // Mock for INSERT
        .mockResolvedValueOnce({
          rows: [{
            id: 'new-site-id',
            site_name: 'Existing Site-1',
            club_name: 'Test Club',
          }],
        });

      await createSite(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      // The site name should have a suffix
      expect(query).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.stringMatching(/Existing Site-\d+/)])
      );
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        body: { site_name: 'Test', club_name: 'Club' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await createSite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateSite', () => {
    it('should update site fields', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: { site_name: 'Updated Name', status: 'maintenance' },
      });
      const res = createMockResponse();

      const updatedSite = {
        id: 'site-123',
        site_name: 'Updated Name',
        status: 'maintenance',
      };
      (query as jest.Mock).mockResolvedValueOnce({ rows: [updatedSite] });

      await updateSite(req, res);

      expect(res.json).toHaveBeenCalledWith(updatedSite);
    });

    it('should return 400 if no data to update', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: {},
      });
      const res = createMockResponse();

      await updateSite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Aucune donnée à mettre à jour' });
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({
        params: { id: 'nonexistent' },
        body: { site_name: 'New Name' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await updateSite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Site non trouvé' });
    });
  });

  describe('deleteSite', () => {
    it('should delete site and return success', async () => {
      const req = createAuthRequest({ params: { id: 'site-123' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [{ site_name: 'Deleted Site' }],
      });

      await deleteSite(req, res);

      expect(query).toHaveBeenCalledWith(
        'DELETE FROM sites WHERE id = $1 RETURNING site_name',
        ['site-123']
      );
      expect(res.json).toHaveBeenCalledWith({ message: 'Site supprimé avec succès' });
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({ params: { id: 'nonexistent' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await deleteSite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Site non trouvé' });
    });
  });

  describe('regenerateApiKey', () => {
    it('should generate new API key', async () => {
      const req = createAuthRequest({ params: { id: 'site-123' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'site-123',
          site_name: 'Test Site',
          updated_at: new Date(),
        }],
      });

      await regenerateApiKey(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'site-123',
          api_key: expect.any(String),
        })
      );
      // Verify API key is 64 chars (32 bytes hex)
      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.api_key).toHaveLength(64);
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({ params: { id: 'nonexistent' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await regenerateApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Site non trouvé' });
    });
  });

  describe('getSiteStats', () => {
    it('should return site statistics', async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      const stats = {
        total_sites: '10',
        online: '7',
        offline: '2',
        maintenance: '1',
        error: '0',
      };
      (query as jest.Mock).mockResolvedValueOnce({ rows: [stats] });

      await getSiteStats(req, res);

      expect(res.json).toHaveBeenCalledWith(stats);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await getSiteStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getSites - additional filters', () => {
    it('should filter sites by sport', async () => {
      const req = createAuthRequest({ query: { sport: 'volleyball' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getSites(req, res);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('sports @>'),
        [JSON.stringify(['volleyball'])]
      );
    });

    it('should filter sites by region', async () => {
      const req = createAuthRequest({ query: { region: 'Ile-de-France' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getSites(req, res);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("location->>'region'"),
        ['Ile-de-France']
      );
    });

    it('should combine multiple filters', async () => {
      const req = createAuthRequest({
        query: { status: 'online', sport: 'basketball', search: 'club' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getSites(req, res);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('AND status'),
        expect.arrayContaining(['online', JSON.stringify(['basketball']), '%club%'])
      );
    });
  });

  describe('getSite - error handling', () => {
    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: 'site-123' } });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await getSite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createSite - suffix handling', () => {
    it('should increment suffix when multiple duplicates exist', async () => {
      const req = createAuthRequest({
        body: { site_name: 'Site', club_name: 'Club' },
      });
      const res = createMockResponse();

      (query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            { site_name: 'Site' },
            { site_name: 'Site-1' },
            { site_name: 'Site-2' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'new-id', site_name: 'Site-3' }],
        });

      await createSite(req, res);

      expect(query).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.arrayContaining(['Site-3'])
      );
    });
  });

  describe('updateSite - additional fields', () => {
    it('should update location and sports', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: {
          club_name: 'New Club',
          location: { city: 'Lyon', region: 'Auvergne' },
          sports: ['handball', 'basketball'],
        },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'site-123', club_name: 'New Club' }],
      });

      await updateSite(req, res);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('club_name'),
        expect.arrayContaining([
          'New Club',
          JSON.stringify({ city: 'Lyon', region: 'Auvergne' }),
          JSON.stringify(['handball', 'basketball']),
        ])
      );
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: { site_name: 'New Name' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await updateSite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('deleteSite - error handling', () => {
    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: 'site-123' } });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await deleteSite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('regenerateApiKey - error handling', () => {
    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: 'site-123' } });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await regenerateApiKey(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getSiteMetrics', () => {
    it('should return metrics for a site', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        query: { hours: '12' },
      });
      const res = createMockResponse();

      const mockMetrics = [
        { cpu_usage: 45, memory_usage: 60, recorded_at: new Date() },
      ];
      (query as jest.Mock).mockResolvedValueOnce({ rows: mockMetrics });

      await getSiteMetrics(req, res);

      expect(res.json).toHaveBeenCalledWith({
        site_id: 'site-123',
        period_hours: '12',
        metrics: mockMetrics,
      });
    });

    it('should use default 24 hours if not specified', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        query: {},
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getSiteMetrics(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ period_hours: 24 })
      );
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: 'site-123' } });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await getSiteMetrics(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('sendCommand', () => {
    it('should return 400 if command is missing', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: {},
      });
      const res = createMockResponse();

      await sendCommand(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Commande requise' });
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({
        params: { id: 'nonexistent' },
        body: { command: 'restart' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await sendCommand(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123' },
        body: { command: 'restart' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await sendCommand(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getCommandStatus', () => {
    it('should return 404 if command not found', async () => {
      const req = createAuthRequest({
        params: { id: 'site-123', commandId: 'nonexistent' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getCommandStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Commande non trouvée' });
    });
  });
});
