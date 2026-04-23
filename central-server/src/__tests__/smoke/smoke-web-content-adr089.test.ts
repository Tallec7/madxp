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
});
