/**
 * Smoke tests — ADR-102 Remote Preferences DB persistence.
 *
 * Garde-fous file-level (pas de bootstrap app) :
 *   - Migration DB existe
 *   - Repository utilise `query()` (pas d'import direct dans le controller)
 *   - Controller délègue au repository (zero query() direct, zero import db)
 *   - Routes wirées avec verifyRemotePin + Joi
 *   - Frontend service scope par (site, profile) et expose update/updateWidget
 *
 * Sans ces assertions, un refactor pourrait silencieusement court-circuiter
 * la table DB ou retirer la protection PIN sans bruit.
 */
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(repoRoot, rel));

describe('Smoke — ADR-102 Remote Preferences DB', () => {
  it('migration add-remote-preferences-table.sql crée la table avec PK composite', () => {
    const file = 'central-server/src/scripts/migrations/add-remote-preferences-table.sql';
    expect(exists(file)).toBe(true);
    const content = read(file);
    expect(/CREATE TABLE IF NOT EXISTS remote_preferences/.test(content)).toBe(true);
    expect(/PRIMARY KEY \(site_id, profile_id\)/.test(content)).toBe(true);
    expect(/REFERENCES sites\(id\) ON DELETE CASCADE/.test(content)).toBe(true);
    expect(/REFERENCES config_profiles\(id\) ON DELETE CASCADE/.test(content)).toBe(true);
    expect(/prefs jsonb NOT NULL/.test(content)).toBe(true);
    expect(/widgets jsonb NOT NULL/.test(content)).toBe(true);
  });

  it('repository expose findBySiteAndProfile + upsert et utilise COALESCE', () => {
    const file = 'central-server/src/repositories/remote-preferences.repository.ts';
    expect(exists(file)).toBe(true);
    const content = read(file);
    expect(/findBySiteAndProfile/.test(content)).toBe(true);
    expect(/upsert/.test(content)).toBe(true);
    // INSERT ON CONFLICT ... DO UPDATE doit utiliser COALESCE pour préserver
    // le bucket non fourni (PATCH partiel prefs sans toucher widgets).
    expect(/ON CONFLICT \(site_id, profile_id\) DO UPDATE/.test(content)).toBe(true);
    expect(/COALESCE\(\$3::jsonb, remote_preferences\.prefs\)/.test(content)).toBe(true);
    expect(/COALESCE\(\$4::jsonb, remote_preferences\.widgets\)/.test(content)).toBe(true);
  });

  it('repository est exporté depuis repositories/index.ts (barrel)', () => {
    const barrel = read('central-server/src/repositories/index.ts');
    expect(/remotePreferencesRepository/.test(barrel)).toBe(true);
    expect(/from '\.\/remote-preferences\.repository'/.test(barrel)).toBe(true);
  });

  it('saas.controller utilise le repository (pas de query() direct, pas d\'import db)', () => {
    const ctrl = read('central-server/src/controllers/saas.controller.ts');
    expect(/getRemotePreferences/.test(ctrl)).toBe(true);
    expect(/upsertRemotePreferences/.test(ctrl)).toBe(true);
    expect(/remotePreferencesRepository/.test(ctrl)).toBe(true);
    // Repository pattern enforced — controllers ne doivent pas importer ../config/database
    expect(/from '\.\.\/config\/database'/.test(ctrl)).toBe(false);
  });

  it('saas.routes monte GET et PUT avec verifyRemotePin + validateParams', () => {
    const routes = read('central-server/src/routes/saas.routes.ts');
    expect(/get\(\s*'\/:siteId\/profiles\/:profileId\/preferences'/.test(routes)).toBe(true);
    expect(/put\(\s*'\/:siteId\/profiles\/:profileId\/preferences'/.test(routes)).toBe(true);
    // PIN obligatoire (sinon profil sans PIN = ouvert, mais avec PIN = bloqué).
    // Au moins 2 occurrences de verifyRemotePin sur les nouvelles routes.
    const verifyCount = (routes.match(/verifyRemotePin/g) || []).length;
    expect(verifyCount).toBeGreaterThanOrEqual(4); // config + profile config + GET prefs + PUT prefs
    // PUT doit valider le body Joi.
    expect(/validate\(schemas\.remotePreferencesUpsert\)/.test(routes)).toBe(true);
  });

  it('Joi schema remotePreferencesUpsert whitelist strict + or() exigence', () => {
    const validation = read('central-server/src/middleware/validation.ts');
    expect(/remotePreferencesUpsert:\s*Joi\.object/.test(validation)).toBe(true);
    // Au moins un des deux objets doit être fourni (.or('prefs','widgets')).
    expect(/\.or\(['"]prefs['"]\s*,\s*['"]widgets['"]\)/.test(validation)).toBe(true);
    // Whitelist par .valid() pour fontSize / layoutMobile / layoutDesktop.
    expect(/fontSize:\s*Joi\.string\(\)\.valid\(['"]normal['"]\s*,\s*['"]large['"]\)/.test(validation)).toBe(true);
    expect(/layoutMobile:\s*Joi\.string\(\)\.valid/.test(validation)).toBe(true);
    expect(/layoutDesktop:\s*Joi\.string\(\)\.valid/.test(validation)).toBe(true);
  });

  it('frontend RemotePreferencesService bootstrap DB + sync debouncé + reload sur switch profil', () => {
    const svc = read('raspberry/src/app/components/remote/remote-preferences.service.ts');
    // Injecte HttpClient + SaasConfigService.
    expect(/inject\(HttpClient\)/.test(svc)).toBe(true);
    expect(/inject\(SaasConfigService\)/.test(svc)).toBe(true);
    // Endpoint construit avec siteId + profileId scopés.
    expect(/\/saas\/\$\{siteId\}\/profiles\/\$\{profileId\}\/preferences/.test(svc)).toBe(true);
    // Sync debouncé.
    expect(/debounceTime\(SYNC_DEBOUNCE_MS\)/.test(svc)).toBe(true);
    // Méthode pour widgets (déléguée par RemoteV2Component.toggleWidget).
    expect(/updateWidget</.test(svc)).toBe(true);
    // Reload depuis SaasConfigService.profileChanged$.
    expect(/profileChanged\$/.test(svc)).toBe(true);
  });

  it('SaasConfigService émet profileChanged$ sur les 3 hooks (load/set/clear)', () => {
    const svc = read('raspberry/src/app/services/saas-config.service.ts');
    expect(/profileChangedSubject/.test(svc)).toBe(true);
    expect(/profileChanged\$/.test(svc)).toBe(true);
    // Doit emit dans loadProfileConfiguration, setSelectedConfiguration, clearSelection.
    const emitCount = (svc.match(/profileChangedSubject\.next\(/g) || []).length;
    expect(emitCount).toBeGreaterThanOrEqual(3);
  });

  it('RemoteV2Component délègue toggleWidget au service (plus de localStorage direct widgets)', () => {
    const v2 = read('raspberry/src/app/components/remote-v2/remote-v2.component.ts');
    expect(/prefsService\.updateWidget\(/.test(v2)).toBe(true);
    // L'ancienne constante WIDGETS_STORAGE_KEY_BASE ne doit plus exister
    // (le service gère la persistance).
    expect(/WIDGETS_STORAGE_KEY_BASE/.test(v2)).toBe(false);
    // Pas de localStorage.setItem direct sur la clé widgets.
    expect(/localStorage\.setItem\(\s*['"]madxp_remote_v2_widgets/.test(v2)).toBe(false);
  });
});
