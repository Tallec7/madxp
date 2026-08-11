/**
 * Smoke — le détourage LED ne s'applique JAMAIS sans validation humaine.
 *
 * PROP-015 / ADR-140. `cropdetect` ne sait pas distinguer un export mal cadré d'un
 * visuel volontairement posé sur fond noir : détourer d'office rognerait un sponsor
 * dont la charte est noire jusqu'à son logo. Toute la feature tient donc sur une
 * séparation stricte — on MESURE d'un côté, on ENREGISTRE de l'autre — et sur le
 * fait que le rectangle validé entre dans l'empreinte du canvas plié.
 *
 * File-based + calcul pur (audit-then-guard), pas de DB requise.
 */

import * as fs from 'fs';
import * as path from 'path';
import { computeFoldedCanvasHash } from '../../services/led-fold.service';
import { buildPerSideFoldFilterGraph, computeFoldGeometryPerSide } from '../../services/led-fold.service';
import { evaluateCropProposal } from '../../services/led-autocrop.service';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('Smoke — détourage LED : proposé, jamais appliqué seul', () => {
  describe('la détection n’écrit rien', () => {
    const CTRL = 'controllers/content-variant.controller.ts';

    it('le détecteur ne persiste aucun crop', () => {
      const src = read(CTRL);
      const detect = src.slice(
        src.indexOf('export const detectLedVariantCrop'),
        src.indexOf('export const setLedVariantCrop')
      );
      expect(detect).toContain('detectCropRect');
      // LE garde-fou : si un jour ce handler appelait `updateCrop`, la validation
      // humaine disparaîtrait et un fond noir volontaire se ferait rogner.
      expect(detect).not.toMatch(/updateCrop\(/);
    });

    it('le service de détection ne connaît pas la base', () => {
      const svc = read('services/led-autocrop.service.ts');
      expect(svc).not.toMatch(/repositor(y|ies)|from '\.\.\/config\/database'/);
    });

    it('une seule écriture de `crop` dans tout le serveur', () => {
      // `updateCrop` est le seul chemin d'écriture, et il n'est appelé que par le
      // handler d'enregistrement explicite.
      const callers = ['controllers/content-variant.controller.ts']
        .map(read)
        .join('\n')
        .match(/updateCrop\(/g);
      expect(callers).toHaveLength(1);
    });
  });

  describe('la mesure est robuste à une frame isolée', () => {
    it('plusieurs instants sont analysés, et on garde l’UNION', () => {
      const svc = read('services/led-autocrop.service.ts');
      expect(svc).toMatch(/export function unionRects/);
      // Une intersection ferait dicter le rectangle par un fondu au noir → canvas
      // qui change sans que rien n'ait changé (interdit par ADR-138).
      expect(svc).not.toMatch(/function intersectRects/);
      expect(svc).toMatch(/CROP_SAMPLE_COUNT = [2-9]/);
    });
  });

  describe('le crop entre dans l’empreinte du canvas plié', () => {
    const base = {
      sides: [10, 10, 10, 10],
      pitch: 'P6.25',
      height: 120,
      bandWidth: 1600,
      sourcePath: 'STRASOL_2025_08_1600x120px.mp4',
      layout: 'centered',
    };

    it('valider un détourage rend inatteignables les canvas d’avant', () => {
      const avant = computeFoldedCanvasHash(base);
      const apres = computeFoldedCanvasHash({ ...base, crop: { x: 0, y: 554, w: 4096, h: 306 } });
      // Sans ça, le canvas plié sur le fichier ENTIER (marges comprises) resterait
      // servi indéfiniment — il n'y a pas de TTL — et la validation n'aurait
      // aucun effet visible sur le ruban.
      expect(apres).not.toBe(avant);
    });

    it('deux détourages différents ne partagent pas un canvas', () => {
      const a = computeFoldedCanvasHash({ ...base, crop: { x: 0, y: 554, w: 4096, h: 306 } });
      const b = computeFoldedCanvasHash({ ...base, crop: { x: 0, y: 500, w: 4096, h: 400 } });
      expect(a).not.toBe(b);
    });

    it('le chemin de config passe bien le crop à l’empreinte', () => {
      const deploy = read('utils/config-secondary-variants.ts');
      expect(deploy).toMatch(/crop: v\.crop \?\? null,/);
    });
  });

  describe('le détourage est appliqué AVANT la mise à l’échelle', () => {
    const geometry = computeFoldGeometryPerSide({
      sides: [10],
      pitchMm: 6.25,
      height: 120,
      bandWidth: 1600,
    });

    it('le crop précède le scale dans le filter graph', () => {
      const graph = buildPerSideFoldFilterGraph(geometry, 'black', 'centered', undefined, undefined, [
        { x: 0, y: 554, w: 4096, h: 306 },
      ]);
      const iCrop = graph.indexOf('crop=4096:306:0:554');
      const iScale = graph.indexOf('scale=');
      expect(iCrop).toBeGreaterThanOrEqual(0);
      // Détourer APRÈS aurait déjà écrasé le bandeau utile en un trait : l'ordre
      // est le fond du problème que PROP-015 résout.
      expect(iCrop).toBeLessThan(iScale);
    });

    it('sans crop validé, le graphe est strictement inchangé', () => {
      const sans = buildPerSideFoldFilterGraph(geometry, 'black', 'centered');
      const vide = buildPerSideFoldFilterGraph(geometry, 'black', 'centered', undefined, undefined, [null]);
      expect(vide).toBe(sans);
      expect(sans).not.toContain('[src0]');
    });

    it('le worker lit le crop de la variante et le transmet', () => {
      const worker = read('services/led-export-worker.service.ts');
      expect(worker).toMatch(/variant\?\.crop \?\? null/);
      expect(worker).toMatch(/crops,/);
    });
  });

  describe('on ne propose rien là où il n’y a rien à proposer', () => {
    it('un 16:9 plein cadre n’est jamais recommandé', () => {
      const p = evaluateCropProposal({
        sourceWidth: 1920,
        sourceHeight: 1080,
        crop: { x: 0, y: 0, w: 1920, h: 1080 },
        targetWidth: 1600,
        targetHeight: 120,
      });
      expect(p.recommended).toBe(false);
    });

    it('le crop n’a AUCUN défaut Joi — il ne peut pas s’activer tout seul', () => {
      const val = read('middleware/validation.ts');
      expect(val).toMatch(/ledVariantCrop: Joi\.object/);
      expect(val).not.toMatch(/crop: Joi\.object\([\s\S]{0,400}?\)\.default\(/);
    });
  });
});
