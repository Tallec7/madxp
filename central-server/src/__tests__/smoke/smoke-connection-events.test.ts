/**
 * Smoke tests — ADR-099 connection_events / uptime tracking
 *
 * Garde-fou contre la régression de l'issue #644 (uptime ~10% systématique
 * pour la flotte) et contre la suppression accidentelle des hooks d'event.
 *
 * Vérifie statiquement (lecture des fichiers source) que :
 * - La migration add-connection-events.sql existe et déclare la table.
 * - Le repository existe et expose les bonnes méthodes.
 * - Le repository est exposé via le barrel index.
 * - Le socketService importe et appelle record() au connect ET au disconnect.
 * - Le dashboard controller consomme connectionEventsRepository.getUptimeStats
 *   et n'utilise plus le calcul faux basé sur 2880 heartbeats/24h.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

describe('ADR-099 — connection_events tracking (smoke)', () => {
  describe('migration', () => {
    it('migration file declares connection_events table with required columns', () => {
      const migration = fs.readFileSync(
        path.join(ROOT, 'scripts/migrations/add-connection-events.sql'),
        'utf8'
      );
      expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS connection_events/);
      expect(migration).toMatch(/site_id UUID NOT NULL/);
      expect(migration).toMatch(/event_type VARCHAR\(20\) NOT NULL/);
      expect(migration).toMatch(/CHECK \(event_type IN \('connected', 'disconnected'\)\)/);
      expect(migration).toMatch(/idx_connection_events_site_time/);
      expect(migration).toMatch(/idx_connection_events_occurred_at/);
    });

    it('full-schema.sql snapshot includes the table definition', () => {
      const schema = fs.readFileSync(path.join(ROOT, 'scripts/full-schema.sql'), 'utf8');
      expect(schema).toMatch(/CREATE TABLE public\.connection_events/);
      expect(schema).toMatch(/idx_connection_events_site_time/);
    });
  });

  describe('repository', () => {
    it('connection-events.repository.ts exposes record / getUptimeStats / purgeOlderThan', () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'repositories/connection-events.repository.ts'),
        'utf8'
      );
      expect(src).toMatch(/async record\(/);
      expect(src).toMatch(/async getUptimeStats\(/);
      expect(src).toMatch(/async purgeOlderThan\(/);
      // Insert query targets the new table.
      expect(src).toMatch(/INSERT INTO connection_events/);
    });

    it('connectionEventsRepository is exported from the barrel', () => {
      const barrel = fs.readFileSync(path.join(ROOT, 'repositories/index.ts'), 'utf8');
      expect(barrel).toMatch(/connectionEventsRepository/);
      expect(barrel).toMatch(/UptimeStats/);
    });
  });

  describe('socket.service hooks', () => {
    const socketSrc = fs.readFileSync(
      path.join(ROOT, 'services/socket.service.ts'),
      'utf8'
    );

    it('imports connectionEventsRepository', () => {
      expect(socketSrc).toMatch(/connectionEventsRepository/);
    });

    it('records a "connected" event on agent authentication', () => {
      // Le bloc juste après le UPDATE sites status='online' doit appeler record({ eventType: 'connected' }).
      expect(socketSrc).toMatch(
        /connectionEventsRepository\.record\(\{[\s\S]{0,200}eventType:\s*'connected'/
      );
    });

    it('records a "disconnected" event on real disconnection (not stale-socket race)', () => {
      expect(socketSrc).toMatch(
        /connectionEventsRepository\.record\(\{[\s\S]{0,200}eventType:\s*'disconnected'/
      );
    });
  });

  describe('dashboard controller', () => {
    const ctrlSrc = fs.readFileSync(
      path.join(ROOT, 'controllers/site-fleet-dashboard.controller.ts'),
      'utf8'
    );

    it('consumes connectionEventsRepository.getUptimeStats', () => {
      expect(ctrlSrc).toMatch(/connectionEventsRepository\.getUptimeStats/);
    });

    it('exposes connection.uptime block (windowHours, percent, disconnectCount, longestGapSeconds, currentState)', () => {
      expect(ctrlSrc).toMatch(/uptime:\s*\{/);
      expect(ctrlSrc).toMatch(/windowHours/);
      expect(ctrlSrc).toMatch(/disconnectCount/);
      expect(ctrlSrc).toMatch(/longestGapSeconds/);
      expect(ctrlSrc).toMatch(/currentState/);
    });

    it('does not divide heartbeat count by the bogus 2880 constant (issue #644 regression guard)', () => {
      // La formule fausse était : heartbeat_count / 2880 * 100.
      // On interdit cette constante magique dans le controller.
      expect(ctrlSrc).not.toMatch(/\/\s*2880/);
    });
  });

  // ---------------------------------------------------------------------
  // Issue #655 — garde-fou étendu aux fichiers analytics (régression #644)
  // Le diviseur 2880 était aussi présent dans analytics.controller.ts,
  // analytics-dashboard.controller.ts et analytics.repository.ts.
  // Ces guards empêchent la réintroduction silencieuse du bug.
  // ---------------------------------------------------------------------
  describe('analytics files — no bogus 2880 divisor (issue #655)', () => {
    it('analytics.controller.ts uses connection_events for getClubHealth (not / 2880)', () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'controllers/analytics.controller.ts'),
        'utf8'
      );
      expect(src).not.toMatch(/\/\s*2880/);
      expect(src).toMatch(/connectionEventsRepository\.getUptimeStats/);
    });

    it('analytics.controller.ts uses getDailyUptimeStats for getClubAvailability (not heartbeats * 0.5)', () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'controllers/analytics.controller.ts'),
        'utf8'
      );
      // L'ancienne formule multipliait heartbeats × 0.5 (= 30s) puis divisait par 1440.
      expect(src).not.toMatch(/heartbeats\s*\*\s*0\.5/);
      expect(src).toMatch(/getDailyUptimeStats/);
    });

    it('analytics-dashboard.controller.ts does not divide by 2880', () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'controllers/analytics-dashboard.controller.ts'),
        'utf8'
      );
      expect(src).not.toMatch(/\/\s*2880/);
    });

    it('analytics.repository.ts does not divide by 2880', () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'repositories/analytics.repository.ts'),
        'utf8'
      );
      expect(src).not.toMatch(/\/\s*2880/);
    });

    it('connection-events.repository.ts exposes getDailyUptimeStats', () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'repositories/connection-events.repository.ts'),
        'utf8'
      );
      expect(src).toMatch(/async getDailyUptimeStats\(/);
    });
  });

  // ---------------------------------------------------------------------
  // ADR-099 follow-up — CRON de purge connection_events (90j par défaut).
  // Sans purge, la table grossirait sans cap. Le smoke ci-dessous gèle :
  // - Le task module + son enregistrement dans le dispatch
  // - L'extension de check_task_type dans la migration seed
  // - L'ajout du task type dans CronTaskType
  // - La métrique Prometheus `recordConnectionEventsPurge`
  // ---------------------------------------------------------------------
  describe('CRON purge follow-up', () => {
    it('connection-events-purge task module exists with executor', () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'cron-tasks/connection-events-purge.task.ts'),
        'utf8'
      );
      expect(src).toMatch(/export async function executeConnectionEventsPurgeTask/);
      expect(src).toMatch(/connectionEventsRepository\.purgeOlderThan/);
      expect(src).toMatch(/metricsService\.recordConnectionEventsPurge/);
    });

    it('CronTaskType union contains connection_events_purge', () => {
      const types = fs.readFileSync(
        path.join(ROOT, 'cron-tasks/types.ts'),
        'utf8'
      );
      expect(types).toMatch(/'connection_events_purge'/);
    });

    it('cron-scheduler dispatch wires the executor', () => {
      const scheduler = fs.readFileSync(
        path.join(ROOT, 'services/cron-scheduler.service.ts'),
        'utf8'
      );
      expect(scheduler).toMatch(/executeConnectionEventsPurgeTask/);
      expect(scheduler).toMatch(/connection_events_purge:\s*executeConnectionEventsPurgeTask/);
    });

    it('seed migration extends check_task_type and inserts a default schedule', () => {
      const seed = fs.readFileSync(
        path.join(ROOT, 'scripts/migrations/add-connection-events-purge-cron.sql'),
        'utf8'
      );
      expect(seed).toMatch(/check_task_type/);
      expect(seed).toMatch(/'connection_events_purge'/);
      expect(seed).toMatch(/INSERT INTO recurring_schedules/);
      expect(seed).toMatch(/retentionDays/);
    });

    it('full-schema CHECK constraint includes connection_events_purge', () => {
      const schema = fs.readFileSync(path.join(ROOT, 'scripts/full-schema.sql'), 'utf8');
      expect(schema).toMatch(/connection_events_purge/);
    });

    it('metricsService exposes recordConnectionEventsPurge counter+gauge', () => {
      const metrics = fs.readFileSync(path.join(ROOT, 'services/metrics.service.ts'), 'utf8');
      expect(metrics).toMatch(/recordConnectionEventsPurge\s*\(/);
      expect(metrics).toMatch(/neopro_connection_events_purged_total/);
      expect(metrics).toMatch(/neopro_connection_events_rows_current/);
    });
  });
});
