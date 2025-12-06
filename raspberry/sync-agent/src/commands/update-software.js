const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const logger = require('../logger');
const { config } = require('../config');

const execAsync = util.promisify(exec);

class SoftwareUpdateHandler {
  async execute(data, progressCallback) {
    const { updateUrl, version, checksum } = data;

    logger.info('Starting software update', { version });

    try {
      progressCallback(5);

      const packagePath = `/tmp/neopro-update-${version}.tar.gz`;

      await this.downloadPackage(updateUrl, packagePath, (progress) => {
        progressCallback(5 + progress * 0.3);
      });

      progressCallback(35);

      if (checksum) {
        await this.verifyChecksum(packagePath, checksum);
      }

      progressCallback(40);

      await this.createBackup();

      progressCallback(50);

      await this.stopServices();

      progressCallback(60);

      await this.extractAndInstall(packagePath);

      progressCallback(80);

      await this.startServices();

      progressCallback(90);

      const newVersion = await this.getCurrentVersion();

      progressCallback(100);

      logger.info('Software update completed successfully', { newVersion });

      return {
        success: true,
        version: newVersion,
        previousVersion: version,
      };
    } catch (error) {
      logger.error('Software update failed:', error);

      try {
        await this.rollback();
      } catch (rollbackError) {
        logger.error('Rollback failed:', rollbackError);
      }

      throw error;
    }
  }

  async downloadPackage(url, targetPath, progressCallback) {
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
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } catch (error) {
      logger.error('Package download failed:', error);
      throw new Error(`Failed to download update package: ${error.message}`);
    }
  }

  async verifyChecksum(filePath, expectedChecksum) {
    try {
      const { stdout } = await execAsync(`sha256sum ${filePath}`);
      const actualChecksum = stdout.split(' ')[0];

      if (actualChecksum !== expectedChecksum) {
        throw new Error('Checksum verification failed');
      }

      logger.info('Checksum verified successfully');
    } catch (error) {
      logger.error('Checksum verification failed:', error);
      throw error;
    }
  }

  async createBackup() {
    try {
      logger.info('Creating backup before update');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(config.paths.backup, `backup-${timestamp}`);

      await fs.ensureDir(backupDir);

      const itemsToBackup = [
        'webapp',
        'server',
        'admin',
        'public/configuration.json',
      ];

      for (const item of itemsToBackup) {
        const sourcePath = path.join(config.paths.root, item);
        const targetPath = path.join(backupDir, item);

        if (await fs.pathExists(sourcePath)) {
          await fs.copy(sourcePath, targetPath);
        }
      }

      await this.cleanOldBackups();

      logger.info('Backup created successfully', { backupDir });

      return backupDir;
    } catch (error) {
      logger.error('Backup creation failed:', error);
      throw error;
    }
  }

  async cleanOldBackups() {
    try {
      const backupDir = config.paths.backup;
      const backups = await fs.readdir(backupDir);

      const backupDirs = [];
      for (const dir of backups) {
        const fullPath = path.join(backupDir, dir);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          backupDirs.push({ path: fullPath, mtime: stat.mtime });
        }
      }

      backupDirs.sort((a, b) => b.mtime - a.mtime);

      if (backupDirs.length > 5) {
        for (let i = 5; i < backupDirs.length; i++) {
          await fs.remove(backupDirs[i].path);
          logger.info('Old backup removed', { path: backupDirs[i].path });
        }
      }
    } catch (error) {
      logger.warn('Failed to clean old backups:', error);
    }
  }

  async stopServices() {
    try {
      logger.info('Stopping services');

      const services = ['neopro-app', 'neopro-admin'];

      for (const service of services) {
        try {
          await execAsync(`sudo systemctl stop ${service}`);
          logger.info(`Service stopped: ${service}`);
        } catch (error) {
          logger.warn(`Failed to stop service ${service}:`, error.message);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      logger.error('Failed to stop services:', error);
      throw error;
    }
  }

  async extractAndInstall(packagePath) {
    try {
      logger.info('Extracting and installing update');

      // Exclude user data directories and configuration from extraction
      // These should never be overwritten by software updates:
      // - videos/: user video content (managed by deploy-video.js)
      // - logs/: runtime logs
      // - backups/: backup archives
      // - public/configuration.json: club-specific configuration
      await execAsync(
        `tar -xzf ${packagePath} -C ${config.paths.root}/ ` +
        `--exclude='videos' --exclude='logs' --exclude='backups' ` +
        `--exclude='public/configuration.json'`
      );

      if (await fs.pathExists(path.join(config.paths.root, 'webapp/package.json'))) {
        await execAsync(`cd ${config.paths.root}/webapp && npm install --production`);
      }

      if (await fs.pathExists(path.join(config.paths.root, 'server/package.json'))) {
        await execAsync(`cd ${config.paths.root}/server && npm install --production`);
      }

      logger.info('Update installed successfully');
    } catch (error) {
      logger.error('Installation failed:', error);
      throw error;
    }
  }

  async startServices() {
    try {
      logger.info('Starting services');

      const services = ['neopro-app', 'neopro-admin'];

      for (const service of services) {
        try {
          await execAsync(`sudo systemctl start ${service}`);
          logger.info(`Service started: ${service}`);
        } catch (error) {
          logger.warn(`Failed to start service ${service}:`, error.message);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 5000));

      for (const service of services) {
        try {
          const { stdout } = await execAsync(`sudo systemctl is-active ${service}`);
          if (stdout.trim() !== 'active') {
            throw new Error(`Service ${service} is not active after restart`);
          }
        } catch (error) {
          logger.error(`Service health check failed for ${service}:`, error);
          throw error;
        }
      }

      logger.info('All services started and healthy');
    } catch (error) {
      logger.error('Failed to start services:', error);
      throw error;
    }
  }

  async getCurrentVersion() {
    try {
      const packageJsonPath = path.join(config.paths.root, 'webapp/package.json');

      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        return packageJson.version;
      }

      return 'unknown';
    } catch (error) {
      logger.warn('Failed to get current version:', error);
      return 'unknown';
    }
  }

  async rollback() {
    try {
      logger.warn('Attempting rollback to previous version');

      const backupDir = config.paths.backup;
      const backups = await fs.readdir(backupDir);

      if (backups.length === 0) {
        throw new Error('No backups available for rollback');
      }

      const latestBackup = backups.sort().reverse()[0];
      const backupPath = path.join(backupDir, latestBackup);

      await this.stopServices();

      const itemsToRestore = ['webapp', 'server', 'admin', 'public/configuration.json'];

      for (const item of itemsToRestore) {
        const sourcePath = path.join(backupPath, item);
        const targetPath = path.join(config.paths.root, item);

        if (await fs.pathExists(sourcePath)) {
          await fs.remove(targetPath);
          await fs.copy(sourcePath, targetPath);
        }
      }

      await this.startServices();

      logger.info('Rollback completed successfully');
    } catch (error) {
      logger.error('Rollback failed:', error);
      throw error;
    }
  }
}

module.exports = new SoftwareUpdateHandler();
