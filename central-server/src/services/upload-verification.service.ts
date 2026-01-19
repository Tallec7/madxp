/**
 * Service de vérification des uploads
 *
 * Vérifie que les fichiers uploadés (vidéos, mises à jour, assets) sont
 * correctement stockés et accessibles avant de permettre leur déploiement.
 *
 * Résout le problème de race condition où un Pi télécharge un fichier
 * avant que l'upload soit terminé.
 */

import { query } from '../config/database';
import { getFtpPublicUrl, isFtpConfigured } from '../config/ftp-storage';
import logger from '../config/logger';

// Types
export type UploadStatus = 'uploading' | 'verifying' | 'ready' | 'failed';

export interface VerificationResult {
  verified: boolean;
  actualSize: number | null;
  expectedSize: number;
  error?: string;
  attempts: number;
}

export interface UploadRecord {
  id: string;
  upload_status: UploadStatus;
  upload_verified_at: Date | null;
  upload_verified_size: number | null;
  upload_error_message: string | null;
  upload_retry_count: number;
}

// Configuration
const VERIFICATION_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 1000, // 1 seconde entre les tentatives
  httpTimeout: 10000, // 10 secondes pour le HEAD request
  sizeTolerance: 0, // Tolérance de taille (0 = exact match requis)
};

class UploadVerificationService {
  /**
   * Vérifie qu'un fichier est accessible via HTTP HEAD request
   * et que sa taille correspond à celle attendue
   */
  async verifyHttpAccess(
    url: string,
    expectedSize: number
  ): Promise<VerificationResult> {
    let attempts = 0;
    let lastError: string | undefined;

    while (attempts < VERIFICATION_CONFIG.maxRetries) {
      attempts++;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          VERIFICATION_CONFIG.httpTimeout
        );

        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          lastError = `HTTP ${response.status}: ${response.statusText}`;
          logger.warn('Upload verification HTTP error', {
            url,
            status: response.status,
            attempt: attempts,
          });

          // Si 404, le fichier n'existe pas encore - retry
          if (response.status === 404 && attempts < VERIFICATION_CONFIG.maxRetries) {
            await this.delay(VERIFICATION_CONFIG.retryDelayMs * attempts);
            continue;
          }

          return {
            verified: false,
            actualSize: null,
            expectedSize,
            error: lastError,
            attempts,
          };
        }

        // Vérifier la taille
        const contentLength = response.headers.get('content-length');
        const actualSize = contentLength ? parseInt(contentLength, 10) : null;

        if (actualSize === null) {
          // Pas de Content-Length header, on accepte quand même
          logger.warn('Upload verification: no Content-Length header', { url });
          return {
            verified: true,
            actualSize: null,
            expectedSize,
            attempts,
          };
        }

        // Vérifier que la taille correspond (avec tolérance)
        const sizeDiff = Math.abs(actualSize - expectedSize);
        if (sizeDiff > VERIFICATION_CONFIG.sizeTolerance) {
          // Taille différente - fichier peut-être encore en cours d'upload
          if (actualSize < expectedSize && attempts < VERIFICATION_CONFIG.maxRetries) {
            logger.info('Upload verification: file smaller than expected, retrying', {
              url,
              actualSize,
              expectedSize,
              attempt: attempts,
            });
            await this.delay(VERIFICATION_CONFIG.retryDelayMs * attempts);
            continue;
          }

          return {
            verified: false,
            actualSize,
            expectedSize,
            error: `Size mismatch: expected ${expectedSize}, got ${actualSize}`,
            attempts,
          };
        }

        // Succès !
        logger.info('Upload verification successful', {
          url,
          actualSize,
          expectedSize,
          attempts,
        });

        return {
          verified: true,
          actualSize,
          expectedSize,
          attempts,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('aborted')) {
          lastError = 'Timeout during verification';
        } else {
          lastError = errorMessage;
        }

        logger.warn('Upload verification error', {
          url,
          error: lastError,
          attempt: attempts,
        });

