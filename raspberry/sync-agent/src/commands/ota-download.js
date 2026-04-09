/**
 * OTA Download — package download with stall detection, checksum verification.
 * Extracted from update-software.js (ADR-044).
 */

const fs = require('fs-extra');
const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const logger = require('../logger');
const { config } = require('../config');

const execAsync = util.promisify(exec);

/**
 * Download update package with stall detection.
 * On WiFi mesh (RTL8192EU), silent drops don't trigger stream errors —
 * the stream hangs indefinitely. Stall timer aborts after 30s of no data.
 */
async function downloadPackage(url, targetPath, progressCallback) {
  try {
    logger.info('Downloading update package', { url });

    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 1800000,
      maxContentLength: config.security.maxDownloadSize,
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const progress = progressEvent.loaded / progressEvent.total;
          if (progressCallback) {
            progressCallback(progress);
          }
        }
      },
    });

    const writer = fs.createWriteStream(targetPath);

    // Stall detection: abort if no data received for 30s
    const STALL_TIMEOUT_MS = 30000;
    let stallTimer = null;
    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        const err = new Error(`Download stalled: no data received for ${STALL_TIMEOUT_MS / 1000}s`);
        logger.warn('Download stall detected, aborting stream', { targetPath });
        response.data.destroy(err);
        writer.destroy(err);
      }, STALL_TIMEOUT_MS);
    };

    response.data.on('data', resetStallTimer);
    resetStallTimer(); // Start the first timer

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        if (stallTimer) clearTimeout(stallTimer);
        resolve();
      });
      writer.on('error', (err) => {
        if (stallTimer) clearTimeout(stallTimer);
        reject(err);
      });
      response.data.on('error', (err) => {
        if (stallTimer) clearTimeout(stallTimer);
        writer.destroy(err);
        reject(err);
      });
    });
  } catch (error) {
    logger.error('Package download failed:', error);
    throw new Error(`Failed to download update package: ${error.message}`);
  }
}

/**
 * Verify SHA256 checksum of a file.
 */
async function verifyChecksum(filePath, expectedChecksum, expectedSize) {
  try {
    const stats = await fs.stat(filePath);
    const actualSize = stats.size;

    if (expectedSize && actualSize !== expectedSize) {
      logger.warn('Downloaded file size mismatch', {
        expected: expectedSize,
        actual: actualSize,
        diff: actualSize - expectedSize,
      });
    }

    const { stdout } = await execAsync(`sha256sum ${filePath}`);
    const actualChecksum = stdout.split(' ')[0];
    const match = actualChecksum === expectedChecksum;

    if (match) {
      logger.info('Checksum verified successfully');
    }

    return { match, actualChecksum, actualSize };
  } catch (error) {
    logger.error('Checksum computation failed:', error);
    return { match: false, actualChecksum: null, actualSize: null };
  }
}

/**
 * Verify checksum with one retry on failure.
 * On mismatch: logs diagnostics, re-downloads once, and retries.
 */
async function verifyChecksumWithRetry(filePath, expectedChecksum, expectedSize, { updateUrl, progressCallback }) {
  const firstResult = await verifyChecksum(filePath, expectedChecksum, expectedSize);
  if (firstResult.match) {
    return true;
  }

  logger.warn('Checksum mismatch on first attempt, will retry download', {
    expectedChecksum,
    actualChecksum: firstResult.actualChecksum,
    expectedSize,
    actualSize: firstResult.actualSize,
    sizeMismatch: expectedSize && firstResult.actualSize !== expectedSize,
  });

  // Re-download
  logger.info('Re-downloading update package for retry...');
  await fs.remove(filePath);
  await downloadPackage(updateUrl, filePath, (progress) => {
    if (progressCallback) {
      progressCallback(35 + progress * 0.03);
    }
  });

  const secondResult = await verifyChecksum(filePath, expectedChecksum, expectedSize);
  if (secondResult.match) {
    logger.info('Checksum verified on retry');
    return true;
  }

  logger.error('Checksum verification failed after retry', {
    expectedChecksum,
    actualChecksum: secondResult.actualChecksum,
    expectedSize,
    actualSize: secondResult.actualSize,
  });
  return false;
}

module.exports = {
  downloadPackage,
  verifyChecksum,
  verifyChecksumWithRetry,
};
