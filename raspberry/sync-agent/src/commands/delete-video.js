const fs = require('fs-extra');
const path = require('path');
const logger = require('../logger');
const { config } = require('../config');

function buildRelativePath(videoData) {
  const segments = ['videos', videoData.category];
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
      const videoPath = path.join(
        config.paths.videos,
        category,
        subcategory || '',
        filename
      );

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

      const content = await fs.readFile(configPath, 'utf-8');
      const configuration = JSON.parse(content);

      const relativePath = buildRelativePath(videoData);

      if (!configuration.categories) {
        return;
      }

      const category = configuration.categories.find(c => c.name === videoData.category);

      if (!category) {
        return;
      }

      const filterFn = (video) => !isSameVideo(video, relativePath, videoData.filename);

      if (videoData.subcategory) {
        const subcategory = category.subCategories?.find(s => s.name === videoData.subcategory);
        if (subcategory) {
          subcategory.videos = (subcategory.videos || []).filter(filterFn);
        }
      } else {
        category.videos = (category.videos || []).filter(filterFn);
      }

      await fs.writeFile(configPath, JSON.stringify(configuration, null, 2));

      logger.info('Configuration updated after deletion');
    } catch (error) {
      logger.error('Failed to update configuration:', error);
      throw error;
    }
  }
}

module.exports = new VideoDeleteHandler();
