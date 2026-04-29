/**
 * Smoke tests — ADR-103 Phase 2b: web/live entries in the playback loop.
 *
 * Phase 2b lifts the Phase 0 filter so the loop accepts web_page /
 * livestream entries with an http(s) URL as path. The orchestrator
 * (`video-playback.service.ts`) routes them via a new
 * `playWebContentInLoop` callback wired to
 * `WebContentService.playInLoop(entry, onComplete)` in the TV
 * component. Auto-close (or load timeout / error) advances the loop
 * to the next step.
 *
 * File-level invariants only.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Smoke — ADR-103 Phase 2b loop rotation with web/live', () => {
  // ------------ video-playback.service.ts ------------

  it('video-playback.service.ts — playlist filter accepts web/live entries with http(s) path', () => {
    const src = read('raspberry/src/app/services/video-playback.service.ts');
    expect(/isPlayableEntry/.test(src)).toBe(true);
    // The filter must accept web_page / livestream entries when path is http(s).
    expect(/contentType.*web_page.*livestream/.test(src)).toBe(true);
    expect(/\^https\?:\\\/\\\//.test(src)).toBe(true);
    // Phase 0 safety net still rejects synthetic filenames.
    expect(/web_page\|livestream/.test(src)).toBe(true);
  });

  it('video-playback.service.ts — exposes dispatchLoopStep + advanceLoop + isWebContentEntry', () => {
    const src = read('raspberry/src/app/services/video-playback.service.ts');
    expect(/private dispatchLoopStep\(/.test(src)).toBe(true);
    expect(/private advanceLoop\(\)/.test(src)).toBe(true);
    expect(/private isWebContentEntry\(/.test(src)).toBe(true);
    expect(/ADR-103 Phase 2b/.test(src)).toBe(true);
  });

  it('video-playback.service.ts — startSeamlessLoop uses dispatchLoopStep instead of direct DoubleBuffer call', () => {
    const src = read('raspberry/src/app/services/video-playback.service.ts');
    const startIdx = src.indexOf('startSeamlessLoop');
    const endIdx = src.indexOf('stopSeamlessLoop');
    expect(startIdx).toBeGreaterThan(0);
    expect(endIdx).toBeGreaterThan(startIdx);
    const block = src.slice(startIdx, endIdx);
    expect(/this\.dispatchLoopStep\(startIndex\)/.test(block)).toBe(true);
    // The previous direct call must NOT exist in startSeamlessLoop body
    // (it lives only in dispatchLoopStep now).
    expect(/this\.doubleBuffer\.playOnActivePlayer\(video\.path, startIndex\)/.test(block)).toBe(false);
  });

  it('video-playback.service.ts — onTimeUpdate skips MP4 preload when next step is web/live', () => {
    const src = read('raspberry/src/app/services/video-playback.service.ts');
    const tuStart = src.indexOf('onTimeUpdate(');
    expect(tuStart).toBeGreaterThan(0);
    const block = src.slice(tuStart, tuStart + 2500);
    expect(/!this\.isWebContentEntry\(nextVideo\)/.test(block)).toBe(true);
  });

  it('video-playback.service.ts — triggerSwitch routes to dispatchLoopStep when next is web/live', () => {
    const src = read('raspberry/src/app/services/video-playback.service.ts');
    const tsStart = src.indexOf('private triggerSwitch()');
    expect(tsStart).toBeGreaterThan(0);
    const block = src.slice(tsStart, tsStart + 2000);
    expect(/this\.isWebContentEntry\(nextVideo\)/.test(block)).toBe(true);
    expect(/this\.dispatchLoopStep\(nextIndex\)/.test(block)).toBe(true);
  });

  it('video-playback.service.ts — onVideoEnded fallback also routes web/live via dispatcher', () => {
    const src = read('raspberry/src/app/services/video-playback.service.ts');
    const oeStart = src.indexOf('onVideoEnded(');
    expect(oeStart).toBeGreaterThan(0);
    const block = src.slice(oeStart, oeStart + 3500);
    expect(/this\.isWebContentEntry\(nextVideo\)/.test(block)).toBe(true);
    expect(/this\.dispatchLoopStep\(nextIndex\)/.test(block)).toBe(true);
  });

  it('video-playback.service.ts — PlaybackCallbacks defines optional playWebContentInLoop', () => {
    const src = read('raspberry/src/app/services/video-playback.service.ts');
    expect(/playWebContentInLoop\?:.*\(entry: Sponsor, onComplete: \(\) => void\) => void/.test(src)).toBe(true);
  });

  // ------------ WebContentService.playInLoop ------------

  it('web-content.service.ts — exposes playInLoop(entry, onComplete) for in-loop playback', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    expect(/playInLoop\(/.test(src)).toBe(true);
    expect(/_loopOnComplete/.test(src)).toBe(true);
    expect(/ADR-103 Phase 2b/.test(src)).toBe(true);
  });

  it('web-content.service.ts — auto-close + failAndReturn invoke onComplete in loop mode', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const returnIdx = src.indexOf('returnToLoop(completed = false)');
    expect(returnIdx).toBeGreaterThan(0);
    const returnBlock = src.slice(returnIdx, returnIdx + 800);
    // returnToLoop branches by _loopOnComplete (loop) vs resumeRotation (manual)
    expect(/_loopOnComplete/.test(returnBlock)).toBe(true);

    const failIdx = src.indexOf('private failAndReturn(');
    expect(failIdx).toBeGreaterThan(0);
    const failBlock = src.slice(failIdx, failIdx + 600);
    expect(/_loopOnComplete/.test(failBlock)).toBe(true);
  });

  it('web-content.service.ts — teardown() clears _loopOnComplete', () => {
    const src = read('raspberry/src/app/services/web-content.service.ts');
    const tdIdx = src.indexOf('private teardown()');
    expect(tdIdx).toBeGreaterThan(0);
    // Phase 1.5a grew the teardown body (hls.js destroy block) — bump window.
    const block = src.slice(tdIdx, tdIdx + 1500);
    expect(/this\._loopOnComplete\s*=\s*null/.test(block)).toBe(true);
  });

  // ------------ TV component wiring ------------

  it('tv.component.ts — playbackService.init wires playWebContentInLoop callback', () => {
    const src = read('raspberry/src/app/components/tv/tv.component.ts');
    expect(/playWebContentInLoop:\s*\(entry,\s*onComplete\)/.test(src)).toBe(true);
    expect(/this\.webContentService\.playInLoop\(entry,\s*onComplete\)/.test(src)).toBe(true);
  });
});
