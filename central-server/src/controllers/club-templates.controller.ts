/**
 * ADR-075 V3 Phase B — Club self-service templates controller.
 *
 * Toutes les routes exigent `requireClubByoAccess` en amont, qui valide
 * le tier premium + override et attache `req.clubSiteId`.
 *
 * Scope strict : un club ne voit/modifie QUE les templates dont `site_id`
 * matche `req.clubSiteId`. Les templates globaux (`site_id IS NULL`) sont
 * listés en lecture seule, pas éditables.
 */

import * as fs from 'fs';
import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import {
  remotionTemplatesRepository,
  templateStudioRepository,
} from '../repositories';
import { uploadAsset, getAssetUrl } from '../services/storage.service';
import { clubTemplateQuotaService } from '../services/club-template-quota.service';

const notFound = (res: Response, msg = 'Ressource non trouvée'): void => {
  res.status(404).json({ error: msg });
};

const forbidden = (res: Response, msg = 'Accès refusé'): void => {
  res.status(403).json({ error: msg });
};

const serverError = (op: string, req: AuthRequest, error: unknown, res: Response): void => {
  logger.error(`clubTemplates.${op} error`, {
    error,
    params: req.params,
    userId: req.user?.id,
    clubSiteId: req.clubSiteId,
  });
  res.status(500).json({ error: 'Erreur serveur' });
};

/** Template doit exister ET appartenir au site du club. */
const loadOwnedTemplate = async (
  templateId: string,
  clubSiteId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'forbidden' }> => {
  const tpl = await remotionTemplatesRepository.findById(templateId);
  if (!tpl) return { ok: false, reason: 'not_found' };
  if (tpl.site_id !== clubSiteId) return { ok: false, reason: 'forbidden' };
  return { ok: true };
};

/** Vérifie qu'une sous-ressource (text_field, image_slot) appartient au template. */
const assertChildBelongs = async (
  kind: 'text_field' | 'image_slot',
  childId: string,
  templateId: string,
): Promise<boolean> => {
  const row = kind === 'text_field'
    ? await templateStudioRepository.findTextFieldById(childId)
    : await templateStudioRepository.findImageSlotById(childId);
  return row?.templateId === templateId;
};

// ── GET /api/club/remotion-templates/quota
// ADR-075 V3 Phase D — expose quotas (templates + renders) pour le site club.
export const getMyQuota = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const siteId = req.clubSiteId as string;
    const quota = await clubTemplateQuotaService.getQuotaFor(siteId);
    res.json(quota);
  } catch (error) {
    serverError('getMyQuota', req, error, res);
  }
};

// ── GET /api/club/remotion-templates
export const listMyTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const siteId = req.clubSiteId as string;
    const all = await remotionTemplatesRepository.findVisibleForSite(siteId);
    // Phase B : on n'expose que les templates OWN (site_id match).
    // Les globaux restent accessibles via la route `/api/remotion-templates` existante.
    const mine = all.filter((t) => t.site_id === siteId);
    res.json(mine);
  } catch (error) {
    serverError('listMyTemplates', req, error, res);
  }
};

// ── GET /api/club/remotion-templates/:id/studio
export const getMyStudioView = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const siteId = req.clubSiteId as string;
    const owned = await loadOwnedTemplate(id, siteId);
    if (!owned.ok) {
      return owned.reason === 'not_found' ? notFound(res, 'Template non trouvé') : forbidden(res);
    }
    const view = await templateStudioRepository.findV2ById(id);
    if (!view) return notFound(res, 'Template legacy (v1) — studio v2 requis');
    res.json(view);
  } catch (error) {
    serverError('getMyStudioView', req, error, res);
  }
};

