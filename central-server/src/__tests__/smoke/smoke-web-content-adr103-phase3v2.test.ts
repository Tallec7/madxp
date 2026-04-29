/**
 * Smoke tests — ADR-103 Phase 3 v2 proactive dashboard UX.
 *
 * Phase 3 v2 surfaces content-type metadata (web_page / livestream) all the
 * way to the video library:
 *   - the API (`GET /sites/:id/local-content`) returns `contentType` +
 *     `externalUrl` on each cloud video
 *   - the reconciliation service propagates them onto VideoItem
 *   - the library list/grid renders icons (🌐 / 📡) so the user sees at a
 *     glance what kind of content sits in the library
 *   - adding a web/live video to a loop (sponsors[] or
 *     timeCategories[].loopVideos[]) prompts for a display duration
 *     BEFORE save, instead of letting the user discover the
 *     WEB_LOOP_DURATION_REQUIRED 400 only at save time
 *
 * File-level invariants only.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Smoke — ADR-103 Phase 3 v2 proactive dashboard UX', () => {
  // ------------ API: contentType + externalUrl on cloud videos ------------

  it('timeline.repository — getCloudVideos selects content_type + external_url', () => {
    const src = read('central-server/src/repositories/timeline.repository.ts');
    expect(/content_type:\s*'video'\s*\|\s*'web_page'\s*\|\s*'livestream'\s*\|\s*null/.test(src)).toBe(true);
    expect(/external_url:\s*string\s*\|\s*null/.test(src)).toBe(true);
    // SELECT clause includes both columns
    const fnStart = src.indexOf('async getCloudVideos');
    const fnBlock = src.slice(fnStart, fnStart + 1200);
    expect(/v\.content_type/.test(fnBlock)).toBe(true);
    expect(/v\.external_url/.test(fnBlock)).toBe(true);
  });

  it('site-fleet.controller — local-content payload exposes contentType + externalUrl', () => {
    const src = read('central-server/src/controllers/site-fleet.controller.ts');
    // Within the cloudVideoRows.map(...) block
    const mapStart = src.indexOf('const cloudVideos = cloudVideoRows.map');
    expect(mapStart).toBeGreaterThan(-1);
    const mapBlock = src.slice(mapStart, mapStart + 1500);
    expect(/contentType:\s*v\.content_type\s*\?\?\s*'video'/.test(mapBlock)).toBe(true);
    expect(/externalUrl:\s*v\.external_url\s*\?\?\s*null/.test(mapBlock)).toBe(true);
  });

  // ------------ Dashboard model: VideoItem + CloudVideo ------------

  it('CloudVideo model — exposes contentType + externalUrl', () => {
    const src = read('central-dashboard/src/app/core/models/index.ts');
    const ifStart = src.indexOf('export interface CloudVideo');
    const ifBlock = src.slice(ifStart, ifStart + 1000);
    expect(/contentType\?:\s*'video'\s*\|\s*'web_page'\s*\|\s*'livestream'/.test(ifBlock)).toBe(true);
    expect(/externalUrl\?:\s*string\s*\|\s*null/.test(ifBlock)).toBe(true);
  });

  it('VideoItem types — exposes contentType + externalUrl', () => {
    const src = read('central-dashboard/src/app/features/sites/components/video-library/video-library.types.ts');
    expect(/contentType\?:\s*'video'\s*\|\s*'web_page'\s*\|\s*'livestream'/.test(src)).toBe(true);
    expect(/externalUrl\?:\s*string\s*\|\s*null/.test(src)).toBe(true);
  });

  it('reconciliation service — propagates contentType + externalUrl onto VideoItem', () => {
    const src = read('central-dashboard/src/app/features/sites/components/video-library/video-reconciliation.service.ts');
    expect(/contentType:\s*cloud\.contentType\s*\?\?\s*'video'/.test(src)).toBe(true);
    expect(/externalUrl:\s*cloud\.externalUrl\s*\?\?\s*null/.test(src)).toBe(true);
  });

  // ------------ Library list — icons in cards + rows ------------

  it('library utils — exports getContentTypeIcon + getContentTypeLabel', () => {
    const src = read('central-dashboard/src/app/features/sites/components/video-library/video-library.utils.ts');
    expect(/export function getContentTypeIcon/.test(src)).toBe(true);
    expect(/export function getContentTypeLabel/.test(src)).toBe(true);
    // Web page → 🌐, Livestream → 📡
    const iconStart = src.indexOf('function getContentTypeIcon');
    const iconBlock = src.slice(iconStart, iconStart + 600);
    expect(/'web_page':\s*return\s*'🌐'/.test(iconBlock)).toBe(true);
    expect(/'livestream':\s*return\s*'📡'/.test(iconBlock)).toBe(true);
  });

  it('library list template — renders content-type icon on cards + rows', () => {
    const src = read('central-dashboard/src/app/features/sites/components/video-library/video-library-list/video-library-list.component.html');
    // Card thumbnail badge
    expect(/data-testid="video-card-content-type-badge"/.test(src)).toBe(true);
    expect(/getContentTypeIcon\(video\.contentType\)/.test(src)).toBe(true);
    // List row prefix icon
    expect(/data-testid="video-row-content-type-icon"/.test(src)).toBe(true);
  });

  it('library list component — re-exposes getContentTypeIcon + getContentTypeLabel for the template', () => {
    const src = read('central-dashboard/src/app/features/sites/components/video-library/video-library-list/video-library-list.component.ts');
    expect(/getContentTypeIcon\s*=\s*getContentTypeIcon/.test(src)).toBe(true);
    expect(/getContentTypeLabel\s*=\s*getContentTypeLabel/.test(src)).toBe(true);
  });

  // ------------ Add-to-loop duration prompt ------------

  it('site-content-tab — prompts for durationSeconds when adding web/live to loop or match', () => {
    const src = read('central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.ts');
    const fnStart = src.indexOf('onAddVideoToTarget(event:');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBlock = src.slice(fnStart, fnStart + 4000);
    // Detects web/live content type
    expect(/video\.contentType\s*===\s*'web_page'\s*\|\|\s*video\.contentType\s*===\s*'livestream'/.test(fnBlock)).toBe(true);
    // Prompts only for loop + match (not category — manual launch tolerates missing duration)
    expect(/target\.type\s*===\s*'loop'\s*\|\|\s*target\.type\s*===\s*'match'/.test(fnBlock)).toBe(true);
    // Uses window.prompt with a default
    expect(/window\.prompt\(/.test(fnBlock)).toBe(true);
    // Builds entry with durationSeconds + contentType + externalUrl
    expect(/durationSeconds:\s*webDurationSeconds/.test(fnBlock)).toBe(true);
    expect(/contentType:\s*video\.contentType/.test(fnBlock)).toBe(true);
    expect(/externalUrl:\s*video\.externalUrl/.test(fnBlock)).toBe(true);
    // Cancel returns early
    expect(/raw\s*===\s*null/.test(fnBlock)).toBe(true);
    // Invalid input rejected
    expect(/Number\.isFinite\(parsed\)/.test(fnBlock)).toBe(true);
  });
});
