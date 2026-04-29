/**
 * Smoke tests — ADR-103 Phase 4 supervision (Prometheus + alertes).
 *
 * Phase 4 ferme l'ADR avec :
 *   - Counter `neopro_web_content_plays_total{content_type, mode, outcome}`
 *   - Counter `neopro_web_loop_duration_required_blocks_total{endpoint}`
 *   - `web_load_failed` accepté côté server-side validInterruptionReasons
 *     (Phase 1 le générait côté Pi mais le serveur le droppait silencieusement)
 *   - Alertes Prometheus `WebContentLoadFailedSpike` + `WebLoopDurationRequiredBurst`
 *
 * File-level invariants only.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Smoke — ADR-103 Phase 4 supervision', () => {
  // ------------ metrics.service.ts — counter definitions ------------

  it('metrics.service — defines neopro_web_content_plays_total counter', () => {
    const src = read('central-server/src/services/metrics.service.ts');
    expect(/name:\s*'neopro_web_content_plays_total'/.test(src)).toBe(true);
    // Labels: content_type, mode, outcome
    const idx = src.indexOf("name: 'neopro_web_content_plays_total'");
    const block = src.slice(idx, idx + 600);
    expect(/labelNames:\s*\[\s*'content_type',\s*'mode',\s*'outcome'\s*\]/.test(block)).toBe(true);
  });

  it('metrics.service — defines neopro_web_loop_duration_required_blocks_total counter', () => {
    const src = read('central-server/src/services/metrics.service.ts');
    expect(/name:\s*'neopro_web_loop_duration_required_blocks_total'/.test(src)).toBe(true);
    const idx = src.indexOf("name: 'neopro_web_loop_duration_required_blocks_total'");
    const block = src.slice(idx, idx + 400);
    expect(/labelNames:\s*\[\s*'endpoint'\s*\]/.test(block)).toBe(true);
  });

  it('metrics.service — exposes recordWebContentPlay + recordWebLoopDurationRequiredBlock', () => {
    const src = read('central-server/src/services/metrics.service.ts');
    expect(/recordWebContentPlay\(\s*\n?\s*contentType:\s*'web_page'\s*\|\s*'livestream'/.test(src)).toBe(true);
    expect(/recordWebLoopDurationRequiredBlock\(endpoint:\s*'config-profiles'\s*\|\s*'config-history'\)/.test(src)).toBe(true);
  });

  // ------------ wiring: reject sites + analytics ------------

  it('config-profiles.controller — increments duration_required_blocks counter on reject', () => {
    const src = read('central-server/src/controllers/config-profiles.controller.ts');
    expect(/from '\.\.\/services\/metrics\.service'/.test(src)).toBe(true);
    const fnStart = src.indexOf('function rejectIfWebLoopMissingDuration');
    const fnBlock = src.slice(fnStart, fnStart + 800);
    expect(/metricsService\.recordWebLoopDurationRequiredBlock\('config-profiles'\)/.test(fnBlock)).toBe(true);
  });

  it('config-history.controller — increments duration_required_blocks counter on reject', () => {
    const src = read('central-server/src/controllers/config-history.controller.ts');
    expect(/from '\.\.\/services\/metrics\.service'/.test(src)).toBe(true);
    expect(/metricsService\.recordWebLoopDurationRequiredBlock\('config-history'\)/.test(src)).toBe(true);
  });

  it('analytics-ingestion.controller — accepts web_load_failed as a valid interruption_reason', () => {
    const src = read('central-server/src/controllers/analytics-ingestion.controller.ts');
    // The valid list must include 'web_load_failed' — without it, server silently drops it.
    expect(/validInterruptionReasons\s*=\s*\[[^\]]*'web_load_failed'/.test(src)).toBe(true);
  });

  it('analytics-ingestion.controller — increments web_content_plays counter on web_load_failed batch', () => {
    const src = read('central-server/src/controllers/analytics-ingestion.controller.ts');
    expect(/webLoadFailedCount/.test(src)).toBe(true);
    expect(/metricsService\.recordWebContentPlay\([^)]*'load_failed'\s*\)/.test(src)).toBe(true);
  });

  // ------------ Prometheus alert rules ------------

  it('rules.yml — declares WebContentLoadFailedSpike alert', () => {
    const src = read('docker/prometheus/rules.yml');
    expect(/alert:\s*WebContentLoadFailedSpike/.test(src)).toBe(true);
    expect(/neopro_web_content_plays_total\{outcome="load_failed"\}/.test(src)).toBe(true);
  });

  it('rules.yml — declares WebLoopDurationRequiredBurst alert', () => {
    const src = read('docker/prometheus/rules.yml');
    expect(/alert:\s*WebLoopDurationRequiredBurst/.test(src)).toBe(true);
    expect(/neopro_web_loop_duration_required_blocks_total/.test(src)).toBe(true);
  });

  // ------------ ADR closure ------------

  it('ADR-103 — marked as closed (Implémenté & Clôturé)', () => {
    const src = read('docs/adr/ADR-103-web-and-livestream-content-in-playback-loops.md');
    expect(/\*\*Statut\*\*\s*:\s*Implémenté\s*&\s*Clôturé/.test(src)).toBe(true);
    expect(/Clôture\s*\(2026-04-29\s*—\s*Phase 4\)/.test(src)).toBe(true);
  });

  it('web-live-content.spec.md — marked as closed', () => {
    const src = read('docs/specs/features/web-live-content.spec.md');
    expect(/Statut\*\*\s*:\s*✅\s*Clôturé/.test(src)).toBe(true);
  });
});
