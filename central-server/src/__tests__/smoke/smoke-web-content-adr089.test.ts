/**
 * Smoke tests — ADR-089 web_page / livestream as first-class content.
 * File-level reads only (no app bootstrap).
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(repoRoot, rel));

describe('Smoke — ADR-089 web_page / livestream', () => {
  // ------------ central-server ------------

  it('central-server — shared injection helper exists and exports injectWebContentCategory', () => {
    const helper = read('central-server/src/utils/inject-web-content-category.ts');
    expect(/export\s+(async\s+)?function\s+injectWebContentCategory/.test(helper)).toBe(true);
    expect(/findWebContentForSite/.test(helper)).toBe(true);
  });

  it('central-server — remote.controller uses shared helper (not inline)', () => {
    const controller = read('central-server/src/controllers/remote.controller.ts');
    expect(/injectWebContentCategory/.test(controller)).toBe(true);
  });

  it('central-server — saas.controller injects web-content in getSaasConfig + getSaasProfileConfig', () => {
    const controller = read('central-server/src/controllers/saas.controller.ts');
    expect(/injectWebContentCategory/.test(controller)).toBe(true);
    const count = (controller.match(/injectWebContentCategory/g) || []).length;
    // import + 2 call sites (getSaasConfig + getSaasProfileConfig)
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it('central-server — Pi web-content route exists and is mounted', () => {
    expect(exists('central-server/src/routes/web-content-pi.routes.ts')).toBe(true);
    const routes = read('central-server/src/routes/web-content-pi.routes.ts');
    expect(/router\.get\(\s*['"]\/:id\/web-content['"]/.test(routes)).toBe(true);
    expect(/authenticateSiteApiKey/.test(routes)).toBe(true);
    expect(/validateParams/.test(routes)).toBe(true);

    const server = read('central-server/src/server.ts');
    expect(/web-content-pi\.routes|webContentPiRoutes/.test(server)).toBe(true);
  });

  it('central-server — listWebContentForPi enforces siteId matches authenticated Pi', () => {
    const controller = read('central-server/src/controllers/web-content.controller.ts');
    expect(/export\s+const\s+listWebContentForPi\b/.test(controller)).toBe(true);
    // Guard req.siteId !== id → 403
    expect(/req\.siteId\s*!==\s*id/.test(controller)).toBe(true);
  });

  it('central-server — Prometheus counter neopro_web_content_fetch_total is registered', () => {
    const metrics = read('central-server/src/services/metrics.service.ts');
    expect(/neopro_web_content_fetch_total/.test(metrics)).toBe(true);
    expect(/recordWebContentFetch/.test(metrics)).toBe(true);
  });

  it('central-server — listWebContentForPi records Prometheus metrics', () => {
    const controller = read('central-server/src/controllers/web-content.controller.ts');
    expect(/recordWebContentFetch\(\s*['"]success['"]/.test(controller)).toBe(true);
    expect(/recordWebContentFetch\(\s*['"]forbidden['"]/.test(controller)).toBe(true);
    expect(/recordWebContentFetch\(\s*['"]error['"]/.test(controller)).toBe(true);
  });

  it('central-server — videoRepository.findWebContentForSite exists and filters by site', () => {
    const repo = read('central-server/src/repositories/video.repository.ts');
    expect(/findWebContentForSite/.test(repo)).toBe(true);
    expect(/uploaded_for_site_id IS NULL OR uploaded_for_site_id = \$1/.test(repo)).toBe(true);
  });

  // ------------ sync-agent (Pi) ------------

  it('sync-agent — web-content-sync module exists with syncFromCloud export', () => {
    expect(exists('raspberry/sync-agent/src/services/web-content-sync.js')).toBe(true);
    const mod = read('raspberry/sync-agent/src/services/web-content-sync.js');
    expect(/module\.exports\s*=\s*\{[\s\S]*syncFromCloud/.test(mod)).toBe(true);
    expect(/mergeWebContent/.test(mod)).toBe(true);
    expect(/\/api\/sites\/\$\{siteId\}\/web-content/.test(mod)).toBe(true);
  });

  it('sync-agent — agent.js imports web-content-sync and calls it on auth + periodically', () => {
    const agent = read('raspberry/sync-agent/src/agent.js');
    expect(/services\/web-content-sync/.test(agent)).toBe(true);
    expect(/syncWebContentFromCloud/.test(agent)).toBe(true);
    expect(/webContentInterval/.test(agent)).toBe(true);
    // Guard against leak: must clearInterval before recreating
    expect(/clearInterval\(this\.webContentInterval\)/.test(agent)).toBe(true);
  });

  // ------------ raspberry webapp (Remote + TV) ------------

  it('raspberry — PiConfigVideoEntry exposes contentType + externalUrl + durationSeconds', () => {
    const iface = read('raspberry/src/app/interfaces/video.interface.ts');
    expect(/contentType\?:\s*'video'\s*\|\s*'web_page'\s*\|\s*'livestream'/.test(iface)).toBe(true);
    expect(/externalUrl\?:\s*string/.test(iface)).toBe(true);
    expect(/durationSeconds\?:\s*number\s*\|\s*null/.test(iface)).toBe(true);
  });

  it('raspberry — Remote component dispatches web-page / livestream commands', () => {
    const remote = read('raspberry/src/app/components/remote/remote.component.ts');
    expect(/type:\s*'web-page'/.test(remote)).toBe(true);
    expect(/type:\s*'livestream'/.test(remote)).toBe(true);
    expect(/video\.contentType\s*===\s*'web_page'/.test(remote)).toBe(true);
    expect(/video\.contentType\s*===\s*'livestream'/.test(remote)).toBe(true);
  });

  it('raspberry — TV component handles web-page / livestream / stop-manual', () => {
    const tv = read('raspberry/src/app/components/tv/tv.component.ts');
    expect(/['"]web-page['"]/.test(tv)).toBe(true);
    expect(/['"]livestream['"]/.test(tv)).toBe(true);
  });

  // ------------ dashboard UI — création web-content (per-site + admin) ------------

  it('dashboard — shared WebContentCreateModal component exists and POSTs to /videos/web-content', () => {
    const modal = 'central-dashboard/src/app/shared/components/web-content-create-modal/web-content-create-modal.component.ts';
    expect(exists(modal)).toBe(true);
    const src = read(modal);
    // Required inputs wire the two usage modes
    expect(/@Input\(\{\s*required:\s*true\s*\}\)\s+contentType/.test(src)).toBe(true);
    expect(/@Input\(\)\s+lockedSiteId/.test(src)).toBe(true);
    expect(/@Input\(\)\s+availableSites/.test(src)).toBe(true);
    // Submit must POST to the ADR-089 endpoint
    expect(/post<[^>]*>\(\s*['"]\/videos\/web-content['"]/.test(src)).toBe(true);
    // uploadedForSiteId must prefer lockedSiteId over selectedSiteId (per-site is authoritative)
    expect(/this\.lockedSiteId\s*\?\?\s*this\.selectedSiteId/.test(src)).toBe(true);
  });

  it('dashboard — video-library exposes web_page + livestream creation buttons gated by siteId', () => {
    const html = read('central-dashboard/src/app/features/sites/components/video-library/video-library.component.html');
    expect(/openWebContentModal\(\s*'web_page'\s*\)/.test(html)).toBe(true);
    expect(/openWebContentModal\(\s*'livestream'\s*\)/.test(html)).toBe(true);
    // The action block must be gated by *ngIf="siteId" — no buttons in the admin global library
    expect(/class="library-actions"\s+\*ngIf="siteId"/.test(html)).toBe(true);
    // Modal must forward the current siteId as lockedSiteId (not null = global leak)
    expect(/<app-web-content-create-modal[\s\S]*?\[lockedSiteId\]="siteId"/.test(html)).toBe(true);
  });

  it('dashboard — video-library component wires modal state + emits webContentCreated', () => {
    const ts = read('central-dashboard/src/app/features/sites/components/video-library/video-library.component.ts');
    expect(/webContentModalType:\s*WebContentType\s*\|\s*null/.test(ts)).toBe(true);
    expect(/@Output\(\)\s+webContentCreated\s*=\s*new\s+EventEmitter/.test(ts)).toBe(true);
    expect(/WebContentCreateModalComponent/.test(ts)).toBe(true);
  });

  it('dashboard — per-site event propagates video-library → video-manager → site-content-tab', () => {
    const manager = read('central-dashboard/src/app/features/sites/components/site-content-tab/video-manager/video-manager.component.ts');
    expect(/@Output\(\)\s+webContentCreated\s*=\s*new\s+EventEmitter/.test(manager)).toBe(true);
    expect(/\(webContentCreated\)="webContentCreated\.emit\(\)"/.test(manager)).toBe(true);

    const tab = read('central-dashboard/src/app/features/sites/components/site-content-tab/site-content-tab.component.html');
    // The tab must reload content after web-content creation (otherwise the new row is invisible until refresh)
    expect(/<app-video-manager[\s\S]*?\(webContentCreated\)="loadContent\(\)"/.test(tab)).toBe(true);
  });

  it('dashboard — content-management uses shared modal with availableSites (admin site selector)', () => {
    const html = read('central-dashboard/src/app/features/content/content-management.component.html');
    expect(/<app-web-content-create-modal/.test(html)).toBe(true);
    expect(/\[availableSites\]="webContentSiteOptions"/.test(html)).toBe(true);

    const ts = read('central-dashboard/src/app/features/content/content-management.component.ts');
    expect(/WebContentCreateModalComponent/.test(ts)).toBe(true);
    expect(/get\s+webContentSiteOptions\s*\(\s*\)\s*:\s*WebContentSiteOption\[\]/.test(ts)).toBe(true);
    // Must not reintroduce the legacy inline form (webContentForm) — the modal owns the form state
    expect(/webContentForm\s*:/.test(ts)).toBe(false);
  });
});
