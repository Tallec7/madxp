/**
 * Smoke tests — ADR-115 Auth preservation cross-reboot.
 *
 * Bug observé : sur un Pi connecté, le bloc `auth.clubName` / `auth.password`
 * du `configuration.json` était remis à vide à chaque reboot. Cause racine :
 *   1. Le bouton "Déployer Authentification Club" mode Pi pushait `update_config`
 *      au Pi mais ne mettait PAS à jour le profil cloud par défaut.
 *   2. Le profil cloud restait à `auth: { password: "" }`, et à chaque
 *      `sync_profiles` (notamment au reboot via `applyProfile`), le merge
 *      pouvait écraser l'auth local.
 *
 * Garde-fou cross-composant :
 *   - sync-agent : `auth` est dans `LOCAL_ONLY_SETTINGS` → préservation Pi-side
 *   - dashboard  : `saveClubAuth` mode Pi update aussi le profil cloud
 *   - test config-merge : assertion regression-guard côté Pi
 *
 * File-level reads only (no app bootstrap).
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Smoke — ADR-115 auth preservation', () => {
  // ------------ sync-agent : LOCAL_ONLY_SETTINGS ------------

  it("config-merge declares 'auth' in LOCAL_ONLY_SETTINGS", () => {
    const merge = read('raspberry/sync-agent/src/utils/config-merge.js');
    // La constante doit lister 'auth' en plus des autres clés protégées.
    const localOnlyMatch = merge.match(/const\s+LOCAL_ONLY_SETTINGS\s*=\s*\[([\s\S]*?)\];/);
    expect(localOnlyMatch).not.toBeNull();
    expect(/'auth'/.test(localOnlyMatch![1])).toBe(true);
  });

  it("config-merge skips 'auth' restoration when dashboard pushes remotePassword/clubName", () => {
    const merge = read('raspberry/sync-agent/src/utils/config-merge.js');
    // Sans cet opt-out, le bouton "Déployer" du dashboard serait inerte
    // (la restauration LOCAL_ONLY annulerait la mise à jour explicite).
    expect(
      /key\s*===\s*'auth'[\s\S]{0,300}neoProContent\.remotePassword[\s\S]{0,80}neoProContent\.clubName/.test(merge)
    ).toBe(true);
  });

  // ------------ sync-agent : test unitaire regression guard ------------

  it('config-merge.test asserts auth is preserved against an empty cloud profile', () => {
    const test = read('raspberry/sync-agent/src/__tests__/config-merge.test.js');
    // Le test "preserves local auth when cloud profile carries auth: { password: ''" doit exister.
    expect(/preserves local auth when cloud profile carries auth/.test(test)).toBe(true);
    // Le test doit asserter le password local survit.
    expect(/expect\(merged\.auth\.password\)\.toBe\('LANESTER26'\)/.test(test)).toBe(true);
  });

  // ------------ dashboard : symétrie SaaS/Pi ------------

  it('saveClubAuth mode Pi calls mergeDefaultProfileConfig in addition to update_config', () => {
    const svc = read(
      'central-dashboard/src/app/features/sites/components/site-settings-tab/site-settings-data.service.ts'
    );
    // Mode Pi doit appeler les DEUX : deployClubAuth (Pi command) + mergeDefaultProfileConfig (cloud).
    expect(/deployClubAuth\(siteId,\s*neoProContent\)\.pipe/.test(svc)).toBe(true);
    expect(/mergeDefaultProfileConfig\(siteId,\s*profileAuth\)/.test(svc)).toBe(true);
  });

  // ------------ backfill : script présent ------------

  it('backfill SQL script is committed', () => {
    const script = read('central-server/src/scripts/backfill-config-profiles-auth.sql');
    // Doit lire local_config_mirror et écrire dans config_profiles.configuration.auth.
    expect(/local_config_mirror->'auth'/.test(script)).toBe(true);
    expect(/UPDATE config_profiles/.test(script)).toBe(true);
    expect(/is_default = TRUE/.test(script)).toBe(true);
    // Doit être idempotent (filtre sur configuration.auth.password vide).
    expect(/cp\.configuration->'auth'->>'password'\s+IS\s+NULL/.test(script)).toBe(true);
  });
});
