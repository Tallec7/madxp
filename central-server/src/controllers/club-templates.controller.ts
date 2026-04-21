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

import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { query } from '../config/database';
import {
  remotionTemplatesRepository,
  templateStudioRepository,
} from '../repositories';

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
  table: 'template_text_fields' | 'template_image_slots',
  childId: string,
  templateId: string,
): Promise<boolean> => {
  const { rows } = await query<{ template_id: string }>(
    `SELECT template_id FROM ${table} WHERE id = $1`,
    [childId],
  );
  return rows[0]?.template_id === templateId;
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
    if (!(await assertChildBelongs('template_text_fields', fieldId, id))) {
      return notFound(res, 'Champ non trouvé');
    }
    const updated = await templateStudioRepository.updateTextField(fieldId, req.body);
    if (!updated) return notFound(res, 'Champ non trouvé');
    res.json(updated);
  } catch (error) {
    serverError('updateMyTextField', req, error, res);
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
    if (!(await assertChildBelongs('template_image_slots', slotId, id))) {
      return notFound(res, 'Slot non trouvé');
    }
    const updated = await templateStudioRepository.updateImageSlot(slotId, req.body);
    if (!updated) return notFound(res, 'Slot non trouvé');
    res.json(updated);
  } catch (error) {
    serverError('updateMyImageSlot', req, error, res);
  }
};
