import { Response } from 'express';
import logger from '../config/logger';
import { AuthRequest, WatermarkConfig } from '../types';
import { assetService } from '../services/asset.service';
import { auditService } from '../services/audit.service';

/**
 * Upload et déploie un watermark vers un site
 * POST /api/assets/watermark/:siteId
 */
export const uploadWatermark = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const file = req.file as Express.Multer.File | undefined;

    if (!file) {
      return res.status(400).json({ error: 'Fichier image requis' });
    }

    // Vérifier le type de fichier
    const allowedMimes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedMimes.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'Format de fichier non supporté',
        allowedFormats: ['PNG', 'JPEG', 'GIF', 'WebP', 'SVG'],
      });
    }

    // Vérifier la taille (max 5MB pour les images)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return res.status(400).json({
        error: 'Fichier trop volumineux',
        maxSize: '5 MB',
      });
    }

    logger.info('Uploading watermark', {
      siteId,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    });

    // Upload et déployer
    const result = await assetService.uploadAndDeployWatermark(
      siteId,
      file.buffer,
      file.originalname
    );

    // Audit
    await auditService.log({
      action: 'SITE_UPDATED',
      userId: req.user?.id || 'system',
      targetType: 'site',
      targetId: siteId,
      details: {
        type: 'watermark_upload',
        filename: file.originalname,
        size: file.size,
        sent: result.deployResult.sent,
        queued: result.deployResult.queued,
      }
    }, req);

    // Construire le chemin relatif pour la webapp Angular
    // Le chemin doit être relatif à /home/pi/neopro/ car nginx sert depuis ce dossier
    const localPath = result.uploadResult.storagePath.replace('watermarks/', 'assets/watermarks/');

    res.json({
      success: true,
      message: result.deployResult.sent
        ? 'Watermark uploadé et déployé'
        : 'Watermark uploadé, en attente de connexion du site',
      cloudUrl: result.uploadResult.url,
      localPath,
      checksum: result.uploadResult.checksum,
      deployment: {
        sent: result.deployResult.sent,
        queued: result.deployResult.queued,
        commandId: result.deployResult.commandId,
      },
      // Retourner une config par défaut pour faciliter l'intégration frontend
      // cloudUrl inclus pour que le dashboard puisse afficher l'aperçu
      suggestedConfig: assetService.createDefaultWatermarkConfig(localPath, result.uploadResult.url),
    });
  } catch (error) {
    logger.error('Error uploading watermark', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur lors de l\'upload du watermark' });
  }
};

/**
 * Valide une configuration watermark
 * POST /api/assets/watermark/validate
 */
export const validateWatermarkConfig = async (req: AuthRequest, res: Response) => {
  try {
    const config = req.body as Partial<WatermarkConfig>;

    const validation = assetService.validateWatermarkConfig(config);

    res.json({
      valid: validation.valid,
      errors: validation.errors,
    });
  } catch (error) {
    logger.error('Error validating watermark config', { error });
    res.status(500).json({ error: 'Erreur lors de la validation' });
  }
};

/**
 * Liste les watermarks disponibles sur le stockage FTP
 * GET /api/assets/watermarks
 */
export const listWatermarks = async (_req: AuthRequest, res: Response) => {
  try {
    const watermarks = await assetService.listWatermarks();

    res.json({
      success: true,
      watermarks,
      count: watermarks.length,
    });
  } catch (error) {
    logger.error('Error listing watermarks', { error });
    res.status(500).json({ error: 'Erreur lors de la récupération des watermarks' });
  }
};

/**
 * Déploie un asset existant vers un site
 * POST /api/assets/deploy/:siteId
 */
export const deployAsset = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { assetUrl, filename, targetPath, checksum, assetType } = req.body;

    if (!assetUrl || !filename || !targetPath) {
      return res.status(400).json({
        error: 'Champs requis manquants',
        required: ['assetUrl', 'filename', 'targetPath'],
      });
    }

    logger.info('Deploying asset to site', {
      siteId,
      filename,
      targetPath,
      assetType,
    });

    const result = await assetService.deployAssetToSite(
      siteId,
      assetUrl,
      filename,
      targetPath,
      checksum || '',
      assetType || 'image'
    );

    // Audit
    await auditService.log({
      action: 'SITE_UPDATED',
      userId: req.user?.id || 'system',
      targetType: 'site',
      targetId: siteId,
      details: {
        type: 'asset_deploy',
        filename,
        targetPath,
        assetType,
        sent: result.sent,
        queued: result.queued,
      }
    }, req);

    res.json({
      success: true,
      message: result.sent
        ? 'Asset déployé'
        : 'Asset en attente de connexion du site',
      sent: result.sent,
      queued: result.queued,
      commandId: result.commandId,
    });
  } catch (error) {
    logger.error('Error deploying asset', { error, siteId: req.params.siteId });
    res.status(500).json({ error: 'Erreur lors du déploiement' });
  }
};
