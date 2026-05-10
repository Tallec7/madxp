/**
 * Smoke tests — Dashboard sauvegarde profil = déploiement versionné (Phase A1).
 *
 * Audit 2026-05-10 (docs/audits/pi-profiles-config-paths-2026-05-10.md) :
 *   3 endpoints distincts existent côté cloud pour modifier la config d'un
 *   profil. Avant cette PR, le dashboard sauvegardait via la combinaison
 *   updateProfileConfiguration + syncProfiles, qui :
 *     - écrivait bien la DB
 *     - envoyait sync_profiles au Pi
 *     - mais NE créait AUCUNE version dans config_history
 *     - ne touchait PAS pending_config_sync_until
 *
 *   Conséquence : impossible de retracer une MAJ perdue, aucun audit trail.
 *
 *   La sauvegarde profil doit désormais passer par deployProfile (POST
 *   /sites/:id/profiles/:profileId/deploy) qui versionne et envoie
 *   update_config + sync_profiles.
 *
 *   Ce smoke est un garde-fou file-based : il bloque tout retour arrière
 *   vers syncProfiles dans le chemin confirmDeployProfile du dashboard.
 *
 * @see central-server/src/controllers/config-profiles.controller.ts:487 (deployProfile)
 * @see docs/audits/pi-profiles-config-paths-2026-05-10.md (Phase A1)
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const COMPONENT_PATH =
  'central-dashboard/src/app/features/sites/components/site-content-tab/deployment-status/deployment-status.component.ts';

describe('Smoke — Dashboard confirmDeployProfile uses deployProfile (Phase A1)', () => {
  let src: string;
  let confirmDeployProfileBlock: string;

  beforeAll(() => {
    src = read(COMPONENT_PATH);
    // Extract the confirmDeployProfile method body — from the declaration
    // up to the next private method (or end-of-file as fallback).
    const match = src.match(
      /private\s+confirmDeployProfile\s*\([^)]*\)\s*:\s*void\s*\{[\s\S]*?(?=\n\s{2}private\s|\n\s{2}public\s|\n\}\s*$)/
    );
    if (!match) throw new Error('confirmDeployProfile method not found in deployment-status.component.ts');
    confirmDeployProfileBlock = match[0];
  });

  it('confirmDeployProfile calls sitesService.deployProfile (versioned path)', () => {
    // deployProfile = POST /sites/:id/profiles/:profileId/deploy
    // Crée une version config_history et envoie update_config + sync_profiles.
    expect(confirmDeployProfileBlock).toMatch(
      /sitesService\.deployProfile\s*\(\s*this\.siteId\s*,\s*this\.selectedProfileId\s*\)/
    );
  });

  it('confirmDeployProfile does NOT call syncProfiles (regression guard)', () => {
    // Le call syncProfiles ici contournait le versioning. Garde-fou : si une
    // future PR le réintroduit (ex: revert), le smoke échoue.
    expect(confirmDeployProfileBlock).not.toMatch(/sitesService\.syncProfiles\s*\(/);
  });

  it('confirmDeployProfile saves DB first via updateProfileConfiguration', () => {
    // L'enchaînement reste : (1) updateProfileConfiguration persiste la
    // config en DB, (2) deployProfile lit cette config en DB pour la
    // versionner et l'envoyer au Pi. Sans (1), deployProfile rejouerait la
    // version précédente.
    expect(confirmDeployProfileBlock).toMatch(
      /sitesService\.updateProfileConfiguration\s*\(\s*this\.siteId\s*,\s*this\.selectedProfileId/
    );
  });

  it('SaaS short-circuit reste actif (pas de Pi à déployer)', () => {
    // Les sites SaaS sortent avant l'appel deployProfile parce qu'ils n'ont
    // pas de Pi qui consomme la commande. Garde-fou couplé avec saas.md.
    expect(confirmDeployProfileBlock).toMatch(/this\.siteType\s*===\s*'saas'/);
  });

  it('sitesService.deployProfile method signature still exists', () => {
    // Vérifie que le service Angular expose toujours deployProfile avec la
    // bonne signature (siteId, profileId). Un rename casserait silencieusement
    // confirmDeployProfile (TypeScript catch normalement, mais on protège).
    const svc = read('central-dashboard/src/app/core/services/sites.service.ts');
    expect(svc).toMatch(
      /deployProfile\s*\(\s*siteId\s*:\s*string\s*,\s*profileId\s*:\s*string\s*\)\s*:\s*Observable</
    );
    expect(svc).toMatch(/`\/sites\/\$\{siteId\}\/profiles\/\$\{profileId\}\/deploy`/);
  });
});
