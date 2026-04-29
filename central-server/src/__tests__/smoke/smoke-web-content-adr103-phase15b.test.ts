/**
 * Smoke tests — ADR-103 Phase 1.5b master/slave sync of web/live content.
 *
 * On a Pi with two HDMI outputs, the primary instance is the master and
 * each secondary output is a slave. The master emits `tv-loop-state` to
 * keep the slave display in lockstep. Pre-Phase 1.5b, that state was
 * MP4-only — when the master entered a web/live loop step (Phase 2b),
 * the slave kept playing the MP4 underneath instead of mirroring the
 * iframe / livestream.
 *
 * Phase 1.5b extends `LoopState` with `currentContentType`,
 * `currentExternalUrl`, `currentDurationMs`, `currentName`. The master
 * populates them when emitting; the slave's `handleMasterLoopState`
 * branches on `currentContentType` and routes to
 * `WebContentService.playInLoop` (with a no-op onComplete — the master
 * drives loop advancement).
 *
 * File-level invariants only.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Smoke — ADR-103 Phase 1.5b master/slave sync', () => {
  it('socket.service.ts — LoopState extended with content_type fields', () => {
    const src = read('raspberry/src/app/services/socket.service.ts');
    expect(/currentContentType\?:.*['"]video['"].*['"]web_page['"].*['"]livestream['"]/.test(src)).toBe(true);
    expect(/currentExternalUrl\?:/.test(src)).toBe(true);
    expect(/currentDurationMs\?:/.test(src)).toBe(true);
    expect(/currentName\?:/.test(src)).toBe(true);
    expect(/ADR-103 Phase 1\.5b/.test(src)).toBe(true);
  });

  it('tv-sync.service.ts — emitLoopState accepts and forwards webContent payload', () => {
    const src = read('raspberry/src/app/services/tv-sync.service.ts');
    expect(/webContent\?:.*contentType.*externalUrl/.test(src)).toBe(true);
    expect(/currentContentType:\s*webContent\?\.contentType/.test(src)).toBe(true);
    expect(/currentExternalUrl:\s*webContent\?\.externalUrl/.test(src)).toBe(true);
    expect(/currentDurationMs:\s*webContent\?\.durationMs/.test(src)).toBe(true);
  });

  it('tv-sync.service.ts — slave handler routes web/live to webContentService.playInLoop', () => {
    const src = read('raspberry/src/app/services/tv-sync.service.ts');
    expect(/from '\.\/web-content\.service'/.test(src)).toBe(true);
    expect(/this\.webContentService\.playInLoop\(/.test(src)).toBe(true);
    expect(/_slaveCurrentContentType/.test(src)).toBe(true);
    expect(/_slaveCurrentExternalUrl/.test(src)).toBe(true);
    // Slave passes a no-op onComplete (master drives advancement)
    expect(/master drives advancement/.test(src)).toBe(true);
  });

  it('tv-sync.service.ts — slave detects same-entry ticks and short-circuits to avoid reload flashes', () => {
    const src = read('raspberry/src/app/services/tv-sync.service.ts');
    expect(/sameAsCurrent/.test(src)).toBe(true);
    // Same-entry comparison checks both contentType AND externalUrl
    const handlerStart = src.indexOf('private handleMasterLoopState');
    const block = src.slice(handlerStart, handlerStart + 4000);
    expect(/_slaveCurrentContentType\s*===\s*masterContentType/.test(block)).toBe(true);
    expect(/_slaveCurrentExternalUrl\s*===\s*masterExternalUrl/.test(block)).toBe(true);
  });

  it('tv-sync.service.ts — slave tears down web/live when master returns to MP4', () => {
    const src = read('raspberry/src/app/services/tv-sync.service.ts');
    expect(/master left web\/live step/.test(src)).toBe(true);
    expect(/this\.webContentService\.returnToLoop\(/.test(src)).toBe(true);
  });

  it('tv-sync.service.ts — race-condition guard ignores stale MP4 state within 2s of content-type change', () => {
    const src = read('raspberry/src/app/services/tv-sync.service.ts');
    expect(/_lastContentTypeChangeAt/.test(src)).toBe(true);
    expect(/msSinceContentTypeChange < 2000/.test(src)).toBe(true);
    // The guard increments the staleLoopStateCount metric (same as ADR-033)
    const guardIdx = src.indexOf('msSinceContentTypeChange');
    const block = src.slice(guardIdx, guardIdx + 600);
    expect(/staleLoopStateCount\+\+/.test(block)).toBe(true);
  });

  it('tv.component.ts — master emits webContent payload when dispatching web/live step', () => {
    const src = read('raspberry/src/app/components/tv/tv.component.ts');
    expect(/playWebContentInLoop:\s*\(entry,\s*onComplete\)\s*=>\s*{/.test(src)).toBe(true);
    // Master-only emit path
    const idx = src.indexOf('playWebContentInLoop:');
    const block = src.slice(idx, idx + 1500);
    expect(/this\.tvSyncService\.tvRole\s*===\s*['"]master['"]/.test(block)).toBe(true);
    expect(/this\.tvSyncService\.emitLoopState\(/.test(block)).toBe(true);
    expect(/contentType:.*livestream.*web_page/.test(block)).toBe(true);
  });
});
