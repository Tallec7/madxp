/**
 * POC dimension — ruban LED périmétrique (PROP-014 étape 3).
 *
 * Rend la composition Remotion `LedPerimeterRibbon` à des largeurs CROISSANTES et
 * reporte, sur des FAITS, le plafond de largeur réellement supporté par cette stack
 * Remotion + Chromium headless (≈ 16384 px en théorie côté Chromium). Tranche la
 * décision d'architecture *flat-puis-fold* (un seul ruban large) vs *tuilé-plié*
 * (rendu segmenté) — cf. PROP-014 §9 risque GPU.
 *
 * Usage :
 *   npm run led:ribbon-poc                 # sweep ruban PLAT (20→200 m, P6)
 *   npm run led:ribbon-poc -- --folded     # sweep canvas PLIÉ (prod, attendu OK partout)
 *   npm run led:ribbon-poc -- --pitch 10   # autre pitch
 *   npm run led:ribbon-poc -- --max 250    # étendre le sweep
 *
 * N'écrit rien en DB. Pas de manifest (compo POC, cf. Root.tsx). Sorties MP4 dans
 * un dossier temp, nettoyées en fin de run.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import logger from '../config/logger';
import { computeRibbonDimensions } from '../services/led-fold.service';

const TEMPLATES_STUDIO_DIR =
  process.env.TEMPLATES_STUDIO_DIR ?? path.resolve(__dirname, '../../templates-studio');
const TEMPLATES_STUDIO_ENTRY = path.join(TEMPLATES_STUDIO_DIR, 'index.ts');
const TEMPLATES_STUDIO_PUBLIC = path.join(TEMPLATES_STUDIO_DIR, 'public');

interface SweepResult {
  perimeterM: number;
  width: number;
  ok: boolean;
  ms: number;
  error?: string;
}

function parseArgs(argv: string[]): { pitchMm: number; maxM: number; folded: boolean } {
  let pitchMm = 6;
  let maxM = 200;
  let folded = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pitch' && argv[i + 1]) pitchMm = Number(argv[i + 1]);
    if (argv[i] === '--max' && argv[i + 1]) maxM = Number(argv[i + 1]);
    if (argv[i] === '--folded') folded = true;
  }
  if (!Number.isFinite(pitchMm) || pitchMm <= 0) pitchMm = 6;
  if (!Number.isFinite(maxM) || maxM <= 0) maxM = 200;
  return { pitchMm, maxM, folded };
}

async function main(): Promise<void> {
  const { pitchMm, maxM, folded } = parseArgs(process.argv.slice(2));
  const compositionId = folded ? 'LedPerimeterFolded' : 'LedPerimeterRibbon';

  if (!fs.existsSync(TEMPLATES_STUDIO_ENTRY)) {
    logger.error('led-ribbon-poc: entry introuvable', { TEMPLATES_STUDIO_ENTRY });
    process.exitCode = 1;
    return;
  }

  const { bundle } = (await import('@remotion/bundler')) as typeof import('@remotion/bundler');
  const { renderMedia, selectComposition } = (await import(
    '@remotion/renderer'
  )) as typeof import('@remotion/renderer');

  const browserExecutable = process.env.BROWSER_EXECUTABLE_PATH || undefined;
  const chromiumOptions = { gl: 'swangle' as const, headless: true };

  logger.info('led-ribbon-poc: bundling…', { entry: TEMPLATES_STUDIO_ENTRY, pitchMm, maxM, mode: folded ? 'folded' : 'flat', compositionId });
  const serveUrl = await bundle({
    entryPoint: TEMPLATES_STUDIO_ENTRY,
    publicDir: TEMPLATES_STUDIO_PUBLIC,
  });

  // Sweep de périmètres (1 côté, en mètres). Pas de 20 m jusqu'à maxM.
  const perimeters: number[] = [];
  for (let m = 20; m <= maxM; m += 20) perimeters.push(m);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'led-ribbon-poc-'));
  const results: SweepResult[] = [];

  for (const perimeterM of perimeters) {
    const { ribbonWidth, ribbonHeight } = computeRibbonDimensions({
      sides: [perimeterM],
      pitchMm,
      height: 160,
    });
    const inputProps = {
      sides: [perimeterM],
      pitchMm,
      height: 160,
      spacingM: 10,
      zones: 'uniform' as const,
      bandWidth: 1920,
      label: 'MADXP',
      ...(folded ? { order: 'top-to-bottom' as const } : {}),
    };
    const outPath = path.join(tmpDir, `${folded ? 'folded' : 'ribbon'}-${perimeterM}m-${ribbonWidth}px.mp4`);
    const started = Date.now();
    try {
      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps,
        chromiumOptions,
        browserExecutable,
        timeoutInMilliseconds: 120_000,
      });
      logger.info('led-ribbon-poc: composition résolue', {
        perimeterM,
        width: composition.width,
        height: composition.height,
      });
      await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        outputLocation: outPath,
        inputProps,
        chromiumOptions,
        browserExecutable,
        timeoutInMilliseconds: 120_000,
        pixelFormat: 'yuv420p',
        imageFormat: 'jpeg',
        jpegQuality: 80,
        concurrency: 1,
        crf: 20,
      });
      results.push({ perimeterM, width: ribbonWidth, ok: true, ms: Date.now() - started });
      logger.info('led-ribbon-poc: OK', { perimeterM, width: ribbonWidth, ms: Date.now() - started });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ perimeterM, width: ribbonWidth, ok: false, ms: Date.now() - started, error: message });
      logger.warn('led-ribbon-poc: ÉCHEC', { perimeterM, width: ribbonWidth, error: message.slice(0, 300) });
    }
    void ribbonHeight;
  }

  // Nettoyage des MP4 temporaires.
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* noop */
  }

  // Rapport.
  const okResults = results.filter((r) => r.ok);
  const maxOk = okResults.length > 0 ? okResults[okResults.length - 1] : null;
  const firstFail = results.find((r) => !r.ok) ?? null;

  logger.info('led-ribbon-poc: ===== RAPPORT =====', { pitchMm });
  for (const r of results) {
    logger.info('led-ribbon-poc: résultat', {
      perimeter_m: r.perimeterM,
      width_px: r.width,
      status: r.ok ? 'OK' : 'FAIL',
      duration_ms: r.ms,
      ...(r.error ? { error: r.error.slice(0, 160) } : {}),
    });
  }

  if (maxOk) {
    logger.info('led-ribbon-poc: largeur MAX rendue avec succès', {
      width_px: maxOk.width,
      perimeter_m: maxOk.perimeterM,
    });
  }
  if (firstFail) {
    logger.warn('led-ribbon-poc: 1ʳᵉ largeur en échec → plafond atteint', {
      width_px: firstFail.width,
      perimeter_m: firstFail.perimeterM,
      mode: folded ? 'folded' : 'flat',
    });
    logger.warn(
      folded
        ? 'led-ribbon-poc: DÉCISION → la compo PLIÉE échoue aussi à cette taille — investiguer (le canvas sortie devrait pourtant rester ≤ bandWidth × N)'
        : 'led-ribbon-poc: DÉCISION → le ruban PLAT échoue à ce seuil → utiliser la compo PLIÉE (LedPerimeterFolded), pas le rendu plat',
    );
  } else {
    logger.info(
      folded
        ? `led-ribbon-poc: DÉCISION → compo PLIÉE OK sur tout le sweep jusqu’à ${maxM} m (ruban ${maxOk?.width ?? 0} px, canvas sortie ≤ 1920×N) — stratégie *rendre directement plié* validée`
        : `led-ribbon-poc: DÉCISION → ruban PLAT viable jusqu’à au moins ${maxM} m (${maxOk?.width ?? 0} px). Étendre --max pour trouver le plafond.`,
    );
  }
}

main().catch((err) => {
  logger.error('led-ribbon-poc: crash', { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
});
