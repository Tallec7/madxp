jest.mock('../config/database', () => ({
  query: jest.fn(),
}));

import { query } from '../config/database';
import { findRowsReferencingInJsonb } from './jsonb-references';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('findRowsReferencingInJsonb', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
  });

  it('returns [] without DB call when all criteria are empty', async () => {
    const rows = await findRowsReferencingInJsonb(
      { table: 'config_profiles', jsonbColumn: 'configuration', selectColumns: 'id' },
      { videoId: undefined, filename: '' },
    );
    expect(rows).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('builds OR clause and ILIKE params from non-empty criteria', async () => {
    await findRowsReferencingInJsonb(
      { table: 'config_profiles', jsonbColumn: 'configuration', selectColumns: 'id, name' },
      { videoId: 'abc-123', filename: 'video.mp4' },
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('SELECT id, name');
    expect(sql).toContain('FROM config_profiles');
    expect(sql).toContain('configuration::text ILIKE $1');
    expect(sql).toContain('configuration::text ILIKE $2');
    expect(sql).toMatch(/configuration::text ILIKE \$1 OR configuration::text ILIKE \$2/);
    expect(params).toEqual(['%abc-123%', '%video.mp4%']);
  });

  it('AND-s extraWhere with the JSONB OR group', async () => {
    await findRowsReferencingInJsonb(
      {
        table: 'sites',
        jsonbColumn: 'local_config_mirror',
        selectColumns: 'id, site_name',
        extraWhere: 'local_config_mirror IS NOT NULL',
      },
      { videoId: 'abc' },
    );

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/WHERE \(local_config_mirror IS NOT NULL\) AND \(local_config_mirror::text ILIKE \$1\)/);
  });

  it('rejects unsafe table identifier (SQL injection guard)', async () => {
    await expect(
      findRowsReferencingInJsonb(
        { table: 'sites; DROP TABLE users--', jsonbColumn: 'configuration', selectColumns: 'id' },
        { videoId: 'abc' },
      ),
    ).rejects.toThrow(/invalid table/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects unsafe jsonbColumn identifier', async () => {
    await expect(
      findRowsReferencingInJsonb(
        { table: 'sites', jsonbColumn: 'configuration"; DROP', selectColumns: 'id' },
        { videoId: 'abc' },
      ),
    ).rejects.toThrow(/invalid jsonbColumn/);
  });

  it('returns rows from query result', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'p1' }, { id: 'p2' }],
      rowCount: 2,
    } as never);

    const rows = await findRowsReferencingInJsonb<{ id: string }>(
      { table: 'config_profiles', jsonbColumn: 'configuration', selectColumns: 'id' },
      { videoId: 'abc' },
    );

    expect(rows).toEqual([{ id: 'p1' }, { id: 'p2' }]);
  });
});
