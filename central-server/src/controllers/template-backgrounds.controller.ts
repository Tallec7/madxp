/**
 * ADR-109 — Template Backgrounds controllers (CRUD + grants).
 *
 * Endpoints :
 *   GET    /api/templates/backgrounds              → list pour user (filtré grants)
 *   GET    /api/templates/backgrounds/:id          → détail si visible
 *   POST   /api/templates/backgrounds              → upload + create (super_admin)
 *   PATCH  /api/templates/backgrounds/:id          → name / is_public / archived
 *   DELETE /api/templates/backgrounds/:id          → hard delete (refusé si utilisé en pratique côté FK)
 *   POST   /api/templates/backgrounds/:id/grants   → bulk grant
 *   GET    /api/templates/backgrounds/:id/grants   → liste user_ids autorisés
 *   DELETE /api/templates/backgrounds/:id/grants/:userId → revoke
 *
 * Sécurité :
 *   - super_admin sur les endpoints d'écriture + listGrants
 *   - listForUser visible par tous (filtrage par grants effectué dans le repo)
 *   - Upload WebM via uploadTemplateAsset (multer disk, 200MB max, mimetype WebM/MP4)
 */

import type { Response } from 'express';
import type { AuthRequest } from '../types';
import logger from '../config/logger';
import { templateBackgroundsRepository } from '../repositories';
import { uploadVideoFromDisk } from '../services/storage.service';
import { cleanupTempFile } from '../middleware/upload';

export const listBackgroundsForUser = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const backgrounds = await templateBackgroundsRepository.listForUser(userId);
    res.json(backgrounds);
  } catch (err) {
    logger.error('templateBackgrounds.listForUser error', { error: err, userId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const getBackground = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  const { id } = req.params;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const bg = await templateBackgroundsRepository.findById(id);
    if (!bg || bg.archived_at !== null) {
      res.status(404).json({ error: 'Background introuvable' });
      return;
    }
    // Si restreint, vérifier que le user a un grant.
    if (!bg.is_public) {
      const visible = await templateBackgroundsRepository.listForUser(userId);
      if (!visible.some((b) => b.id === id)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }
    res.json(bg);
  } catch (err) {
    logger.error('templateBackgrounds.get error', { error: err, id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createBackground = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!req.file?.path) {
    res.status(400).json({ error: 'no_file', message: 'WebM requis (champ "background")' });
    return;
  }
  const { name, hex_color, is_public } = req.body as {
    name: string;
    hex_color: string;
    is_public?: boolean;
  };
  let uploadedPath: string | null = null;
  try {
    // Upload FTP via storage service (verification incluse).
    const uploaded = await uploadVideoFromDisk(
      req.file.path,
      req.file.size,
      `template-backgrounds/${Date.now()}-${req.file.originalname}`,
      req.file.mimetype
    );
    if (!uploaded || !uploaded.url) {
      res.status(500).json({ error: 'upload_failed' });
      return;
    }
    uploadedPath = uploaded.path;

    const bg = await templateBackgroundsRepository.create({
      name,
      hex_color,
      webm_url: uploaded.url,
      is_public: is_public ?? true,
      uploaded_by: userId,
    });
    logger.info('templateBackgrounds.create ok', {
      userId,
      id: bg.id,
      name,
      is_public: bg.is_public,
      ftp_path: uploadedPath,
    });
    res.status(201).json(bg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key|unique/i.test(msg)) {
      res.status(409).json({ error: 'name_exists' });
      return;
    }
    logger.error('templateBackgrounds.create error', { error: err, userId });
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    if (req.file?.path) cleanupTempFile(req.file.path);
  }
};

export const updateBackground = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const patch = req.body as { name?: string; is_public?: boolean; archived?: boolean };
  try {
    const bg = await templateBackgroundsRepository.update(id, patch);
    if (!bg) {
      res.status(404).json({ error: 'Background introuvable' });
      return;
    }
    logger.info('templateBackgrounds.update ok', { id, patch, userId: req.user?.id });
    res.json(bg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key|unique/i.test(msg)) {
      res.status(409).json({ error: 'name_exists' });
      return;
    }
    logger.error('templateBackgrounds.update error', { error: err, id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const grantBackgroundBulk = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { user_ids } = req.body as { user_ids: string[] };
  const grantedBy = req.user?.id;
  if (!grantedBy) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const exists = await templateBackgroundsRepository.findById(id);
    if (!exists) {
      res.status(404).json({ error: 'Background introuvable' });
      return;
    }
    const count = await templateBackgroundsRepository.grantBulk(id, user_ids, grantedBy);
    logger.info('templateBackgrounds.grantBulk ok', {
      id,
      requested: user_ids.length,
      affected: count,
      grantedBy,
    });
    res.json({ requested: user_ids.length, affected: count });
  } catch (err) {
    logger.error('templateBackgrounds.grantBulk error', { error: err, id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const listBackgroundGrants = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const grants = await templateBackgroundsRepository.listGrants(id);
    res.json(grants);
  } catch (err) {
    logger.error('templateBackgrounds.listGrants error', { error: err, id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const revokeBackgroundGrant = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { backgroundId, userId: targetUserId } = req.params;
  try {
    const ok = await templateBackgroundsRepository.revoke(backgroundId, targetUserId);
    if (!ok) {
      res.status(404).json({ error: 'Grant introuvable' });
      return;
    }
    logger.info('templateBackgrounds.revoke ok', {
      backgroundId,
      targetUserId,
      revokedBy: req.user?.id,
    });
    res.status(204).end();
  } catch (err) {
    logger.error('templateBackgrounds.revoke error', { error: err, backgroundId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
