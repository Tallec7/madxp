/**
 * Le cache-buster des sondes d'existence FTP.
 *
 * Incident du 2026-08-11 : un edge CDN chaud servait un 200 pour neuf fichiers
 * supprimés de l'origine chez Piraths. Ce qui suit verrouille les deux propriétés
 * qui rendent la sonde fiable — l'URL est neuve, et elle vise bien la ressource.
 */

import { withCacheBuster, NO_CACHE_HEADERS } from '../cache-busted-url';

const URL_NUE = 'https://kalonpartners.bzh/neopro-video/videos/ab/cd.mp4';

describe('withCacheBuster', () => {
  it('rend une URL différente à CHAQUE appel', () => {
    // La propriété essentielle : deux sondes successives (HEAD puis repli Range)
    // ne doivent jamais partager une URL, sinon la seconde tape le cache que la
    // première vient de remplir.
    const vus = new Set(Array.from({ length: 50 }, () => withCacheBuster(URL_NUE)));
    expect(vus.size).toBe(50);
  });

  it('vise toujours la même ressource', () => {
    // Une sonde qui interroge une autre URL que le fichier ne prouve rien.
    expect(withCacheBuster(URL_NUE)).toContain('/neopro-video/videos/ab/cd.mp4');
    expect(withCacheBuster(URL_NUE)).toMatch(/[?&]_audit=[0-9a-f-]{36}$/);
  });

  it('respecte une query déjà présente', () => {
    const avecQuery = withCacheBuster(`${URL_NUE}?v=2`);
    // `?` une seule fois, sinon l'URL est malformée et la sonde échoue à tort.
    expect(avecQuery.match(/\?/g)).toHaveLength(1);
    expect(avecQuery).toContain('v=2');
    expect(avecQuery).toContain('&_audit=');
  });

  it('expose des en-têtes anti-cache', () => {
    expect(NO_CACHE_HEADERS).toMatchObject({ 'Cache-Control': 'no-cache, no-store' });
  });
});

/**
 * Garde-fou : toute sonde d'existence FTP passe par le helper.
 *
 * Quatre appelants sondent l'existence d'un fichier ; ils ont deux motivations
 * opposées — le 200 fantôme (fichier mort vu vivant) pour l'audit, le pré-filtre
 * de déploiement et le script legacy ; le 404 fantôme (upload réussi vu raté)
 * pour la vérification post-upload. Le remède est le même, l'oubli se paie des
 * deux côtés.
 */
describe('les sondes d’existence FTP passent toutes par le helper', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const SRC = path.resolve(__dirname, '../..');
  const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

  const SONDEURS = [
    'services/video-ftp-audit.service.ts',
    'services/deployment.service.ts',
    'services/upload-verification.service.ts',
    'scripts/audit-ftp-legacy-videos.ts',
  ];

  it.each(SONDEURS)('%s utilise withCacheBuster', (rel) => {
    expect(read(rel)).toMatch(/withCacheBuster\(/);
  });

  it.each(SONDEURS)('%s ne sonde jamais une URL de stockage NUE', (rel) => {
    // Assertion NÉGATIVE : la formulation buguée est de passer directement le
    // constructeur d'URL à `fetch`, sans le faire transiter par le buster.
    // Elle vise le CONSTRUCTEUR d'URL, pas la forme de l'appel — une première
    // version interdisait `fetch(url, { method: 'HEAD'` et rejetait donc aussi
    // l'implémentation CORRECTE qui buste `url` une ligne plus haut.
    expect(read(rel)).not.toMatch(/fetch\(\s*(getVideoUrl|getFtpPublicUrl|buildUrl)\(/);
  });
});
