/**
 * Tests unitaires pour remotionTemplatesRepository + remotionTemplateVersionsRepository.
 * Couvre CRUD, publish toggle, update (query builder dynamique), duplicate,
 * et les reads de versions (ADR-055).
 */

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

import {
  remotionTemplatesRepository,
  remotionTemplateVersionsRepository,
} from './remotion-templates.repository';

describe('RemotionTemplatesRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns all templates ordered by created_at DESC', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1' }, { id: 't2' }] });
      const result = await remotionTemplatesRepository.findAll();
      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[0][0]).toMatch(/ORDER BY created_at DESC/);
      expect(mockQuery.mock.calls[0][0]).not.toMatch(/WHERE published/);
    });

    it('filters by published=true when requested', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await remotionTemplatesRepository.findAll(true);
      expect(mockQuery.mock.calls[0][0]).toMatch(/WHERE published = true/);
    });
  });

  describe('findById / findPublishedById', () => {
    it('findById returns the row or null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 't1' }] });
      expect(await remotionTemplatesRepository.findById('t1')).toEqual({ id: 't1' });

      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await remotionTemplatesRepository.findById('missing')).toBeNull();
    });

    it('findPublishedById filters by published=true', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1' }] });
      await remotionTemplatesRepository.findPublishedById('t1');
      expect(mockQuery.mock.calls[0][0]).toMatch(/published = true/);
    });
  });

  describe('create', () => {
    it('serializes props_schema and default_props to JSON with defaults', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1' }] });
      await remotionTemplatesRepository.create({
        name: 'Test',
        composition_id: 'Comp',
      });
      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe('Test');
      expect(params[1]).toBe('Comp');
      expect(params[2]).toBeNull();
      expect(params[3]).toBe('[]'); // empty props_schema
      expect(params[4]).toBe('{}'); // empty default_props
      expect(params[5]).toBeNull();
    });

    it('uses provided values when given', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1' }] });
      await remotionTemplatesRepository.create({
        name: 'X',
        composition_id: 'C',
        description: 'desc',
        props_schema: [{ key: 'title', type: 'string' }],
        default_props: { title: 'Hello' },
        created_by: 'user-1',
      });
      const params = mockQuery.mock.calls[0][1];
      expect(params[2]).toBe('desc');
      expect(params[3]).toBe(JSON.stringify([{ key: 'title', type: 'string' }]));
      expect(params[4]).toBe(JSON.stringify({ title: 'Hello' }));
      expect(params[5]).toBe('user-1');
    });
  });

  describe('updateDefaultProps', () => {
    it('updates default_props and bumps updated_at', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1' }] });
      await remotionTemplatesRepository.updateDefaultProps('t1', { color: 'red' });
      expect(mockQuery.mock.calls[0][0]).toMatch(/SET default_props = \$1, updated_at = NOW/);
      expect(mockQuery.mock.calls[0][1]).toEqual([JSON.stringify({ color: 'red' }), 't1']);
    });

    it('returns null when no row updated', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await remotionTemplatesRepository.updateDefaultProps('missing', {});
      expect(result).toBeNull();
    });
  });

  describe('setPublished', () => {
    it('toggles published flag', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1', published: true }] });
      const result = await remotionTemplatesRepository.setPublished('t1', true);
      expect(result).toEqual({ id: 't1', published: true });
      expect(mockQuery.mock.calls[0][1]).toEqual([true, 't1']);
    });
  });

  describe('update — dynamic query builder (ADR-055)', () => {
    it('returns the current row when no fields provided (delegates to findById)', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1', name: 'unchanged' }] });
      const result = await remotionTemplatesRepository.update('t1', {});
      expect(result).toEqual({ id: 't1', name: 'unchanged' });
      // Only the findById SELECT should have run — no UPDATE
      expect(mockQuery.mock.calls[0][0]).toMatch(/SELECT \* FROM neopro_templates/);
    });

    it('builds a partial update for a single field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1', name: 'New' }] });
      await remotionTemplatesRepository.update('t1', { name: 'New' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/SET name = \$1, updated_at = NOW/);
      expect(params).toEqual(['New', 't1']);
    });

    it('serializes props_schema and default_props when both provided', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1' }] });
      await remotionTemplatesRepository.update('t1', {
        props_schema: [{ key: 'a' }],
        default_props: { a: 1 },
      });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/props_schema = \$1/);
      expect(sql).toMatch(/default_props = \$2/);
      expect(params[0]).toBe(JSON.stringify([{ key: 'a' }]));
      expect(params[1]).toBe(JSON.stringify({ a: 1 }));
      expect(params[2]).toBe('t1');
    });

    it('supports updating description to null (nullable field)', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 't1' }] });
      await remotionTemplatesRepository.update('t1', { description: null });
      const params = mockQuery.mock.calls[0][1];
      expect(params).toEqual([null, 't1']);
    });

    it('returns null when update matches no row', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await remotionTemplatesRepository.update('missing', { name: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('duplicate', () => {
    it('copies source fields, marks unpublished, defaults name to "X (copie)"', async () => {
      const src = {
        id: 't1',
        name: 'Original',
        composition_id: 'Comp',
        description: 'desc',
        props_schema: [{ key: 'a' }],
        default_props: { a: 1 },
      };
      // First call: findById(src) → returns the source
      mockQuery
        .mockResolvedValueOnce({ rows: [src] })
        // Second call: INSERT → returns the duplicate
        .mockResolvedValueOnce({ rows: [{ id: 't2', name: 'Original (copie)' }] });

      const result = await remotionTemplatesRepository.duplicate('t1', { createdBy: 'u-1' });

      expect(result).toEqual({ id: 't2', name: 'Original (copie)' });
      const [insertSql, insertParams] = mockQuery.mock.calls[1];
      expect(insertSql).toMatch(/INSERT INTO neopro_templates/);
      expect(insertSql).toMatch(/published/);
      expect(insertParams[0]).toBe('Original (copie)');
      expect(insertParams[5]).toBe('u-1');
    });

    it('uses provided name when given (trimmed)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'O', composition_id: 'C' }] })
        .mockResolvedValueOnce({ rows: [{ id: 't2' }] });

      await remotionTemplatesRepository.duplicate('t1', { name: '  Custom name  ' });
      expect(mockQuery.mock.calls[1][1][0]).toBe('Custom name');
    });

    it('returns null when source does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await remotionTemplatesRepository.duplicate('missing', {});
      expect(result).toBeNull();
      // Only the findById SELECT ran — no INSERT
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });
});

describe('RemotionTemplateVersionsRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listByTemplate', () => {
    it('orders by created_at DESC with default limit 50', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'v1' }, { id: 'v2' }] });
      const result = await remotionTemplateVersionsRepository.listByTemplate('t1');
      expect(result).toHaveLength(2);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/ORDER BY created_at DESC/);
      expect(sql).toMatch(/LIMIT \$2/);
      expect(params).toEqual(['t1', 50]);
    });

    it('respects custom limit', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await remotionTemplateVersionsRepository.listByTemplate('t1', 10);
      expect(mockQuery.mock.calls[0][1]).toEqual(['t1', 10]);
    });
  });

  describe('findById', () => {
    it('returns the version row or null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'v1', template_id: 't1' }] });
      expect(await remotionTemplateVersionsRepository.findById('v1')).toEqual({
        id: 'v1',
        template_id: 't1',
      });

      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await remotionTemplateVersionsRepository.findById('missing')).toBeNull();
    });
  });
});
