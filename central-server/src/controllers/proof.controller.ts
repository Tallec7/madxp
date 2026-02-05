import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../types';
import { proofService } from '../services/proof.service';
import { auditService } from '../services/audit.service';
import socketService from '../services/socket.service';
import { query } from '../config/database';
import logger from '../config/logger';

/**
 * Upload une preuve de diffusion (capture d'écran)
 * POST /api/proofs/:siteId/upload
 */
export const uploadProof = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const file = req.file as Express.Multer.File | undefined;
    const { checksum, triggeredBy = 'manual' } = req.body;

    // Validation
    if (!file) {
      return res.status(400).json({ error: 'Fichier screenshot requis' });
    }

    // Vérifier que le site existe
    const siteResult = await query('SELECT id, site_name FROM sites WHERE id = $1', [siteId]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Vérifier le checksum si fourni
    const actualChecksum = crypto
      .createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    if (checksum && actualChecksum !== checksum) {
      logger.warn('[ProofController] Checksum mismatch', {
        siteId,
        expected: checksum.substring(0, 16),
        actual: actualChecksum.substring(0, 16),
      });
      return res.status(400).json({ error: 'Checksum invalide - fichier corrompu' });
    }

    // Upload vers le cloud
    const uploadResult = await proofService.uploadProof(
      siteId,
      file.buffer,
      file.originalname,
      actualChecksum
    );

    // Sauvegarder en DB
    const proof = await proofService.saveProofRecord(
      siteId,
      uploadResult,
      triggeredBy as 'manual' | 'scheduled' | 'command',
      {
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        resolution: req.body.resolution,
      }
    );

    // Audit
    await auditService.log({
      action: 'SITE_UPDATED',
      userId: req.user?.id || 'system',
      targetType: 'site',
      targetId: siteId,
      details: {
        type: 'proof_uploaded',
        proofId: proof.id,
        filename: file.originalname,
        size: file.size,
        triggeredBy,
      },
    }, req);

    logger.info('[ProofController] Proof uploaded successfully', {
      siteId,
      proofId: proof.id,
      triggeredBy,
    });

    res.json({
      success: true,
      proof: {
        id: proof.id,
        url: proof.screenshot_url,
        timestamp: proof.timestamp_captured,
        checksum: proof.checksum,
      },
    });
  } catch (error) {
    logger.error('[ProofController] Upload failed', { error, siteId: req.params.siteId });
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * Récupère les preuves pour un site
 * GET /api/proofs/:siteId
 */
export const getProofsForSite = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    // Vérifier que le site existe
    const siteResult = await query('SELECT id FROM sites WHERE id = $1', [siteId]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const { proofs, total } = await proofService.getProofsForSite(siteId, limit, offset);

    res.json({
      success: true,
      proofs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + proofs.length < total,
      },
    });
  } catch (error) {
    logger.error('[ProofController] Get proofs failed', { error, siteId: req.params.siteId });
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * Récupère une preuve par ID
 * GET /api/proofs/detail/:proofId
 */
export const getProofById = async (req: AuthRequest, res: Response) => {
  try {
    const { proofId } = req.params;
    const proof = await proofService.getProofById(proofId);

    if (!proof) {
      return res.status(404).json({ error: 'Preuve non trouvée' });
    }

    res.json({ success: true, proof });
  } catch (error) {
    logger.error('[ProofController] Get proof failed', { error, proofId: req.params.proofId });
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * Déclenche une capture d'écran sur un site
 * POST /api/proofs/:siteId/capture
 */
export const triggerCapture = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    const { format = 'jpeg', quality = 85 } = req.body;

    // Vérifier que le site existe et est connecté
    const siteResult = await query('SELECT id, site_name FROM sites WHERE id = $1', [siteId]);
    if (siteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const isConnected = socketService.isConnected(siteId);
    if (!isConnected) {
      return res.status(503).json({
        error: 'Site non connecté',
        message: 'Le site doit être en ligne pour déclencher une capture',
      });
    }

    // Envoyer la commande au Pi
    const commandId = `capture-${Date.now()}`;
    const sent = socketService.sendCommand(siteId, {
      id: commandId,
      type: 'capture_proof',
      data: {
        format,
        quality,
        uploadToCloud: true,
      },
    });

    if (!sent) {
      return res.status(503).json({
        error: 'Impossible d\'envoyer la commande',
        message: 'Connexion perdue avec le site',
      });
    }

    logger.info('[ProofController] Capture triggered', { siteId, commandId, format, quality });

    res.json({
      success: true,
      message: 'Capture déclenchée',
      commandId,
    });
  } catch (error) {
    logger.error('[ProofController] Trigger capture failed', { error, siteId: req.params.siteId });
    res.status(500).json({ error: (error as Error).message });
  }
};

/**
 * Récupère les stats de preuves globales
 * GET /api/proofs/stats
 */
export const getProofStats = async (_req: AuthRequest, res: Response) => {
  try {
    const stats = await proofService.getProofStats();
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('[ProofController] Get stats failed', { error });
    res.status(500).json({ error: (error as Error).message });
  }
};
