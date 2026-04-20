import { Response } from 'express';
import Joi from 'joi';
import { AuthRequest } from '../types/index';
import { videoCategoryService } from '../services/video-category.service';
import logger from '../config/logger';

const createSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  type: Joi.string().valid('action', 'loop', 'match').required(),
  icon: Joi.string().max(50).optional().allow(null, ''),
  sort_order: Joi.number().integer().min(0).optional(),
});

const updateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).optional(),
  type: Joi.string().valid('action', 'loop', 'match').optional(),
  icon: Joi.string().max(50).optional().allow(null, ''),
  sort_order: Joi.number().integer().min(0).optional(),
}).min(1);

export const listCategories = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const categories = await videoCategoryService.listForSite(siteId);
    return res.json({ data: categories });
  } catch (error) {
    logger.error('video_category.list.error', { error, siteId: req.params.siteId });
    return res.status(500).json({ error: 'Erreur serveur interne' });
  }
};

export const createCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { error, value } = createSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const category = await videoCategoryService.create(siteId, value);
    return res.status(201).json({ data: category });
  } catch (error) {
    logger.error('video_category.create.error', { error, siteId: req.params.siteId });
    return res.status(500).json({ error: 'Erreur serveur interne' });
  }
};

export const updateCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, id } = req.params;
    const { error, value } = updateSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const category = await videoCategoryService.update(id, siteId, value);
    if (!category) return res.status(404).json({ error: 'Catégorie introuvable' });
    return res.json({ data: category });
  } catch (error) {
    logger.error('video_category.update.error', { error, siteId: req.params.siteId, id: req.params.id });
    return res.status(500).json({ error: 'Erreur serveur interne' });
  }
};

export const deleteCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, id } = req.params;
    const deleted = await videoCategoryService.delete(id, siteId);
    if (!deleted) return res.status(404).json({ error: 'Catégorie introuvable' });
    return res.status(204).send();
  } catch (error) {
    logger.error('video_category.delete.error', { error, siteId: req.params.siteId, id: req.params.id });
    return res.status(500).json({ error: 'Erreur serveur interne' });
  }
};
