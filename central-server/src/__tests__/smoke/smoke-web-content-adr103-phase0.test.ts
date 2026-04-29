/**
 * Smoke tests — ADR-103 Phase 0 defensive guards.
 *
 * Protects against the regression observed on 2026-04-28 (NLF SaaS): a web_page
 * entry that lost its contentType when added via the dashboard video selector
 * landed in `sponsors[]`/`loopVideos[]` with `path = 'web_page-<ts>'`. The TV
 * tried to stream it as MP4 → 404 → MEDIA_ELEMENT_ERROR loop → full system
 * reset every few seconds.
 *
 * File-level reads only (no app bootstrap).
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Smoke — ADR-103 Phase 0 web/livestream defensive guards', () => {
  // ------------ raspberry/src/app/services/video-playback.service.ts ------------

  it('video-playback.service.ts — startSeamlessLoop filters by contentType (Phase 0/2b)', () => {
    const src = read('raspberry/src/app/services/video-playback.service.ts');
    // Phase 0/2b: filter still consults `contentType ?? 'video'`. Phase 0
    // dropped non-video entries; Phase 2b accepts web/live with http(s)
    // URL and routes them via dispatchLoopStep / playWebContentInLoop.
    expect(/v\.contentType\s*\?\?\s*['"]video['"]/.test(src)).toBe(true);
    // Phase 2b: explicit `===` check for `'video'` OR acceptance of
    // web_page / livestream contentType.
    expect(/ct === ['"]video['"]/.test(src)).toBe(true);
    expect(/web_page['"]\s*\|\|\s*ct === ['"]livestream['"]/.test(src)).toBe(true);
  });

  it('video-playback.service.ts — startSeamlessLoop blocks synthetic web_page/livestream paths', () => {
    const src = read('raspberry/src/app/services/video-playback.service.ts');
    // The synthetic-filename regex protects against legacy entries that lost
    // contentType when added via the dashboard. Pattern must match path-only.
    expect(/web_page\|livestream/.test(src)).toBe(true);
    expect(/ADR-103 Phase 0/.test(src)).toBe(true);
  });

  // ------------ raspberry/src/app/services/manual-video.service.ts ------------

  it('manual-video.service.ts — exposes isPlayableVideoEntry helper (ADR-103 Phase 0)', () => {
    const src = read('raspberry/src/app/services/manual-video.service.ts');
    expect(/static\s+isPlayableVideoEntry\s*\(/.test(src)).toBe(true);
    expect(/contentType\s*\?\?\s*['"]video['"]/.test(src)).toBe(true);
    expect(/ADR-103 Phase 0/.test(src)).toBe(true);
  });

  it('manual-video.service.ts — isPlayableVideoEntry blocks synthetic web_page/livestream paths', () => {
    const src = read('raspberry/src/app/services/manual-video.service.ts');
    expect(/web_page\|livestream/.test(src)).toBe(true);
  });

  it('manual-video.service.ts — play() invokes the guard before any side effect', () => {
    const src = read('raspberry/src/app/services/manual-video.service.ts');
    const playStart = src.indexOf('play(video: PiConfigVideoEntry)');
    const playSlice = src.slice(playStart, playStart + 400);
    expect(/isPlayableVideoEntry\(video\)/.test(playSlice)).toBe(true);
  });

  // ------------ central-server cleanup script ------------

  it('cleanup-web-content-in-loops.sql — script exists and is idempotent', () => {
    const sql = read('central-server/src/scripts/cleanup-web-content-in-loops.sql');
    expect(/ADR-103 Phase 0/.test(sql)).toBe(true);
    // Idempotency markers
    expect(/IDEMPOTENT/i.test(sql)).toBe(true);
    // Strips synthetic paths from sponsors AND loopVideos AND categories.videos
    expect(/sponsors/.test(sql)).toBe(true);
    expect(/loopVideos/.test(sql)).toBe(true);
    expect(/categories/.test(sql)).toBe(true);
    expect(/web_page\|livestream/.test(sql)).toBe(true);
  });

  // ------------ ADR document ------------

  it('ADR-103 document exists and is referenced in README', () => {
    const adr = read('docs/adr/ADR-103-web-and-livestream-content-in-playback-loops.md');
    expect(/Phase 0/.test(adr)).toBe(true);
    expect(/Phase 1/.test(adr)).toBe(true);
    expect(/Phase 2/.test(adr)).toBe(true);
    const readme = read('docs/adr/README.md');
    expect(/ADR-103/.test(readme)).toBe(true);
  });
});
