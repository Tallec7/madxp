/**
 * PNG Alpha BBox Service — POC SPEC JOUEUR (auto_crop photo joueur)
 *
 * Calcule la bounding box du contenu non-transparent d'une image PNG détourée.
 * Utilisé par le packshot IMG des templates JOUEUR pour caler automatiquement
 * la photo détourée dans la safe zone à l'upload (cf. SPEC-GLOBAL §3.7,
 * réponse Daisy Q15 : « cadrage par défaut auto, user peut décaler ensuite »).
 *
 * Stratégie :
 *   1. Décodage du PNG via pngjs (pure JS, pas de native dep).
 *   2. Scan du canal alpha → bounding box (top, left, right, bottom) des
 *      pixels avec alpha > seuil (default 16/255 ≈ 6%).
 *   3. Retourne bbox + suggestion d'offset_x normalisée (-1 → +1) si la
 *      photo n'est pas centrée horizontalement par rapport au canvas.
 *
 * Refs :
 *   - SPEC PACKSHOT_IMG : docs/templates/packshots/img/SPEC.md (auto_crop)
 *   - ADR-108 §Slot capabilities : require_alpha + auto_crop
 */

import { PNG } from 'pngjs';
import logger from '../config/logger';

export interface AlphaBbox {
  /** Coords pixel : haut-gauche inclusif */
  top: number;
  left: number;
  /** Coords pixel : bas-droite inclusif */
  right: number;
  bottom: number;
  /** Largeur / hauteur en pixels du rectangle non-alpha */
  width: number;
  height: number;
}

export interface AutoCropResult {
  bbox: AlphaBbox;
  /**
   * Offset horizontal recommandé : -1 → +1.
   * 0 = bbox centrée sur le canvas. Négatif = bbox décalée à gauche.
   * Permet au runtime de décider du recentrage par défaut dans la safe zone.
   */
  suggested_offset_x: number;
  canvas_width: number;
  canvas_height: number;
  alpha_threshold: number;
  /** True si le PNG n'a pas de pixel non-transparent (image vide) */
  empty: boolean;
}

export interface ComputeBboxOptions {
  /** Seuil alpha (0-255). Default 16 (≈ 6 %). Pixels strictement supérieurs = "visibles". */
  alpha_threshold?: number;
}

export class PngBboxService {
  /**
   * Décode un buffer PNG et calcule la bbox du contenu non-alpha.
   * Throw si le buffer n'est pas un PNG valide ou n'a pas de canal alpha.
   */
  async computeAlphaBbox(
    pngBuffer: Buffer,
    options: ComputeBboxOptions = {}
  ): Promise<AutoCropResult> {
    const threshold = options.alpha_threshold ?? 16;
    const png = await this.decode(pngBuffer);

    if (png.width === 0 || png.height === 0) {
      throw new Error('PNG has zero dimension');
    }

    // pngjs garantit RGBA 8-bit. data = Uint8Array de longueur w*h*4.
    const { width, height, data } = png;
    let top = height;
    let left = width;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > threshold) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }

    const empty = right === -1;
    if (empty) {
      logger.warn('PNG bbox empty (no pixel above alpha threshold)', {
        width,
        height,
        threshold,
      });
      return {
        bbox: { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 },
        suggested_offset_x: 0,
        canvas_width: width,
        canvas_height: height,
        alpha_threshold: threshold,
        empty: true,
      };
    }

    const bboxWidth = right - left + 1;
    const bboxHeight = bottom - top + 1;
    // Centre horizontal de la bbox vs centre du canvas, normalisé sur la
    // demi-largeur du canvas. Output dans [-1, +1].
    const bboxCenterX = (left + right) / 2;
    const canvasCenterX = (width - 1) / 2;
    const halfCanvas = Math.max(canvasCenterX, 1); // évite /0 sur canvas 1px
    const suggested_offset_x = (bboxCenterX - canvasCenterX) / halfCanvas;

    return {
      bbox: {
        top,
        left,
        right,
        bottom,
        width: bboxWidth,
        height: bboxHeight,
      },
      suggested_offset_x,
      canvas_width: width,
      canvas_height: height,
      alpha_threshold: threshold,
      empty: false,
    };
  }

  /**
   * Vérifie qu'un buffer PNG a bien un canal alpha (require_alpha).
   * Refuse les PNG RGB sans transparence (pattern défini par SPEC JOUEUR).
   */
  async hasAlphaChannel(pngBuffer: Buffer): Promise<boolean> {
    const png = await this.decode(pngBuffer);
    // pngjs convertit toujours en RGBA, donc un alpha "vrai" se détecte en
    // vérifiant qu'au moins un pixel n'est pas à 255.
    const data = png.data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 255) return true;
    }
    return false;
  }

  private decode(buffer: Buffer): Promise<PNG> {
    return new Promise((resolve, reject) => {
      const png = new PNG();
      png.parse(buffer, (err: Error | null) => {
        if (err) {
          reject(new Error(`PNG decode failed: ${err.message}`));
          return;
        }
        resolve(png);
      });
    });
  }
}

export const pngBboxService = new PngBboxService();
