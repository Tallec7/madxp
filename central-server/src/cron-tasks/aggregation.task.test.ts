import { RecurringSchedule } from './types';

const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

jest.mock('../config/logger', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  __esModule: true,
}));

import { executeAggregationTask } from './aggregation.task';

const buildSchedule = (taskConfig: Record<string, unknown>): RecurringSchedule =>
  ({
    id: 'sched-1',
    name: 'test',
    description: null,
    task_type: 'aggregation',
    cron_expression: null,
    frequency: 'daily',
    day_of_week: null,
    day_of_month: null,
    hour: 1,
    minute: 0,
    timezone: 'Europe/Paris',
    task_config: taskConfig,
    is_active: true,
    last_run_at: null,
    last_run_status: null,
    last_run_error: null,
    next_run_at: null,
    run_count: 0,
    failure_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: null,
  } as unknown as RecurringSchedule);

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] });
});

describe('executeAggregationTask — target_date routing', () => {
  it('defaults to CURRENT_DATE - 1 (yesterday) when target_date is unset', async () => {
    const result = await executeAggregationTask(
      buildSchedule({ aggregation_type: 'site_sponsor_daily_stats' })
    );
    expect(result.success).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('CURRENT_DATE - 1');
    expect(sql).not.toContain('CURRENT_DATE)');
    expect(result.message).toContain('yesterday');
  });

  it('uses CURRENT_DATE when target_date is "today" (live intra-day refresh)', async () => {
    // Regression guard — incident Bottière 2026-05-08 :
    // sans cette branche, un Pi activé en cours de journée n'apparaît
    // dans site_sponsor_daily_stats que le lendemain matin.
    const result = await executeAggregationTask(
      buildSchedule({ aggregation_type: 'site_sponsor_daily_stats', target_date: 'today' })
    );
    expect(result.success).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/calculate_site_sponsor_daily_stats\(CURRENT_DATE\)/);
    expect(sql).not.toContain('CURRENT_DATE - 1');
    expect(result.message).toContain('today');
  });

  it('honors target_date for all aggregation_type variants (all)', async () => {
    const result = await executeAggregationTask(
      buildSchedule({ aggregation_type: 'all', target_date: 'today' })
    );
    expect(result.success).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(3);
    for (const call of mockQuery.mock.calls) {
      expect(call[0] as string).toContain('CURRENT_DATE');
      expect(call[0] as string).not.toContain('CURRENT_DATE - 1');
    }
  });

  it('rejects unknown target_date and falls back to yesterday safely', async () => {
    const result = await executeAggregationTask(
      buildSchedule({ aggregation_type: 'site_sponsor_daily_stats', target_date: 'tomorrow' })
    );
    expect(result.success).toBe(true);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('CURRENT_DATE - 1');
    expect(result.message).toContain('yesterday');
  });

  it('returns success=false when calculate function is missing in DB', async () => {
    mockQuery.mockRejectedValueOnce(
      new Error('function calculate_site_sponsor_daily_stats(date) does not exist')
    );
    const result = await executeAggregationTask(
      buildSchedule({ aggregation_type: 'site_sponsor_daily_stats', target_date: 'today' })
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('Aggregation function missing');
  });
});
