/**
 * Drafts Controller
 *
 * Gère les endpoints pour les brouillons de configuration.
 */

import { Response } from 'express';
import logger from '../config/logger';
import { AuthRequest } from '../types';
import { draftService } from '../services/draft.service';
import { orchestratedDeploymentService } from '../services/orchestrated-deployment.service';

/**
 * GET /api/sites/:siteId/draft
 * Récupère le brouillon d'un site
 */
export const getDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;

    const draft = await draftService.getDraft(siteId);

    if (!draft) {
      return res.status(404).json({
        error: 'Aucun brouillon trouvé pour ce site',
      });
    }

    res.json(draft);
  } catch (error) {
    logger.error('Get draft error:', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};

/**
 * PUT /api/sites/:siteId/draft
 * Crée ou met à jour le brouillon d'un site
 */
export const saveDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { name, configuration } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    if (!configuration) {
      return res.status(400).json({ error: 'La configuration est requise' });
    }

    const draft = await draftService.createOrUpdateDraft(
      siteId,
      name || 'Brouillon',
      configuration,
      userId
    );

    res.json(draft);
  } catch (error) {
    logger.error('Save draft error:', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};

/**
 * DELETE /api/sites/:siteId/draft
 * Supprime le brouillon d'un site
 */
export const deleteDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;

    const deleted = await draftService.deleteDraft(siteId);

    if (!deleted) {
      return res.status(404).json({
        error: 'Aucun brouillon trouvé pour ce site',
      });
    }

    res.json({ success: true, message: 'Brouillon supprimé' });
  } catch (error) {
    logger.error('Delete draft error:', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};

/**
 * POST /api/sites/:siteId/draft/validate
 * Valide le brouillon (vérifie les vidéos manquantes)
 */
export const validateDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;

    const draft = await draftService.getDraft(siteId);
    if (!draft) {
      return res.status(404).json({
        error: 'Aucun brouillon trouvé pour ce site',
      });
    }

    const validation = await draftService.validateDraft(siteId);

    res.json(validation);
  } catch (error) {
    logger.error('Validate draft error:', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};

/**
 * POST /api/sites/:siteId/draft/deploy
 * Déploie le brouillon (vidéos puis configuration)
 */
export const deployDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    // Vérifier qu'un brouillon existe
    const draft = await draftService.getDraft(siteId);
    if (!draft) {
      return res.status(404).json({
        error: 'Aucun brouillon trouvé pour ce site',
      });
    }

    // Vérifier qu'il n'y a pas déjà un déploiement en cours
    const activeDeployments = await orchestratedDeploymentService.getActiveDeployments(siteId);
    if (activeDeployments.length > 0) {
      return res.status(409).json({
        error: 'Un déploiement est déjà en cours pour ce site',
        activeDeploymentId: activeDeployments[0].id,
      });
    }

    // Valider le brouillon
    const validation = await draftService.validateDraft(siteId);

    // Vérifier si des vidéos sont vraiment manquantes (ni sur Pi, ni dans cloud)
    const trulyMissingVideos = validation.missingVideos.filter(v => !v.isInCloud);
    if (trulyMissingVideos.length > 0) {
      return res.status(400).json({
        error: 'Certaines vidéos référencées sont introuvables',
        missingVideos: trulyMissingVideos,
      });
    }

    // Lancer le déploiement orchestré
    const deployment = await orchestratedDeploymentService.startDeployment(siteId, userId);

    res.json({
      success: true,
      orchestratedDeploymentId: deployment.id,
      totalVideos: deployment.total_videos,
      message: deployment.total_videos > 0
        ? `Déploiement de ${deployment.total_videos} vidéo(s) puis configuration`
        : 'Déploiement de la configuration',
    });
  } catch (error) {
    logger.error('Deploy draft error:', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};

/**
 * GET /api/sites/:siteId/draft/deployment/:deploymentId
 * Récupère la progression d'un déploiement orchestré
 */
export const getDeploymentProgress = async (req: AuthRequest, res: Response) => {
  try {
    const { deploymentId } = req.params;

    const progress = await orchestratedDeploymentService.getDeploymentProgress(deploymentId);

    if (!progress) {
      return res.status(404).json({
        error: 'Déploiement non trouvé',
      });
    }

    res.json(progress);
  } catch (error) {
    logger.error('Get deployment progress error:', { error, deploymentId: req.params.deploymentId });
    res.status(500).json({ error: 'Erreur serveur interne' });
  }
};
