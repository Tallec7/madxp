/**
 * Smoke tests — ADR-103 Phase 1.5a hls.js for HLS livestreams.
 *
 * Phase 1.5a unblocks livestream playback on Chromium kiosk (Pi) and any
 * non-Safari browser by lazy-loading hls.js when the source is `.m3u8`
 * AND the platform lacks native HLS support.
 *
 * Decisions :
 *   - Dynamic `import('hls.js')` keeps the ~500KB lib OUT of the main
 *     bundle. A site that never plays a livestream never downloads it.
 *   - The hls instance is owned by WebContentService (`_hlsInstance`)
 *     and destroyed on teardown + via the livestream cleanup closure.
 *   - On hls.js fatal error → failAndReturn (skip step, advance loop).
 *   - On dynamic-import failure → failAndReturn (defensive).
 *
 * Phase 1.5b (master/slave sync of web/live state) is a separate PR.
 *
 * File-level invariants only.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Smoke — ADR-103 Phase 1.5a hls.js', () => {
  it('package.json — declares hls.js as a runtime dependency', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies && pkg.dependencies['hls.js']).toBeDefined();
  });

  it('web-content.service.ts — branches on .m3u8 + native HLS support before attaching hls.js', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    expect(/canPlayType\(['"]application\/vnd\.apple\.mpegurl['"]\)/.test(src)).toBe(true);
    expect(/\\\.m3u8/.test(src)).toBe(true);
    expect(/attachHlsAndPlay/.test(src)).toBe(true);
    expect(/ADR-103 Phase 1\.5/.test(src)).toBe(true);
  });

  it('web-content.service.ts — attachHlsAndPlay uses dynamic import of hls.js (lazy-load)', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const fnIdx = src.indexOf('private async attachHlsAndPlay');
    expect(fnIdx).toBeGreaterThan(0);
    const block = src.slice(fnIdx, fnIdx + 3500);
    expect(/await import\(['"]hls\.js['"]\)/.test(block)).toBe(true);
    // Defensive: re-check `_isActive` and player identity after the import
    // resolves (caller may have torn down between import start and now).
    expect(/this\._isActive/.test(block)).toBe(true);
    expect(/this\._livestreamPlayer/.test(block)).toBe(true);
  });

  it('web-content.service.ts — hls.js fatal errors and import failures route to failAndReturn', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    expect(/failAndReturn\(['"]hls\.js dynamic import failed['"]\)/.test(src)).toBe(true);
    expect(/failAndReturn\(['"]hls\.js not supported['"]\)/.test(src)).toBe(true);
    expect(/failAndReturn\(['"]hls\.js fatal error['"]\)/.test(src)).toBe(true);
  });

  it('web-content.service.ts — _hlsInstance is created, destroyed in teardown + cleanup closure', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    expect(/private _hlsInstance:.*null/.test(src)).toBe(true);
    // Destroy in teardown (defensive)
    const teardownIdx = src.indexOf('private teardown()');
    expect(teardownIdx).toBeGreaterThan(0);
    const teardownBlock = src.slice(teardownIdx, teardownIdx + 1200);
    expect(/this\._hlsInstance[\s\S]{0,200}destroy\(\)/.test(teardownBlock)).toBe(true);
    // Destroy in livestream cleanup closure (so attaching a new livestream
    // mid-flight after a previous play also resets hls cleanly).
    const liveIdx = src.indexOf('this._livestreamCleanup = () =>');
    expect(liveIdx).toBeGreaterThan(0);
    const liveBlock = src.slice(liveIdx, liveIdx + 800);
    expect(/this\._hlsInstance[\s\S]{0,200}destroy\(\)/.test(liveBlock)).toBe(true);
  });
});
