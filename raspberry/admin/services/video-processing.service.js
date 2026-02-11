/**
 * VideoProcessingService
 *
 * G\u00e8re la file d'attente de traitement vid\u00e9o (compression, miniatures).
 * Lit et \u00e9crit dans PROCESSING_DIR/queue.json et job-{id}.json.
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
   * Add a job to the video processing queue.
   *
   * Creates the processing directory and queue file if they don't exist.
   * Each job gets a unique ID based on timestamp + random suffix.
   *
   * @param {Object} jobData — Job parameters (inputPath, outputPath, compress, thumbnail, etc.)
   * @returns {Promise<string>} Unique job ID
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

    console.log('[admin] Job ajout\u00e9 \u00e0 la file de traitement', {
      jobId,
      inputPath: jobData.inputPath,
    });

    return jobId;
  }

  /**
   * Get the status of a specific processing job.
   *
   * Reads `job-{id}.json` from PROCESSING_DIR. Returns `null` if
   * the job status file doesn't exist (job may still be pending).
   *
   * @param {string} jobId — Unique job identifier
   * @returns {Promise<Object|null>} Job status object or null if not found
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
   * Get the full processing queue.
   *
   * @returns {Promise<Array<{id: string, status: string, createdAt: string, inputPath: string, outputPath: string}>>}
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
   * Return the current video processing configuration.
   *
   * Reads from environment variables / helpers constants.
   *
   * @returns {{compressionEnabled: boolean, thumbnailsEnabled: boolean, quality: string}}
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
