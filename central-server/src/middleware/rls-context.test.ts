/**
 * Tests unitaires pour le middleware Row-Level Security (RLS)
 *
 * Ce middleware gère l'isolation multi-tenant via PostgreSQL RLS :
 * - Injection du contexte user/site dans la session PostgreSQL
 * - Nettoyage automatique du contexte à la fin de la requête
 * - Bypass admin pour les admins
 *
 * Critique : une faille dans ce middleware permettrait à un club
 * de voir les données d'un autre club.
 *
 * @module rls-context.test
 */

const mockPoolQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPool = {
  query: (...args: any[]) => mockPoolQuery(...args),
  connect: jest.fn().mockResolvedValue({
    query: (...args: any[]) => mockClientQuery(...args),
    release: mockClientRelease,
  }),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

import { setRLSContext, resetRLSContext, setAdminContext, withRLSContext, withAdminContext } from './rls-context';
import { Request, Response, NextFunction } from 'express';

// Helper: create mock request
function mockRequest(overrides: Record<string, any> = {}): any {
  return {
    params: {},
    body: {},
    query: {},
    path: '/api/sites/site-123',
    user: undefined,
    ...overrides,
  };
}

// Helper: create mock response with event emitter
function mockResponse(): any {
  const res: any = {
    on: jest.fn(),
    statusCode: 200,
  };
  return res;
}

describe('RLS Context Middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockClientQuery.mockResolvedValue({ rows: [] });
  });

  // ============================================
  // setRLSContext
  // ============================================
  describe('setRLSContext', () => {
    it('should set context with siteId from route params (siteId param)', async () => {
      const middleware = setRLSContext(mockPool as any);
      const req = mockRequest({
        params: { siteId: 'site-123' },
        path: '/api/some/route',
        user: { id: 'user-1', role: 'operator' },
      });
      const res = mockResponse();

      await middleware(req, res, next);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_session_context'),
        expect.arrayContaining(['site-123', 'user-1'])
      );
      expect(next).toHaveBeenCalled();
    });

    it('should extract siteId from params.id when path includes /sites/', async () => {
      const middleware = setRLSContext(mockPool as any);
      const req = mockRequest({
        params: { id: 'site-456' },
        path: '/api/sites/site-456',
        user: { id: 'user-1', role: 'operator' },
      });
      const res = mockResponse();

      await middleware(req, res, next);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_session_context'),
        expect.arrayContaining(['site-456'])
      );
    });

    it('should extract siteId from body.site_id if not in params', async () => {
      const middleware = setRLSContext(mockPool as any);
      const req = mockRequest({
        params: {},
        body: { site_id: 'site-789' },
        path: '/api/other/route',
        user: { id: 'user-1', role: 'operator' },
      });
      const res = mockResponse();

      await middleware(req, res, next);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_session_context'),
        expect.arrayContaining(['site-789'])
      );
    });

    it('should extract siteId from query.site_id if not in params or body', async () => {
      const middleware = setRLSContext(mockPool as any);
      const req = mockRequest({
        params: {},
        body: {},
        query: { site_id: 'site-101' },
        path: '/api/other/route',
        user: { id: 'user-1', role: 'operator' },
      });
      const res = mockResponse();

      await middleware(req, res, next);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_session_context'),
        expect.arrayContaining(['site-101'])
      );
    });

    it('should register cleanup on response finish', async () => {
      const middleware = setRLSContext(mockPool as any);
      const req = mockRequest({
        user: { id: 'user-1', role: 'operator' },
      });
      const res = mockResponse();

      await middleware(req, res, next);

      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should set isAdmin flag for admin role', async () => {
      const middleware = setRLSContext(mockPool as any);
      const req = mockRequest({
        params: { siteId: 'site-123' },
        user: { id: 'admin-1', role: 'admin' },
      });
      const res = mockResponse();

      await middleware(req, res, next);

      // isAdmin = role === 'admin'
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_session_context'),
        expect.arrayContaining([true])
      );
    });

    it('should NOT set isAdmin for super_admin role', async () => {
      const middleware = setRLSContext(mockPool as any);
      const req = mockRequest({
        params: { siteId: 'site-123' },
        user: { id: 'sa-1', role: 'super_admin' },
      });
      const res = mockResponse();

      await middleware(req, res, next);

      // isAdmin = (role === 'admin'), super_admin does NOT get isAdmin=true
      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_session_context'),
        ['site-123', 'sa-1', false]
      );
    });

    it('should call next even if context setting fails', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('DB error'));

      const middleware = setRLSContext(mockPool as any);
      const req = mockRequest({
        user: { id: 'user-1', role: 'operator' },
      });
      const res = mockResponse();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should skip RLS context if no user is authenticated', async () => {
      const middleware = setRLSContext(mockPool as any);
      const req = mockRequest({ user: undefined });
      const res = mockResponse();

      await middleware(req, res, next);

      expect(mockPoolQuery).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  // ============================================
  // resetRLSContext
  // ============================================
  describe('resetRLSContext', () => {
    it('should call reset_session_context on the pool', async () => {
      const middleware = resetRLSContext(mockPool as any);
      const req = mockRequest();
      const res = mockResponse();

      await middleware(req, res, next);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('reset_session_context')
      );
      expect(next).toHaveBeenCalled();
    });
  });

  // ============================================
  // setAdminContext
  // ============================================
  describe('setAdminContext', () => {
    it('should set admin context bypassing RLS', async () => {
      const middleware = setAdminContext(mockPool as any);
      const req = mockRequest();
      const res = mockResponse();

      await middleware(req, res, next);

      // setAdminContext uses a direct string query without params array
      expect(mockPoolQuery).toHaveBeenCalledWith(
        'SELECT set_session_context(NULL, NULL, true)'
      );
      expect(next).toHaveBeenCalled();
    });
  });

  // ============================================
  // withRLSContext (helper function using pool.connect)
  // ============================================
  describe('withRLSContext', () => {
    it('should execute query function within RLS context', async () => {
      const queryFn = jest.fn().mockResolvedValue('result');

      const result = await withRLSContext(
        mockPool as any,
        { siteId: 'site-123', userId: 'user-1', isAdmin: false },
        queryFn
      );

      // Should connect, set context on client, execute, reset on client, release
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_session_context'),
        expect.arrayContaining(['site-123', 'user-1', false])
      );
      expect(queryFn).toHaveBeenCalled();
      expect(result).toBe('result');
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('reset_session_context')
      );
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should reset context even if query function throws', async () => {
      const queryFn = jest.fn().mockRejectedValue(new Error('Query failed'));

      await expect(
        withRLSContext(
          mockPool as any,
          { siteId: 'site-123', userId: 'user-1' },
          queryFn
        )
      ).rejects.toThrow('Query failed');

      // Reset should still be called on client
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('reset_session_context')
      );
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  // ============================================
  // withAdminContext (helper function)
  // ============================================
  describe('withAdminContext', () => {
    it('should execute query with admin bypass via pool.connect', async () => {
      const queryFn = jest.fn().mockResolvedValue([{ id: 1 }]);

      const result = await withAdminContext(mockPool as any, queryFn);

      expect(result).toEqual([{ id: 1 }]);
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('set_session_context'),
        expect.arrayContaining([true])
      );
    });
  });

  // ============================================
  // Multi-tenant isolation scenarios
  // ============================================
  describe('Multi-tenant isolation', () => {
    it('should set different contexts for different sites', async () => {
      const middleware = setRLSContext(mockPool as any);

      // Request for site A
      const reqA = mockRequest({
        params: { siteId: 'site-A' },
        user: { id: 'user-1', role: 'operator' },
      });
      await middleware(reqA, mockResponse(), next);

      // Request for site B
      const reqB = mockRequest({
        params: { siteId: 'site-B' },
        user: { id: 'user-2', role: 'operator' },
      });
      await middleware(reqB, mockResponse(), next);

      const calls = mockPoolQuery.mock.calls;
      const siteACall = calls.find((c: any[]) => c[1]?.includes('site-A'));
      const siteBCall = calls.find((c: any[]) => c[1]?.includes('site-B'));

      expect(siteACall).toBeDefined();
      expect(siteBCall).toBeDefined();
    });

    it('should not leak context between requests (withRLSContext)', async () => {
      // First request sets context for site-A
      await withRLSContext(
        mockPool as any,
        { siteId: 'site-A', userId: 'user-1' },
        async () => 'result-A'
      );

      // Reset should have been called on the client, clearing site-A context
      const resetCalls = mockClientQuery.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('reset')
      );
      expect(resetCalls.length).toBeGreaterThanOrEqual(1);
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });
});
