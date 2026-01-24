import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

export interface ImageToVideoOptions {
  duration: number; // seconds
  outputFormat?: 'mp4';
}

export interface ImageToVideoResult {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  size: number;
}

/**
 * Service pour convertir une image en vidéo MP4 via ffmpeg
 * Utilise ffmpeg installé sur le système (Railway ou local)
 */
class ImageToVideoService {
  /**
   * Convertit une image en vidéo MP4
   * @param imageBuffer - Buffer de l'image source
   * @param originalFilename - Nom original du fichier image
   * @param options - Options de conversion
   * @returns Buffer de la vidéo générée
   */
  async convert(
    imageBuffer: Buffer,
    originalFilename: string,
    options: ImageToVideoOptions
  ): Promise<ImageToVideoResult> {
    const { duration } = options;

    // Créer des fichiers temporaires
    const tempDir = os.tmpdir();
    const tempId = uuidv4();
    const inputExt = path.extname(originalFilename).toLowerCase();
    const inputPath = path.join(tempDir, `neopro-img-${tempId}${inputExt}`);
    const outputPath = path.join(tempDir, `neopro-vid-${tempId}.mp4`);

    try {
      // Écrire l'image dans un fichier temporaire
      await fs.promises.writeFile(inputPath, imageBuffer);

      logger.info('Starting image to video conversion', {
        inputPath,
        outputPath,
        duration,
        imageSize: imageBuffer.length,
      });

      // Exécuter ffmpeg
      await this.runFfmpeg(inputPath, outputPath, duration);

      // Lire le fichier vidéo généré
      const videoBuffer = await fs.promises.readFile(outputPath);
      const stats = await fs.promises.stat(outputPath);

      // Générer le nom de fichier de sortie
      const baseName = path.basename(originalFilename, inputExt);
      const outputFilename = `${baseName}.mp4`;

      logger.info('Image to video conversion completed', {
        outputFilename,
        videoSize: stats.size,
        duration,
      });

      return {
        buffer: videoBuffer,
        filename: outputFilename,
        mimetype: 'video/mp4',
        size: stats.size,
      };
    } finally {
      // Nettoyer les fichiers temporaires
      await this.cleanup(inputPath, outputPath);
    }
  }

  /**
   * Exécute ffmpeg pour convertir l'image en vidéo
   */
  private runFfmpeg(
    inputPath: string,
    outputPath: string,
    duration: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Arguments ffmpeg optimisés pour Raspberry Pi
      const args = [
        '-y', // Overwrite output
        '-loop', '1', // Loop l'image
        '-i', inputPath, // Input
        '-c:v', 'libx264', // Codec H.264
        '-t', duration.toString(), // Durée
        '-pix_fmt', 'yuv420p', // Format pixel compatible
        '-preset', 'medium', // Bon compromis vitesse/qualité
        '-crf', '18', // Qualité (plus bas = meilleur)
        '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2', // Scale to 1080p with padding
        '-movflags', '+faststart', // Streaming-friendly
        outputPath,
      ];

      logger.debug('Running ffmpeg', { args: args.join(' ') });

      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          logger.error('ffmpeg failed', { code, stderr });
          reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        }
      });

      ffmpeg.on('error', (err) => {
        logger.error('ffmpeg spawn error', { error: err.message });
        reject(new Error(`Failed to spawn ffmpeg: ${err.message}. Is ffmpeg installed?`));
      });
    });
  }

  /**
   * Nettoie les fichiers temporaires
   */
  private async cleanup(...paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        await fs.promises.unlink(p);
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  /**
   * Vérifie si ffmpeg est disponible sur le système
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', ['-version']);

      ffmpeg.on('close', (code) => {
        resolve(code === 0);
      });

      ffmpeg.on('error', () => {
        resolve(false);
      });
    });
  }
}

export const imageToVideoService = new ImageToVideoService();
export default imageToVideoService;
