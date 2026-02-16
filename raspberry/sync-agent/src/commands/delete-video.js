const fs = require('fs-extra');
const path = require('path');
const logger = require('../logger');
const { config } = require('../config');
const { atomicWriteJson, safeReadConfig } = require('../utils/safe-config-io');

function buildRelativePath(videoData) {
  const segments = ['videos'];
  if (videoData.category) {
    segments.push(videoData.category);
  }
  if (videoData.subcategory) {
    segments.push(videoData.subcategory);
  }
  segments.push(videoData.filename);
  return segments.join('/');
}

function isSameVideo(video, relativePath, filename) {
  if (video.filename) {
    return video.filename === filename;
  }
  return video.path === relativePath;
}

class VideoDeleteHandler {
  async execute(data) {
    const { filename, category, subcategory } = data;

    logger.info('Starting video deletion', { filename, category, subcategory });

    try {
      const segments = [config.paths.videos];
      if (category) segments.push(category);
      if (subcategory) segments.push(subcategory);
      segments.push(filename);
      const videoPath = path.join(...segments);

      if (!(await fs.pathExists(videoPath))) {
        logger.warn('Video file not found', { videoPath });
        return {
          success: true,
          message: 'Video already deleted or not found',
        };
      }

      await fs.remove(videoPath);

      await this.updateConfiguration(data);

      logger.info('Video deleted successfully', { videoPath });

      return {
        success: true,
        path: videoPath,
      };
    } catch (error) {
      logger.error('Video deletion failed:', error);
      throw error;
    }
  }

  async updateConfiguration(videoData) {
    try {
      const configPath = config.paths.config;

      if (!(await fs.pathExists(configPath))) {
        logger.warn('Configuration file not found');
        return;
      }

      const configuration = await safeReadConfig(configPath);

      const relativePath = buildRelativePath(videoData);

      const filterFn = (video) => !isSameVideo(video, relativePath, videoData.filename);

      // Remove from categories if applicable
      if (configuration.categories && videoData.category) {
        const category = configuration.categories.find(c => c.name === videoData.category);

        if (category) {
          if (videoData.subcategory) {
            const subcategory = category.subCategories?.find(s => s.name === videoData.subcategory);
            if (subcategory) {
              subcategory.videos = (subcategory.videos || []).filter(filterFn);
            }
          } else {
            category.videos = (category.videos || []).filter(filterFn);
          }
        }
      }

      // Aussi supprimer du tableau sponsors si présent
      if (configuration.sponsors && Array.isArray(configuration.sponsors)) {
        const originalLength = configuration.sponsors.length;
        configuration.sponsors = configuration.sponsors.filter(filterFn);
        if (configuration.sponsors.length < originalLength) {
          logger.info('Removed video from sponsors array', { path: relativePath });
        }
      }

      await atomicWriteJson(configPath, configuration);

      logger.info('Configuration updated after deletion');
    } catch (error) {
      logger.error('Failed to update configuration:', error);
      throw error;
    }
  }
}

module.exports = new VideoDeleteHandler();
