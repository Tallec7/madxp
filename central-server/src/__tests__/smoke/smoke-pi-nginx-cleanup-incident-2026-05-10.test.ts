/**
 * Smoke tests — incident RACC 2026-05-10 nginx legacy symlink + cache dir.
 *
 * INCIDENT (2026-05-10) — TV + portail captif HS sur RACC.
 * Cause racine :
 *   1. install.sh historique crée /etc/nginx/sites-enabled/neopro (legacy)
 *   2. OTA récent déploie /etc/nginx/sites-enabled/{neopro-base, neopro-hls,
 *      firestick-captive} mais ne supprime pas le legacy
 *   3. nginx au reload : "duplicate default_server for 0.0.0.0:80" → fail
 *   4. neopro-hls.conf déclare proxy_cache_path /var/cache/nginx/madxp_videos
 *      qui n'existe pas → "mkdir() failed (2: No such file or directory)" → fail
 *
 * FIX — ota-install.js (raspberry/sync-agent/src/commands/ota-install.js)
 *   doit auto-réparer à chaque OTA :
 *   - retirer /etc/nginx/sites-enabled/neopro AVANT de déployer neopro-base
 *   - mkdir -p /var/cache/nginx/madxp_videos AVANT de déployer neopro-hls
 *
 * Sans ces 2 actions, le bug RACC se reproduira sur tout Pi de la flotte
 * qui a un ancien install.sh + reçoit un OTA avec neopro-base/hls.
 *
 * File-level reads only (no app bootstrap).
 *
 * @see docs/runbooks/INCIDENT-LOG.md (entrée 2026-05-10)
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const OTA_INSTALL_PATH = 'raspberry/sync-agent/src/commands/ota-install.js';

describe('Smoke — Pi nginx cleanup (incident RACC 2026-05-10)', () => {
  let src: string;

  beforeAll(() => {
    src = read(OTA_INSTALL_PATH);
  });

  it('ota-install.js removes legacy /etc/nginx/sites-enabled/neopro before deploying neopro-base', () => {
    // Le cleanup doit être conditionné sur la présence de neopro-base.conf
    // dans le payload OTA (sinon on supprime un symlink encore actif sur les
    // Pi qui n'ont pas encore migré vers la nouvelle archi).
    expect(src).toMatch(/confFiles\.includes\(['"]neopro-base\.conf['"]\)/);
    // Et la suppression elle-même doit cibler exactement le legacy.
    expect(src).toMatch(/sudo rm -f \/etc\/nginx\/sites-enabled\/neopro(\s|['"])/);
  });

  it('ota-install.js ensures /var/cache/nginx/madxp_videos exists before deploying neopro-hls', () => {
    // neopro-hls.conf déclare proxy_cache_path sur ce dossier. Sans mkdir,
    // nginx -t échoue et le reload tue tout le service.
    expect(src).toMatch(/confFiles\.includes\(['"]neopro-hls\.conf['"]\)/);
    expect(src).toMatch(/sudo mkdir -p \/var\/cache\/nginx\/madxp_videos/);
    expect(src).toMatch(/sudo chown www-data:www-data \/var\/cache\/nginx\/madxp_videos/);
  });

  it('ota-install.js cleanup runs BEFORE the deploy loop (so legacy symlink removed before nginx reload)', () => {
    // Ordre lexical : le rm legacy + mkdir cache doivent apparaître AVANT la
    // boucle de déploiement qui crée les nouveaux symlinks et reload nginx.
    // Sinon on reload avec le conflit toujours présent.
    // Ancre spécifique : la boucle de déploiement contient `sudo cp ${src} ${dest}`
    // — c'est elle qu'il faut localiser, pas n'importe quelle boucle confFiles.
    const idxRm = src.search(/sudo rm -f \/etc\/nginx\/sites-enabled\/neopro(\s|['"])/);
    const idxMkdir = src.search(/sudo mkdir -p \/var\/cache\/nginx\/madxp_videos/);
    const idxDeployCp = src.search(/sudo cp \$\{src\} \$\{dest\}/);
    expect(idxRm).toBeGreaterThan(0);
    expect(idxMkdir).toBeGreaterThan(0);
    expect(idxDeployCp).toBeGreaterThan(0);
    expect(idxRm).toBeLessThan(idxDeployCp);
    expect(idxMkdir).toBeLessThan(idxDeployCp);
  });

  it('cleanup blocks are wrapped in try/catch (non-blocking, follows ADR-051 pattern)', () => {
    // Si le rm ou mkdir échoue (sudo refusé, race), l'OTA ne doit pas s'arrêter.
    // Le warn dans le catch est la seule observabilité côté logs.
    expect(src).toMatch(/Failed to remove legacy nginx symlink \(non-blocking\)/);
    expect(src).toMatch(/Failed to ensure nginx cache dir \(non-blocking\)/);
  });

  it('INCIDENT-LOG.md tracks the incident with the smoke filename', () => {
    const log = read('docs/runbooks/INCIDENT-LOG.md');
    expect(log).toMatch(/2026-05-10[\s\S]*?RACC[\s\S]*?smoke-pi-nginx-cleanup-incident-2026-05-10/);
  });
});
