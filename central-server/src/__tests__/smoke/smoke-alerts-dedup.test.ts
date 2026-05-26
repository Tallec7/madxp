/**
 * Smoke tests — ADR-111 dedup au niveau alertRepository
 *
 * Garde-fou contre la régression du spam d'alertes (incident 2026-05-05 :
 * 22 688 rows actives sur 3 Pi à cause d'emitters en boucle sans dedup,
 * notamment "Déploiement bloqué" × 16 912 sur RACC, "saas_empty_profile" × 4 405
 * sur NOOR).
 *
 * Vérifie statiquement que :
 * - La migration add-alerts-dedup-columns.sql existe et déclare last_seen_at + occurrences.
 * - full-schema.sql contient les nouvelles colonnes.
 * - alertRepository.create() est un upsert (UPDATE puis INSERT, pas un INSERT brut).
 * - alertingService.createAlert() délègue à alertRepository.create() (pas d'INSERT brut).
 * - metricsService expose recordAlertDedupSkipped + déclare le Counter associé.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

describe('ADR-111 — alerts dedup at repository level (smoke)', () => {
  describe('migration', () => {
    it('add-alerts-dedup-columns.sql declares last_seen_at + occurrences + dedup index', () => {
      const migration = fs.readFileSync(
        path.join(ROOT, 'scripts/migrations/add-alerts-dedup-columns.sql'),
        'utf8'
      );
      expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS last_seen_at/);
      expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS occurrences INTEGER/);
      expect(migration).toMatch(/idx_alerts_dedup_active/);
      expect(migration).toMatch(/WHERE status = 'active'/);
    });

    it('full-schema.sql snapshot includes the new columns', () => {
      const schema = fs.readFileSync(path.join(ROOT, 'scripts/full-schema.sql'), 'utf8');
      expect(schema).toMatch(/last_seen_at timestamp/);
      expect(schema).toMatch(/occurrences integer/);
    });
  });

  describe('alertRepository.create() is an upsert (not a raw INSERT)', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'repositories/alert.repository.ts'),
      'utf8'
    );

    it('attempts UPDATE first to bump occurrences before INSERT', () => {
      // Le UPDATE doit venir AVANT le INSERT dans le source (ordre lexical).
      const updateIdx = src.indexOf('UPDATE alerts');
      const insertIdx = src.indexOf("INSERT INTO alerts");
      expect(updateIdx).toBeGreaterThan(0);
      expect(insertIdx).toBeGreaterThan(updateIdx);
    });

    it('UPDATE bumps last_seen_at + occurrences', () => {
      expect(src).toMatch(/last_seen_at = NOW\(\)/);
      expect(src).toMatch(/occurrences = occurrences \+ 1/);
    });

    it('UPDATE uses IS NOT DISTINCT FROM to handle global alerts (site_id = NULL)', () => {
      expect(src).toMatch(/site_id IS NOT DISTINCT FROM/);
    });

    it('UPDATE filters on status = active (only dedup unresolved alerts)', () => {
      expect(src).toMatch(/status = 'active'/);
    });

    it('records dedup metric when UPDATE matches', () => {
      expect(src).toMatch(/metricsService\.recordAlertDedupSkipped/);
    });
  });

  describe('alertingService.createAlert() delegates to repository (no raw INSERT)', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'services/alerting.service.ts'),
      'utf8'
    );

    it('imports alertRepository', () => {
      expect(src).toMatch(/import \{ alertRepository \} from '\.\.\/repositories\/alert\.repository'/);
    });

    it('createAlert() calls alertRepository.create()', () => {
      const fnStart = src.indexOf('async createAlert(');
      expect(fnStart).toBeGreaterThan(0);
      const fnEnd = src.indexOf('\n  }', fnStart);
      const fnBody = src.slice(fnStart, fnEnd);
      expect(fnBody).toMatch(/alertRepository\.create\(/);
      expect(fnBody).not.toMatch(/INSERT INTO/);
    });
  });

  describe('metrics — alerts_dedup_skipped_total counter', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'services/metrics.service.ts'),
      'utf8'
    );

    it('declares madxp_alerts_dedup_skipped_total Counter', () => {
      expect(src).toMatch(/madxp_alerts_dedup_skipped_total/);
      expect(src).toMatch(/labelNames: \['type'\]/);
    });

    it('exposes recordAlertDedupSkipped(type) method', () => {
      expect(src).toMatch(/recordAlertDedupSkipped\(type: string\)/);
    });
  });
});