        if (attempts < VERIFICATION_CONFIG.maxRetries) {
          await this.delay(VERIFICATION_CONFIG.retryDelayMs * attempts);
        }
      }
    }

    return {
      verified: false,
      actualSize: null,
      expectedSize,
      error: lastError || 'Max retries exceeded',
      attempts,
    };
  }

  /**
   * Vérifie et marque une vidéo comme prête pour le déploiement
   */
  async verifyAndMarkVideoReady(
    videoId: string,
    storageUrl: string,
    expectedSize: number
  ): Promise<boolean> {
    try {
      // Mettre à jour le statut en 'verifying'
      await query(
        `UPDATE videos SET upload_status = 'verifying' WHERE id = $1`,
        [videoId]
      );

      // Vérifier l'accès HTTP
      const result = await this.verifyHttpAccess(storageUrl, expectedSize);

      if (result.verified) {
        // Marquer comme prêt
        await query(
          `UPDATE videos
           SET upload_status = 'ready',
               upload_verified_at = NOW(),
               upload_verified_size = $1,
               upload_error_message = NULL
           WHERE id = $2`,
          [result.actualSize || expectedSize, videoId]
        );

        logger.info('Video marked as ready for deployment', {
          videoId,
          verifiedSize: result.actualSize,
        });

        return true;
      } else {
        // Marquer comme échoué
        await query(
          `UPDATE videos
           SET upload_status = 'failed',
               upload_error_message = $1,
               upload_retry_count = upload_retry_count + 1
           WHERE id = $2`,
          [result.error, videoId]
        );

        logger.error('Video upload verification failed', {
          videoId,
          error: result.error,
          attempts: result.attempts,
        });

        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await query(
        `UPDATE videos
         SET upload_status = 'failed',
             upload_error_message = $1
         WHERE id = $2`,
        [errorMessage, videoId]
      );

      logger.error('Error during video upload verification', {
        videoId,
        error: errorMessage,
      });

      return false;
    }
  }

  /**
   * Vérifie et marque une mise à jour comme prête pour le déploiement
   */
  async verifyAndMarkUpdateReady(
    updateId: string,
    packageUrl: string,
    expectedSize: number
  ): Promise<boolean> {
    try {
      // Mettre à jour le statut en 'verifying'
      await query(
        `UPDATE software_updates SET upload_status = 'verifying' WHERE id = $1`,
        [updateId]
      );

      // Vérifier l'accès HTTP
      const result = await this.verifyHttpAccess(packageUrl, expectedSize);

      if (result.verified) {
        // Marquer comme prêt
        await query(
          `UPDATE software_updates
           SET upload_status = 'ready',
               upload_verified_at = NOW(),
               upload_verified_size = $1,
               upload_error_message = NULL
           WHERE id = $2`,
          [result.actualSize || expectedSize, updateId]
        );

        logger.info('Software update marked as ready for deployment', {
          updateId,
          verifiedSize: result.actualSize,
        });

        return true;
      } else {
        // Marquer comme échoué
        await query(
          `UPDATE software_updates
           SET upload_status = 'failed',
               upload_error_message = $1,
               upload_retry_count = upload_retry_count + 1
           WHERE id = $2`,
          [result.error, updateId]
        );

        logger.error('Software update upload verification failed', {
          updateId,
          error: result.error,
          attempts: result.attempts,
        });

        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await query(
        `UPDATE software_updates
         SET upload_status = 'failed',
             upload_error_message = $1
         WHERE id = $2`,
        [errorMessage, updateId]
      );

      logger.error('Error during software update upload verification', {
        updateId,
        error: errorMessage,
      });

      return false;
    }
  }

  /**
   * Vérifie si une vidéo est prête pour le déploiement
   */
  async isVideoReadyForDeployment(videoId: string): Promise<{
    ready: boolean;
    status: UploadStatus | null;
    error?: string;
  }> {
    const result = await query<{ upload_status: UploadStatus; upload_error_message: string | null }>(
      `SELECT upload_status, upload_error_message FROM videos WHERE id = $1`,
      [videoId]
    );

    if (result.rows.length === 0) {
      return { ready: false, status: null, error: 'Video not found' };
    }

    const { upload_status, upload_error_message } = result.rows[0];

    return {
      ready: upload_status === 'ready',
      status: upload_status,
      error: upload_error_message || undefined,
    };
  }

  /**
   * Vérifie si une mise à jour est prête pour le déploiement
   */
  async isUpdateReadyForDeployment(updateId: string): Promise<{
    ready: boolean;
    status: UploadStatus | null;
    error?: string;
  }> {
    const result = await query<{ upload_status: UploadStatus; upload_error_message: string | null }>(
      `SELECT upload_status, upload_error_message FROM software_updates WHERE id = $1`,
      [updateId]
    );

    if (result.rows.length === 0) {
      return { ready: false, status: null, error: 'Update not found' };
    }

    const { upload_status, upload_error_message } = result.rows[0];

    return {
      ready: upload_status === 'ready',
      status: upload_status,
      error: upload_error_message || undefined,
    };
  }

  /**
   * Marque une vidéo comme en cours d'upload
   */
  async markVideoUploading(videoId: string): Promise<void> {
    await query(
      `UPDATE videos SET upload_status = 'uploading', upload_error_message = NULL WHERE id = $1`,
      [videoId]
    );
  }

  /**
   * Marque une mise à jour comme en cours d'upload
   */
  async markUpdateUploading(updateId: string): Promise<void> {
    await query(
      `UPDATE software_updates SET upload_status = 'uploading', upload_error_message = NULL WHERE id = $1`,
      [updateId]
    );
  }

  /**
   * Obtient le message d'erreur approprié selon le statut
   */
  getDeploymentBlockedMessage(status: UploadStatus | null): string {
    switch (status) {
      case 'uploading':
        return "L'upload est encore en cours. Veuillez patienter quelques secondes.";
      case 'verifying':
        return "L'upload est en cours de vérification. Veuillez patienter.";
      case 'failed':
        return "L'upload a échoué. Veuillez réessayer d'uploader le fichier.";
      default:
        return "Le fichier n'est pas prêt pour le déploiement.";
    }
  }

  /**
   * Génère l'URL publique pour un fichier
   */
  getPublicUrl(storagePath: string, supabaseGetPublicUrl: (path: string) => string): string {
    // Détection FTP vs Supabase basée sur le format du path
    const isFtpPath = !storagePath.includes('/');

    if (isFtpPath && isFtpConfigured()) {
      return getFtpPublicUrl(storagePath);
    }

    return supabaseGetPublicUrl(storagePath);
  }

  /**
   * Utilitaire: délai async
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const uploadVerificationService = new UploadVerificationService();
export default uploadVerificationService;
