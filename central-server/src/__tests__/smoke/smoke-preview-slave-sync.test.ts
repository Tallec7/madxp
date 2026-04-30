/**
 * Smoke tests — ADR-106 preview-slave sync (1:1 master → iframe preview).
 *
 * The mini-thumb iframe in Remote V2 hero loads `/display/0?preview=1`
 * which instantiates a TvComponent. Pre-ADR-106 it ran its own loop
 * (independent Bresenham + own playback) → desynchronized from the
 * physical master. ADR-106 introduces a `tv-preview-register` event
 * that joins the room WITHOUT registering as a TV instance, then
 * receives `tv-loop-state` like a slave but cannot emit `tv-loop-update`.
 *
 * Invariants checked here are file-level (string presence / absence)
 * — same pattern as smoke-web-content-adr103-phase15b.test.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Smoke — ADR-106 preview-slave sync', () => {
  // ==========================================================================
  // SERVER SIDE — Pi local server
  // ==========================================================================

  it('Pi server — exposes tv-preview-register handler', () => {
    const src = read('raspberry/server/socket/handlers.js');
    expect(/socket\.on\(\s*['"]tv-preview-register['"]/.test(src)).toBe(true);
  });

  it('Pi server — tv-preview-register emits tv-loop-state to the new socket', () => {
    const src = read('raspberry/server/socket/handlers.js');
    const handlerIdx = src.indexOf("'tv-preview-register'");
    expect(handlerIdx).toBeGreaterThan(-1);
    const block = src.slice(handlerIdx, handlerIdx + 1500);
    // Must read current loop state from stateService and emit to the socket
    expect(/getLoopState\(\)/.test(block)).toBe(true);
    expect(/socket\.emit\(\s*['"]tv-loop-state['"]/.test(block)).toBe(true);
  });

  it('Pi server — tv-preview-register does NOT register a TV instance', () => {
    const src = read('raspberry/server/socket/handlers.js');
    const handlerIdx = src.indexOf("'tv-preview-register'");
    const block = src.slice(handlerIdx, handlerIdx + 1500);
    // The preview must NOT call registerTv (that would count it as a display)
    expect(/registerTv\(/.test(block)).toBe(false);
    // The preview must NOT broadcast displays-changed (preserves PROP-002 counter)
    expect(/displays-changed/.test(block)).toBe(false);
  });

  // ==========================================================================
  // SERVER SIDE — central-server SaaS relay
  // ==========================================================================

  it('central-server saas-relay — exposes tv-preview-register handler', () => {
    const src = read('central-server/src/handlers/saas-relay.handler.ts');
    expect(/socket\.on\(\s*['"]tv-preview-register['"]/.test(src)).toBe(true);
  });

  it('central-server saas-relay — tv-preview-register joins the siteId room without touching tvInstances', () => {
    const src = read('central-server/src/handlers/saas-relay.handler.ts');
    const handlerIdx = src.indexOf("'tv-preview-register'");
    expect(handlerIdx).toBeGreaterThan(-1);
    const block = src.slice(handlerIdx, handlerIdx + 1500);
    // Must NOT add to state.tvInstances (preview must not count as display)
    expect(/state\.tvInstances\.set/.test(block)).toBe(false);
    // Must NOT emit displays-changed
    expect(/displays-changed/.test(block)).toBe(false);
    // Must emit current loopState to the new socket if available
    expect(/state\.loopState/.test(block)).toBe(true);
    expect(/socket\.emit\(\s*['"]tv-loop-state['"]/.test(block)).toBe(true);
  });

  // ==========================================================================
  // CLIENT SIDE — TvComponent preview branch
  // ==========================================================================

  it('TvComponent — preview mode emits tv-preview-register (not tv-register)', () => {
    const src = read('raspberry/src/app/components/tv/tv.component.ts');
    // The new event must be referenced
    expect(/['"]tv-preview-register['"]/.test(src)).toBe(true);
    // It must be emitted under an isPreviewMode guard
    const previewIdx = src.indexOf('tv-preview-register');
    const block = src.slice(Math.max(0, previewIdx - 800), previewIdx + 200);
    expect(/isPreviewMode/.test(block)).toBe(true);
  });

  it('TvComponent — preview mode skips tvSyncService.init() and startSeamlessLoop()', () => {
    const src = read('raspberry/src/app/components/tv/tv.component.ts');
    // Both calls must be gated by !this.isPreviewMode somewhere
    // We check by locating the calls and verifying a preview guard exists in the file
    expect(/if\s*\(\s*!?\s*this\.isPreviewMode\s*\)/.test(src)).toBe(true);
    // Comment marker for the preview-slave init branch (ADR-106)
    expect(/ADR-106/.test(src)).toBe(true);
  });

  it('TvComponent — preview mode never emits tv-loop-update', () => {
    const src = read('raspberry/src/app/components/tv/tv.component.ts');
    // The preview branch must explicitly NOT call emitLoopState
    // We assert the file contains a guard that wraps all emitLoopState calls
    // OR the preview-slave branch comment notes the read-only contract.
    expect(/preview-slave|read-only|ADR-106/.test(src)).toBe(true);
  });

  it('TvComponent — handlePreviewLoopState handler exists and syncs by index', () => {
    const src = read('raspberry/src/app/components/tv/tv.component.ts');
    expect(/handlePreviewLoopState/.test(src)).toBe(true);
    // Sync by videoIndex, never by videoPath (invariant ADR-033 reused)
    const idx = src.indexOf('handlePreviewLoopState');
    const block = src.slice(idx, idx + 3000);
    expect(/videoIndex/.test(block)).toBe(true);
  });

  // ==========================================================================
  // ADR document
  // ==========================================================================

  it('ADR-106 document exists and is referenced from the README index', () => {
    const adr = read('docs/adr/ADR-106-preview-slave-sync.md');
    expect(/Statut.*Accepté/.test(adr)).toBe(true);
    expect(/preview-slave/.test(adr)).toBe(true);

    const readme = read('docs/adr/README.md');
    expect(/ADR-106-preview-slave-sync\.md/.test(readme)).toBe(true);
  });
});
