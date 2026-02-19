import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

export interface ImageToVideoOptions {
  duration: number; // seconds
  outputFormat?: 'mp4';
  blurBackground?: boolean; // Si true, utilise une version floutée de l'image comme fond (effet esthétique)
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
    const { duration, blurBackground = false } = options;

    // Créer des fichiers temporaires
    const tempDir = os.tmpdir();
    const tempId = uuidv4();
    const inputExt = path.extname(originalFilename).toLowerCase();
    const inputPath = path.join(tempDir, `neopro-img-${tempId}${inputExt}`);
    const outputPath = path.join(tempDir, `neopro-vid-${tempId}.mp4`);

    try {
      // Écrire l'image dans un fichier temporaire
      await fs.promises.writeFile(inputPath, imageBuffer);

      // Déterminer le meilleur codec disponible
      const codec = await this.getBestCodec();

      logger.info('Starting image to video conversion', {
        inputPath,
        outputPath,
        duration,
        imageSize: imageBuffer.length,
        codec,
        blurBackground,
      });

      // Exécuter ffmpeg
      await this.runFfmpeg(inputPath, outputPath, duration, codec, blurBackground);

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
   * Détermine le meilleur codec vidéo disponible
   * Préfère libx264, fallback sur libx265, puis sur le codec natif
   */
  async getBestCodec(): Promise<string> {
    const hasX264 = await this.hasLibx264();
    if (hasX264) {
      return 'libx264';
    }
    logger.warn('libx264 not available, using mpeg4 codec as fallback');
    return 'mpeg4';
  }

  /**
   * Exécute ffmpeg pour convertir l'image en vidéo
   * @param blurBackground - Si true, utilise une version floutée de l'image comme fond au lieu de bandes noires
   */
  private runFfmpeg(
    inputPath: string,
    outputPath: string,
    duration: number,
    codec: string = 'libx264',
    blurBackground: boolean = false
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Arguments ffmpeg - ordre important !
      // Options d'entrée AVANT -i, options de sortie APRÈS -i
      const args = [
        '-y', // Overwrite output
        '-loop', '1', // Loop l'image (option d'entrée)
        '-framerate', '1', // FPS d'entrée bas pour économiser la mémoire
        '-t', duration.toString(), // Durée d'entrée (important pour -loop 1)
        '-i', inputPath, // Input
        // Options de sortie après -i
        '-c:v', codec, // Codec vidéo
        '-r', '25', // FPS de sortie
        '-pix_fmt', 'yuv420p', // Format pixel compatible
      ];

      // Ajouter les options spécifiques au codec
      if (codec === 'libx264') {
        args.push('-preset', 'ultrafast'); // Plus rapide, moins de mémoire
        args.push('-crf', '28'); // Qualité acceptable, fichier plus petit
      } else {
        // Pour mpeg4 ou autres codecs
        args.push('-q:v', '8'); // Qualité
      }

      // Filtre vidéo selon l'option blurBackground
      let videoFilter: string;
      if (blurBackground) {
        // Filtre avec fond flou esthétique :
        // 1. [0:v] scale=-1:720 → Image originale redimensionnée (hauteur 720, largeur proportionnelle)
        // 2. [bg] scale=1280:720, boxblur=25:25 → Fond : image étirée à 1280x720 + flou intense
        // 3. overlay → Superpose l'image nette centrée sur le fond flou
        videoFilter = '[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=25:25[bg];[0:v]scale=-1:720:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2';
      } else {
        // Filtre standard : redimensionne et ajoute des bandes noires si nécessaire
        videoFilter = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2';
      }

      // Options communes de sortie
      args.push(
        '-filter_complex', videoFilter,
        '-movflags', '+faststart', // Streaming-friendly
        outputPath,
      );

      logger.info('Running ffmpeg', { codec, blurBackground, args: args.join(' ') });

      const ffmpeg = spawn('ffmpeg', args);

      let stderr = '';

      ffmpeg.stdout.on('data', () => {
        // stdout data consumed but not used
      });

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code, signal) => {
        if (code === 0) {
          resolve();
        } else {
          // Log les 2000 premiers caractères pour voir l'erreur réelle (pas la fin)
          logger.error('ffmpeg failed', {
            code,
            signal,
            stderrStart: stderr.slice(0, 2000),
            stderrEnd: stderr.slice(-500),
          });
          reject(new Error(`ffmpeg exited with code ${code} (signal: ${signal}): ${stderr.slice(0, 1000)}`));
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

  /**
   * Vérifie si l'encodeur libx264 est disponible
   */
  async hasLibx264(): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', ['-encoders']);
      let output = '';

      ffmpeg.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffmpeg.on('close', () => {
        resolve(output.includes('libx264'));
      });

      ffmpeg.on('error', () => {
        resolve(false);
      });
    });
  }
}

export const imageToVideoService = new ImageToVideoService();
export default imageToVideoService;
