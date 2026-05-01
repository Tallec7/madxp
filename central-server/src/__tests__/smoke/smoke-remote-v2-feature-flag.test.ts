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

// Strip JS/TS line and block comments. Used when a smoke test asserts the
// presence/absence of a code pattern that may also appear in surrounding
// commentary (justification of why X must NOT be done, etc.).
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

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

  // ------------ Orchestration parity V1 ↔ V2 (audit 2026-05-01) ------------
  // Sans ces garde-fous, V2 pourrait silencieusement perdre les emits que V1
  // fait (request-state au boot, breaking-news, options-update) et tout
  // l'overlay TV deviendrait muet côté V2 → bug placebo, sunset V1 risqué.

  it('remote-v2 demande un request-state au boot (snapshot displays/score/phase)', () => {
    const v2 = read('raspberry/src/app/components/remote-v2/remote-v2.component.ts');
    expect(/socketService\.emit\(\s*['"]request-state['"]/.test(v2)).toBe(true);
  });

  it('remote-v2 émet breaking-news vers la TV via socket + localBroadcast', () => {
    const v2 = read('raspberry/src/app/components/remote-v2/remote-v2.component.ts');
    expect(/socketService\.emit\(\s*['"]breaking-news['"]/.test(v2)).toBe(true);
    expect(/localBroadcast\.emitBreakingNews/.test(v2)).toBe(true);
  });

  it('remote-v2 propage les options à la TV (options-update via socket + localBroadcast)', () => {
    const v2 = read('raspberry/src/app/components/remote-v2/remote-v2.component.ts');
    expect(/socketService\.emit\(\s*['"]options-update['"]/.test(v2)).toBe(true);
    expect(/localBroadcast\.broadcast\(\s*['"]options-update['"]/.test(v2)).toBe(true);
    // Le broadcast est branché sur l'observable des options (skip 1 = pas au boot)
    expect(/getOptions\$\(\)[\s\S]{0,200}skip\(1\)/.test(v2)).toBe(true);
  });

  it('remote-v2 reset targetDisplay si le display ciblé disparaît (parité V1)', () => {
    const v2 = read('raspberry/src/app/components/remote-v2/remote-v2.component.ts');
    // Cherche le handler displays-changed et la logique de reset
    const handlerStart = v2.indexOf("'displays-changed'");
    expect(handlerStart).toBeGreaterThan(0);
    const block = v2.slice(handlerStart, handlerStart + 1500);
    expect(/this\.displays\.some/.test(block)).toBe(true);
    expect(/this\.targetDisplay\s*=\s*['"]all['"]/.test(block)).toBe(true);
  });

  it("RemoteV2Component n'appelle PAS socketService.initialize() (parité V1, anti-double-socket)", () => {
    // Régression : un second `initialize()` dans ngOnInit du V2 crée un 2e
    // socket et écrase `this.socket`, leakant le 1er (créé par app.component
    // au boot) avec ses listeners attachés par d'autres services injectés
    // providedIn: 'root'. Le serveur émet alors displays-changed au socket
    // qui a registered, et la réponse peut atterrir sur le socket SANS le
    // listener V2 selon le timing.
    // Diagnostic : 2x "Connecting to socket server" dans les logs Pi.
    const v2 = read('raspberry/src/app/components/remote-v2/remote-v2.component.ts');
    const stripped = stripComments(v2);
    expect(/socketService\.initialize\(\)/.test(stripped)).toBe(false);
  });

  it("AppComponent reste l'unique caller de socketService.initialize() (singleton de boot)", () => {
    const app = read('raspberry/src/app/app.component.ts');
    const stripped = stripComments(app);
    expect(/socketService\.initialize\(\)/.test(stripped)).toBe(true);
  });

  it('saas-register pousse displays-changed au remote SaaS (fix race ADR-106)', () => {
    // Régression : avant le fix, le remote SaaS ne recevait jamais le snapshot
    // initial. Son `request-state` partait avant que `registerSaasRelay` n'ait
    // attaché le handler côté serveur (race ADR-106) → silencieusement dropé.
    // Le serveur doit donc pousser displays-changed proactivement au remote au
    // moment du saas-register, sans attendre request-state.
    const svc = read('central-server/src/services/socket.service.ts');
    const registerStart = svc.indexOf("socket.on('saas-register'");
    expect(registerStart).toBeGreaterThan(0);
    const block = svc.slice(registerStart, registerStart + 3500);
    // Doit pousser displays-changed directement au socket remote (pas de room
    // broadcast — éviterait les TVs déjà connectées de re-recevoir l'état).
    expect(
      /clientType\s*===\s*['"]saas-remote['"][\s\S]{0,500}socket\.emit\(['"]displays-changed['"]/.test(block),
    ).toBe(true);
  });

  it("Layouts mobile-classic + desktop-centered NE masquent PAS .r2-display-wrap (parité V1)", () => {
    // Régression : Daisy ne voyait pas la sheet "Cible vidéo" sur Remote V2.
    // Cause = `display: none` sur `.r2-display-wrap` dans les 2 layouts par
    // défaut. Le listener fire bien, le DOM est rendu, mais CSS le cache.
    // V1 n'a pas ces overrides → toujours visible. Parité = unhide.
    const layouts = [
      'raspberry/src/app/components/remote-v2/layouts/_mobile-classic.scss',
      'raspberry/src/app/components/remote-v2/layouts/_desktop-centered.scss',
    ];
    for (const rel of layouts) {
      const css = read(rel);
      // Cherche un sélecteur ciblant .r2-display-wrap suivi d'un display:none
      // dans le même bloc { ... }. Tolère les sélecteurs combinés (`,`).
      const blocks = css.match(/[^{}]*\.r2-display-wrap[^{}]*\{[^}]*\}/g) || [];
      for (const b of blocks) {
        expect(b.includes('display: none')).toBe(false);
      }
    }
  });
});
