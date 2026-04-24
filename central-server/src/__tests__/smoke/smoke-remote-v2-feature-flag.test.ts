/**
 * Smoke tests — ADR-092 Remote V2 feature-flag rollout.
 *
 * Enforce cross-component contract for `remote_v2` feature flag :
 *   cloud (saas.controller) → Pi (SaasConfigService + RemoteHostComponent dispatcher)
 *                           → dashboard (FeatureGate + Site Settings toggle)
 *
 * Without these assertions, a future refactor could silently strip any link in
 * the chain and the V2↔V1 rollback would break without anyone noticing until
 * a match is on air.
 *
 * File-level reads only (no app bootstrap).
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(repoRoot, rel));

describe('Smoke — ADR-092 Remote V2 feature flag', () => {
  // ------------ central-server : expose featureOverrides ------------

  it('saas.controller exposes featureOverrides in getSaasConfig and getSaasProfileConfig', () => {
    const controller = read('central-server/src/controllers/saas.controller.ts');
    // Both endpoints must surface the JSONB feature_overrides column.
    const occurrences = (controller.match(/featureOverrides/g) || []).length;
    // At least one parse + two response inclusions (getSaasConfig + getSaasProfileConfig).
    expect(occurrences).toBeGreaterThanOrEqual(3);
    // Must read the DB column.
    expect(/feature_overrides/.test(controller)).toBe(true);
  });

  // ------------ raspberry : SaasConfigService ------------

  it('SaasConfigService stores feature overrides and exposes isFeatureEnabled', () => {
    const svc = read('raspberry/src/app/services/saas-config.service.ts');
    expect(/featureOverrides\??:\s*Record<string,\s*boolean>/.test(svc)).toBe(true);
    expect(/isFeatureEnabled\s*\(/.test(svc)).toBe(true);
    expect(/getFeatureOverrides\s*\(/.test(svc)).toBe(true);
  });

  // ------------ raspberry : dispatcher component ------------

  it('RemoteHostComponent dispatcher exists and implements 4-step resolution', () => {
    const host = 'raspberry/src/app/components/remote/remote-host.component.ts';
    expect(exists(host)).toBe(true);
    const content = read(host);
    // Query param override
    expect(/v2=/.test(content)).toBe(true);
    // localStorage key
    expect(/neopro_remote_v2_override/.test(content)).toBe(true);
    // Cloud feature flag lookup
    expect(/isFeatureEnabled\(\s*['"]remote_v2['"]\s*\)/.test(content)).toBe(true);
  });

  it('app.routes.ts uses RemoteHostComponent for /remote (not RemoteComponent directly)', () => {
    const routes = read('raspberry/src/app/app.routes.ts');
    expect(/RemoteHostComponent/.test(routes)).toBe(true);
    // Route /remote must point to the host dispatcher.
    expect(/path:\s*['"]remote['"]\s*,\s*component:\s*RemoteHostComponent/.test(routes)).toBe(true);
  });

  it('RemoteV2Component exists with backToV1 rollback escape hatch', () => {
    const v2 = 'raspberry/src/app/components/remote-v2/remote-v2.component.ts';
    expect(exists(v2)).toBe(true);
    const content = read(v2);
    // Rollback must set override to '0' and reload (guarantees < 10s recovery).
    expect(/neopro_remote_v2_override/.test(content)).toBe(true);
    expect(/backToV1\s*\(/.test(content)).toBe(true);
    // Must reuse V1 scoped services (ADR-051 Phase 4) — no logic fork.
    expect(/RemoteScoreService/.test(content)).toBe(true);
    expect(/RemoteTimerService/.test(content)).toBe(true);
  });

  // ------------ dashboard : feature-gate + toggle ------------

  it('dashboard FeatureGate registers remote_v2 as a club-tier flag', () => {
    const gate = read(
      'central-dashboard/src/app/core/services/feature-gate.service.ts',
    );
    expect(/'remote_v2'/.test(gate)).toBe(true);
    expect(/remote_v2:\s*'club'/.test(gate)).toBe(true);
  });

  it('dashboard Site Settings tab surfaces the remote_v2 toggle', () => {
    const tab = read(
      'central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-tab.component.ts',
    );
    expect(/remote_v2/.test(tab)).toBe(true);
    // Must be presented as a user-facing label (tier Beta).
    expect(/Télécommande V2/.test(tab)).toBe(true);
  });

  // ------------ Pi sync-agent path (ADR-092 Phase Pi) ------------

  it('central-server exposes Pi-facing GET /api/sites/:id/feature-flags', () => {
    const route = 'central-server/src/routes/feature-flags-pi.routes.ts';
    const controller = 'central-server/src/controllers/feature-flags.controller.ts';
    expect(exists(route)).toBe(true);
    expect(exists(controller)).toBe(true);

    const routeContent = read(route);
    // Pi auth (api_key Bearer), not JWT admin.
    expect(/authenticateSiteApiKey/.test(routeContent)).toBe(true);
    expect(/:id\/feature-flags/.test(routeContent)).toBe(true);

    const ctrl = read(controller);
    // Guard site mismatch — a Pi can only read its own flags.
    expect(/req\.siteId\s*!==\s*id/.test(ctrl)).toBe(true);
    expect(/feature_overrides/.test(ctrl)).toBe(true);

    // Route mounted in server.ts.
    const server = read('central-server/src/server.ts');
    expect(/featureFlagsPiRoutes/.test(server)).toBe(true);
  });

  it('sync-agent fetches feature flags on reconnect and writes configuration.json', () => {
    const svc = 'raspberry/sync-agent/src/services/feature-flags-sync.js';
    expect(exists(svc)).toBe(true);
    const content = read(svc);
    expect(/\/api\/sites\/\$\{siteId\}\/feature-flags/.test(content)).toBe(true);
    expect(/featureOverrides/.test(content)).toBe(true);
    expect(/atomicWriteJson/.test(content)).toBe(true);

    const agent = read('raspberry/sync-agent/src/agent.js');
    expect(/syncFeatureFlagsFromCloud/.test(agent)).toBe(true);
    expect(/featureFlagsInterval/.test(agent)).toBe(true);
  });

  it('featureOverrides is declared in LOCAL_ONLY_SETTINGS (never wiped by cloud push)', () => {
    const merge = read('raspberry/sync-agent/src/utils/config-merge.js');
    expect(/'featureOverrides'/.test(merge)).toBe(true);
  });

  it('RemoteHostComponent reads featureOverrides from route configuration (Pi mode)', () => {
    const host = read(
      'raspberry/src/app/components/remote/remote-host.component.ts',
    );
    // Reads configuration from route data (resolver).
    expect(/route\.snapshot\.data\[['"]configuration['"]\]/.test(host)).toBe(true);
    // Reads featureOverrides out of configuration before falling back to SaasConfigService.
    expect(/featureOverrides/.test(host)).toBe(true);
  });

  it('Configuration interface declares featureOverrides for Pi resolver', () => {
    const iface = read('raspberry/src/app/interfaces/configuration.interface.ts');
    expect(/featureOverrides\??:\s*Record<string,\s*boolean>/.test(iface)).toBe(true);
  });

  // ------------ ADR present ------------

  it('ADR-092 is committed alongside the implementation', () => {
    expect(exists('docs/adr/ADR-092-remote-v2-feature-flag-rollout.md')).toBe(true);
  });
});
