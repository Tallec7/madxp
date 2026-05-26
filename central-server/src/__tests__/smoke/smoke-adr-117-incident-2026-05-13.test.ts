/**
 * Smoke tests — ADR-117 auto-deploy hardening (incident NLF 2026-05-13)
 *
 * Garde-fou contre la régression de l'incident 2026-05-13 :
 * - 34 deploys sériés en 2min30s vers NLF (KBC profile, masters + secondary
 *   variants × 17 vidéos) ont fait spiker le CPU du Pi de 0.9% → 8.8% puis
 *   crasher `neopro-app` à 06:45:11 UTC.
 * - Le throttle initial (MAX_AUTO_DEPLOY=10 PAR APPEL) ne couvrait pas le cumul :
 *   appels rapprochés (deployProfile + N×updateProfileConfiguration) ×
 *   amplification master+secondary = storm.
 *
 * Le fix introduit :
 *   1. Un cap global "in-flight per site" via deploymentRepository.countActivePerSite()
 *   2. Une réduction MAX_AUTO_DEPLOY 10 → 5
 *   3. Une sérialisation des deploys (INTER_DEPLOY_DELAY_MS)
 *   4. Un re-check mid-loop pour break si la cap est atteinte en cours de batch
 *   5. Une métrique Prometheus madxp_auto_deploy_throttled_total{reason}
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SERVICE = path.join(ROOT, 'services/deployment.service.ts');
const REPO = path.join(ROOT, 'repositories/deployment.repository.ts');
const METRICS = path.join(ROOT, 'services/metrics.service.ts');

describe('ADR-117 — auto-deploy hardening NLF 2026-05-13 (smoke)', () => {
  const svc = fs.readFileSync(SERVICE, 'utf8');
  const repo = fs.readFileSync(REPO, 'utf8');
  const metrics = fs.readFileSync(METRICS, 'utf8');

  describe('deployment.repository.ts', () => {
    it('exposes countActivePerSite(siteId) — base du cap global', () => {
      expect(repo).toMatch(/async\s+countActivePerSite\s*\(\s*siteId:\s*string\s*\)/);
    });

    it('countActivePerSite ne compte QUE pending + in_progress (pas completed)', () => {
      const match = repo.match(/countActivePerSite[\s\S]*?status\s+IN\s*\(([^)]+)\)/);
      expect(match).not.toBeNull();
      const statuses = match![1];
      expect(statuses).toMatch(/'pending'/);
      expect(statuses).toMatch(/'in_progress'/);
      expect(statuses).not.toMatch(/'completed'/);
      expect(statuses).not.toMatch(/'failed'/);
    });
  });

  describe('deployment.service.ts — triggerMissingVideoDeployments', () => {
    it('déclare MAX_IN_FLIGHT_PER_SITE et MAX_AUTO_DEPLOY ≤ 5', () => {
      const max = svc.match(/const\s+MAX_AUTO_DEPLOY\s*=\s*(\d+)/);
      const cap = svc.match(/const\s+MAX_IN_FLIGHT_PER_SITE\s*=\s*(\d+)/);
      expect(max).not.toBeNull();
      expect(cap).not.toBeNull();
      expect(parseInt(max![1], 10)).toBeLessThanOrEqual(5);
      expect(parseInt(cap![1], 10)).toBeLessThanOrEqual(10);
    });

    it('déclare INTER_DEPLOY_DELAY_MS ≥ 1000 (sérialisation pour épargner le Pi)', () => {
      const delay = svc.match(/const\s+INTER_DEPLOY_DELAY_MS\s*=\s*(\d+)/);
      expect(delay).not.toBeNull();
      expect(parseInt(delay![1], 10)).toBeGreaterThanOrEqual(1000);
    });

    it('appelle countActivePerSite dans triggerMissingVideoDeployments', () => {
      // 2 call sites attendus : 1 pre-batch + 1 mid-loop re-check
      const matches = svc.match(/deploymentRepository\.countActivePerSite\(siteId\)/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });

    it('break la boucle si la cap est atteinte mid-batch', () => {
      expect(svc).toMatch(/in-flight cap reached mid-loop/);
      const breakIdx = svc.search(/in-flight cap reached mid-loop[\s\S]{0,500}break;/);
      expect(breakIdx).toBeGreaterThan(-1);
    });

    it('await setTimeout entre chaque deploy (sérialisation)', () => {
      expect(svc).toMatch(/await\s+new\s+Promise\([\s\S]{0,200}setTimeout\([\s\S]{0,100}INTER_DEPLOY_DELAY_MS/);
    });

    it('émet la métrique recordAutoDeployThrottled sur les 2 codes de refus', () => {
      expect(svc).toMatch(/recordAutoDeployThrottled\(siteId,\s*['"]in_flight_cap['"]\)/);
      expect(svc).toMatch(/recordAutoDeployThrottled\(siteId,\s*['"]in_flight_cap_midloop['"]\)/);
    });
  });

  describe('metrics.service.ts', () => {
    it('expose le Counter madxp_auto_deploy_throttled_total', () => {
      expect(metrics).toMatch(/name:\s*['"]madxp_auto_deploy_throttled_total['"]/);
    });

    it('expose recordAutoDeployThrottled(siteId, reason) avec union typée stricte', () => {
      expect(metrics).toMatch(/recordAutoDeployThrottled\s*\(\s*siteId:\s*string\s*,\s*reason:\s*['"]in_flight_cap['"]\s*\|\s*['"]in_flight_cap_midloop['"]/);
    });
  });
});
