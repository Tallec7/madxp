/**
 * CLI de test du POC auto_crop bbox PNG.
 *
 * Permet de valider l'algorithme sur une vraie photo détourée AVANT que
 * l'API endpoint ne soit câblé (cf. JOUEUR-ACTION-PLAN.md §2.3).
 *
 * Usage :
 *   npm run template:test-bbox -- <path-to-photo.png>
 *   npm run template:test-bbox -- <path-to-photo.png> --threshold 32
 *   npm run template:test-bbox -- <path-to-photo.png> --visual
 *
 * Le flag --visual produit un PNG annoté (sortie : <photo>.bbox.png) avec
 * un rectangle rouge sur la bbox détectée + un crosshair sur le centre,
 * pour validation visuelle rapide.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import { pngBboxService } from '../services/png-bbox.service';

interface CliArgs {
  inputPath: string;
  threshold: number;
  visual: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0]?.startsWith('--')) {
    console.error('Usage: npm run template:test-bbox -- <path-to-photo.png> [--threshold N] [--visual]');
    process.exit(1);
  }
  const inputPath = args[0];
  const thresholdIdx = args.indexOf('--threshold');
  const threshold = thresholdIdx >= 0 ? parseInt(args[thresholdIdx + 1], 10) : 16;
  const visual = args.includes('--visual');
  return { inputPath, threshold, visual };
}

function drawBboxOverlay(
  inputBuffer: Buffer,
  bbox: { top: number; left: number; right: number; bottom: number },
  outputPath: string
): void {
  const png = PNG.sync.read(inputBuffer);
  const { width, height, data } = png;

  // Rectangle rouge épais (3px) sur les 4 bords de la bbox.
  const drawPixel = (x: number, y: number, r = 255, g = 0, b = 0) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4;
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = 255; // opaque rouge sur le rendu
  };

  for (let dx = -1; dx <= 1; dx++) {
    for (let x = bbox.left; x <= bbox.right; x++) {
      drawPixel(x, bbox.top + dx);
      drawPixel(x, bbox.bottom + dx);
    }
    for (let y = bbox.top; y <= bbox.bottom; y++) {
      drawPixel(bbox.left + dx, y);
      drawPixel(bbox.right + dx, y);
    }
  }

  // Crosshair vert sur le centre canvas + crosshair bleu sur le centre bbox
  const canvasCx = Math.round((width - 1) / 2);
  const canvasCy = Math.round((height - 1) / 2);
  const bboxCx = Math.round((bbox.left + bbox.right) / 2);
  const bboxCy = Math.round((bbox.top + bbox.bottom) / 2);

  for (let i = -10; i <= 10; i++) {
    drawPixel(canvasCx + i, canvasCy, 0, 255, 0);
    drawPixel(canvasCx, canvasCy + i, 0, 255, 0);
    drawPixel(bboxCx + i, bboxCy, 0, 100, 255);
    drawPixel(bboxCx, bboxCy + i, 0, 100, 255);
  }

  fs.writeFileSync(outputPath, PNG.sync.write(png));
}

async function main(): Promise<void> {
  const { inputPath, threshold, visual } = parseArgs();
  const absPath = path.resolve(inputPath);

  if (!fs.existsSync(absPath)) {
    console.error(`Fichier introuvable : ${absPath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(absPath);
  console.log(`\n📸 Analyse : ${absPath}`);
  console.log(`   Taille fichier : ${(buffer.length / 1024).toFixed(1)} KB`);
  console.log(`   Seuil alpha : ${threshold} / 255\n`);

  const t0 = Date.now();
  const hasAlpha = await pngBboxService.hasAlphaChannel(buffer);
  const result = await pngBboxService.computeAlphaBbox(buffer, {
    alpha_threshold: threshold,
  });
  const elapsed = Date.now() - t0;

  console.log('🔍 Résultat :');
  console.log(`   Canvas             : ${result.canvas_width} × ${result.canvas_height} px`);
  console.log(`   Canal alpha        : ${hasAlpha ? '✅ détecté' : '❌ aucun (PNG opaque)'}`);

  if (result.empty) {
    console.log(`   ⚠️  PNG entièrement transparent (aucun pixel > seuil ${threshold})`);
    process.exit(0);
  }

  const bboxPctW = ((result.bbox.width / result.canvas_width) * 100).toFixed(1);
  const bboxPctH = ((result.bbox.height / result.canvas_height) * 100).toFixed(1);
  const offsetPct = (result.suggested_offset_x * 100).toFixed(1);

  console.log(`   BBox top/left      : ${result.bbox.top} / ${result.bbox.left}`);
  console.log(`   BBox right/bottom  : ${result.bbox.right} / ${result.bbox.bottom}`);
  console.log(`   BBox dimensions    : ${result.bbox.width} × ${result.bbox.height} px (${bboxPctW}% × ${bboxPctH}%)`);
  console.log(`   Centre bbox        : x=${Math.round((result.bbox.left + result.bbox.right) / 2)}, y=${Math.round((result.bbox.top + result.bbox.bottom) / 2)}`);
  console.log(`   Centre canvas      : x=${Math.round((result.canvas_width - 1) / 2)}, y=${Math.round((result.canvas_height - 1) / 2)}`);
  console.log(`   Offset suggéré X   : ${result.suggested_offset_x.toFixed(3)} (${offsetPct}% du demi-canvas)`);
  console.log(`   Temps d'exécution  : ${elapsed} ms\n`);

  if (visual) {
    const outPath = absPath.replace(/\.png$/i, '.bbox.png');
    drawBboxOverlay(buffer, result.bbox, outPath);
    console.log(`🎨 Aperçu visuel : ${outPath}`);
    console.log('   Rouge = bbox détectée');
    console.log('   Vert = centre du canvas');
    console.log('   Bleu = centre de la bbox\n');
  }

  // Hint cadrage tête/buste : si bbox proche du haut + déborde en bas, OK.
  // Si bbox trop centrée verticalement, prévenir.
  const topRatio = result.bbox.top / result.canvas_height;
  if (topRatio > 0.2) {
    console.log('💡 Conseil cadrage tête/buste :');
    console.log(`   La tête démarre à ${(topRatio * 100).toFixed(0)}% du haut du canvas.`);
    console.log(`   Pour le packshot IMG (calage haut + débordement bas),`);
    console.log(`   recadrer la photo source pour démarrer dès le haut.\n`);
  }
}

main().catch((err) => {
  console.error('❌ Erreur :', err.message);
  process.exit(1);
});
