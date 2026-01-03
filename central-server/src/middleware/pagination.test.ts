import { Request, Response, NextFunction } from 'express';
import {
  paginationMiddleware,
  createPaginationMiddleware,
  formatPaginatedResponse,
  buildPaginationClause,
  executePaginatedQuery,
  PaginationParams,
} from './pagination';

describe('Pagination Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      query: {},
    };
    mockRes = {};
    mockNext = jest.fn();
  });

  describe('paginationMiddleware', () => {
    it('should set default pagination values', () => {
      paginationMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.pagination).toEqual({
        page: 1,
        limit: 20,
        offset: 0,
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should parse page and limit from query', () => {
      mockReq.query = { page: '3', limit: '50' };

      paginationMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.pagination).toEqual({
        page: 3,
        limit: 50,
        offset: 100, // (3-1) * 50
      });
    });

    it('should enforce minimum page of 1', () => {
      mockReq.query = { page: '0' };

      paginationMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.pagination?.page).toBe(1);
    });

    it('should enforce minimum page of 1 for negative values', () => {
      mockReq.query = { page: '-5' };

      paginationMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.pagination?.page).toBe(1);
    });

    it('should enforce maximum limit of 100', () => {
      mockReq.query = { limit: '500' };

      paginationMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.pagination?.limit).toBe(100);
    });

    it('should enforce minimum limit of 1 for negative values', () => {
      mockReq.query = { limit: '-5' };

      paginationMiddleware(mockReq as Request, mockRes as Response, mockNext);

      // Math.max(1, -5) = 1, so we expect 1
      expect(mockReq.pagination?.limit).toBe(1);
    });

    it('should use default limit when limit is 0', () => {
      mockReq.query = { limit: '0' };

      paginationMiddleware(mockReq as Request, mockRes as Response, mockNext);

      // Math.max(1, 0) = 1, but parseInt('0') || 20 = 20 (falsy 0 triggers default)
      // Actually: Math.max(1, parseInt('0', 10) || 20) = Math.max(1, 0 || 20) = Math.max(1, 20) = 20
      expect(mockReq.pagination?.limit).toBe(20);
    });

    it('should handle non-numeric values gracefully', () => {
      mockReq.query = { page: 'abc', limit: 'xyz' };

      paginationMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.pagination).toEqual({
        page: 1,
        limit: 20,
        offset: 0,
      });
    });

    it('should calculate correct offset for different pages', () => {
      const testCases = [
        { page: 1, limit: 10, expectedOffset: 0 },
        { page: 2, limit: 10, expectedOffset: 10 },
        { page: 5, limit: 20, expectedOffset: 80 },
        { page: 10, limit: 25, expectedOffset: 225 },
      ];

      for (const { page, limit, expectedOffset } of testCases) {
        mockReq.query = { page: String(page), limit: String(limit) };
        paginationMiddleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockReq.pagination?.offset).toBe(expectedOffset);
      }
    });
  });

  describe('createPaginationMiddleware', () => {
    it('should create middleware with custom defaults', () => {
      const customMiddleware = createPaginationMiddleware(10, 50);

      customMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.pagination).toEqual({
        page: 1,
        limit: 10,
        offset: 0,
      });
    });

    it('should enforce custom max limit', () => {
      const customMiddleware = createPaginationMiddleware(10, 30);
      mockReq.query = { limit: '100' };

      customMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.pagination?.limit).toBe(30);
    });

    it('should use provided limit if within bounds', () => {
      const customMiddleware = createPaginationMiddleware(10, 50);
      mockReq.query = { limit: '25' };

      customMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.pagination?.limit).toBe(25);
    });
  });

  describe('formatPaginatedResponse', () => {
    it('should format response with correct pagination metadata', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const pagination: PaginationParams = { page: 1, limit: 10, offset: 0 };

      const result = formatPaginatedResponse(data, 25, pagination);

      expect(result).toEqual({
        data,
        pagination: {
          page: 1,
          limit: 10,
          total: 25,
          totalPages: 3,
          hasNext: true,
          hasPrev: false,
        },
      });
    });

    it('should calculate totalPages correctly', () => {
      const testCases = [
        { total: 0, limit: 10, expectedPages: 0 },
        { total: 5, limit: 10, expectedPages: 1 },
        { total: 10, limit: 10, expectedPages: 1 },
        { total: 11, limit: 10, expectedPages: 2 },
        { total: 100, limit: 20, expectedPages: 5 },
        { total: 101, limit: 20, expectedPages: 6 },
      ];

      for (const { total, limit, expectedPages } of testCases) {
        const result = formatPaginatedResponse([], total, { page: 1, limit, offset: 0 });
        expect(result.pagination.totalPages).toBe(expectedPages);
      }
    });

    it('should set hasNext to false on last page', () => {
      const result = formatPaginatedResponse([], 30, { page: 3, limit: 10, offset: 20 });

      expect(result.pagination.hasNext).toBe(false);
    });

    it('should set hasPrev to false on first page', () => {
      const result = formatPaginatedResponse([], 30, { page: 1, limit: 10, offset: 0 });

      expect(result.pagination.hasPrev).toBe(false);
    });

    it('should set hasPrev to true on pages after first', () => {
      const result = formatPaginatedResponse([], 30, { page: 2, limit: 10, offset: 10 });

      expect(result.pagination.hasPrev).toBe(true);
    });

    it('should handle empty data', () => {
      const result = formatPaginatedResponse([], 0, { page: 1, limit: 10, offset: 0 });

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.hasNext).toBe(false);
    });
  });

  describe('buildPaginationClause', () => {
    it('should build correct SQL clause', () => {
      const pagination: PaginationParams = { page: 2, limit: 25, offset: 25 };

      const result = buildPaginationClause(pagination);

      expect(result).toBe('LIMIT 25 OFFSET 25');
    });

    it('should handle first page', () => {
      const pagination: PaginationParams = { page: 1, limit: 10, offset: 0 };

      const result = buildPaginationClause(pagination);

      expect(result).toBe('LIMIT 10 OFFSET 0');
    });
  });

  describe('executePaginatedQuery', () => {
    it('should execute data and count queries in parallel', async () => {
      const mockPool = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })
          .mockResolvedValueOnce({ rows: [{ count: '50' }] }),
      };

      const result = await executePaginatedQuery(
        mockPool,
        'SELECT * FROM items',
        'SELECT COUNT(*) FROM items',
        [],
        { page: 1, limit: 10, offset: 0 }
      );

      expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
      expect(result.total).toBe(50);
    });

    it('should append LIMIT and OFFSET to data query', async () => {
      const mockPool = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ count: '0' }] }),
      };

      await executePaginatedQuery(
        mockPool,
        'SELECT * FROM items WHERE active = $1',
        'SELECT COUNT(*) FROM items WHERE active = $1',
        [true],
        { page: 2, limit: 15, offset: 15 }
      );

      // First call is the data query
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM items WHERE active = $1 LIMIT $2 OFFSET $3',
        [true, 15, 15]
      );

      // Second call is the count query (no LIMIT/OFFSET)
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) FROM items WHERE active = $1',
        [true]
      );
    });

    it('should handle missing count result', async () => {
      const mockPool = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }), // No count row
      };

      const result = await executePaginatedQuery(mockPool, 'SELECT *', 'SELECT COUNT(*)', [], {
        page: 1,
        limit: 10,
        offset: 0,
      });

      expect(result.total).toBe(0);
    });
  });
});
