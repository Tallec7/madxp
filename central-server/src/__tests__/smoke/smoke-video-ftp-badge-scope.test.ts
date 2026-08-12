/**
 * Smoke — le badge « vidéos manquantes » d'un site compte ce qui est DIFFUSÉ
 *
 * La PR #1165 a branché l'alerting sur `config_profiles`. La restitution qui reste
 * à l'écran, elle, était toujours branchée sur `site_videos` : le badge du tab
 * « Contenu » affichait **0 pour Mangin-Beaulieu (NLF) qui en diffusait 17**, 1 pour
 * Lanester qui en diffusait 15, 2 pour la Bottière qui en diffusait 20. Le tableau
 * de bord ne se taisait pas, il rassurait — le mode d'échec le plus coûteux.
 *
 * `site_videos` est alimentée à l'upload ciblé et au déploiement (ADR-048) : une
 * config copiée ou importée n'y laisse rien. Elle ne voyait que 3 des 51 lignes.
 *
 * Ces garde-fous sont statiques : la jointure est une propriété du SQL, et sa
 * régression serait silencieuse (le badge afficherait un chiffre, simplement faux).
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_SRC = path.resolve(__dirname, '../..');
const repositorySrc = fs.readFileSync(
  path.join(REPO_SRC, 'repositories/video-ftp-audit.repository.ts'),
  'utf8',
);

/** Découpe une méthode du source pour l'inspecter isolément. */
function methodBody(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Badge « vidéos manquantes » — périmètre de rattachement au site', () => {
  it('le prédicat partagé couvre la bibliothèque OU la diffusion', () => {
    const predicate = methodBody(repositorySrc, 'LINKED_TO_SITE = `', 'async countActiveForSite');
    expect(predicate).toMatch(/FROM site_videos sv/);
    expect(predicate).toMatch(/FROM config_profiles cp/);
    expect(predicate).toMatch(/\bOR EXISTS\b/);
  });

  it('le badge et la bannière partagent ce prédicat — pas de divergence entre le chiffre et la liste', () => {
    const count = methodBody(repositorySrc, 'async countActiveForSite', 'async findActiveForSite');
    const list = methodBody(repositorySrc, 'async findActiveForSite', 'async findMissingReferencedInProfiles');
    expect(count).toMatch(/VideoFtpAuditRepository\.LINKED_TO_SITE/);
    expect(list).toMatch(/VideoFtpAuditRepository\.LINKED_TO_SITE/);
  });

  it('ni le badge ni la bannière ne joignent `site_videos` seul', () => {
    const count = methodBody(repositorySrc, 'async countActiveForSite', 'async findActiveForSite');
    expect(count).not.toMatch(/JOIN site_videos/);
    const list = methodBody(repositorySrc, 'async findActiveForSite', 'async findMissingReferencedInProfiles');
    expect(list).not.toMatch(/JOIN site_videos/);
  });

  it('le croisement config utilise strpos() et jamais LIKE (les `_` des noms sont des jokers LIKE)', () => {
    // `LIKE '%TV_PART03%'` matcherait `TVxPART03` : faux positif silencieux.
    const predicate = methodBody(repositorySrc, 'LINKED_TO_SITE = `', 'async countActiveForSite');
    expect(predicate).toMatch(/strpos\(cp\.configuration::text, v\.filename\)/);
    expect(predicate).not.toMatch(/LIKE/i);
  });

  it('le croisement teste filename ET original_name (la config porte le nom non assaini)', () => {
    // La config référence `TV_PART03_SPORT&WELNESS.mp4` là où storage_path porte
    // `TV_PART03_SPORTWELNESS.mp4`. Ne tester que l'un des deux rate une part du parc.
    const predicate = methodBody(repositorySrc, 'LINKED_TO_SITE = `', 'async countActiveForSite');
    expect(predicate).toMatch(/v\.original_name IS NOT NULL/);
    expect(predicate).toMatch(/strpos\(cp\.configuration::text, v\.original_name\)/);
  });

  it('la bannière expose l\'origine du rattachement — la garde d\'unlink en dépend', () => {
    // `findActiveForSite` sert aussi de garde à `unlinkSiteFtpOrphan`, qui purge le
    // JSONB des profils. Exclure les vidéos config-only rendait non nettoyables
    // précisément celles qui en avaient besoin.
    const list = methodBody(repositorySrc, 'async findActiveForSite', 'async findMissingReferencedInProfiles');
    expect(list).toMatch(/linked_in_library/);
    expect(list).toMatch(/referenced_in_config/);
  });

  it('le tri « impact » de la vue admin flotte pondère via la config', () => {
    const all = methodBody(repositorySrc, 'async findAllActive', 'LINKED_TO_SITE = `');
    const refCount = all.slice(0, all.indexOf('AS reference_count'));
    expect(refCount).toMatch(/FROM config_profiles cp/);
  });

  it('les jauges de supervision sont branchées sur la notification, pas sur le scan brut', () => {
    // Le total d'orphelines mélange 30 lignes de ménage et 16 pannes réelles ; c'est
    // le sous-ensemble diffusé qu'il faut superviser.
    const service = fs.readFileSync(path.join(REPO_SRC, 'services/video-ftp-audit.service.ts'), 'utf8');
    const notify = methodBody(service, 'async notifyMissingReferencedInProfiles', 'private async fetchAllVideos');
    expect(notify).toMatch(/recordVideoFtpMissingReferenced/);
    // Retour à zéro explicite : sans lui, la dernière valeur non nulle reste affichée.
    expect(notify).toMatch(/recordVideoFtpMissingReferenced\(0, 0\)/);
  });
});
