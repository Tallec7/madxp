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

  it('RemoteHostComponent dispatcher exists and implements 3-step resolution', () => {
    const host = 'raspberry/src/app/components/remote/remote-host.component.ts';
    expect(exists(host)).toBe(true);
    const content = read(host);
    // Query param override
    expect(/v2=/.test(content)).toBe(true);
    // Pi configuration override (route resolver) before SaaS fallback
    expect(/featureOverrides/.test(content)).toBe(true);
    // Cloud feature flag lookup (SaaS)
    expect(/isFeatureEnabled\(\s*['"]remote_v2['"]\s*\)/.test(content)).toBe(true);
    // Legacy key référencée UNIQUEMENT pour cleanup (removeItem) — jamais écrite.
    // Multi-tenant SaaS hotfix : `?v2=…` ne doit pas persister en localStorage
    // (sinon il fuite à tous les sites partageant le domaine).
    expect(/neopro_remote_v2_override/.test(content)).toBe(true);
    expect(/localStorage\.setItem\([^)]*v2_override/i.test(content)).toBe(false);
    expect(/localStorage\.removeItem\(/.test(content)).toBe(true);
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
    // Rollback navigue vers /remote?v2=0 (override session-only, plus de localStorage).
    expect(/backToV1\s*\(/.test(content)).toBe(true);
    expect(/queryParams:\s*\{\s*v2:\s*['"]0['"]/.test(content)).toBe(true);
    // Doit pas réécrire la clé legacy localStorage (multi-tenant SaaS).
    expect(/localStorage\.setItem\([^)]*neopro_remote_v2_override/.test(content)).toBe(false);
    // Must reuse V1 scoped services (ADR-051 Phase 4) — no logic fork.
    expect(/RemoteScoreService/.test(content)).toBe(true);
    expect(/RemoteTimerService/.test(content)).toBe(true);
  });

  // ------------ Multi-tenant SaaS : prefs scopées par site/profil ------------

  it('RemotePreferencesService scope la clé localStorage par site + profil', () => {
    const svc = read(
      'raspberry/src/app/components/remote/remote-preferences.service.ts',
    );
    // SaasConfigService injecté pour récupérer le scope.
    expect(/SaasConfigService/.test(svc)).toBe(true);
    expect(/getScopedStorageKey/.test(svc)).toBe(true);
    // Plus aucune écriture sur la clé globale legacy non scopée.
    expect(
      /localStorage\.setItem\(\s*['"]neopro_remote_prefs['"]\s*,/.test(svc),
    ).toBe(false);
    // Méthode de rechargement après switch de profil.
    expect(/reloadFromStorage\s*\(/.test(svc)).toBe(true);
  });

  it('RemoteV2Component scope les clés widgets + recent par site + profil', () => {
    const v2 = read(
      'raspberry/src/app/components/remote-v2/remote-v2.component.ts',
    );
    // Plus de constantes globales écrites directement — passage par
    // saasConfig.getScopedStorageKey pour les deux clés.
    expect(/getScopedStorageKey/.test(v2)).toBe(true);
    expect(
      /localStorage\.setItem\(\s*['"]neopro_remote_v2_widgets['"]\s*,/.test(v2),
    ).toBe(false);
    expect(
      /localStorage\.setItem\(\s*['"]neopro_remote_v2_recent['"]\s*,/.test(v2),
    ).toBe(false);
  });

  it('SaasConfigService expose getScopedStorageKey + getSelectedProfileId', () => {
    const svc = read('raspberry/src/app/services/saas-config.service.ts');
    expect(/getScopedStorageKey\s*\(/.test(svc)).toBe(true);
    expect(/getSelectedProfileId\s*\(/.test(svc)).toBe(true);
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

  // ------------ Parité socket V1↔V2 ------------

  it('RemoteV2Component émet request-state au boot (sinon displays-changed jamais reçu)', () => {
    // Régression : sans cet emit, le serveur ne renvoie jamais displays-changed
    // et le sélecteur N display reste vide (`displays.length === 0`).
    // V1 émet à la ligne ~365 de remote.component.ts.
    const v2 = read('raspberry/src/app/components/remote-v2/remote-v2.component.ts');
    expect(/socketService\.emit\(\s*['"]request-state['"]/.test(v2)).toBe(true);
  });

  it('RemoteV2Component a un handler displays-changed qui popule this.displays', () => {
    const v2 = read('raspberry/src/app/components/remote-v2/remote-v2.component.ts');
    expect(/['"]displays-changed['"]/.test(v2)).toBe(true);
    expect(/this\.displays\s*=/.test(v2)).toBe(true);
  });

  // ------------ ADR present ------------

  it('ADR-092 is committed alongside the implementation', () => {
    expect(exists('docs/adr/ADR-092-remote-v2-feature-flag-rollout.md')).toBe(true);
  });
});
