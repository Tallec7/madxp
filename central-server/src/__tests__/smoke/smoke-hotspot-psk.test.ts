/**
 * Smoke tests — hotspot PSK single source of truth (ADR-074)
 * Cross-repo regression guard for the cloud-canonical PSK architecture.
 * File-level reads only (no app bootstrap).
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(repoRoot, rel));

describe('Smoke — hotspot PSK (ADR-074)', () => {
  // ------------ central-server ------------

  it('central-server — hotspot-config module files exist', () => {
    expect({
      controller: exists('central-server/src/controllers/hotspot-config.controller.ts'),
      service: exists('central-server/src/services/hotspot-psk-crypto.service.ts'),
      repository: exists('central-server/src/repositories/hotspot-config.repository.ts'),
      routes: exists('central-server/src/routes/hotspot-config.routes.ts'),
    }).toEqual({ controller: true, service: true, repository: true, routes: true });
  });

  it('central-server — hotspotConfigRepository is exported from repositories barrel', () => {
    const barrel = read('central-server/src/repositories/index.ts');
    expect(/hotspotConfigRepository|hotspot-config\.repository/.test(barrel)).toBe(true);
  });

  it('central-server — hotspot-config routes are mounted in server.ts', () => {
    const server = read('central-server/src/server.ts');
    expect(/hotspot-config\.routes|hotspotConfigRoutes/.test(server)).toBe(true);
  });

  it('central-server — Pi route GET /:id/hotspot-config uses authenticateSiteApiKey (ADR-076)', () => {
    const routes = read('central-server/src/routes/hotspot-config.routes.ts');
    // Capture the block defining the router.get('/:id/hotspot-config', ...) up to the first closing ')'.
    const match = routes.match(/router\.get\(\s*['"]\/:id\/hotspot-config['"][\s\S]*?\);/);
    expect(match).not.toBeNull();
    const block = match![0];
    expect({
      usesSiteApiKey: /authenticateSiteApiKey/.test(block),
      noJwtAuthenticate: !/\bauthenticate\b(?!SiteApiKey)/.test(block),
    }).toEqual({ usesSiteApiKey: true, noJwtAuthenticate: true });
  });

  it('central-server — legacy sites.routes.ts does NOT declare /:id/hotspot-config (ADR-076)', () => {
    const routes = read('central-server/src/routes/sites.routes.ts');
    expect(/['"]\/:id\/hotspot-config['"]/.test(routes)).toBe(false);
  });

  it('central-server — site-debug.controller does NOT export getHotspotConfig (ADR-076)', () => {
    const controller = read('central-server/src/controllers/site-debug.controller.ts');
    expect(/export\s+const\s+getHotspotConfig\b/.test(controller)).toBe(false);
  });

  it('central-server — admin-view endpoint is declared with JWT + admin/operator role (ADR-076)', () => {
    const routes = read('central-server/src/routes/hotspot-config.routes.ts');
    const match = routes.match(/router\.get\(\s*['"]\/:id\/hotspot-config\/admin-view['"][\s\S]*?\);/);
    expect(match).not.toBeNull();
    const block = match![0];
    expect({
      usesJwt: /\bauthenticate\b(?!SiteApiKey)/.test(block),
      requiresAdminOrOperator: /requireRole\(\s*['"]admin['"],\s*['"]operator['"]\s*\)/.test(block),
      hasRateLimit: /adminRateLimit|sensitiveRateLimit/.test(block),
    }).toEqual({ usesJwt: true, requiresAdminOrOperator: true, hasRateLimit: true });
  });

  it('central-server — rotateHotspotConfig dispatches rotate_psk via commandQueueService', () => {
    const controller = read('central-server/src/controllers/hotspot-config.controller.ts');
    expect({
      importsCommandQueue: /commandQueueService/.test(controller),
      dispatchesRotatePsk: /sendOrQueue\([^)]*['"]rotate_psk['"]/.test(controller),
    }).toEqual({ importsCommandQueue: true, dispatchesRotatePsk: true });
  });

  it('central-server — hotspot-bootstrap-status fleet monitoring script exists', () => {
    expect(exists('central-server/src/scripts/hotspot-bootstrap-status.ts')).toBe(true);
  });

  // ------------ raspberry/sync-agent ------------

  it('sync-agent — hotspot-sync service exists with required functions', () => {
    const svc = read('raspberry/sync-agent/src/services/hotspot-sync.js');
    expect({
      hasSyncFromCloud: /syncFromCloud\s*[:=(]/.test(svc),
      hasShellEscape: /shellEscape\s*[:=(]/.test(svc),
      hasParseHostapd: /parseHostapdConf\s*[:=(]/.test(svc),
      usesShellEscapeForSed: /shellEscape/.test(svc),
      writesCacheChmod600: /0o?600/.test(svc) || /chmod.*600/.test(svc),
    }).toEqual({
      hasSyncFromCloud: true,
      hasShellEscape: true,
      hasParseHostapd: true,
      usesShellEscapeForSed: true,
      writesCacheChmod600: true,
    });
  });

  it('sync-agent — rotate_psk is whitelisted in DEFAULT_ALLOWED_COMMANDS', () => {
    const cfg = read('raspberry/sync-agent/src/config.js');
    expect(/['"]rotate_psk['"]/.test(cfg)).toBe(true);
  });

  it('sync-agent — commands/index.js registers rotate_psk handler', () => {
    const cmds = read('raspberry/sync-agent/src/commands/index.js');
    expect({
      importsHotspotSync: /services\/hotspot-sync/.test(cmds),
      hasRotatePskCmd: /rotate_psk/.test(cmds),
    }).toEqual({ importsHotspotSync: true, hasRotatePskCmd: true });
  });

  it('sync-agent — agent.js calls syncHotspotFromCloud after auth', () => {
    const agent = read('raspberry/sync-agent/src/agent.js');
    expect({
      definesMethod: /syncHotspotFromCloud\s*\(/.test(agent),
      callsIt: /this\.syncHotspotFromCloud\s*\(/.test(agent),
    }).toEqual({ definesMethod: true, callsIt: true });
  });

  // ------------ raspberry/admin ------------

  it('admin — hostapd-reader service exists', () => {
    expect(exists('raspberry/admin/services/hostapd-reader.service.js')).toBe(true);
  });

  it('admin — configuration.service.getClubConfig reads WiFi from hostapd, not club-config.json', () => {
    const svc = read('raspberry/admin/services/configuration.service.js');
    expect({
      importsHostapdReader: /hostapd-reader\.service/.test(svc),
      readsHostapd: /hostapdReader\.read\s*\(/.test(svc),
    }).toEqual({ importsHostapdReader: true, readsHostapd: true });
  });

  it('admin — hotspot-dashboard.service.rotatePsk does NOT write club-config.json', () => {
    const svc = read('raspberry/admin/services/hotspot-dashboard.service.js');
    // Only comments may mention club-config.json (ADR-074 reference). No fs write calls.
    const nonComment = svc.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(/club-config\.json/.test(nonComment)).toBe(false);
  });

  // ------------ install / flash scripts ------------

  it('install — install.sh does NOT write wifiPassword/wifiSSID in club-config.json', () => {
    const sh = read('raspberry/install.sh');
    expect({
      noWifiPassword: !/["']wifiPassword["']\s*:/.test(sh),
      noWifiSsid: !/["']wifiSSID["']\s*:/.test(sh),
    }).toEqual({ noWifiPassword: true, noWifiSsid: true });
  });

  it('install — prepare-image.sh does NOT write wifiPassword/wifiSSID', () => {
    const sh = read('raspberry/tools/prepare-image.sh');
    expect({
      noWifiPassword: !/["']wifiPassword["']\s*:/.test(sh),
      noWifiSsid: !/["']wifiSSID["']\s*:/.test(sh),
    }).toEqual({ noWifiPassword: true, noWifiSsid: true });
  });
});
