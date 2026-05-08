/**
 * Smoke tests — Fire Stick receivers discovery wiring (Phase 9 OBSERVE-02)
 *
 * Goal: figer les 11 contrats de wiring de la feature Fire Stick.
 * Si l'un de ces contrats est cassé silencieusement dans une PR future,
 * ce smoke test échoue immédiatement.
 *
 * Contrats gardés :
 * 1. sync-agent whitelist: receiver_assignment_updated dans DEFAULT_ALLOWED_COMMANDS
 * 2. API route: connected-receivers dans sites.routes.ts
 * 3. Model: ReceiverInfo exportée depuis core/models/index.ts
 * 4. Model: ReceiverConfig exportée depuis core/models/index.ts
 * 5. Model: DisplayConfig.receiver field existe
 * 6. Service: getConnectedReceivers dans sites.service.ts
 * 7. nginx: /api/captive/whoami dans neopro-base.conf
 * 8. dnsmasq: firetvcaptiveportal.com DNS hijack
 * 9. dnsmasq: spectrum.s3.amazonaws.com DNS hijack
 * 10. Pi receivers.service.js existe
 * 11. socket.service.ts: receiversBySite Map + getConnectedReceivers method
 *
 * File-level reads uniquement — pas de bootstrap applicatif.
 * Usage: npm run test:smoke (ou test:smoke:smart sur fichiers modifiés)
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(repoRoot, rel));

describe('Smoke — receivers discovery (Phase 9 OBSERVE-02)', () => {

  // ── 1. sync-agent whitelist ──────────────────────────────────────────────

  it('sync-agent — receiver_assignment_updated est dans DEFAULT_ALLOWED_COMMANDS', () => {
    const config = read('raspberry/sync-agent/src/config.js');
    expect(config).toMatch(/receiver_assignment_updated/);
  });

  // ── 2. Cloud API route ───────────────────────────────────────────────────

  it('central-server — route connected-receivers est declaree dans sites.routes.ts', () => {
    const routes = read('central-server/src/routes/sites.routes.ts');
    expect(routes).toMatch(/connected-receivers/);
  });

  // ── 3. Dashboard models ──────────────────────────────────────────────────

  it('dashboard — interface ReceiverInfo est exportee depuis models/index.ts', () => {
    const models = read('central-dashboard/src/app/core/models/index.ts');
    expect(models).toMatch(/ReceiverInfo/);
  });

  it('dashboard — interface ReceiverConfig est exportee depuis models/index.ts', () => {
    const models = read('central-dashboard/src/app/core/models/index.ts');
    expect(models).toMatch(/ReceiverConfig/);
  });

  it('dashboard — models/index.ts contient un champ receiver (DisplayConfig Phase 8)', () => {
    const models = read('central-dashboard/src/app/core/models/index.ts');
    expect(models).toMatch(/receiver/i);
    expect(models).toMatch(/ReceiverInfo/);
  });

  // ── 4. Dashboard service ─────────────────────────────────────────────────

  it('dashboard — SitesService expose getConnectedReceivers', () => {
    const service = read('central-dashboard/src/app/core/services/sites.service.ts');
    expect(service).toMatch(/getConnectedReceivers/);
  });

  // ── 5. nginx captive route ───────────────────────────────────────────────

  it('nginx — bloc /api/captive/whoami est declare dans neopro-base.conf', () => {
    const nginx = read('raspberry/config/nginx/neopro-base.conf');
    expect(nginx).toMatch(/\/api\/captive\/whoami/);
  });

  // ── 6. dnsmasq Fire Stick DNS hijack ─────────────────────────────────────

  it('dnsmasq — firetvcaptiveportal.com est redirige vers le Pi', () => {
    const dnsmasq = read('raspberry/config/systemd/dnsmasq.conf');
    expect(dnsmasq).toMatch(/firetvcaptiveportal\.com/);
  });

  it('dnsmasq — spectrum.s3.amazonaws.com est redirige vers le Pi', () => {
    const dnsmasq = read('raspberry/config/systemd/dnsmasq.conf');
    expect(dnsmasq).toMatch(/spectrum\.s3\.amazonaws\.com/);
  });

  // ── 7. Pi receivers service ──────────────────────────────────────────────

  it('Pi — receivers.service.js existe dans raspberry/src/app/services/ ou raspberry/server/services/', () => {
    const inAppServices = exists('raspberry/src/app/services/receivers.service.js');
    const inAppServicesTs = exists('raspberry/src/app/services/receivers.service.ts');
    const inServerServices = exists('raspberry/server/services/receivers.service.js');
    const inServerSrcServices = exists('raspberry/server/src/services/receivers.service.js');
    expect(inAppServices || inAppServicesTs || inServerServices || inServerSrcServices).toBe(true);
  });

  // ── 8. Cloud socket Map ───────────────────────────────────────────────────

  it('socket.service.ts — Map receiversBySite est declaree', () => {
    const socket = read('central-server/src/services/socket.service.ts');
    expect(socket).toMatch(/receiversBySite/);
  });

  it('socket.service.ts — methode getConnectedReceivers est declaree', () => {
    const socket = read('central-server/src/services/socket.service.ts');
    expect(socket).toMatch(/getConnectedReceivers/);
  });

});

describe('Phase 12 OBSERVE — neopro_hotspot_unknown_firestick_total', () => {

  const metricsSource = () => read('central-server/src/services/metrics.service.ts');
  const socketSource = () => read('central-server/src/services/socket.service.ts');

  // ── Task 1: Counter + recorder in metrics.service.ts ─────────────────────

  it('metrics.service.ts — declare Counter neopro_hotspot_unknown_firestick_total avec label site_id', () => {
    const src = metricsSource();
    expect(src).toContain('neopro_hotspot_unknown_firestick_total');
    // labelNames must contain site_id (within ~15 lines of the counter name)
    const idx = src.indexOf('neopro_hotspot_unknown_firestick_total');
    const window = src.slice(idx, idx + 500);
    expect(window).toMatch(/labelNames.*site_id/s);
  });

  it('metrics.service.ts — expose recordHotspotUnknownFirestick(siteId: string)', () => {
    const src = metricsSource();
    expect(src).toMatch(/recordHotspotUnknownFirestick\s*\(siteId:\s*string\)/);
  });

  it('metrics.service.ts — recordHotspotUnknownFirestick increments the Counter', () => {
    const src = metricsSource();
    // Method body must call .inc({ site_id:
    const idx = src.indexOf('recordHotspotUnknownFirestick');
    const body = src.slice(idx, idx + 200);
    expect(body).toMatch(/hotspotUnknownFirestickTotal\.inc\(\s*\{/);
  });

  it('metrics.service.ts — neopro_hotspot_unknown_firestick_total has NO mac label (high cardinality guard)', () => {
    const src = metricsSource();
    const idx = src.indexOf('neopro_hotspot_unknown_firestick_total');
    const window = src.slice(idx, idx + 500);
    // mac must NOT appear in the labelNames array for this counter
    expect(window).not.toMatch(/'mac'/);
  });

  // ── Task 2: state-sync hook in socket.service.ts ──────────────────────────

  it('socket.service.ts — state-sync handler calls recordHotspotUnknownFirestick(siteId)', () => {
    const src = socketSource();
    const stateSyncIdx = src.indexOf("socket.on('state-sync'");
    expect(stateSyncIdx).toBeGreaterThan(0);
    // Check within ~500 chars after the state-sync open
    const nextHandlerIdx = src.indexOf("socket.on(", stateSyncIdx + 1);
    const handlerBlock = src.slice(stateSyncIdx, nextHandlerIdx > stateSyncIdx ? nextHandlerIdx : stateSyncIdx + 800);
    expect(handlerBlock).toContain('recordHotspotUnknownFirestick(siteId)');
  });

  it('socket.service.ts — declare unknownFirestickSeenBySite dedup Map', () => {
    const src = socketSource();
    expect(src).toMatch(/unknownFirestickSeenBySite\s*:\s*Map<string,\s*Set<string>>/);
  });

  it('socket.service.ts — state-sync detects firestick with displayIndex === null only', () => {
    const src = socketSource();
    const stateSyncIdx = src.indexOf("socket.on('state-sync'");
    const nextHandlerIdx = src.indexOf("socket.on(", stateSyncIdx + 1);
    const handlerBlock = src.slice(stateSyncIdx, nextHandlerIdx > stateSyncIdx ? nextHandlerIdx : stateSyncIdx + 1000);
    expect(handlerBlock).toContain("r.kind === 'firestick'");
    expect(handlerBlock).toContain('r.displayIndex === null');
  });

  it('socket.service.ts — emits a Winston warn for unknown firestick', () => {
    const src = socketSource();
    expect(src).toMatch(/logger\.warn\(.*unknown_firestick/s);
  });

  it('socket.service.ts — recordHotspotUnknownFirestick is NOT called outside socket.service.ts', () => {
    // Enumerate all .ts files in central-server/src except test files, metrics.service.ts, socket.service.ts
    const srcDir = path.join(path.resolve(__dirname, '../../../../'), 'central-server/src');
    const walk = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries.flatMap(e => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return e.name.endsWith('.ts') ? [full] : [];
      });
    };
    const files = walk(srcDir).filter(f =>
      !f.includes('__tests__') &&
      !f.endsWith('metrics.service.ts') &&
      !f.endsWith('socket.service.ts')
    );
    const callers = files.filter(f =>
      fs.readFileSync(f, 'utf8').includes('recordHotspotUnknownFirestick')
    );
    expect(callers).toHaveLength(0);
  });

});
