/**
 * Capture Proof Command
 * Prend une capture d'écran de la TV et l'upload vers le cloud
 * pour servir de "preuve de diffusion"
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');
const config = require('../config');

const execAsync = promisify(exec);

class CaptureProofHandler {
  constructor() {
    this.tempDir = '/tmp/neopro-proofs';
  }

  /**
   * Exécute la commande de capture
   * @param {Object} data - Paramètres de la commande
   * @param {Function} progressCallback - Callback pour le progrès
   */
  async execute(data, progressCallback) {
    const {
      format = 'jpeg',
      quality = 85,
      uploadToCloud = true,
    } = data;

    logger.info('[capture-proof] Starting capture', { format, quality, uploadToCloud });

    try {
      // Créer le dossier temporaire si nécessaire
      await fs.ensureDir(this.tempDir);

      // 1. Capturer l'écran
      progressCallback(10, 'capturing', 'Capture en cours...');
      const screenshotPath = await this.captureScreen(format, quality);
      logger.info('[capture-proof] Screenshot taken', { path: screenshotPath });

      // 2. Lire le fichier et calculer le checksum
      progressCallback(30, 'processing', 'Traitement...');
      const buffer = await fs.readFile(screenshotPath);
      const checksum = crypto
        .createHash('sha256')
        .update(buffer)
        .digest('hex');

      const stats = await fs.stat(screenshotPath);
      logger.info('[capture-proof] Checksum calculated', {
        size: stats.size,
        checksum: checksum.substring(0, 16) + '...',
      });

      // 3. Upload vers le cloud si demandé
      if (uploadToCloud) {
        progressCallback(50, 'uploading', 'Upload vers le cloud...');
        const uploadResult = await this.uploadToCloud(buffer, checksum, format);

        // Nettoyer le fichier temporaire
        await fs.remove(screenshotPath);

        progressCallback(100, 'completed', 'Capture uploadée avec succès');

        return {
          success: true,
          uploaded: true,
          proofId: uploadResult.proofId,
          url: uploadResult.url,
          checksum,
          fileSize: stats.size,
          timestamp: new Date().toISOString(),
        };
      }

      // 4. Sinon, garder en local
      progressCallback(100, 'completed', 'Capture sauvegardée localement');

      return {
        success: true,
        uploaded: false,
        localPath: screenshotPath,
        checksum,
        fileSize: stats.size,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('[capture-proof] Capture failed', { error: error.message });
      progressCallback(0, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Capture l'écran avec ffmpeg ou scrot
   */
  async captureScreen(format, quality) {
    const timestamp = Date.now();
    const extension = format === 'png' ? 'png' : 'jpg';
    const outputPath = path.join(this.tempDir, `proof_${timestamp}.${extension}`);

    // Déterminer la méthode de capture
    // On essaie d'abord ffmpeg (plus fiable), puis scrot
    const display = process.env.DISPLAY || ':0';

    try {
      // Méthode 1: ffmpeg x11grab (recommandé)
      const ffmpegQuality = Math.max(1, Math.round((100 - quality) / 4)); // 1-25, plus bas = meilleur
      await execAsync(
        `DISPLAY=${display} ffmpeg -f x11grab -video_size 1920x1080 -i ${display} ` +
        `-vframes 1 -q:v ${ffmpegQuality} "${outputPath}" -y`,
        { timeout: 10000 }
      );
      logger.info('[capture-proof] Captured with ffmpeg', { outputPath });
      return outputPath;
    } catch (ffmpegError) {
      logger.warn('[capture-proof] ffmpeg failed, trying scrot', { error: ffmpegError.message });
    }

    try {
      // Méthode 2: scrot (fallback)
      const scrotQuality = quality;
      await execAsync(
        `DISPLAY=${display} scrot -q ${scrotQuality} "${outputPath}"`,
        { timeout: 10000 }
      );
      logger.info('[capture-proof] Captured with scrot', { outputPath });
      return outputPath;
    } catch (scrotError) {
      logger.error('[capture-proof] scrot also failed', { error: scrotError.message });
    }

    // Méthode 3: capture depuis le framebuffer (sans X11)
    try {
      await execAsync(
        `fbgrab "${outputPath}"`,
        { timeout: 10000 }
      );
      logger.info('[capture-proof] Captured with fbgrab', { outputPath });
      return outputPath;
    } catch (fbError) {
      throw new Error(
        `Impossible de capturer l'écran. ` +
        `ffmpeg: ${ffmpegError?.message || 'N/A'}, ` +
        `scrot: ${scrotError?.message || 'N/A'}, ` +
        `fbgrab: ${fbError.message}`
      );
    }
  }

  /**
   * Upload la capture vers le serveur central
   */
  async uploadToCloud(buffer, checksum, format) {
    const siteId = config.site.id;
    const apiKey = config.site.apiKey;
    const centralUrl = config.central.url;

    if (!siteId || !apiKey) {
      throw new Error('Site ID ou API Key manquant dans la configuration');
    }

    const formData = new FormData();
    const filename = `proof_${Date.now()}.${format === 'png' ? 'png' : 'jpg'}`;

    formData.append('screenshot', buffer, {
      filename,
      contentType: format === 'png' ? 'image/png' : 'image/jpeg',
    });
    formData.append('checksum', checksum);
    formData.append('triggeredBy', 'command');
    formData.append('resolution', '1920x1080');

    const response = await axios.post(
      `${centralUrl}/api/proofs/${siteId}/upload`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'x-api-key': apiKey,
          'x-site-id': siteId,
        },
        timeout: 30000,
        maxContentLength: 15 * 1024 * 1024, // 15MB
      }
    );

    if (!response.data.success) {
      throw new Error(response.data.error || 'Upload failed');
    }

    logger.info('[capture-proof] Upload successful', {
      proofId: response.data.proof?.id,
      url: response.data.proof?.url,
    });

    return {
      proofId: response.data.proof?.id,
      url: response.data.proof?.url,
      timestamp: response.data.proof?.timestamp,
    };
  }
}

module.exports = new CaptureProofHandler();
