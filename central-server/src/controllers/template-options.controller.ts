/**
 * PDF JOUEUR §démarrage — CRUD super_admin pour template_options + template_packshot_refs.
 *
 * 6 endpoints :
 *   - POST   /:id/options                       → créer une option
 *   - PATCH  /:id/options/:optionId             → patch partiel
 *   - DELETE /:id/options/:optionId             → supprimer
 *   - GET    /:id/packshot-refs                 → lister les packshots pluggables
 *   - POST   /:id/packshot-refs                 → ajouter un mapping option_value → packshot_template_id
 *   - DELETE /:id/packshot-refs/:packshotRefId  → retirer un mapping
 *
 * Refs : PR #771 (DB tables), PR #773 (UI form options), PR #774 (render packshot).
 */

import type { Response } from 'express';
import type { AuthRequest } from '../types';
import logger from '../config/logger';
import { templateOptionsRepository } from '../repositories';

export const createOption = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id: templateId } = req.params;
  const body = req.body as {
    key: string;
    label: string;
    type?: 'enum' | 'boolean';
    values: string[];
    default_value: string;
    user_editable?: boolean;
    sort_order?: number;
  };

  // Data integrity : default_value doit être dans values
  if (!body.values.includes(body.default_value)) {
    res.status(400).json({
      error: 'invalid_default_value',
      message: `default_value "${body.default_value}" doit être présent dans values`,
    });
    return;
  }

  try {
    const option = await templateOptionsRepository.createOption({
      template_id: templateId,
      key: body.key,
      label: body.label,
      type: body.type ?? 'enum',
      values: body.values,
      default_value: body.default_value,
      user_editable: body.user_editable ?? true,
      sort_order: body.sort_order ?? 0,
    });
    logger.info('templateOptions.create ok', {
      templateId,
      optionId: option.id,
      key: body.key,
      userId: req.user?.id,
    });
    res.status(201).json(option);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key|unique/i.test(msg)) {
      res.status(409).json({ error: 'key_exists', message: `Une option avec key="${body.key}" existe déjà sur ce template` });
      return;
    }
    if (/check.*type|jsonb_typeof/i.test(msg)) {
      res.status(400).json({ error: 'invalid_payload', message: msg });
      return;
    }
    logger.error('templateOptions.create error', { error: err, templateId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const updateOption = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { optionId } = req.params;
  const body = req.body as {
    label?: string;
    values?: string[];
    default_value?: string;
    user_editable?: boolean;
    sort_order?: number;
  };

  // Si values + default_value tous deux fournis, vérifier cohérence.
  // Si seulement default_value fourni, on doit comparer aux values existants.
  try {
    if (body.default_value !== undefined && body.values !== undefined) {
      if (!body.values.includes(body.default_value)) {
        res.status(400).json({
          error: 'invalid_default_value',
          message: 'default_value doit être présent dans values',
        });
        return;
      }
    } else if (body.default_value !== undefined) {
      const existing = await templateOptionsRepository.findOptionById(optionId);
      if (existing && Array.isArray(existing.values) && !existing.values.includes(body.default_value)) {
        res.status(400).json({
          error: 'invalid_default_value',
          message: 'default_value doit être présent dans values',
        });
        return;
      }
    }

    const option = await templateOptionsRepository.updateOption(optionId, body);
    if (!option) {
      res.status(404).json({ error: 'Option introuvable' });
      return;
    }
    logger.info('templateOptions.update ok', {
      optionId,
      patch: body,
      userId: req.user?.id,
    });
    res.json(option);
  } catch (err) {
    logger.error('templateOptions.update error', { error: err, optionId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteOption = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { optionId } = req.params;
  try {
    const ok = await templateOptionsRepository.deleteOption(optionId);
    if (!ok) {
      res.status(404).json({ error: 'Option introuvable' });
      return;
    }
    logger.info('templateOptions.delete ok', { optionId, userId: req.user?.id });
    res.status(204).end();
  } catch (err) {
    logger.error('templateOptions.delete error', { error: err, optionId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ── Packshot refs ──────────────────────────────────────────────────────────

export const listPackshotRefs = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  try {
    const refs = await templateOptionsRepository.listPackshotRefs(id);
    res.json(refs);
  } catch (err) {
    logger.error('templateOptions.listPackshotRefs error', { error: err, id });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createPackshotRef = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { id: templateId } = req.params;
  const body = req.body as {
    option_key: string;
    option_value: string;
    packshot_template_id: string;
    start_at_ms?: number;
    z_index_offset?: number;
  };

  // Évite l'auto-référence (un template ne peut pas être son propre packshot)
  if (body.packshot_template_id === templateId) {
    res.status(400).json({
      error: 'self_reference',
      message: 'Un template ne peut pas être son propre packshot',
    });
    return;
  }

  try {
    const ref = await templateOptionsRepository.createPackshotRef({
      template_id: templateId,
      option_key: body.option_key,
      option_value: body.option_value,
      packshot_template_id: body.packshot_template_id,
      start_at_ms: body.start_at_ms ?? 0,
      z_index_offset: body.z_index_offset ?? 100,
    });
    logger.info('templateOptions.createPackshotRef ok', {
      templateId,
      refId: ref.id,
      optionKey: body.option_key,
      optionValue: body.option_value,
      packshotTemplateId: body.packshot_template_id,
      userId: req.user?.id,
    });
    res.status(201).json(ref);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key|unique/i.test(msg)) {
      res.status(409).json({
        error: 'mapping_exists',
        message: `Un mapping existe déjà pour (${body.option_key}, ${body.option_value})`,
      });
      return;
    }
    if (/foreign key|references/i.test(msg)) {
      res.status(400).json({
        error: 'invalid_packshot_template',
        message: 'packshot_template_id introuvable',
      });
      return;
    }
    logger.error('templateOptions.createPackshotRef error', { error: err, templateId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deletePackshotRef = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { packshotRefId } = req.params;
  try {
    const ok = await templateOptionsRepository.deletePackshotRef(packshotRefId);
    if (!ok) {
      res.status(404).json({ error: 'Packshot ref introuvable' });
      return;
    }
    logger.info('templateOptions.deletePackshotRef ok', {
      packshotRefId,
      userId: req.user?.id,
    });
    res.status(204).end();
  } catch (err) {
    logger.error('templateOptions.deletePackshotRef error', { error: err, packshotRefId });
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
