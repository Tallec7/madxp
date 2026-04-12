import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { analyticsRepository } from '../repositories';

/**
 * GET /api/analytics/categories
 * Liste des catégories analytics disponibles
 */
export const getAnalyticsCategories = async (req: AuthRequest, res: Response) => {
  try {
    const categories = await analyticsRepository.getCategories();
    res.json(categories);
  } catch (error: unknown) {
    // Si la table n'existe pas encore, retourner les catégories par défaut
    const pgError = error as { code?: string };
    if (pgError.code === '42P01') {
      logger.warn('analytics_categories table does not exist, returning defaults');
      res.json([
        { id: 'sponsor', name: 'Sponsor', description: 'Vidéos partenaires et sponsors', color: '#3B82F6', is_default: true },
        { id: 'jingle', name: 'Jingle', description: 'Buts, temps morts, animations de match', color: '#10B981', is_default: true },
        { id: 'ambiance', name: 'Ambiance', description: 'Entrées joueurs, intros, outros', color: '#8B5CF6', is_default: true },
        { id: 'other', name: 'Autre', description: 'Vidéos non catégorisées', color: '#6B7280', is_default: true },
      ]);
      return;
    }
    logger.error('Get analytics categories error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des catégories analytics' });
  }
};

/**
 * POST /api/analytics/categories
 * Créer une nouvelle catégorie analytics (admin only)
 */
export const createAnalyticsCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id, name, description, color } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'id et name sont requis' });
    }

    // Validation: id doit être en snake_case (lettres minuscules, chiffres, underscores)
    if (!/^[a-z][a-z0-9_]*$/.test(id)) {
      return res.status(400).json({
        error: 'id doit commencer par une lettre minuscule et ne contenir que des lettres minuscules, chiffres et underscores',
      });
    }

    // Validation: couleur hex si fournie
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ error: 'color doit être au format hex (#RRGGBB)' });
    }

    const category = await analyticsRepository.createCategory({
      id,
      name,
      description: description || null,
      color: color || null,
    });

    logger.info('Analytics category created', { id, name, createdBy: req.user?.email });

    res.status(201).json(category);
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === '23505') {
      // Unique violation
      return res.status(409).json({ error: 'Une catégorie avec cet id existe déjà' });
    }
    logger.error('Create analytics category error:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la catégorie' });
  }
};

/**
 * PUT /api/analytics/categories/:id
 * Mettre à jour une catégorie analytics (admin only)
 */
export const updateAnalyticsCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name est requis' });
    }

    // Validation: couleur hex si fournie
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ error: 'color doit être au format hex (#RRGGBB)' });
    }

    const updated = await analyticsRepository.updateCategory(id, name, description || null, color || null);

    if (!updated) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    logger.info('Analytics category updated', { id, updatedBy: req.user?.email });

    res.json(updated);
  } catch (error) {
    logger.error('Update analytics category error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la catégorie' });
  }
};

/**
 * DELETE /api/analytics/categories/:id
 * Supprimer une catégorie analytics (admin only, si non-default)
 */
export const deleteAnalyticsCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Vérifier si c'est une catégorie par défaut
    const isDefault = await analyticsRepository.isCategoryDefault(id);

    if (isDefault === null) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    if (isDefault) {
      return res.status(400).json({ error: 'Impossible de supprimer une catégorie par défaut' });
    }

    await analyticsRepository.deleteCategory(id);

    logger.info('Analytics category deleted', { id, deletedBy: req.user?.email });

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete analytics category error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la catégorie' });
  }
};
