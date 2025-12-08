const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const logger = require('../logger');
const { config } = require('../config');

class VideoDeployHandler {
  async execute(data, progressCallback) {
    const { videoUrl, filename, originalName, category, subcategory } = data;

    logger.info('Starting video deployment', { filename, category, subcategory });

    try {
      const targetDir = path.join(
        config.paths.videos,
        category,
        subcategory || ''
      );

      await fs.ensureDir(targetDir);

      const targetPath = path.join(targetDir, filename);

      if (await fs.pathExists(targetPath)) {
        logger.warn('Video already exists, will be overwritten', { targetPath });
      }

      await this.downloadFile(videoUrl, targetPath, progressCallback);

      await this.updateConfiguration(data);

      await this.notifyLocalApp();

      logger.info('Video deployed successfully', { targetPath });

      return {
        success: true,
        path: targetPath,
        size: (await fs.stat(targetPath)).size,
      };
    } catch (error) {
      logger.error('Video deployment failed:', error);
      throw error;
    }
  }

  async downloadFile(url, targetPath, progressCallback) {
    try {
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout: 600000,
        maxContentLength: config.security.maxDownloadSize,
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            if (progressCallback) {
              progressCallback(progress);
            }
          }
        },
      });

      const writer = fs.createWriteStream(targetPath);

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } catch (error) {
      logger.error('Download failed:', error);
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }

  async updateConfiguration(videoData) {
    try {
      const configPath = config.paths.config;

      // S'assurer que le répertoire parent existe
      await fs.ensureDir(path.dirname(configPath));

      let configuration = {};
      if (await fs.pathExists(configPath)) {
        const content = await fs.readFile(configPath, 'utf-8');
        configuration = JSON.parse(content);
      }

      if (!configuration.categories) {
        configuration.categories = [];
      }

      let category = configuration.categories.find(c => c.name === videoData.category);

      if (!category) {
        category = {
          id: `category-${Date.now()}`,
          name: videoData.category,
          videos: [],
          subCategories: [],
        };
        configuration.categories.push(category);
      }

      const videoEntry = {
        id: `video-${Date.now()}`,
        title: videoData.originalName.replace(/\.[^/.]+$/, ''),
        filename: videoData.filename,
        duration: videoData.duration || 0,
        category: videoData.category,
        subcategory: videoData.subcategory,
      };

      if (videoData.subcategory) {
        let subcategory = category.subCategories.find(s => s.name === videoData.subcategory);

        if (!subcategory) {
          subcategory = {
            id: `subcategory-${Date.now()}`,
            name: videoData.subcategory,
            videos: [],
          };
          category.subCategories.push(subcategory);
        }

        const existingIndex = subcategory.videos.findIndex(v => v.filename === videoData.filename);
        if (existingIndex >= 0) {
          subcategory.videos[existingIndex] = videoEntry;
        } else {
          subcategory.videos.push(videoEntry);
        }
      } else {
        const existingIndex = category.videos.findIndex(v => v.filename === videoData.filename);
        if (existingIndex >= 0) {
          category.videos[existingIndex] = videoEntry;
        } else {
          category.videos.push(videoEntry);
        }
      }

      await fs.writeFile(configPath, JSON.stringify(configuration, null, 2));

      logger.info('Configuration updated', { configPath });
    } catch (error) {
      logger.error('Failed to update configuration:', error);
      throw error;
    }
  }

  async notifyLocalApp() {
    try {
      const io = require('socket.io-client');
      const socket = io('http://localhost:3000', { timeout: 5000 });

      socket.emit('config_updated');

      setTimeout(() => socket.close(), 1000);

      logger.info('Local app notified of configuration change');
    } catch (error) {
      logger.warn('Could not notify local app:', error.message);
    }
  }
}

module.exports = new VideoDeployHandler();
