/**
 * Tests unitaires pour CronSchedulerService.
 *
 * Focus : le rattrapage au boot (`catchUpIfOverdue`) — sans lui, un schedule à
 * heure fixe dont le process était éteint pile au moment du déclenchement (ex:
 * réveil Railway App Sleeping après une nuit endormie) saute silencieusement
 * son occurrence, car node-cron ne rattrape jamais un tick manqué de lui-même.
 *
 * @module cron-scheduler.service.test
 */

const mockQuery = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../config/logger', () => mockLogger);

jest.mock('node-cron', () => ({
  __esModule: true,
  default: {
    validate: jest.fn().mockReturnValue(true),
    schedule: jest.fn().mockReturnValue({ stop: jest.fn() }),
  },
}));

import { cronSchedulerService } from './cron-scheduler.service';
import type { RecurringSchedule } from '../cron-tasks/types';

function makeSchedule(overrides: Partial<RecurringSchedule> = {}): RecurringSchedule {
  return {
    id: 'sched-1',
    name: 'Agrégation stats clubs',
    description: null,
    task_type: 'aggregation',
    cron_expression: null,
    frequency: 'daily',
    day_of_week: null,
    day_of_month: null,
    hour: 2,
    minute: 0,
    timezone: 'Europe/Paris',
    task_config: { aggregation_type: 'club_daily_stats', target_date: 'yesterday' },
    is_active: true,
    last_run_at: null,
    next_run_at: null,
    ...overrides,
  };
}

describe('CronSchedulerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('start() — catch-up au boot', () => {
    it('exécute immédiatement un schedule dont next_run_at est dans le passé', async () => {
      const overdueSchedule = makeSchedule({
        next_run_at: new Date(Date.now() - 60 * 60 * 1000), // il y a 1h
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [overdueSchedule] }) // SELECT active schedules
        .mockResolvedValueOnce({ rows: [{ id: 'exec-1' }] }) // INSERT execution (startExecution)
        .mockResolvedValueOnce({ rows: [] }) // calculate_all_daily_stats
        .mockResolvedValueOnce({ rows: [] }) // completeExecution UPDATE execution
        .mockResolvedValueOnce({ rows: [] }); // completeExecution UPDATE schedule

      await cronSchedulerService.start();

      const executedAggregation = mockQuery.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('calculate_all_daily_stats')
      );
      expect(executedAggregation).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Catching up missed schedule'),
        expect.objectContaining({ scheduleId: 'sched-1' })
      );

      cronSchedulerService.stop();
    });

    it("ne rattrape pas un schedule dont next_run_at est dans le futur", async () => {
      const futureSchedule = makeSchedule({
        next_run_at: new Date(Date.now() + 60 * 60 * 1000), // dans 1h
      });

      mockQuery.mockResolvedValueOnce({ rows: [futureSchedule] });

      await cronSchedulerService.start();

      const executedAggregation = mockQuery.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('calculate_all_daily_stats')
      );
      expect(executedAggregation).toBe(false);

      cronSchedulerService.stop();
    });

    it('ne rattrape pas un schedule qui n\'a jamais tourné (next_run_at NULL)', async () => {
      const neverRunSchedule = makeSchedule({ next_run_at: null });

      mockQuery.mockResolvedValueOnce({ rows: [neverRunSchedule] });

      await cronSchedulerService.start();

      const executedAggregation = mockQuery.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('calculate_all_daily_stats')
      );
      expect(executedAggregation).toBe(false);

      cronSchedulerService.stop();
    });
  });
});
