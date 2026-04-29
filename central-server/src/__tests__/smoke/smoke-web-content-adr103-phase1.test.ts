/**
 * Smoke tests — ADR-103 Phase 1 WebContentPlayer manual robustness.
 *
 * Phase 0/0.5/0.6 made the system stable + visible. Phase 1 makes manual
 * playback ROBUST: 1s load timeout, skip on iframe/livestream errors,
 * analytics tracking. File-level invariants only.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(repoRoot, rel));

describe('Smoke — ADR-103 Phase 1 WebContentPlayer', () => {
  // ------------ web-content.service.ts ------------

  it('web-content.service.ts — exposes LOAD_TIMEOUT_MS = 1000', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    expect(/LOAD_TIMEOUT_MS\s*=\s*1000/.test(src)).toBe(true);
    expect(/ADR-103 Phase 1/.test(src)).toBe(true);
  });

  it('web-content.service.ts — showWebPage attaches load+error listeners BEFORE setting src', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const showStart = src.indexOf('showWebPage(payload: WebPagePayload)');
    expect(showStart).toBeGreaterThan(0);
    const block = src.slice(showStart, showStart + 4000);
    const addLoadIdx = block.indexOf("addEventListener('load'");
    const setSrcIdx = block.indexOf('iframe.src = payload.url');
    expect(addLoadIdx).toBeGreaterThan(0);
    expect(setSrcIdx).toBeGreaterThan(0);
    expect(addLoadIdx).toBeLessThan(setSrcIdx);
  });

  it('web-content.service.ts — showWebPage schedules 1s skip via failAndReturn', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const showStart = src.indexOf('showWebPage(payload: WebPagePayload)');
    const block = src.slice(showStart, showStart + 4000);
    expect(/setTimeout\(\(\) => \{[\s\S]+failAndReturn\('iframe load timeout'\)/.test(block)).toBe(true);
    expect(/_loadTimeoutTimer\s*=\s*setTimeout/.test(block)).toBe(true);
  });

  it('web-content.service.ts — showWebPage starts auto-close timer ONLY after load fires', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const onLoadStart = src.indexOf('const onLoad =');
    expect(onLoadStart).toBeGreaterThan(0);
    // Phase 2.5 grew the onLoad body (REVEAL_DELAY wrapper) — bump window.
    const onLoadBlock = src.slice(onLoadStart, onLoadStart + 1500);
    expect(/_autoCloseTimer\s*=\s*setTimeout/.test(onLoadBlock)).toBe(true);
    expect(/clearLoadTimeout/.test(onLoadBlock)).toBe(true);
  });

  it('web-content.service.ts — showLivestream uses loadeddata + 1s timeout', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const liveStart = src.indexOf('showLivestream(payload: LivestreamPayload)');
    expect(liveStart).toBeGreaterThan(0);
    const block = src.slice(liveStart, liveStart + 4000);
    expect(/addEventListener\('loadeddata'/.test(block)).toBe(true);
    expect(/failAndReturn\('livestream load timeout'\)/.test(block)).toBe(true);
    expect(/failAndReturn\('livestream play rejected'\)/.test(block)).toBe(true);
  });

  it('web-content.service.ts — failAndReturn records analytics interruption_reason=web_load_failed', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const failStart = src.indexOf('private failAndReturn(');
    expect(failStart).toBeGreaterThan(0);
    const block = src.slice(failStart, failStart + 600);
    expect(/endAnalytics\(false,\s*'web_load_failed'\)/.test(block)).toBe(true);
  });

  it('web-content.service.ts — prepareShow tracks video start with contentType + manual trigger', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const prepStart = src.indexOf('private prepareShow(');
    expect(prepStart).toBeGreaterThan(0);
    const block = src.slice(prepStart, prepStart + 1500);
    expect(/contentType/.test(block)).toBe(true);
    expect(/externalUrl/.test(block)).toBe(true);
    expect(/trackVideoStart\(this\._currentAnalyticsVideo,\s*'manual'\)/.test(block)).toBe(true);
  });

  // ------------ analytics.service.ts ------------

  it('analytics.service.ts — interruption_reason union accepts web_load_failed', () => {
    const src = read('raspberry/src/app/services/analytics.service.ts');
    expect(/'web_load_failed'/.test(src)).toBe(true);
    expect(/ADR-103 Phase 1/.test(src)).toBe(true);
  });

  // ------------ Remote V1 dispatch ------------

  it('remote.component.ts — livestream dispatch passes durationMs and name', () => {
    const src = read('raspberry/src/app/components/remote/remote.component.ts');
    const liveBlock = src.slice(src.indexOf("video.contentType === 'livestream'"));
    expect(liveBlock.length).toBeGreaterThan(0);
    const sliced = liveBlock.slice(0, 800);
    expect(/durationMs/.test(sliced)).toBe(true);
    expect(/name:\s*video\.name/.test(sliced)).toBe(true);
  });

  it('remote.component.ts — web_page dispatch passes durationMs and name', () => {
    const src = read('raspberry/src/app/components/remote/remote.component.ts');
    const webBlock = src.slice(src.indexOf("video.contentType === 'web_page'"));
    const sliced = webBlock.slice(0, 800);
    expect(/durationMs/.test(sliced)).toBe(true);
    expect(/name:\s*video\.name/.test(sliced)).toBe(true);
  });

  // ------------ Spec doc ------------

  it('docs/specs/features/web-live-content.spec.md — exists and references Phase 1', () => {
    expect(exists('docs/specs/features/web-live-content.spec.md')).toBe(true);
    const spec = read('docs/specs/features/web-live-content.spec.md');
    expect(/Phase 1/.test(spec)).toBe(true);
    expect(/LOAD_TIMEOUT_MS/.test(spec)).toBe(true);
    expect(/web_load_failed/.test(spec)).toBe(true);
  });

  // ------------ ADR-103 deferred items ------------

  it('ADR-103 — Twitch/YouTube and offline cache flagged as deferred (per Daisy 2026-04-29)', () => {
    const adr = read('docs/adr/ADR-103-web-and-livestream-content-in-playback-loops.md');
    expect(/Twitch/.test(adr)).toBe(true);
    expect(/Cache offline/.test(adr)).toBe(true);
    // Phase phasing reflects shipped status
    expect(/Phase 0\.5/.test(adr)).toBe(true);
    expect(/Phase 0\.6/.test(adr)).toBe(true);
  });
});
