/**
 * ADR-108 — Template Versioning controllers.
 * 4 endpoints super_admin :
 *   - POST  /:id/publish              → snapshot + lock du master
 *   - POST  /:id/fork                 → clone draft v+1 d'un master published
 *   - GET   /:id/versions             → liste les snapshots du template
 *   - PATCH /:id/default-version      → rollback ou promote (set version courante)
 *
 * Refs : ADR-108 §Plan Phase 2.
 */

import type { Response } from 'express';
import type { AuthRequest } from '../types';
import logger from '../config/logger';
import { templateVersionsRepository, templateOptionsRepository } from '../repositories';

export const publishTemplateVersion = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const snapshot = await templateVersionsRepository.publish(id, userId);
    if (!snapshot) {
      res.status(404).json({ error: 'Template introuvable' });
      return;
    }
    logger.info('templateVersioning.publish ok', {
      templateId: id,
      version: snapshot.version,
      userId,
    });
    res.status(201).json(snapshot);
  } catch (err) {
    if (err instanceof Error && err.message === 'already_published') {
      res.status(409).json({ error: 'already_published' });
      return;
    }
    if (err instanceof Error && err.message === 'version_exists') {
      res.status(409).json({ error: 'version_exists' });
      return;
    }
    logger.error('templateVersioning.publish error', { error: err, id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const forkTemplateVersion = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { next_version } = req.body as { next_version: string };
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const result = await templateVersionsRepository.fork(id, {
      next_version,
      forked_by: userId,
    });
    if (!result) {
      res.status(404).json({ error: 'Template source introuvable ou non publié' });
      return;
    }
    logger.info('templateVersioning.fork ok', {
      sourceId: id,
      newId: result.id,
      nextVersion: next_version,
      userId,
    });
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof Error && err.message === 'invalid_version') {
      res.status(400).json({ error: 'invalid_version', message: 'next_version doit être > version source' });
      return;
    }
    if (err instanceof Error && err.message === 'fork_exists') {
      res.status(409).json({ error: 'fork_exists' });
      return;
    }
    logger.error('templateVersioning.fork error', { error: err, id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const listTemplateV2Versions = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const versions = await templateVersionsRepository.listByTemplate(id);
    res.json(versions);
  } catch (err) {
    logger.error('templateVersioning.list error', { error: err, id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const setTemplateDefaultVersion = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const { version } = req.body as { version: string };
  try {
    const updated = await templateVersionsRepository.setDefaultVersion(id, version);
    if (!updated) {
      res.status(404).json({ error: 'Template ou version introuvable' });
      return;
    }
    logger.info('templateVersioning.setDefault ok', {
      templateId: id,
      version,
      userId: req.user?.id,
    });
    res.json(updated);
  } catch (err) {
    logger.error('templateVersioning.setDefault error', { error: err, id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * GET /:id/options — liste des options template-level pour saisie user.
 * PDF JOUEUR §démarrage. Lecture pour tous rôles authentifiés.
 */
export const listTemplateOptions = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const options = await templateOptionsRepository.listOptions(id);
    res.json(
      options.map((o) => ({
        id: o.id,
        templateId: o.template_id,
        key: o.key,
        label: o.label,
        type: o.type,
        values: Array.isArray(o.values) ? o.values : [],
        defaultValue: o.default_value,
        userEditable: o.user_editable,
        sortOrder: o.sort_order,
      }))
    );
  } catch (err) {
    logger.error('templateVersioning.listOptions error', { error: err, id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
