/**
 * VideoProcessingService
 *
 * Gère la file d'attente de traitement vidéo (compression, miniatures).
 * Lit et écrit dans PROCESSING_DIR/queue.json et job-{id}.json.
 */

const fs = require('fs').promises;
const path = require('path');

const {
  PROCESSING_DIR,
  VIDEO_COMPRESSION_ENABLED,
  VIDEO_THUMBNAILS_ENABLED,
} = require('../helpers');

class VideoProcessingService {
  // ---------------------------------------------------------------------------
  // Queue management
  // ---------------------------------------------------------------------------

  /**
   * Ajouter un job à la file de traitement.
   * @param {Object} jobData - Données du job (inputPath, outputPath, etc.)
   * @returns {string} jobId
   */
  async addToQueue(jobData) {
    await fs.mkdir(PROCESSING_DIR, { recursive: true });

    const jobId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const job = {
      id: jobId,
      ...jobData,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    let queue = [];
    const queueFile = path.join(PROCESSING_DIR, 'queue.json');
    try {
      const data = await fs.readFile(queueFile, 'utf8');
      queue = JSON.parse(data).jobs || [];
    } catch {
      // File vide ou inexistante
    }

    queue.push(job);
    await fs.writeFile(
      queueFile,
      JSON.stringify({ jobs: queue, updated: new Date().toISOString() }, null, 2),
    );

    console.log('[admin] Job ajouté à la file de traitement', {
      jobId,
      inputPath: jobData.inputPath,
    });

    return jobId;
  }

  /**
   * Obtenir le statut d'un job spécifique.
   * @param {string} jobId
   * @returns {Object|null}
   */
  async getJobStatus(jobId) {
    try {
      const statusFile = path.join(PROCESSING_DIR, `job-${jobId}.json`);
      const data = await fs.readFile(statusFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Obtenir la file d'attente complète.
   * @returns {Array}
   */
  async getQueue() {
    try {
      const queueFile = path.join(PROCESSING_DIR, 'queue.json');
      const data = await fs.readFile(queueFile, 'utf8');
      return JSON.parse(data).jobs || [];
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Processing config
  // ---------------------------------------------------------------------------

  /**
   * Retourne la configuration actuelle du traitement vidéo.
   */
  getProcessingConfig() {
    return {
      compressionEnabled: VIDEO_COMPRESSION_ENABLED,
      thumbnailsEnabled: VIDEO_THUMBNAILS_ENABLED,
      quality: process.env.VIDEO_QUALITY || 'medium',
    };
  }
}

module.exports = VideoProcessingService;
