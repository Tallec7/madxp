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

  it('central-server — Prometheus counter madxp_web_content_fetch_total is registered', () => {
    const metrics = read('central-server/src/services/metrics.service.ts');
    expect(/madxp_web_content_fetch_total/.test(metrics)).toBe(true);
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

  it('dashboard — video-library exposes unified "+ Ajouter du contenu" button gated by siteId (ADR-094)', () => {
    const html = read('central-dashboard/src/app/features/sites/components/video-library/video-library.component.html');
    // ADR-094: the 2 legacy buttons are replaced by a single unified entry point.
    expect(/openAddContentModal\s*\(\s*\)/.test(html)).toBe(true);
    expect(/\+\s*Ajouter du contenu/.test(html)).toBe(true);
    // The action block must still be gated by *ngIf="siteId" — no buttons in the admin global library.
    expect(/class="library-actions"\s+\*ngIf="siteId"/.test(html)).toBe(true);
    // The modal host must also be gated on siteId (defense-in-depth vs global leak).
    expect(/<app-add-content-modal[\s\S]*?\*ngIf="addContentModalOpen\s*&&\s*siteId"/.test(html)).toBe(true);
    // The modal must forward the current siteId (per-site scope — ADR-089 invariant).
    expect(/<app-add-content-modal[\s\S]*?\[siteId\]="siteId"/.test(html)).toBe(true);
  });

  it('dashboard — video-library component wires unified add-content modal state + emits webContentCreated (ADR-094)', () => {
    const ts = read('central-dashboard/src/app/features/sites/components/video-library/video-library.component.ts');
    expect(/addContentModalOpen\s*=\s*false/.test(ts)).toBe(true);
    expect(/openAddContentModal\s*\(\s*\)/.test(ts)).toBe(true);
    expect(/closeAddContentModal\s*\(\s*\)/.test(ts)).toBe(true);
    expect(/@Output\(\)\s+webContentCreated\s*=\s*new\s+EventEmitter/.test(ts)).toBe(true);
    expect(/AddContentModalComponent/.test(ts)).toBe(true);
  });

  it('dashboard — AddContentModalComponent exists and forwards lockedSiteId to embedded web-content modal (ADR-094)', () => {
    const file = 'central-dashboard/src/app/shared/components/add-content-modal/add-content-modal.component.ts';
    expect(exists(file)).toBe(true);
    const src = read(file);
    // 3 tabs: upload / web_page / livestream
    expect(/activeTab\s*===\s*'upload'/.test(src)).toBe(true);
    expect(/activeTab\s*===\s*'web_page'/.test(src)).toBe(true);
    expect(/activeTab\s*===\s*'livestream'/.test(src)).toBe(true);
    // Each web-content tab must forward lockedSiteId (ADR-089 invariant).
    const webTabMatches = src.match(/<app-web-content-create-modal[\s\S]*?>/g) || [];
    expect(webTabMatches.length).toBe(2);
    webTabMatches.forEach(tag => {
      expect(/\[lockedSiteId\]="siteId"/.test(tag)).toBe(true);
      expect(/\[embedded\]="true"/.test(tag)).toBe(true);
    });
  });

  it('dashboard — web-content-create-modal supports embedded mode (ADR-094)', () => {
    const src = read('central-dashboard/src/app/shared/components/web-content-create-modal/web-content-create-modal.component.ts');
    expect(/@Input\(\)\s+embedded\s*=\s*false/.test(src)).toBe(true);
    // In embedded mode, backdrop/header must be omitted (parent owns the chrome).
    expect(/\*ngIf="!embedded;\s*else\s+embeddedBody"/.test(src)).toBe(true);
  });

  it('dashboard — video-manager no longer renders a standalone upload zone (ADR-094)', () => {
    const src = read('central-dashboard/src/app/features/sites/components/site-content-tab/video-manager/video-manager.component.ts');
    // The upload zone is now hosted inside the add-content modal, triggered from the library.
    expect(/<app-video-upload-zone/.test(src)).toBe(false);
    expect(/VideoUploadZoneComponent/.test(src)).toBe(false);
    // Upload events must still propagate from library → manager → parent.
    expect(/\(uploadComplete\)="onVideoUploaded\(\$event\)"/.test(src)).toBe(true);
    expect(/\(allUploadsComplete\)="onAllVideosUploaded\(\$event\)"/.test(src)).toBe(true);
  });

  it('dashboard — video-library exposes global drag-drop overlay gated by siteId (ADR-094)', () => {
    const html = read('central-dashboard/src/app/features/sites/components/video-library/video-library.component.html');
    expect(/class="global-drop-overlay"/.test(html)).toBe(true);
    // Must be gated by siteId to avoid triggering on admin global views.
    expect(/\*ngIf="siteId\s*&&\s*isFileDraggedOverPage"/.test(html)).toBe(true);

    const ts = read('central-dashboard/src/app/features/sites/components/video-library/video-library.component.ts');
    // Counter prevents enter/leave flicker when dragging over nested elements.
    expect(/dragCounter/.test(ts)).toBe(true);
    expect(/@HostListener\(['"]document:dragenter['"]/.test(ts)).toBe(true);
    expect(/@HostListener\(['"]document:drop['"]/.test(ts)).toBe(true);
    // Must filter non-file drags (text selections, links) to avoid spurious overlays.
    expect(/types\?\.\s*includes\(['"]Files['"]\)/.test(ts)).toBe(true);
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
