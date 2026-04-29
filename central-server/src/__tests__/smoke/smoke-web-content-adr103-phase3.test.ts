/**
 * Smoke tests — ADR-103 Phase 3 dashboard UX guards.
 *
 * Phase 3 (MVP): backend refuses save when a web_page / livestream entry
 * is placed in the loop (sponsors[] or timeCategories[].loopVideos[])
 * without a positive `durationSeconds`. The dashboard's existing
 * ErrorExtractor surfaces the message to the user.
 *
 * Categories[].videos[] are NOT validated — those are manual-launch
 * targets where missing duration means "no auto-close" (page stays
 * until user navigates away), which is a valid choice.
 *
 * File-level invariants only.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Smoke — ADR-103 Phase 3 dashboard UX guards', () => {
  // ------------ config-profiles.controller.ts ------------

  it('config-profiles.controller — exposes findWebLoopEntriesMissingDuration scanner', () => {
    const src = read('central-server/src/controllers/config-profiles.controller.ts');
    expect(/function findWebLoopEntriesMissingDuration/.test(src)).toBe(true);
    // Scanner walks sponsors + timeCategories.loopVideos (NOT categories.videos)
    const fnStart = src.indexOf('function findWebLoopEntriesMissingDuration');
    const fnBlock = src.slice(fnStart, fnStart + 1500);
    expect(/sponsors/.test(fnBlock)).toBe(true);
    expect(/timeCategories/.test(fnBlock)).toBe(true);
    expect(/loopVideos/.test(fnBlock)).toBe(true);
    // Categories.videos is NOT scanned (manual-launch is OK without duration)
    expect(/scanCats|cats\.videos/.test(fnBlock)).toBe(false);
  });

  it('config-profiles.controller — duration check requires number > 0', () => {
    const src = read('central-server/src/controllers/config-profiles.controller.ts');
    const fnStart = src.indexOf('function findWebLoopEntriesMissingDuration');
    const fnBlock = src.slice(fnStart, fnStart + 1500);
    expect(/typeof d !== 'number'/.test(fnBlock)).toBe(true);
    expect(/d > 0/.test(fnBlock)).toBe(true);
  });

  it('config-profiles.controller — rejectIfWebLoopMissingDuration returns 400 with WEB_LOOP_DURATION_REQUIRED', () => {
    const src = read('central-server/src/controllers/config-profiles.controller.ts');
    expect(/function rejectIfWebLoopMissingDuration/.test(src)).toBe(true);
    expect(/WEB_LOOP_DURATION_REQUIRED/.test(src)).toBe(true);
    expect(/res\.status\(400\)/.test(src)).toBe(true);
    // Message references the user-facing fix
    expect(/dur[ée]e d'affichage/i.test(src)).toBe(true);
  });

  it('config-profiles.controller — Phase 3 reject called in createProfile + updateProfile + updateProfileConfiguration', () => {
    const src = read('central-server/src/controllers/config-profiles.controller.ts');
    const calls = (src.match(/rejectIfWebLoopMissingDuration\(/g) || []).length;
    // Helper definition + 3 endpoint call sites = 4 occurrences
    expect(calls).toBeGreaterThanOrEqual(4);
    expect(/ADR-103 Phase 3/.test(src)).toBe(true);
  });

  // ------------ config-history.controller.ts (saveConfigDirect SaaS) ------------

  it('config-history.controller — saveConfigDirect refuses loop entries missing duration', () => {
    const src = read('central-server/src/controllers/config-history.controller.ts');
    const saveStart = src.indexOf('export const saveConfigDirect');
    expect(saveStart).toBeGreaterThan(0);
    const block = src.slice(saveStart, saveStart + 5000);
    expect(/WEB_LOOP_DURATION_REQUIRED/.test(block)).toBe(true);
    expect(/typeof d !== 'number'/.test(block)).toBe(true);
    expect(/ADR-103 Phase 3/.test(block)).toBe(true);
    // Sponsors + loopVideos scanned, categories.videos skipped
    expect(/sponsors/.test(block)).toBe(true);
    expect(/loopVideos/.test(block)).toBe(true);
  });
});
