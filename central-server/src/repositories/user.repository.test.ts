const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import { userRepository } from './user.repository';

describe('UserRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test listWithRelations
  describe('listWithRelations', () => {
    it('should list users with no filters', async () => {
      const mockUsers = [{ id: 'u1', email: 'a@b.com', full_name: 'Test', role: 'admin' }];
      mockQuery.mockResolvedValue({ rows: mockUsers, rowCount: 1 });

      const result = await userRepository.listWithRelations();

      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('FROM users u');
      expect(sql).toContain('LEFT JOIN advertisers');
    });

    it('should apply role and search filters', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await userRepository.listWithRelations({ role: 'admin', search: 'test' });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('u.role = $1');
      expect(sql).toContain('ILIKE $2');
      expect(mockQuery.mock.calls[0][1]).toEqual(['admin', '%test%']);
    });
  });

  // Test findByIdWithRelations
  describe('findByIdWithRelations', () => {
    it('should return user with relations', async () => {
      const mockUser = { id: 'u1', email: 'a@b.com', advertiser_name: 'Adv1' };
      mockQuery.mockResolvedValue({ rows: [mockUser], rowCount: 1 });

      const result = await userRepository.findByIdWithRelations('u1');

      expect(result).toEqual(mockUser);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE u.id = $1'), ['u1']);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await userRepository.findByIdWithRelations('u-x');

      expect(result).toBeNull();
    });
  });

  // Test findByEmail
  describe('findByEmail', () => {
    it('should return user by email', async () => {
      const mockUser = { id: 'u1', email: 'a@b.com', password_hash: 'hash' };
      mockQuery.mockResolvedValue({ rows: [mockUser], rowCount: 1 });

      const result = await userRepository.findByEmail('a@b.com');

      expect(result).toEqual(mockUser);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE email = $1'), ['a@b.com']);
    });

    it('should fallback to sponsor_id on missing advertiser_id column', async () => {
      const missingColError = { code: '42703', message: 'column "advertiser_id" does not exist' };
      const mockUser = { id: 'u1', sponsor_id: 's1' };
      mockQuery
        .mockRejectedValueOnce(missingColError)
        .mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });

      const result = await userRepository.findByEmail('a@b.com');

      expect(result).toEqual(mockUser);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect((mockQuery.mock.calls[1][0] as string)).toContain('sponsor_id');
    });
  });

  // Test emailExists
  describe('emailExists', () => {
    it('should return true when email exists', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await userRepository.emailExists('a@b.com');

      expect(result).toBe(true);
    });

    it('should exclude specific user ID', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await userRepository.emailExists('a@b.com', 'u1');

      expect(result).toBe(false);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('id != $2'), ['a@b.com', 'u1']);
    });
  });

  // Test create
  describe('create', () => {
    it('should insert new user', async () => {
      const mockUser = { id: 'u1', email: 'a@b.com', role: 'admin' };
      mockQuery.mockResolvedValue({ rows: [mockUser], rowCount: 1 });

      const result = await userRepository.create({
        email: 'a@b.com',
        passwordHash: 'hash',
        fullName: 'Test',
        role: 'admin',
        advertiserId: null,
        agencyId: null,
      });

      expect(result).toEqual(mockUser);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO users');
      expect(sql).toContain('RETURNING');
    });
  });

  // Test update
  describe('update', () => {
    it('should update user with COALESCE', async () => {
      const mockUser = { id: 'u1', email: 'new@b.com' };
      mockQuery.mockResolvedValue({ rows: [mockUser], rowCount: 1 });

      const result = await userRepository.update('u1', { email: 'new@b.com' });

      expect(result).toEqual(mockUser);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('COALESCE($1, email)');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await userRepository.update('u-x', { email: 'test@b.com' });

      expect(result).toBeNull();
    });
  });

  // Test updateStatus
  describe('updateStatus', () => {
    it('should update user status', async () => {
      const mockUser = { id: 'u1', status: 'inactive' };
      mockQuery.mockResolvedValue({ rows: [mockUser], rowCount: 1 });

      const result = await userRepository.updateStatus('u1', 'inactive');

      expect(result).toEqual(mockUser);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('SET status = $1'), ['inactive', 'u1']);
    });
  });

  // Test updatePassword
  describe('updatePassword', () => {
    it('should update password hash', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'u1' }], rowCount: 1 });

      const result = await userRepository.updatePassword('u1', 'newhash');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('password_hash = $1'), ['newhash', 'u1']);
    });
  });

  // Test updateLastLogin
  describe('updateLastLogin', () => {
    it('should update last_login_at', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await userRepository.updateLastLogin('u1');

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('last_login_at = NOW()'), ['u1']);
    });
  });

  // Test countActiveSuperAdmins
  describe('countActiveSuperAdmins', () => {
    it('should return count of active super admins', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '3' }], rowCount: 1 });

      const result = await userRepository.countActiveSuperAdmins();

      expect(result).toBe(3);
    });
  });

  // Test getAuditLogs
  describe('getAuditLogs', () => {
    it('should return audit logs with limit', async () => {
      const mockLogs = [{ action: 'login', ip_address: '1.2.3.4' }];
      mockQuery.mockResolvedValue({ rows: mockLogs, rowCount: 1 });

      const result = await userRepository.getAuditLogs('u1', 50);

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('audit_logs'), ['u1', 50]);
    });
  });

  // Test getPasswordResetHistory
  describe('getPasswordResetHistory', () => {
    it('should return password reset tokens', async () => {
      const mockTokens = [{ created_at: new Date(), expires_at: new Date(), used_at: null }];
      mockQuery.mockResolvedValue({ rows: mockTokens, rowCount: 1 });

      const result = await userRepository.getPasswordResetHistory('u1');

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('password_reset_tokens'), ['u1']);
    });
  });
});
