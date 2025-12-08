import { Response } from 'express';
import {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addSitesToGroup,
  removeSiteFromGroup,
  getGroupSites,
} from './groups.controller';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../types';

// Get the mock client from the mocked module
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

// Override getClient to return our mockClient
(getClient as jest.Mock).mockResolvedValue(mockClient);

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

describe('Groups Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mockClient and ensure getClient returns it
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    (getClient as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('getGroups', () => {
    it('should return all groups with site counts', async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      const mockGroups = [
        { id: '1', name: 'Group A', site_count: '5' },
        { id: '2', name: 'Group B', site_count: '3' },
      ];

      (query as jest.Mock).mockResolvedValueOnce({ rows: mockGroups });

      await getGroups(req, res);

      expect(res.json).toHaveBeenCalledWith({
        total: 2,
        groups: mockGroups,
      });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await getGroups(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Erreur lors de la récupération des groupes',
      });
    });
  });

  describe('getGroup', () => {
    it('should return group with sites', async () => {
      const req = createAuthRequest({ params: { id: 'group-123' } });
      const res = createMockResponse();

      const mockGroup = { id: 'group-123', name: 'Test Group', type: 'sport' };
      const mockSites = [
        { id: 'site-1', site_name: 'Site A' },
        { id: 'site-2', site_name: 'Site B' },
      ];

      (query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockGroup] })
        .mockResolvedValueOnce({ rows: mockSites });

      await getGroup(req, res);

      expect(res.json).toHaveBeenCalledWith({
        ...mockGroup,
        sites: mockSites,
      });
    });

    it('should return 404 if group not found', async () => {
      const req = createAuthRequest({ params: { id: 'nonexistent' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Groupe non trouvé' });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: 'group-123' } });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await getGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createGroup', () => {
    it('should create a new group', async () => {
      const req = createAuthRequest({
        body: {
          name: 'New Group',
          description: 'Test description',
          type: 'sport',
          filters: { sport: 'volleyball' },
        },
      });
      const res = createMockResponse();

      const mockGroup = {
        id: 'new-group-id',
        name: 'New Group',
        description: 'Test description',
        type: 'sport',
      };

      (query as jest.Mock).mockResolvedValueOnce({ rows: [mockGroup] });

      await createGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockGroup);
    });

    it('should create group without optional fields', async () => {
      const req = createAuthRequest({
        body: {
          name: 'Minimal Group',
          type: 'custom',
        },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'id', name: 'Minimal Group', type: 'custom' }],
      });

      await createGroup(req, res);

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.any(String), 'Minimal Group', null, 'custom', null])
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        body: { name: 'Test', type: 'custom' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await createGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateGroup', () => {
    it('should update group fields', async () => {
      const req = createAuthRequest({
        params: { id: 'group-123' },
        body: { name: 'Updated Name', type: 'geography' },
      });
      const res = createMockResponse();

      const updatedGroup = {
        id: 'group-123',
        name: 'Updated Name',
        type: 'geography',
      };
      (query as jest.Mock).mockResolvedValueOnce({ rows: [updatedGroup] });

      await updateGroup(req, res);

      expect(res.json).toHaveBeenCalledWith(updatedGroup);
    });

    it('should return 400 if no data to update', async () => {
      const req = createAuthRequest({
        params: { id: 'group-123' },
        body: {},
      });
      const res = createMockResponse();

      await updateGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Aucune donnée à mettre à jour' });
    });

    it('should return 404 if group not found', async () => {
      const req = createAuthRequest({
        params: { id: 'nonexistent' },
        body: { name: 'New Name' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await updateGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Groupe non trouvé' });
    });
  });

  describe('deleteGroup', () => {
    it('should delete group and return success', async () => {
      const req = createAuthRequest({ params: { id: 'group-123' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({
        rows: [{ name: 'Deleted Group' }],
      });

      await deleteGroup(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: 'Groupe supprimé avec succès' });
    });

    it('should return 404 if group not found', async () => {
      const req = createAuthRequest({ params: { id: 'nonexistent' } });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await deleteGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Groupe non trouvé' });
    });
  });

  describe('addSitesToGroup', () => {
    it('should add sites to group', async () => {
      const req = createAuthRequest({
        params: { id: 'group-123' },
        body: { site_ids: ['site-1', 'site-2'] },
      });
      const res = createMockResponse();

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'group-123' }] }) // Group check
        .mockResolvedValueOnce({ rows: [{ id: 'site-1' }] }) // Site 1 check
        .mockResolvedValueOnce({}) // Insert site 1
        .mockResolvedValueOnce({ rows: [{ id: 'site-2' }] }) // Site 2 check
        .mockResolvedValueOnce({}) // Insert site 2
        .mockResolvedValueOnce({}); // COMMIT

      await addSitesToGroup(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: '2 site(s) ajouté(s) au groupe avec succès',
        added_count: 2,
      });
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return 404 if group not found', async () => {
      const req = createAuthRequest({
        params: { id: 'nonexistent' },
        body: { site_ids: ['site-1'] },
      });
      const res = createMockResponse();

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // Group check - not found

      await addSitesToGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Groupe non trouvé' });
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({
        params: { id: 'group-123' },
        body: { site_ids: ['nonexistent-site'] },
      });
      const res = createMockResponse();

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'group-123' }] }) // Group check
        .mockResolvedValueOnce({ rows: [] }); // Site check - not found

      await addSitesToGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Site nonexistent-site non trouvé' });
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle database error and release client', async () => {
      const req = createAuthRequest({
        params: { id: 'group-123' },
        body: { site_ids: ['site-1'] },
      });
      const res = createMockResponse();

      mockClient.query.mockRejectedValueOnce(new Error('DB Error'));

      await addSitesToGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('removeSiteFromGroup', () => {
    it('should remove site from group', async () => {
      const req = createAuthRequest({
        params: { id: 'group-123', siteId: 'site-456' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [{}] });

      await removeSiteFromGroup(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: 'Site retiré du groupe avec succès' });
    });

    it('should return 404 if association not found', async () => {
      const req = createAuthRequest({
        params: { id: 'group-123', siteId: 'site-456' },
      });
      const res = createMockResponse();

      (query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await removeSiteFromGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Association non trouvée' });
    });
  });

  describe('getGroupSites', () => {
    it('should return sites for a group', async () => {
      const req = createAuthRequest({ params: { id: 'group-123' } });
      const res = createMockResponse();

      const mockSites = [
        { id: 'site-1', site_name: 'Site A' },
        { id: 'site-2', site_name: 'Site B' },
      ];

      (query as jest.Mock).mockResolvedValueOnce({ rows: mockSites });

      await getGroupSites(req, res);

      expect(res.json).toHaveBeenCalledWith({
        group_id: 'group-123',
        total: 2,
        sites: mockSites,
      });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: 'group-123' } });
      const res = createMockResponse();

      (query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

      await getGroupSites(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
