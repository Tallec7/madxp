/**
 * Service de génération de thumbnails pour les vidéos
 * Utilise ffmpeg pour extraire une image et les métadonnées
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import logger from '../config/logger';

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  codec: string;
  bitrate: number;
  fps: number;
}

class ThumbnailService {
  private thumbnailDir: string;

  constructor() {
    this.thumbnailDir = process.env.THUMBNAIL_DIR || path.join(process.cwd(), 'uploads', 'thumbnails');
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.thumbnailDir)) {
      fs.mkdirSync(this.thumbnailDir, { recursive: true });
    }
  }

  /**
   * Vérifie si ffmpeg est disponible
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('ffmpeg', ['-version']);
      process.on('error', () => resolve(false));
      process.on('close', (code) => resolve(code === 0));
    });
  }

  /**
   * Génère une thumbnail pour une vidéo
   * @param videoPath Chemin de la vidéo source
   * @param videoId ID de la vidéo pour nommer la thumbnail
   * @param timePercent Position dans la vidéo (0-100, défaut 10%)
   * @returns Chemin de la thumbnail générée
   */
  async generateThumbnail(
    videoPath: string,
    videoId: string,
    timePercent: number = 10
  ): Promise<string | null> {
    if (!fs.existsSync(videoPath)) {
      logger.error('Video file not found for thumbnail generation', { videoPath });
      return null;
    }

    const thumbnailFilename = `${videoId}.jpg`;
    const thumbnailPath = path.join(this.thumbnailDir, thumbnailFilename);

    try {
      // D'abord obtenir la durée pour calculer le timestamp
      const metadata = await this.extractMetadata(videoPath);
      const seekTime = (metadata.duration * timePercent) / 100;

      await this.runFfmpeg([
        '-ss', seekTime.toString(),
        '-i', videoPath,
        '-vframes', '1',
        '-vf', 'scale=320:-1', // 320px de large, hauteur proportionnelle
        '-q:v', '2', // Qualité (1-31, 2 = haute qualité)
        '-y', // Écraser si existe
        thumbnailPath,
      ]);

      logger.info('Thumbnail generated', { videoId, thumbnailPath });
      return thumbnailPath;
    } catch (error) {
      logger.error('Failed to generate thumbnail:', error);
      return null;
    }
  }

  /**
   * Extrait les métadonnées d'une vidéo
   * @param videoPath Chemin de la vidéo
   */
  async extractMetadata(videoPath: string): Promise<VideoMetadata> {
    const defaultMetadata: VideoMetadata = {
      duration: 0,
      width: 0,
      height: 0,
      codec: 'unknown',
      bitrate: 0,
      fps: 0,
    };

    if (!fs.existsSync(videoPath)) {
      logger.error('Video file not found for metadata extraction', { videoPath });
      return defaultMetadata;
    }

    try {
      const output = await this.runFfprobe([
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,codec_name,bit_rate,r_frame_rate:format=duration',
        '-of', 'json',
        videoPath,
      ]);

      const data = JSON.parse(output);
      const stream = data.streams?.[0] || {};
      const format = data.format || {};

      // Calculer le FPS à partir de la fraction
      let fps = 0;
      if (stream.r_frame_rate) {
        const [num, den] = stream.r_frame_rate.split('/').map(Number);
        fps = den > 0 ? num / den : 0;
      }

      return {
        duration: parseFloat(format.duration) || 0,
        width: stream.width || 0,
        height: stream.height || 0,
        codec: stream.codec_name || 'unknown',
        bitrate: parseInt(stream.bit_rate, 10) || 0,
        fps: Math.round(fps * 100) / 100,
      };
    } catch (error) {
      logger.error('Failed to extract video metadata:', error);
      return defaultMetadata;
    }
  }

  /**
   * Supprime une thumbnail
   * @param videoId ID de la vidéo
   */
  async deleteThumbnail(videoId: string): Promise<boolean> {
    const thumbnailPath = path.join(this.thumbnailDir, `${videoId}.jpg`);

    try {
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
        logger.info('Thumbnail deleted', { videoId });
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to delete thumbnail:', error);
      return false;
    }
  }

  /**
   * Retourne le chemin d'une thumbnail existante ou null
   * @param videoId ID de la vidéo
   */
  getThumbnailPath(videoId: string): string | null {
    const thumbnailPath = path.join(this.thumbnailDir, `${videoId}.jpg`);
    return fs.existsSync(thumbnailPath) ? thumbnailPath : null;
  }

  /**
   * Exécute une commande ffmpeg
   */
  private runFfmpeg(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn('ffmpeg', args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('error', (error) => {
        reject(new Error(`ffmpeg error: ${error.message}`));
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Exécute une commande ffprobe
   */
  private runFfprobe(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn('ffprobe', args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('error', (error) => {
        reject(new Error(`ffprobe error: ${error.message}`));
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
        }
      });
    });
  }
}

export const thumbnailService = new ThumbnailService();
export default thumbnailService;
