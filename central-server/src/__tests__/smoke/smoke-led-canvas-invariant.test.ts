/**
 * Smoke — le canvas processeur LED ne doit JAMAIS dépendre du contenu diffusé.
 *
 * Contexte : jusqu'à ADR-138, la géométrie de pliage était choisie par le CONTENU
 * et non par l'ÉCRAN — le worker branchait sur `side_files.length > 0` entre deux
 * géométries qui ne produisaient pas le même canvas (7 bandes vs 8 sur le même club).
 *
 * Un processeur LED (Novastar/Colorlight) est configuré UNE FOIS à l'installation,
 * pixel à pixel. Si la diffusion émettait tantôt l'un tantôt l'autre, le second
 * serait immappable → ruban noir ou décalé, un soir de match.
 *
 * ## Révisé en ADR-138 — la divergence est CORRIGÉE
 *
 * La géométrie est désormais unifiée : `computeSiteCanvas()` est le point d'entrée
 * unique et plie TOUJOURS par côté. Le contenu ne choisit plus que les sources.
 * Ce fichier ne documente donc plus une divergence à surveiller, mais deux
 * invariants à tenir :
 *
 *   1. le canvas est une fonction pure du terrain (jamais du contenu) ;
 *   2. le canvas plié n'est servi QUE derrière `serve_folded`, un interrupteur
 *      par site éteint par défaut (ADR-139, étape D). Servir un canvas plié à un
 *      processeur qui n'en veut pas donne un ruban noir : l'activation doit
 *      rester un geste délibéré, posé après avoir observé le montage réel.
 *
 * File-based + calcul pur (audit-then-guard), pas de DB requise.
 *
 * Réf : ADR-134, ADR-135 (étape D « reste à câbler »), docs/specs/features/led-perimeter.spec.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { computeSiteCanvas } from '../../services/led-fold.service';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/**
 * Profils LED réellement en production (relevés en DB le 2026-08-10).
 * Les deux sites sont `site_type='saas'` — aucun Pi. Aucun CÔTÉ ne dépasse
 * `band_width` : le pliage par côté ne coupe donc jamais à l'intérieur d'un côté.
 */
interface ProfilProd {
  site: string;
  sides: number[];
  pitchMm: number;
  height: number;
  bandWidth: number;
  /** `canvas_in.band_count` figé par un installateur, ou `null` si encore provisoire. */
  bandCountConfirme: number | null;
}

const PROFILS_PROD: ProfilProd[] = [
  {
    site: 'Saas Lanester HB',
    sides: [4.8, 4.8],
    pitchMm: 10,
    height: 110,
    bandWidth: 1920,
    /** `canvas_in.band_count` FIGÉ par un installateur → géométrie uniforme gravée. */
    bandCountConfirme: 1,
  },
  {
    site: 'Piraths Strasbourg ATH',
    sides: [10, 10, 10, 10],
    pitchMm: 6.25,
    height: 160,
    bandWidth: 1920,
    bandCountConfirme: null,
  },
];

