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
import { groupRepository } from '../repositories';
import { AuthRequest } from '../types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock logger (Winston) — avoid console output during tests
jest.mock('../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock uuid — predictable ID generation
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('new-group-id'),
}));

// Mock repositories
jest.mock('../repositories', () => ({
  groupRepository: {
    findAllWithSiteCount: jest.fn(),
    findGroupById: jest.fn(),
    findGroupSites: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteGroup: jest.fn(),
    addSites: jest.fn(),
    removeSite: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Typed mock references
// ---------------------------------------------------------------------------

const mockGroupRepository = groupRepository as jest.Mocked<typeof groupRepository>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMockResponse = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

const createAuthRequest = (overrides: Partial<AuthRequest> = {}): AuthRequest =>
  ({
    user: { id: 'user-123', email: 'admin@example.com', role: 'admin' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as AuthRequest);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Groups Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getGroups', () => {
    it('should return all groups with site counts', async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      const mockGroups = [
        { id: '1', name: 'Group A', site_count: 5 },
        { id: '2', name: 'Group B', site_count: 3 },
      ];

      mockGroupRepository.findAllWithSiteCount.mockResolvedValueOnce(mockGroups as never);

      await getGroups(req, res);

      expect(mockGroupRepository.findAllWithSiteCount).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        total: 2,
        groups: mockGroups,
      });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      mockGroupRepository.findAllWithSiteCount.mockRejectedValueOnce(new Error('DB Error'));

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

      mockGroupRepository.findGroupById.mockResolvedValueOnce(mockGroup as never);
      mockGroupRepository.findGroupSites.mockResolvedValueOnce(mockSites as never);

      await getGroup(req, res);

      expect(mockGroupRepository.findGroupById).toHaveBeenCalledWith('group-123');
      expect(mockGroupRepository.findGroupSites).toHaveBeenCalledWith('group-123');
      expect(res.json).toHaveBeenCalledWith({
        ...mockGroup,
        sites: mockSites,
      });
    });

    it('should return 404 if group not found', async () => {
      const req = createAuthRequest({ params: { id: 'nonexistent' } });
      const res = createMockResponse();

      mockGroupRepository.findGroupById.mockResolvedValueOnce(null);

      await getGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Groupe non trouvé' });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: 'group-123' } });
      const res = createMockResponse();

      mockGroupRepository.findGroupById.mockRejectedValueOnce(new Error('DB Error'));

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

      mockGroupRepository.create.mockResolvedValueOnce(mockGroup as never);

      await createGroup(req, res);

      expect(mockGroupRepository.create).toHaveBeenCalledWith({
        id: 'new-group-id',
        name: 'New Group',
        description: 'Test description',
        type: 'sport',
        filters: JSON.stringify({ sport: 'volleyball' }),
      });
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

      const mockGroup = { id: 'new-group-id', name: 'Minimal Group', type: 'custom' };

      mockGroupRepository.create.mockResolvedValueOnce(mockGroup as never);

      await createGroup(req, res);

      expect(mockGroupRepository.create).toHaveBeenCalledWith({
        id: 'new-group-id',
        name: 'Minimal Group',
        description: null,
        type: 'custom',
        filters: null,
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({
        body: { name: 'Test', type: 'custom' },
      });
      const res = createMockResponse();

      mockGroupRepository.create.mockRejectedValueOnce(new Error('DB Error'));

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
      mockGroupRepository.update.mockResolvedValueOnce(updatedGroup as never);

      await updateGroup(req, res);

      expect(mockGroupRepository.update).toHaveBeenCalledWith('group-123', {
        name: 'Updated Name',
        description: undefined,
        type: 'geography',
        filters: undefined,
      });
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

      mockGroupRepository.update.mockResolvedValueOnce(null);

      await updateGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Groupe non trouvé' });
    });
  });

  describe('deleteGroup', () => {
    it('should delete group and return success', async () => {
      const req = createAuthRequest({ params: { id: 'group-123' } });
      const res = createMockResponse();

      mockGroupRepository.deleteGroup.mockResolvedValueOnce('Deleted Group');

      await deleteGroup(req, res);

      expect(mockGroupRepository.deleteGroup).toHaveBeenCalledWith('group-123');
      expect(res.json).toHaveBeenCalledWith({ message: 'Groupe supprimé avec succès' });
    });

    it('should return 404 if group not found', async () => {
      const req = createAuthRequest({ params: { id: 'nonexistent' } });
      const res = createMockResponse();

      mockGroupRepository.deleteGroup.mockResolvedValueOnce(null);

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

      mockGroupRepository.addSites.mockResolvedValueOnce(undefined);

      await addSitesToGroup(req, res);

      expect(mockGroupRepository.addSites).toHaveBeenCalledWith('group-123', ['site-1', 'site-2']);
      expect(res.json).toHaveBeenCalledWith({
        message: '2 site(s) ajouté(s) au groupe avec succès',
        added_count: 2,
      });
    });

    it('should return 404 if group not found', async () => {
      const req = createAuthRequest({
        params: { id: 'nonexistent' },
        body: { site_ids: ['site-1'] },
      });
      const res = createMockResponse();

      mockGroupRepository.addSites.mockRejectedValueOnce(
        new Error('Group nonexistent not found')
      );

      await addSitesToGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Group nonexistent not found' });
    });

    it('should return 404 if site not found', async () => {
      const req = createAuthRequest({
        params: { id: 'group-123' },
        body: { site_ids: ['nonexistent-site'] },
      });
      const res = createMockResponse();

      mockGroupRepository.addSites.mockRejectedValueOnce(
        new Error('Site nonexistent-site not found')
      );

      await addSitesToGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Site nonexistent-site not found' });
    });

    it('should handle database error', async () => {
      const req = createAuthRequest({
        params: { id: 'group-123' },
        body: { site_ids: ['site-1'] },
      });
      const res = createMockResponse();

      mockGroupRepository.addSites.mockRejectedValueOnce(new Error('DB Error'));

      await addSitesToGroup(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Erreur lors de l'ajout des sites au groupe",
      });
    });
  });

  describe('removeSiteFromGroup', () => {
    it('should remove site from group', async () => {
      const req = createAuthRequest({
        params: { id: 'group-123', siteId: 'site-456' },
      });
      const res = createMockResponse();

      mockGroupRepository.removeSite.mockResolvedValueOnce(true);

      await removeSiteFromGroup(req, res);

      expect(mockGroupRepository.removeSite).toHaveBeenCalledWith('group-123', 'site-456');
      expect(res.json).toHaveBeenCalledWith({ message: 'Site retiré du groupe avec succès' });
    });

    it('should return 404 if association not found', async () => {
      const req = createAuthRequest({
        params: { id: 'group-123', siteId: 'site-456' },
      });
      const res = createMockResponse();

      mockGroupRepository.removeSite.mockResolvedValueOnce(false);

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

      mockGroupRepository.findGroupSites.mockResolvedValueOnce(mockSites as never);

      await getGroupSites(req, res);

      expect(mockGroupRepository.findGroupSites).toHaveBeenCalledWith('group-123');
      expect(res.json).toHaveBeenCalledWith({
        group_id: 'group-123',
        total: 2,
        sites: mockSites,
      });
    });

    it('should return 500 on database error', async () => {
      const req = createAuthRequest({ params: { id: 'group-123' } });
      const res = createMockResponse();

      mockGroupRepository.findGroupSites.mockRejectedValueOnce(new Error('DB Error'));

      await getGroupSites(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
