#!/usr/bin/env node

/**
 * Service de traitement vidéo en arrière-plan pour Neopro
 *
 * Ce service surveille un dossier de vidéos à traiter et :
 * 1. Compresse les vidéos avec FFmpeg
 * 2. Génère des miniatures
 * 3. Met à jour les métadonnées
 * 4. Nettoie les fichiers temporaires
 *
 * Le traitement se fait en arrière-plan pour ne pas bloquer les uploads.
 */

const fs = require('fs').promises;
const fsCore = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration
const NEOPRO_DIR = process.env.NEOPRO_DIR || '/home/pi/neopro';
const PROCESSING_DIR = path.join(NEOPRO_DIR, 'videos-processing');
const VIDEOS_DIR = path.join(NEOPRO_DIR, 'videos');
const THUMBNAILS_DIR = path.join(NEOPRO_DIR, 'thumbnails');
const STATUS_FILE = path.join(PROCESSING_DIR, 'processing-status.json');
const POLL_INTERVAL = 5000; // 5 secondes
const COMPRESSION_ENABLED = process.env.VIDEO_COMPRESSION !== 'false';
const THUMBNAIL_ENABLED = process.env.VIDEO_THUMBNAILS !== 'false';
const COMPRESSION_QUALITY = process.env.VIDEO_QUALITY || 'medium';

// État du traitement
const processingQueue = [];
let isProcessing = false;

/**
 * Logger avec timestamp
 */
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = {
    timestamp,
    level,
    message,
    ...data
  };
  console.log(JSON.stringify(logMessage));
}

/**
 * Lire la file d'attente depuis le disque
 */
async function loadQueue() {
  try {
    const queueFile = path.join(PROCESSING_DIR, 'queue.json');
    const data = await fs.readFile(queueFile, 'utf8');
    const queue = JSON.parse(data);
    return queue.jobs || [];
  } catch (error) {
    return [];
  }
}

/**
 * Sauvegarder la file d'attente sur le disque
 */
async function saveQueue(jobs) {
  try {
    const queueFile = path.join(PROCESSING_DIR, 'queue.json');
    await fs.writeFile(queueFile, JSON.stringify({ jobs, updated: new Date().toISOString() }, null, 2));
  } catch (error) {
    log('error', 'Échec de la sauvegarde de la file', { error: error.message });
  }
}

/**
 * Mettre à jour le statut d'un job
 */
async function updateJobStatus(jobId, status, data = {}) {
  try {
    const statusData = {
      jobId,
      status, // 'pending', 'processing', 'completed', 'failed'
      ...data,
      updated: new Date().toISOString()
    };

    const statusFile = path.join(PROCESSING_DIR, `job-${jobId}.json`);
    await fs.writeFile(statusFile, JSON.stringify(statusData, null, 2));

    log('info', 'Statut du job mis à jour', { jobId, status });
  } catch (error) {
    log('error', 'Échec de la mise à jour du statut', { jobId, error: error.message });
  }
}

/**
 * Compresser une vidéo
 */
async function compressVideo(inputPath, outputPath, quality = 'medium') {
  const scriptPath = path.join(NEOPRO_DIR, 'scripts', 'compress-video.sh');

  // Vérifier que le script existe
  try {
    await fs.access(scriptPath);
  } catch {
    throw new Error('Script de compression non trouvé');
  }

  log('info', 'Compression de la vidéo', { inputPath, outputPath, quality });

  const { stdout, stderr } = await execAsync(`bash ${scriptPath} "${inputPath}" "${outputPath}" ${quality}`);

  if (stderr && !stderr.includes('warning')) {
    log('warning', 'Warnings pendant la compression', { stderr });
  }

  return { stdout, stderr };
}

/**
 * Générer une miniature
 */
async function generateThumbnail(videoPath, thumbnailPath, width = 320) {
  const scriptPath = path.join(NEOPRO_DIR, 'scripts', 'generate-thumbnail.sh');

  // Vérifier que le script existe
  try {
    await fs.access(scriptPath);
  } catch {
    throw new Error('Script de génération de miniatures non trouvé');
  }

  log('info', 'Génération de la miniature', { videoPath, thumbnailPath, width });

  const { stdout, stderr } = await execAsync(`bash ${scriptPath} "${videoPath}" "${thumbnailPath}" ${width}`);

  return { stdout, stderr };
}

/**
 * Obtenir les métadonnées d'une vidéo
 */