// ── PATCH /api/club/remotion-templates/:id
// Seuls `name` et `canvas_width/canvas_height` sont modifiables par le club.
export const updateMyTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const siteId = req.clubSiteId as string;
    const owned = await loadOwnedTemplate(id, siteId);
    if (!owned.ok) {
      return owned.reason === 'not_found' ? notFound(res, 'Template non trouvé') : forbidden(res);
    }
    const body = req.body as {
      name?: string;
      canvas_width?: number;
      canvas_height?: number;
    };
    const updated = await remotionTemplatesRepository.update(id, {
      name: body.name,
      canvas_width: body.canvas_width,
      canvas_height: body.canvas_height,
    });
    if (!updated) return notFound(res, 'Template non trouvé');
    res.json(updated);
  } catch (error) {
    serverError('updateMyTemplate', req, error, res);
  }
};

// ── PATCH /api/club/remotion-templates/:id/text-fields/:fieldId
export const updateMyTextField = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, fieldId } = req.params;
    const siteId = req.clubSiteId as string;
    const owned = await loadOwnedTemplate(id, siteId);
    if (!owned.ok) {
      return owned.reason === 'not_found' ? notFound(res, 'Template non trouvé') : forbidden(res);
    }
    if (!(await assertChildBelongs('text_field', fieldId, id))) {
      return notFound(res, 'Champ non trouvé');
    }
    const updated = await templateStudioRepository.updateTextField(fieldId, req.body);
    if (!updated) return notFound(res, 'Champ non trouvé');
    res.json(updated);
  } catch (error) {
    serverError('updateMyTextField', req, error, res);
  }
};

const cleanupTmp = (filePath: string): void => {
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
};

// ── POST /api/club/remotion-templates/:id/background
// Upload d'une vidéo de fond (WebM/MP4) pour la première variante du template.
// Le club a un modèle single-variant : on update la variant de sort_order le plus bas.
export const uploadMyVariantBackground = async (req: AuthRequest, res: Response): Promise<void> => {
  const file = req.file as Express.Multer.File | undefined;
  const filePath = file?.path;
  try {
    const { id } = req.params;
    const siteId = req.clubSiteId as string;
    if (!file || !filePath) {
      res.status(400).json({ error: 'Fichier requis' });
      return;
    }
    const owned = await loadOwnedTemplate(id, siteId);
    if (!owned.ok) {
      cleanupTmp(filePath);
      return owned.reason === 'not_found' ? notFound(res, 'Template non trouvé') : forbidden(res);
    }
    const variants = await templateStudioRepository.listVariants(id);
    const variant = variants[0];
    if (!variant) {
      cleanupTmp(filePath);
      return notFound(res, 'Aucune variante à éditer — contactez le support');
    }

    const storagePath = `template-assets/club/${siteId}/${Date.now()}-${file.originalname}`;
    const buffer = fs.readFileSync(filePath);
    const uploaded = await uploadAsset(buffer, storagePath, file.mimetype);
    cleanupTmp(filePath);
    if (!uploaded) {
      res.status(500).json({ error: 'Échec upload FTP' });
      return;
    }
    const url = getAssetUrl(storagePath);
    const updated = await templateStudioRepository.updateVariant(variant.id, {
      backgroundVideoUrl: url,
    });
    logger.info('Club template variant background uploaded', {
      templateId: id,
      variantId: variant.id,
      siteId,
      userId: req.user?.id,
      url,
    });
    res.json({ url, variant: updated });
  } catch (error) {
    if (filePath) cleanupTmp(filePath);
    serverError('uploadMyVariantBackground', req, error, res);
  }
};

// ── PATCH /api/club/remotion-templates/:id/image-slots/:slotId
export const updateMyImageSlot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, slotId } = req.params;
    const siteId = req.clubSiteId as string;
    const owned = await loadOwnedTemplate(id, siteId);
    if (!owned.ok) {
      return owned.reason === 'not_found' ? notFound(res, 'Template non trouvé') : forbidden(res);
    }
    if (!(await assertChildBelongs('image_slot', slotId, id))) {
      return notFound(res, 'Slot non trouvé');
    }
    const updated = await templateStudioRepository.updateImageSlot(slotId, req.body);
    if (!updated) return notFound(res, 'Slot non trouvé');
    res.json(updated);
  } catch (error) {
    serverError('updateMyImageSlot', req, error, res);
  }
};
