/**
 * CLI mire de diagnostic LED — remplace le SPIKE matériel par une photo.
 *
 * Génère une (ou trois) mire(s) numérotée(s) à diffuser sur le ruban d'un club.
 * On photographie le ruban, et l'ordre des blocs sur la photo dit comment le
 * processeur redistribue le signal — sans acheter le moindre matériel.
 *
 * Usage :
 *   npm run led:mire                                      # 1920×1080, 8 blocs
 *   npm run led:mire -- --all --sides 10,10,10,10 --pitch 6.25 --height 160
 *   npm run led:mire -- --width 6400 --height-px 160 --blocks 12
 *   npm run led:mire -- --out /tmp/mire.mp4 --duration 20
 *
 * Le mode `--all` produit LES TROIS formats à comparer, c'est lui qui tranche :
 *
 *   1. `signal-standard`  1920×1080  — que fait le processeur d'un 16:9 ordinaire ?
 *   2. `ruban-deroule`    Σcôtés×px  — accepte-t-il l'ultra-wide à plat ?
 *   3. `canvas-plie`      1920×N     — attend-il un canvas déjà plié ?
 *
 * Celui qui s'affiche proprement, dans l'ordre 1→N sur tout le tour, désigne le
 * contrat d'entrée réel du processeur. Cf. maquette
 * `docs/proposals/assets/led-mockups/04-matrice-des-montages.html`.
 *
 * Écrit les MP4 sur disque (chemins loggés) — pas d'upload ni de DB.
 */

import * as os from 'os';
import * as path from 'path';
import logger from '../config/logger';
import { renderTestPattern, findFont } from '../services/led-test-pattern.service';
import { computeRibbonDimensions, computeFoldGeometry } from '../services/led-fold.service';

interface Args {
  sides: number[];
  pitchMm: number;
  panelHeight: number;
  bandWidth: number;
  blocks: number;
  durationSec: number;
  width: number | null;
  height: number | null;
  outPath: string | null;
  all: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const sides = (get('--sides') ?? '10,10,10,10')
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  return {
    sides: sides.length ? sides : [10],
    pitchMm: Number(get('--pitch') ?? 6.25),
    panelHeight: Number(get('--height') ?? 160),
    bandWidth: Number(get('--band-width') ?? 1920),
    blocks: Number(get('--blocks') ?? 8),
    durationSec: Number(get('--duration') ?? 10),
    width: get('--width') ? Number(get('--width')) : null,
    height: get('--height-px') ? Number(get('--height-px')) : null,
    outPath: get('--out') ?? null,
    all: argv.includes('--all'),
  };
}

interface Variante {
  nom: string;
  width: number;
  height: number;
  pourquoi: string;
}

/** Les trois formats du diagnostic, dérivés du profil du club. */
function variantes(args: Args): Variante[] {
  const ribbon = computeRibbonDimensions({
    sides: args.sides,
    pitchMm: args.pitchMm,
    height: args.panelHeight,
  });
  const fold = computeFoldGeometry({
    ribbonWidth: ribbon.ribbonWidth,
    ribbonHeight: ribbon.ribbonHeight,
    bandWidth: args.bandWidth,
  });

  return [
    {
      nom: 'signal-standard',
      width: 1920,
      height: 1080,
      pourquoi: 'Que fait le processeur d’un 16:9 ordinaire ? (étire / cantonne / répète)',
    },
    {
      nom: 'ruban-deroule',
      width: ribbon.ribbonWidth,
      height: ribbon.ribbonHeight,
      pourquoi: 'Accepte-t-il l’ultra-wide à plat, et le mappe-t-il lui-même ?',
    },
    {
      nom: 'canvas-plie',
      width: fold.canvasWidth,
      height: fold.canvasHeight,
      pourquoi: `Attend-il un canvas déjà plié ? (${fold.bandCount} bandes empilées)`,
    },
  ];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const font = findFont();

  logger.info('Mire LED — génération', {
    police: font ?? 'AUCUNE (repli barres)',
    blocs: args.blocks,
    duree: args.durationSec,
  });

  const cibles: Variante[] = args.all
    ? variantes(args)
    : [
        {
          nom: 'mire',
          width: args.width ?? 1920,
          height: args.height ?? 1080,
          pourquoi: 'Format explicite demandé en ligne de commande.',
        },
      ];

  let echecs = 0;
  for (const v of cibles) {
    const out =
      args.outPath && cibles.length === 1
        ? args.outPath
        : path.join(os.tmpdir(), `led-mire-${v.nom}-${v.width}x${v.height}.mp4`);

    const res = await renderTestPattern({
      width: v.width,
      height: v.height,
      blocks: args.blocks,
      durationSec: args.durationSec,
      outputPath: out,
    });

    if (res.success) {
      logger.info(`✅ ${v.nom} — ${v.width}×${v.height}`, {
        fichier: res.outputPath,
        blocs: res.blocks.length,
        ms: res.durationMs,
        pourquoi: v.pourquoi,
      });
    } else {
      echecs++;
      logger.error(`❌ ${v.nom} — ${v.width}×${v.height}`, { erreur: res.error });
    }
  }

  if (args.all) {
    logger.info(
      'Mode d’emploi : diffuser chaque mire sur le ruban, photographier, ' +
        'et comparer. Celle qui s’affiche dans l’ordre 1→N sur tout le tour ' +
        'désigne le contrat d’entrée réel du processeur. Le repère BLANC marque ' +
        'le début du signal, le NOIR la fin — un ruban peut être câblé à l’envers.'
    );
  }

  process.exit(echecs > 0 ? 1 : 0);
}

main().catch((err) => {
  logger.error('Mire LED — échec inattendu', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