async function getVideoMetadata(videoPath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`
    );
    return JSON.parse(stdout);
  } catch (error) {
    log('error', 'Échec de la récupération des métadonnées', { videoPath, error: error.message });
    return null;
  }
}

/**
 * Traiter un job
 */
async function processJob(job) {
  const { id, inputPath, outputPath, category, subcategory, compress, thumbnail } = job;

  log('info', 'Début du traitement du job', { jobId: id, inputPath });

  await updateJobStatus(id, 'processing', {
    startTime: new Date().toISOString()
  });

  try {
    // 1. Vérifier que le fichier source existe
    try {
      await fs.access(inputPath);
    } catch {
      throw new Error('Fichier source non trouvé');
    }

    // 2. Obtenir les métadonnées de la vidéo source
    const sourceMetadata = await getVideoMetadata(inputPath);
    const sourceSize = (await fs.stat(inputPath)).size;

    // 3. Compression (si activée)
    let finalVideoPath = inputPath;
    let compressionSavings = 0;

    if (compress && COMPRESSION_ENABLED) {
      const compressedPath = outputPath.replace(/\.\w+$/, '.compressed.mp4');

      try {
        await compressVideo(inputPath, compressedPath, COMPRESSION_QUALITY);

        // Vérifier que la compression a réussi et a réduit la taille
        const compressedSize = (await fs.stat(compressedPath)).size;
        compressionSavings = ((sourceSize - compressedSize) / sourceSize * 100).toFixed(1);

        if (compressedSize < sourceSize) {
          // La compression a réduit la taille, utiliser le fichier compressé
          await fs.rename(compressedPath, outputPath);
          finalVideoPath = outputPath;

          // Supprimer le fichier original
          await fs.unlink(inputPath);

          log('success', 'Compression réussie', {
            jobId: id,
            originalSize: (sourceSize / 1024 / 1024).toFixed(2) + ' MB',
            compressedSize: (compressedSize / 1024 / 1024).toFixed(2) + ' MB',
            savings: compressionSavings + '%'
          });
        } else {
          // La compression n'a pas réduit la taille, conserver l'original
          await fs.unlink(compressedPath);
          await fs.rename(inputPath, outputPath);
          finalVideoPath = outputPath;

          log('info', 'Compression ignorée (fichier déjà optimisé)', { jobId: id });
        }
      } catch (error) {
        log('error', 'Échec de la compression', { jobId: id, error: error.message });
        // En cas d'échec, utiliser le fichier original
        await fs.rename(inputPath, outputPath);
        finalVideoPath = outputPath;
      }
    } else {
      // Pas de compression, déplacer directement
      await fs.rename(inputPath, outputPath);
      finalVideoPath = outputPath;
    }

    // 4. Génération de miniature (si activée)
    let thumbnailPath = null;

    if (thumbnail && THUMBNAIL_ENABLED) {
      try {
        const videoFilename = path.basename(finalVideoPath, path.extname(finalVideoPath));
        const thumbnailFilename = `${videoFilename}.jpg`;
        thumbnailPath = path.join(THUMBNAILS_DIR, category, subcategory || '', thumbnailFilename);

        await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });
        await generateThumbnail(finalVideoPath, thumbnailPath);

        log('success', 'Miniature générée', { jobId: id, thumbnailPath });
      } catch (error) {
        log('error', 'Échec de la génération de miniature', { jobId: id, error: error.message });
      }
    }

    // 5. Obtenir les métadonnées finales
    const finalMetadata = await getVideoMetadata(finalVideoPath);
    const finalSize = (await fs.stat(finalVideoPath)).size;

    // 6. Marquer comme terminé
    await updateJobStatus(id, 'completed', {
      endTime: new Date().toISOString(),
      outputPath: finalVideoPath,
      thumbnailPath,
      originalSize: sourceSize,
      finalSize: finalSize,
      compressionSavings: compressionSavings + '%',
      metadata: {
        duration: finalMetadata?.format?.duration,
        bitrate: finalMetadata?.format?.bit_rate,
        videoCodec: finalMetadata?.streams?.[0]?.codec_name,
        audioCodec: finalMetadata?.streams?.[1]?.codec_name,
        width: finalMetadata?.streams?.[0]?.width,
        height: finalMetadata?.streams?.[0]?.height
      }
    });

    log('success', 'Job terminé', { jobId: id });

    return true;
  } catch (error) {
    log('error', 'Échec du traitement du job', { jobId: id, error: error.message, stack: error.stack });

    await updateJobStatus(id, 'failed', {
      endTime: new Date().toISOString(),
      error: error.message
    });

    return false;
  }
}

/**
 * Boucle de traitement
 */
async function processQueue() {
  if (isProcessing) {
    return;
  }

  // Charger la file d'attente
  const jobs = await loadQueue();

  if (jobs.length === 0) {
    return;
  }

  isProcessing = true;

  // Traiter le premier job
  const job = jobs.shift();

  try {
    await processJob(job);
  } catch (error) {
    log('error', 'Erreur lors du traitement', { error: error.message });
  }

  // Sauvegarder la file mise à jour
  await saveQueue(jobs);

  isProcessing = false;

  // Continuer immédiatement si d'autres jobs sont en attente
  if (jobs.length > 0) {
    setImmediate(() => processQueue());
  }
}

/**
 * Initialisation
 */
async function init() {
  log('info', 'Démarrage du service de traitement vidéo', {
    compressionEnabled: COMPRESSION_ENABLED,
    thumbnailEnabled: THUMBNAIL_ENABLED,
    quality: COMPRESSION_QUALITY
  });

  // Créer les dossiers nécessaires
  await fs.mkdir(PROCESSING_DIR, { recursive: true });
  await fs.mkdir(THUMBNAILS_DIR, { recursive: true });

  // Vérifier FFmpeg
  try {
    await execAsync('which ffmpeg');
    log('info', 'FFmpeg détecté');
  } catch {
    log('warning', 'FFmpeg non installé - compression et miniatures désactivées');
  }

  // Démarrer la boucle de traitement
  setInterval(processQueue, POLL_INTERVAL);

  log('info', 'Service prêt');
}

/**
 * Gestion des signaux
 */
process.on('SIGTERM', () => {
  log('info', 'Arrêt du service (SIGTERM)');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('info', 'Arrêt du service (SIGINT)');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  log('error', 'Exception non gérée', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (error) => {
  log('error', 'Promesse rejetée', { error: error.message });
});

// Lancement
init().catch(error => {
  log('error', 'Échec de l\'initialisation', { error: error.message });
  process.exit(1);
});
