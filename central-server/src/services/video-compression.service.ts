/**
 * Service de compression vidéo automatique
 * Compresse les vidéos > 100MB avant déploiement
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

interface CompressionResult {
  success: boolean;
  inputSize: number;
  outputSize: number;
  compressionRatio: number;
  outputPath: string | null;
  duration?: number;
  error?: string;
}

interface CompressionOptions {
  crf?: number;          // Qualité (18-28, plus bas = meilleur, défaut 23)
  preset?: string;       // Vitesse (ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow)
  maxBitrate?: string;   // Bitrate max (ex: '4M')
  audioCodec?: string;   // Codec audio (défaut: aac)
  audioBitrate?: string; // Bitrate audio (défaut: 128k)
}

class VideoCompressionService {
  private tempDir: string;
  private compressionThresholdMB: number;
  private defaultOptions: CompressionOptions;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'neopro-video-compression');
    this.compressionThresholdMB = parseInt(process.env.VIDEO_COMPRESSION_THRESHOLD_MB || '100', 10);
    this.defaultOptions = {
      crf: 23,
      preset: 'medium',
      audioCodec: 'aac',
      audioBitrate: '128k',
    };

    // Créer le répertoire temp s'il n'existe pas
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
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
   * Vérifie si une vidéo doit être compressée
   */
  shouldCompress(fileSizeBytes: number): boolean {
    const fileSizeMB = fileSizeBytes / (1024 * 1024);
    return fileSizeMB > this.compressionThresholdMB;
  }

  /**
   * Compresse une vidéo
   * @param inputBuffer Buffer de la vidéo source
   * @param originalName Nom original du fichier
   * @param options Options de compression
   * @returns Résultat avec le buffer compressé ou erreur
   */
  async compressVideo(
    inputBuffer: Buffer,
    originalName: string,
    options: CompressionOptions = {}
  ): Promise<{ buffer: Buffer | null; result: CompressionResult }> {
    const startTime = Date.now();
    const opts = { ...this.defaultOptions, ...options };

    // Chemins temporaires
    const inputId = uuidv4();
    const ext = path.extname(originalName) || '.mp4';
    const inputPath = path.join(this.tempDir, `input-${inputId}${ext}`);
    const outputPath = path.join(this.tempDir, `output-${inputId}.mp4`);

    try {
      // Vérifier disponibilité ffmpeg
      if (!await this.isAvailable()) {
        return {
          buffer: null,
          result: {
            success: false,
            inputSize: inputBuffer.length,
            outputSize: 0,
            compressionRatio: 0,
            outputPath: null,
            error: 'ffmpeg not available',
          },
        };
      }

      // Écrire le buffer d'entrée
      fs.writeFileSync(inputPath, inputBuffer);
      const inputSize = inputBuffer.length;

      logger.info('Starting video compression', {
        inputSize: Math.round(inputSize / (1024 * 1024)) + 'MB',
        originalName,
        options: opts,
      });

      // Exécuter la compression
      await this.runFfmpegCompression(inputPath, outputPath, opts);

      // Lire le résultat
      if (!fs.existsSync(outputPath)) {
        throw new Error('Output file not created');
      }

      const outputBuffer = fs.readFileSync(outputPath);
      const outputSize = outputBuffer.length;
      const compressionRatio = inputSize / outputSize;
      const duration = Date.now() - startTime;

      logger.info('Video compression completed', {
        inputSize: Math.round(inputSize / (1024 * 1024)) + 'MB',
        outputSize: Math.round(outputSize / (1024 * 1024)) + 'MB',
        compressionRatio: compressionRatio.toFixed(2),
        durationMs: duration,
      });

      // Si la compression n'a pas réduit significativement la taille, retourner l'original
      if (compressionRatio < 1.1) {
        logger.info('Compression did not reduce size significantly, using original');
        return {
          buffer: inputBuffer,
          result: {
            success: true,
            inputSize,
            outputSize: inputSize,
            compressionRatio: 1,
            outputPath: null,
            duration,
          },
        };
      }

      return {
        buffer: outputBuffer,
        result: {
          success: true,
          inputSize,
          outputSize,
          compressionRatio,
          outputPath,
          duration,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Video compression failed:', error);

      return {
        buffer: null,
        result: {
          success: false,
          inputSize: inputBuffer.length,
          outputSize: 0,
          compressionRatio: 0,
          outputPath: null,
          error: errorMessage,
        },
      };
    } finally {
      // Nettoyer les fichiers temporaires
      this.cleanupFile(inputPath);
      this.cleanupFile(outputPath);
    }
  }

  /**
   * Exécute ffmpeg pour la compression
   */
  private runFfmpegCompression(
    inputPath: string,
    outputPath: string,
    options: CompressionOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-crf', String(options.crf || 23),
        '-preset', options.preset || 'medium',
        '-c:a', options.audioCodec || 'aac',
        '-b:a', options.audioBitrate || '128k',
        '-movflags', '+faststart', // Optimise pour le streaming
        '-y', // Écraser si existe
        outputPath,
      ];

      // Ajouter bitrate max si spécifié
      if (options.maxBitrate) {
        args.splice(args.indexOf('-preset') + 2, 0, '-maxrate', options.maxBitrate, '-bufsize', options.maxBitrate);
      }

      const process = spawn('ffmpeg', args);
      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('error', (error) => {
        reject(new Error(`ffmpeg process error: ${error.message}`));
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        }
      });
    });
  }

  /**
   * Nettoie un fichier temporaire
   */
  private cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      logger.warn('Failed to cleanup temp file:', { filePath, error });
    }
  }

  /**
   * Nettoie tous les fichiers temporaires anciens (> 1 heure)
   */
  async cleanupOldTempFiles(): Promise<number> {
    let cleaned = 0;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    try {
      const files = fs.readdirSync(this.tempDir);

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime.getTime() < oneHourAgo) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.info('Cleaned old temp compression files', { count: cleaned });
      }
    } catch (error) {
      logger.error('Failed to cleanup old temp files:', error);
    }

    return cleaned;
  }
}

export const videoCompressionService = new VideoCompressionService();
export default videoCompressionService;
