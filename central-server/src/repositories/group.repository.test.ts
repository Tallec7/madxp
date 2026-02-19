const mockQuery = jest.fn();
const mockGetClient = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  getClient: () => mockGetClient(),
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import { groupRepository } from './group.repository';

describe('GroupRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAllWithSiteCount', () => {
    it('should return all groups with site counts', async () => {
      const mockGroups = [
        { id: 'g1', name: 'Group 1', site_count: 5 },
        { id: 'g2', name: 'Group 2', site_count: 3 },
      ];
      mockQuery.mockResolvedValue({ rows: mockGroups, rowCount: 2 });

      const result = await groupRepository.findAllWithSiteCount();

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('FROM "groups" g');
      expect(sql).toContain('site_count');
    });
  });

  describe('findGroupById', () => {
    it('should return group when found', async () => {
      const mockGroup = { id: 'g1', name: 'Test Group' };
      mockQuery.mockResolvedValue({ rows: [mockGroup], rowCount: 1 });

      const result = await groupRepository.findGroupById('g1');

      expect(result).toEqual(mockGroup);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), ['g1']);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await groupRepository.findGroupById('g-x');

      expect(result).toBeNull();
    });
  });

  describe('findGroupSites', () => {
    it('should return sites for a group', async () => {
      const mockSites = [
        { id: 's1', site_name: 'Site A' },
        { id: 's2', site_name: 'Site B' },
      ];
      mockQuery.mockResolvedValue({ rows: mockSites, rowCount: 2 });

      const result = await groupRepository.findGroupSites('g1');

      expect(result).toHaveLength(2);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('site_groups');
      expect(sql).toContain('WHERE sg.group_id = $1');
    });
  });

  describe('create', () => {
    it('should insert a new group', async () => {
      const mockGroup = { id: 'g1', name: 'New Group', type: 'manual' };
      mockQuery.mockResolvedValue({ rows: [mockGroup], rowCount: 1 });

      const result = await groupRepository.create({
        id: 'g1',
        name: 'New Group',
        description: null,
        type: 'manual',
        filters: null,
      });

      expect(result).toEqual(mockGroup);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO "groups"');
    });
  });

  describe('update', () => {
    it('should update group with dynamic fields', async () => {
      const mockGroup = { id: 'g1', name: 'Updated Group' };
      mockQuery.mockResolvedValue({ rows: [mockGroup], rowCount: 1 });

      const result = await groupRepository.update('g1', { name: 'Updated Group' });

      expect(result).toEqual(mockGroup);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE "groups"');
      expect(sql).toContain('RETURNING *');
    });

    it('should return null when no fields to update', async () => {
      const result = await groupRepository.update('g1', {});

      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('deleteGroup', () => {
    it('should delete group and return name', async () => {
      mockQuery.mockResolvedValue({ rows: [{ name: 'Test Group' }], rowCount: 1 });

      const result = await groupRepository.deleteGroup('g1');

      expect(result).toBe('Test Group');
    });

    it('should return null when group not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await groupRepository.deleteGroup('g-x');

      expect(result).toBeNull();
    });
  });

  describe('addSites', () => {
    it('should add sites to group in a transaction', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: 'g1' }] }) // group check
          .mockResolvedValueOnce({ rows: [{ id: 's1' }] }) // site check 1
          .mockResolvedValueOnce({}) // insert 1
          .mockResolvedValueOnce({ rows: [{ id: 's2' }] }) // site check 2
          .mockResolvedValueOnce({}) // insert 2
          .mockResolvedValueOnce({}), // COMMIT
        release: jest.fn(),
      };
      mockGetClient.mockResolvedValue(mockClient);

      await groupRepository.addSites('g1', ['s1', 's2']);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on missing group', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [] }), // group not found
        release: jest.fn(),
      };
      mockGetClient.mockResolvedValue(mockClient);

      await expect(groupRepository.addSites('g-x', ['s1'])).rejects.toThrow('Group g-x not found');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('removeSite', () => {
    it('should remove site from group', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await groupRepository.removeSite('g1', 's1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM site_groups'),
        ['g1', 's1']
      );
    });

    it('should return false when association not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await groupRepository.removeSite('g1', 's-x');

      expect(result).toBe(false);
    });
  });
});
