/**
 * Smoke tests — ADR-103 Phase 0.5 server-side guards.
 *
 * Phase 0 added TV-side defensive filters in video-playback.service.ts and
 * manual-video.service.ts that check `path` against the synthetic
 * web_page-<ts> / livestream-<ts> regex. After deployment (v3.266.1) the
 * regression came back: SaaS controller's `resolveVideoUrls()` rewrites
 * `path` into a JWT stream URL BEFORE the TV runs its filter, so the
 * synthetic filename is hidden inside the token and the regex never matches.
 *
 * Phase 0.5 fixes the blind spot at the source: strip synthetic entries
 * server-side BEFORE resolveVideoUrls + reject saves that would re-introduce
 * them.
 *
 * File-level reads only (no app bootstrap).
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(repoRoot, rel));

describe('Smoke — ADR-103 Phase 0.5 server-side guards', () => {
  // ------------ shared utility ------------

  it('strip-synthetic-web-content.ts — utility exists with expected exports', () => {
    expect(exists('central-server/src/utils/strip-synthetic-web-content.ts')).toBe(true);
    const src = read('central-server/src/utils/strip-synthetic-web-content.ts');
    expect(/export function isSyntheticWebContentPath/.test(src)).toBe(true);
    expect(/export function stripSyntheticWebContent/.test(src)).toBe(true);
    expect(/web_page\|livestream/.test(src)).toBe(true);
    expect(/ADR-103 Phase 0\.5/.test(src)).toBe(true);
  });

  it('strip-synthetic-web-content.ts — covers sponsors, timeCategories.loopVideos, categories.videos (recursive)', () => {
    const src = read('central-server/src/utils/strip-synthetic-web-content.ts');
    expect(/sponsors/.test(src)).toBe(true);
    expect(/timeCategories/.test(src)).toBe(true);
    expect(/loopVideos/.test(src)).toBe(true);
    expect(/categories/.test(src)).toBe(true);
    expect(/subCategories/.test(src)).toBe(true);
  });

  // ------------ saas.controller ------------

  it('saas.controller — strips synthetic entries before resolveVideoUrls in BOTH endpoints', () => {
    const src = read('central-server/src/controllers/saas.controller.ts');
    expect(/from '\.\.\/utils\/strip-synthetic-web-content'/.test(src)).toBe(true);
    const stripCallCount = (src.match(/stripSyntheticWebContent\(/g) || []).length;
    // getSaasConfig + getSaasProfileConfig
    expect(stripCallCount).toBeGreaterThanOrEqual(2);
    // Strip MUST happen before resolveVideoUrls (otherwise path becomes a JWT URL)
    const stripIdx = src.indexOf('stripSyntheticWebContent(');
    const resolveIdx = src.indexOf('resolveVideoUrls(', stripIdx);
    expect(stripIdx).toBeGreaterThan(0);
    expect(resolveIdx).toBeGreaterThan(stripIdx);
  });

  // ------------ remote.controller ------------

  it('remote.controller — strips synthetic entries before serving config to Remote', () => {
    const src = read('central-server/src/controllers/remote.controller.ts');
    expect(/from '\.\.\/utils\/strip-synthetic-web-content'/.test(src)).toBe(true);
    expect(/stripSyntheticWebContent\(/.test(src)).toBe(true);
    // Strip happens inside the PIN-gated block (before injectWebContentCategory[Ex])
    const stripIdx = src.indexOf('stripSyntheticWebContent(');
    const injectIdx = src.search(/injectWebContentCategory(?:Ex)?\(/);
    expect(stripIdx).toBeGreaterThan(0);
    expect(injectIdx).toBeGreaterThan(stripIdx);
  });

  // ------------ config-profiles.controller ------------

  // ------------ config-profiles.controller — Phase 2 lifted the 400 reject ------------

  it('config-profiles.controller — Phase 2 ACCEPTS synthetic paths on save (resolved at read)', () => {
    const src = read('central-server/src/controllers/config-profiles.controller.ts');
    // The helper is still imported (used as type/legacy) but no longer enforces 400
    expect(/from '\.\.\/utils\/strip-synthetic-web-content'/.test(src)).toBe(true);
    // ADR-103 Phase 2 marker — the comment that documents why the reject was lifted
    expect(/ADR-103 Phase 2/.test(src)).toBe(true);
    // The reject helper exists but is NOT called at the entry of mutating endpoints
    const callsInEndpoints = (src.match(/^\s+if \(rejectIfSyntheticWebContent/gm) || []).length;
    expect(callsInEndpoints).toBe(0);
  });

  // ------------ config-history.controller — Phase 2 lifted the 400 reject ------------

  it('config-history.controller — Phase 2 ACCEPTS synthetic paths on saveConfigDirect', () => {
    const src = read('central-server/src/controllers/config-history.controller.ts');
    // ADR-103 Phase 2 marker
    expect(/ADR-103 Phase 2/.test(src)).toBe(true);
    // No active 400 reject for SYNTHETIC_WEB_CONTENT_PATH_FORBIDDEN
    expect(/return res\.status\(400\)[^\n]*SYNTHETIC_WEB_CONTENT_PATH_FORBIDDEN/.test(src)).toBe(false);
  });
});
