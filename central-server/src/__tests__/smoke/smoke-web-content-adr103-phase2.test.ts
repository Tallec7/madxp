/**
 * Smoke tests — ADR-103 Phase 2a: backend resolves synthetic web_page /
 * livestream entries at read time so they can play in user categories
 * (manual launch from the Remote) without the dashboard needing to be
 * updated first.
 *
 * Phase 2b (TV boucle integration) is a follow-up PR — it requires
 * delegating loop step playback to WebContentService when contentType !==
 * 'video'. This Phase 2a unblocks the manual flow today.
 *
 * File-level invariants only.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Smoke — ADR-103 Phase 2a backend resolve', () => {
  it('strip-synthetic-web-content.ts — exports collectSyntheticWebContentFilenames + resolveSyntheticWebContent', () => {
    const src = read('central-server/src/utils/strip-synthetic-web-content.ts');
    expect(/export function collectSyntheticWebContentFilenames/.test(src)).toBe(true);
    expect(/export function resolveSyntheticWebContent/.test(src)).toBe(true);
    expect(/ADR-103 Phase 2/.test(src)).toBe(true);
    // The rewriter preserves contentType + externalUrl + durationSeconds
    expect(/contentType:\s*row\.contentType/.test(src)).toBe(true);
    expect(/externalUrl:\s*row\.externalUrl/.test(src)).toBe(true);
    expect(/durationSeconds:\s*row\.durationSeconds/.test(src)).toBe(true);
  });

  it('video.repository.ts — exposes findWebContentByFilenames batch lookup', () => {
    const src = read('central-server/src/repositories/video.repository.ts');
    expect(/async findWebContentByFilenames/.test(src)).toBe(true);
    expect(/content_type IN \('web_page', 'livestream'\)/.test(src)).toBe(true);
    expect(/external_url IS NOT NULL/.test(src)).toBe(true);
  });

  it('saas.controller — calls resolveSyntheticWebContent BEFORE strip in BOTH endpoints', () => {
    const src = read('central-server/src/controllers/saas.controller.ts');
    expect(/from '\.\.\/utils\/strip-synthetic-web-content'/.test(src)).toBe(true);
    expect(/collectSyntheticWebContentFilenames/.test(src)).toBe(true);
    expect(/resolveSyntheticWebContent/.test(src)).toBe(true);
    // Resolve must come BEFORE strip (resolve rewrites, strip drops leftovers)
    const firstResolve = src.indexOf('resolveSyntheticWebContent(');
    const firstStrip = src.indexOf('stripSyntheticWebContent(');
    expect(firstResolve).toBeGreaterThan(0);
    expect(firstStrip).toBeGreaterThan(0);
    expect(firstResolve).toBeLessThan(firstStrip);
    // 2 call sites (getSaasConfig + getSaasProfileConfig)
    const resolveCount = (src.match(/resolveSyntheticWebContent\(/g) || []).length;
    expect(resolveCount).toBeGreaterThanOrEqual(2);
  });

  it('remote.controller — calls resolveSyntheticWebContent BEFORE strip', () => {
    const src = read('central-server/src/controllers/remote.controller.ts');
    expect(/resolveSyntheticWebContent/.test(src)).toBe(true);
    const firstResolve = src.indexOf('resolveSyntheticWebContent(');
    const firstStrip = src.indexOf('stripSyntheticWebContent(');
    expect(firstResolve).toBeGreaterThan(0);
    expect(firstResolve).toBeLessThan(firstStrip);
  });

  it('config-profiles.controller — Phase 2 marker present, no active 400 reject', () => {
    const src = read('central-server/src/controllers/config-profiles.controller.ts');
    expect(/ADR-103 Phase 2/.test(src)).toBe(true);
    // Helper still imported but no longer enforced
    const activeRejects = (src.match(/^\s+if \(rejectIfSyntheticWebContent/gm) || []).length;
    expect(activeRejects).toBe(0);
  });

  it('config-history.controller — Phase 2 marker, no active 400 reject', () => {
    const src = read('central-server/src/controllers/config-history.controller.ts');
    expect(/ADR-103 Phase 2/.test(src)).toBe(true);
    expect(/return res\.status\(400\)[^\n]*SYNTHETIC_WEB_CONTENT_PATH_FORBIDDEN/.test(src)).toBe(false);
  });
});
