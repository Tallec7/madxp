/**
 * Smoke — deux suites de tests ne doivent jamais se disputer un port.
 *
 * ## L'incident
 *
 * Importer `server.ts` démarre un vrai serveur HTTP (`startServer()` s'exécute au
 * chargement du module). Quinze suites l'importent pour récupérer `app`, et chacune
 * s'était vu attribuer un port à la main — 3096 à 3109, « pour éviter les conflits ».
 *
 * Un registre tenu par des humains dérive : il comptait déjà **deux doublons**
 * (3098 : `smoke-server-core` + `sites-connected-receivers` ; 3099 : `admin.routes`
 * + `smoke-wiring`). Jest répartissant les suites sur des process parallèles, deux
 * d'entre elles écoutaient le même port au même instant → `EADDRINUSE`, puis
 * « Server is not running. » quand le `afterAll` fermait un serveur jamais ouvert.
 *
 * Résultat : un échec **aléatoire**, sur une suite sans rapport avec le changement
 * en cours de test. Reproduit 6 fois sur 6 en parallèle, 0 sur 6 en `--runInBand`.
 *
 * ## Le contrat que ce fichier verrouille
 *
 * Le port d'écoute est **0 sous test** : l'OS en garantit l'unicité, il n'y a plus
 * de registre à tenir ni de doublon possible. Les deux moitiés du contrat sont
 * vérifiées ici, parce que l'une sans l'autre ramène le bug :
 *
 *  1. `server.ts` écoute sur un port éphémère quand `NODE_ENV === 'test'` ;
 *  2. aucune suite ne refixe un port — sinon elle se réattribue un numéro et
 *     rouvre la porte aux collisions.
 *
 * File-based (audit-then-guard), pas de DB ni de serveur requis.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../..');
const TESTS = path.join(SRC, '__tests__');

/** Tous les fichiers de test du serveur, récursivement. */
function listTestFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listTestFiles(full);
    return e.isFile() && e.name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('Smoke — isolation des ports en test', () => {
  it('server.ts écoute sur un port ÉPHÉMÈRE sous test', () => {
    const src = fs.readFileSync(path.join(SRC, 'server.ts'), 'utf8');

    // Le `0` est tout le correctif : c'est lui qui délègue l'unicité à l'OS.
    // Revenir à un port fixe sous test ramène l'EADDRINUSE aléatoire.
    expect(src).toMatch(/const PORT = NODE_ENV === 'test' \? 0 : process\.env\.PORT \|\| 3001;/);
  });

  it('aucune suite ne refixe un port d’écoute', () => {
    const offenders = listTestFiles(TESTS)
      .filter((f) => /process\.env\.PORT\s*=/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(TESTS, f));

    // Assertion NÉGATIVE : c'est la formulation buguée qu'on bloque. Réattribuer
    // un port à la main, c'est rouvrir le registre qui a produit les deux doublons.
    expect(offenders).toEqual([]);
  });

  it('les suites qui démarrent le serveur ferment bien leur httpServer', () => {
    // Sans `close`, le handle reste ouvert : Jest force la sortie du worker et le
    // port met un temps variable à se libérer — la collision redevient possible
    // même avec des ports distincts.
    const starters = listTestFiles(TESTS).filter((f) => {
      const s = fs.readFileSync(f, 'utf8');
      return /await import\('(\.\.\/)+server'\)/.test(s) && /httpServer\s*=/.test(s);
    });

    expect(starters.length).toBeGreaterThan(0); // le test se saborderait sinon

    const leaking = starters
      .filter((f) => !/httpServer\.close\(/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(TESTS, f));

    expect(leaking).toEqual([]);
  });
});
