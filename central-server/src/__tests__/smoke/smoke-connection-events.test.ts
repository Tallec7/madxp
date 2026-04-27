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
});