describe('Smoke — invariant : le canvas LED ne dépend pas du contenu', () => {
  describe('le canvas ne dépend QUE du terrain (ADR-138)', () => {
    it.each(PROFILS_PROD)('$site — canvas dérivé du seul profil', ({ sides, pitchMm, height, bandWidth }) => {
      const canvas = computeSiteCanvas({
        sides: [...sides],
        pitch: pitchMm,
        height,
        canvas_in: { band_width: bandWidth },
      });
      // Toujours par côté : chaque côté est un bloc de bandes contigu.
      expect(canvas.geometry.segments).toHaveLength(sides.length);
      expect(canvas.canvasWidth).toBe(bandWidth);
      expect(canvas.canvasHeight).toBe(canvas.derivedBandCount * height);
    });

    it('un band_count figé divergent est SIGNALÉ, jamais écrasé', () => {
      const p = PROFILS_PROD[0]; // Lanester : 1 bande figée, 2 dérivées
      const canvas = computeSiteCanvas({
        sides: [...p.sides],
        pitch: p.pitchMm,
        height: p.height,
        canvas_in: { band_width: p.bandWidth, band_count: p.bandCountConfirme ?? undefined },
      });
      expect(canvas.confirmedBandCount).toBe(1);
      expect(canvas.derivedBandCount).toBe(2);
      expect(canvas.confirmedIsStale).toBe(true);
      // La valeur figée décrit ce qui est gravé dans le processeur : la corriger
      // en douce ferait diverger le canvas émis de la config matérielle réelle.
    });

    it('sans band_count figé, rien à signaler', () => {
      const p = PROFILS_PROD[1]; // Piraths : provisoire
      const canvas = computeSiteCanvas({
        sides: [...p.sides],
        pitch: p.pitchMm,
        height: p.height,
        canvas_in: { band_width: p.bandWidth },
      });
      expect(canvas.confirmedBandCount).toBeNull();
      expect(canvas.confirmedIsStale).toBe(false);
    });
  });

  describe('le canvas plié n’est servi que derrière un interrupteur explicite (ADR-139)', () => {
    const DEPLOY = 'utils/config-secondary-variants.ts';

    it('la substitution est gardée par serve_folded === true', () => {
      const src = read(DEPLOY);
      expect(src).toMatch(/async function substituteFoldedCanvas/);
      // LE garde-fou : sans cette condition, les deux clubs LED en production
      // recevraient un canvas plié que leur processeur n'attend peut-être pas
      // — ruban noir un soir de match.
      expect(src).toMatch(/if \(!led\?\.canvas_in\?\.serve_folded\) return;/);
    });

    it('serve_folded n’a AUCUN défaut Joi — il ne peut pas s’allumer tout seul', () => {
      const val = read('middleware/validation.ts');
      expect(val).toMatch(/serve_folded: Joi\.boolean\(\)\.optional\(\),/);
      expect(val).not.toMatch(/serve_folded: Joi\.boolean\(\)\.default\(/);
      // `mode` ne pouvait pas servir de bascule : il vaut 'B' par défaut sur tout
      // le parc sans que personne l'ait choisi.
      expect(val).toMatch(/mode: Joi\.string\(\)\.valid\('A', 'B'\)\.default\('B'\)/);
    });

    it('un cache manquant DÉGRADE, il ne casse pas', () => {
      const src = read(DEPLOY);
      // Pas de canvas encore fabriqué → on garde le fichier brut et on met en
      // file. Le déploiement ne doit jamais échouer à cause du pliage.
      expect(src).toMatch(/hasPendingForGeometry/);
      expect(src).toMatch(/fichier brut conservé/);
    });

    it('le cache est clé par GÉOMÉTRIE — l’invalidation est automatique', () => {
      const src = read(DEPLOY);
      expect(src).toMatch(/computeFoldedCanvasHash/);
      const fold = read('services/led-fold.service.ts');
      // L'empreinte couvre géométrie + source + layout + détourage : changer la
      // hauteur d'un ruban, ou valider un détourage (PROP-015), doit suffire à
      // périmer tous ses canvas, sans logique d'expiration.
      for (const k of ['sides', 'height', 'bandWidth', 'sourcePath', 'layout', 'crop', 'spacingM']) {
        expect(fold.slice(fold.indexOf('computeFoldedCanvasHash'))).toContain(k);
      }
    });

    it('l’empreinte utilise le même défaut d’espacement que le worker (effectiveSpacingM)', () => {
      // Incident 2026-08-12 : `spacing_m` pilote la cadence du motif repeated/
      // scrolling au pliage (`cellPx`) mais était absent de l'empreinte — un
      // changement seul laissait l'ancien canvas (ancienne cadence) servi
      // indéfiniment. Un défaut réécrit séparément aux deux endroits pourrait
      // diverger — un seul helper exporté élimine la classe de bug.
      const src = read(DEPLOY);
      const worker = read('services/led-export-worker.service.ts');
      expect(src).toMatch(/effectiveSpacingM/);
      expect(worker).toMatch(/effectiveSpacingM/);
    });

    it('l’enrichissement saute toujours les variantes par côté sans binaire', () => {
      const src = read(DEPLOY);
      // Garde-fou anti-MP4-noir : une variante « par côté pure » n'a ni
      // storage_path ni filename — l'injecter produirait `videos-.../null`.
      expect(src).toMatch(/if \(!v\.storage_path && !v\.filename\) continue;/);
    });
  });

  describe('la FABRICATION du canvas reste au worker', () => {
    it('seul le worker d’export compose réellement (ffmpeg)', () => {
      const worker = read('services/led-export-worker.service.ts');
      expect(worker).toMatch(/applyPerSideFold/);

      // L'enrichissement de déploiement CONSOMME le canvas (lecture de cache +
      // mise en file), il ne le fabrique pas : un `applyPerSideFold` dans le
      // chemin de config bloquerait une requête sur un encodage ffmpeg.
      expect(read('utils/config-secondary-variants.ts')).not.toMatch(/applyPerSideFold\(/);

      const consommateurs = ['controllers/content-deployment.controller.ts', 'controllers/saas.controller.ts'];
      for (const rel of consommateurs) {
        expect(read(rel)).not.toMatch(/applyPerSideFold|computeFoldGeometryPerSide/);
      }
    });
  });
});
