import { commandQueueService } from './command-queue.service';
import logger from '../config/logger';
import { isFtpConfigured, getFtpPublicUrl, uploadFileToFtp } from '../config/ftp-storage';
import { uploadFile, getPublicUrl } from '../config/supabase';
import crypto from 'crypto';
import {
  AssetDeploymentRequest,
  AssetDeploymentResult,
  WatermarkConfig,
  OverlayPosition,
  WatermarkAnimation,
} from '../types';

/**
 * Service de gestion des assets (images watermark, logos, etc.)
 * Gère l'upload vers le stockage cloud et le déploiement vers les Pi
 */
class AssetService {
  /**
   * Calcule le checksum SHA256 d'un buffer
   */
  private calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Génère un nom de fichier sanitisé pour l'asset
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Remplace les caractères spéciaux
      .replace(/_+/g, '_') // Évite les underscores multiples
      .toLowerCase();
  }

  /**
   * Upload un asset vers le stockage cloud (FTP ou Supabase)
   * @returns URL publique de l'asset uploadé
   */
  async uploadAsset(
    buffer: Buffer,
    filename: string,
    assetType: 'watermark' | 'logo' | 'image'
  ): Promise<{ url: string; storagePath: string; checksum: string }> {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const checksum = this.calculateChecksum(buffer);

    // Déterminer le chemin de stockage selon le type
    const storageFolder = assetType === 'watermark' ? 'watermarks' : 'assets';

    logger.info('Uploading asset to cloud storage', {
      filename: sanitizedFilename,
      assetType,
      size: buffer.length,
      checksum,
    });

    // Essayer FTP d'abord, sinon Supabase
    if (isFtpConfigured()) {
      const ftpPath = `${storageFolder}/${sanitizedFilename}`;
      const mimeType = this.getMimeType(filename);
      await uploadFileToFtp(buffer, ftpPath, mimeType);
      const url = getFtpPublicUrl(ftpPath);

      logger.info('Asset uploaded to FTP', { url, storagePath: ftpPath });
      return { url, storagePath: ftpPath, checksum };
    }

    // Fallback vers Supabase
    const supabasePath = `${storageFolder}/${sanitizedFilename}`;
    await uploadFile(buffer, supabasePath, this.getMimeType(filename));
    const url = getPublicUrl(supabasePath);

    logger.info('Asset uploaded to Supabase', { url, storagePath: supabasePath });
    return { url, storagePath: supabasePath, checksum };
  }

  /**
   * Déploie un asset vers un site Pi
   */
  async deployAssetToSite(
    siteId: string,
    assetUrl: string,
    filename: string,
    targetPath: string,
    checksum: string,
    assetType: 'watermark' | 'logo' | 'image'
  ): Promise<{ sent: boolean; queued: boolean; commandId?: string }> {
    const commandData: AssetDeploymentRequest = {
      assetUrl,
      filename,
      targetPath,
      checksum,
      assetType,
    };

    logger.info('Deploying asset to site', {
      siteId,
      filename,
      targetPath,
      assetType,
    });

    const result = await commandQueueService.sendOrQueue(
      siteId,
      'deploy_asset',
      commandData,
      {
        priority: 4, // Priorité légèrement inférieure aux vidéos
        description: `Déploiement ${assetType}: ${filename}`,
        expiresIn: 7 * 24 * 60 * 60 * 1000, // Expire après 7 jours
      }
    );

    logger.info('Asset deployment command result', {
      siteId,
      sent: result.sent,
      queued: result.queued,
      commandId: result.commandId,
    });

    return {
      sent: result.sent,
      queued: result.queued,
      commandId: result.commandId,
    };
  }

  /**
   * Upload et déploie un watermark vers un site
   * Combine l'upload vers le cloud et le déploiement vers le Pi
   */
  async uploadAndDeployWatermark(
    siteId: string,
    buffer: Buffer,
    filename: string
  ): Promise<{
    uploadResult: { url: string; storagePath: string; checksum: string };
    deployResult: { sent: boolean; queued: boolean; commandId?: string };
  }> {
    // 1. Upload vers le cloud
    const uploadResult = await this.uploadAsset(buffer, filename, 'watermark');

    // 2. Déployer vers le Pi
    // Le chemin cible sur le Pi est relatif à /home/pi/neopro/
    const targetPath = `assets/watermarks/${this.sanitizeFilename(filename)}`;

    const deployResult = await this.deployAssetToSite(
      siteId,
      uploadResult.url,
      filename,
      targetPath,
      uploadResult.checksum,
      'watermark'
    );

    return { uploadResult, deployResult };
  }

  /**
   * Crée une configuration watermark par défaut
   */
  createDefaultWatermarkConfig(imagePath: string): WatermarkConfig {
    return {
      enabled: true,
      imagePath,
      position: 'bottom-right' as OverlayPosition,
      offsetX: 20,
      offsetY: 20,
      opacity: 80,
      width: 150,
      height: 0, // Auto
      borderRadius: 0,
      animation: 'fade' as WatermarkAnimation,
      animationDuration: 500,
      schedule: {
        enabled: false,
        rules: [],
      },
    };
  }

  /**
   * Valide une configuration watermark
   */
  validateWatermarkConfig(config: Partial<WatermarkConfig>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (config.opacity !== undefined && (config.opacity < 0 || config.opacity > 100)) {
      errors.push('opacity doit être entre 0 et 100');
    }

    if (config.width !== undefined && config.width < 0) {
      errors.push('width doit être positif');
    }

    if (config.height !== undefined && config.height < 0) {
      errors.push('height doit être positif');
    }

    if (config.offsetX !== undefined && config.offsetX < -1000) {
      errors.push('offsetX invalide');
    }

    if (config.offsetY !== undefined && config.offsetY < -1000) {
      errors.push('offsetY invalide');
    }

    if (config.borderRadius !== undefined && config.borderRadius < 0) {
      errors.push('borderRadius doit être positif');
    }

    if (config.animationDuration !== undefined && config.animationDuration < 0) {
      errors.push('animationDuration doit être positif');
    }

    const validPositions: OverlayPosition[] = [
      'top-left',
      'top-center',
      'top-right',
      'center-left',
      'center',
      'center-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ];
    if (config.position && !validPositions.includes(config.position)) {
      errors.push(`position invalide: ${config.position}`);
    }

    const validAnimations: WatermarkAnimation[] = [
      'none',
      'fade',
      'slide-left',
      'slide-right',
      'slide-top',
      'slide-bottom',
      'zoom',
    ];
    if (config.animation && !validAnimations.includes(config.animation)) {
      errors.push(`animation invalide: ${config.animation}`);
    }

    // Valider les règles de scheduling si présentes
    if (config.schedule?.rules) {
      for (const rule of config.schedule.rules) {
        if (!this.isValidTimeFormat(rule.startTime)) {
          errors.push(`startTime invalide: ${rule.startTime}`);
        }
        if (!this.isValidTimeFormat(rule.endTime)) {
          errors.push(`endTime invalide: ${rule.endTime}`);
        }
        if (
          !Array.isArray(rule.daysOfWeek) ||
          rule.daysOfWeek.some((d) => d < 0 || d > 6)
        ) {
          errors.push('daysOfWeek doit contenir des valeurs entre 0 et 6');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Vérifie le format d'heure HH:mm
   */
  private isValidTimeFormat(time: string): boolean {
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(time);
  }

  /**
   * Détermine le type MIME d'un fichier image
   */
  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
}

export const assetService = new AssetService();
export default assetService;
