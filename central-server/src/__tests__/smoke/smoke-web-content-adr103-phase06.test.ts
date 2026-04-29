/**
 * Smoke tests — ADR-103 Phase 0.6 Web/Live visibility fix.
 *
 * Phase 0/0.5 ensured the synthetic-path crash never reaches the TV. But the
 * pseudo-category "Web / Live" was injected into `categories[]` only — it was
 * never registered in any `timeCategories[].categoryIds[]`, so the Remote V1
 * (which filters categories per phase via `categoryIds.includes(cat.id)`)
 * never displayed it. The user couldn't see Web/Live entries despite ADR-089
 * working end-to-end on the data layer.
 *
 * Phase 0.6 fixes this by:
 *   - exposing `injectWebContentCategoryEx` returning `{ categories, hasWebContent }`
 *   - exposing `registerWebContentInTimeCategories(timeCategories, hasWebContent)`
 *   - calling both in saas.controller (2 endpoints) and remote.controller
 *   - mirroring the same patch in raspberry/sync-agent/src/services/web-content-sync.js
 *
 * File-level reads only.
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Smoke — ADR-103 Phase 0.6 Web/Live visibility', () => {
  // ------------ shared helper ------------

  it('inject-web-content-category.ts — exports Ex variant + registerWebContentInTimeCategories', () => {
    const src = read('central-server/src/utils/inject-web-content-category.ts');
    expect(/export async function injectWebContentCategoryEx/.test(src)).toBe(true);
    expect(/hasWebContent/.test(src)).toBe(true);
    expect(/export function registerWebContentInTimeCategories/.test(src)).toBe(true);
    expect(/ADR-103 Phase 0\.6/.test(src)).toBe(true);
    // Idempotency safeguard
    expect(/includes\(WEB_CATEGORY_ID\)/.test(src)).toBe(true);
  });

  it('inject-web-content-category.ts — keeps backward-compat injectWebContentCategory export', () => {
    const src = read('central-server/src/utils/inject-web-content-category.ts');
    expect(/export async function injectWebContentCategory\(/.test(src)).toBe(true);
  });

  // ------------ saas.controller ------------

  it('saas.controller — both endpoints register web-content in timeCategories', () => {
    const src = read('central-server/src/controllers/saas.controller.ts');
    expect(/from '\.\.\/utils\/inject-web-content-category'/.test(src)).toBe(true);
    expect(/injectWebContentCategoryEx/.test(src)).toBe(true);
    const registerCount = (src.match(/registerWebContentInTimeCategories\(/g) || []).length;
    // 2 call sites: getSaasConfig + getSaasProfileConfig
    expect(registerCount).toBeGreaterThanOrEqual(2);
  });

  // ------------ remote.controller ------------

  it('remote.controller — registers web-content in timeCategories before serving config', () => {
    const src = read('central-server/src/controllers/remote.controller.ts');
    expect(/injectWebContentCategoryEx/.test(src)).toBe(true);
    expect(/registerWebContentInTimeCategories\(/.test(src)).toBe(true);
    expect(/baseTimeCategories/.test(src)).toBe(true);
  });

  // ------------ sync-agent (Pi) ------------

  it('web-content-sync.js — registers web-content in timeCategories', () => {
    const src = read('raspberry/sync-agent/src/services/web-content-sync.js');
    expect(/function registerWebContentInTimeCategories/.test(src)).toBe(true);
    expect(/ADR-103 Phase 0\.6/.test(src)).toBe(true);
    // Both paths: add when entries.length > 0, strip when 0
    expect(/categoryIds\.includes\(WEB_CATEGORY_ID\)/.test(src)).toBe(true);
    // The main syncFromCloud function applies the patch alongside the categories merge
    expect(/registerWebContentInTimeCategories\(beforeTimeCategories/.test(src)).toBe(true);
  });

  it('web-content-sync.js — exports registerWebContentInTimeCategories for unit tests', () => {
    const src = read('raspberry/sync-agent/src/services/web-content-sync.js');
    expect(/_internal:.*registerWebContentInTimeCategories/.test(src)).toBe(true);
  });
});
