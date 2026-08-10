/**
 * CLI mire de diagnostic LED — une image, une photo, une fois par club.
 *
 * Génère UNE grille numérotée à la résolution de sortie de la source. On la
 * diffuse sur le ruban, on photographie, et la photo dit ce que le processeur
 * fait vraiment du signal. Remplace le SPIKE-003 matériel, sans rien acheter.
 *
 * Usage :
 *   npm run led:mire                                   # 1920×1080, grille 8×4
 *   npm run led:mire -- --width 3840 --height 2160     # source en 4K
 *   npm run led:mire -- --cols 6 --rows 3 --duration 30
 *   npm run led:mire -- --out ~/Desktop/mire.mp4
 *
 * ⚠️ La taille à passer est celle du **signal émis par la source** (le mode
 * d'affichage du PC / du Pi), PAS celle du ruban. Le lecteur TV rend en
 * `object-fit: contain` : la résolution du fichier n'atteint jamais le
 * processeur, seul le mode de sortie compte.
 *
 * ## Lire la photo
 *
 *   rangée 1 seule, cases dans l'ordre     → le processeur mappe une bande
 *   rangées 1,2,3,4 bout à bout            → il DÉPLIE un canvas plié
 *   toute la grille écrasée                → il étire le signal entier
 *   le même motif répété N fois            → côtés indépendants, même signal
 *
 * Cf. `docs/proposals/assets/led-mockups/04-matrice-des-montages.html`.
 */

import * as os from 'os';
import * as path from 'path';
import logger from '../config/logger';
import { renderTestPattern } from '../services/led-test-pattern.service';

interface Args {
  width: number;
  height: number;
  cols: number;
  rows: number;
  durationSec: number;
  outPath: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const width = Number(get('--width') ?? 1920);
  const height = Number(get('--height') ?? 1080);
  return {
    width,
    height,
    cols: Number(get('--cols') ?? 8),
    rows: Number(get('--rows') ?? 4),
    durationSec: Number(get('--duration') ?? 30),
    outPath: get('--out') ?? path.join(os.tmpdir(), `led-mire-${width}x${height}.mp4`),
  };
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));

  const res = await renderTestPattern({
    width: a.width,
    height: a.height,
    blocks: a.cols,
    rows: a.rows,
    durationSec: a.durationSec,
    outputPath: a.outPath,
  });

  if (!res.success) {
    logger.error('Mire LED — échec', { erreur: res.error });
    process.exit(1);
  }

  logger.info('✅ Mire générée', {
    fichier: res.outputPath,
    signal: `${a.width}×${a.height}`,
    grille: `${a.cols} colonnes × ${a.rows} rangées = ${res.blocks.length} cases`,
    numeros: res.usedFont ? 'chiffres' : 'barres (drawtext indisponible)',
    duree: `${a.durationSec}s`,
  });

  logger.info(
    'Mode d’emploi : téléverser ce fichier comme une vidéo normale, le diffuser ' +
      'sur le ruban, photographier, puis le retirer. Le repère BLANC marque le ' +
      'début du signal (case 1), le NOIR la fin (dernière case) — un ruban peut ' +
      'être câblé à l’envers.'
  );
  logger.info(
    'Lecture — rangée 1 seule dans l’ordre : le processeur mappe une bande. ' +
      'Rangées bout à bout le long du ruban : il DÉPLIE un canvas plié. ' +
      'Grille écrasée : il étire tout le signal. ' +
      'Motif répété N fois : les côtés sont indépendants.'
  );
}

main().catch((err) => {
  logger.error('Mire LED — échec inattendu', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
