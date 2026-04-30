/**
 * SPEC JOUEUR Q15 — endpoint auto_crop photo joueur.
 *
 * POST /api/remotion-templates-studio/photo/auto-crop
 *   multipart/form-data field `photo` : PNG détouré (<= 20 MB)
 *   query ?threshold=N : seuil alpha optionnel (default 16)
 *
 * Retourne le résultat bbox + suggested_offset_x calculé par le service
 * pngBboxService. Permet à l'UI super_admin de pré-remplir les coords
 * d'une photo joueur uploadée pour le packshot IMG.
 *
 * Sécurité :
 *   - Auth super_admin uniquement (cf. routes)
 *   - PNG-only via uploadPngBuffer (multer + filter)
 *   - require_alpha enforced ici (refuse les PNG opaques)
 */

import type { Response } from 'express';
import type { AuthRequest } from '../types';
import logger from '../config/logger';
import { pngBboxService } from '../services/png-bbox.service';

export const autoCropPhoto = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!req.file?.buffer) {
    res.status(400).json({ error: 'no_file', message: 'Photo PNG requise (champ "photo")' });
    return;
  }

  const thresholdRaw = Number(req.query.threshold ?? 16);
  if (!Number.isFinite(thresholdRaw) || thresholdRaw < 0 || thresholdRaw > 255) {
    res.status(400).json({ error: 'invalid_threshold', message: 'threshold doit être dans [0, 255]' });
    return;
  }

  try {
    const t0 = Date.now();
    const hasAlpha = await pngBboxService.hasAlphaChannel(req.file.buffer);
    if (!hasAlpha) {
      res.status(400).json({
        error: 'missing_alpha_channel',
        message: 'La photo joueur doit être un PNG détouré (canal alpha requis).',
      });
      return;
    }
    const result = await pngBboxService.computeAlphaBbox(req.file.buffer, {
      alpha_threshold: thresholdRaw,
    });
    const elapsed_ms = Date.now() - t0;

    if (result.empty) {
      res.status(400).json({
        error: 'empty_alpha',
        message: `Aucun pixel non-transparent trouvé (seuil ${thresholdRaw}).`,
      });
      return;
    }

    logger.info('templatePhoto.autoCrop ok', {
      userId,
      file_size: req.file.size,
      bbox: result.bbox,
      offset_x: result.suggested_offset_x,
      elapsed_ms,
    });
    res.json({ ...result, has_alpha_channel: true, elapsed_ms });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/PNG decode failed/.test(msg)) {
      res.status(400).json({ error: 'invalid_png', message: msg });
      return;
    }
    logger.error('templatePhoto.autoCrop error', { error: err, userId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
