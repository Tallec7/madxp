const deployVideo = require('./deploy-video');
const deleteVideo = require('./delete-video');
const updateSoftware = require('./update-software');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const logger = require('../logger');
const { config } = require('../config');

const execAsync = util.promisify(exec);

const commands = {
  deploy_video: deployVideo,
  delete_video: deleteVideo,
  update_software: updateSoftware,

  async update_config(data) {
    logger.info('Updating configuration', data);

    try {
      if (!data || !data.configuration) {
        throw new Error('Missing configuration data in update_config command');
      }

      // Single source of truth: webapp/configuration.json (served by app :8080)
      const configPath = config.paths.root + '/webapp/configuration.json';
      const configJson = JSON.stringify(data.configuration, null, 2);

      await fs.writeFile(configPath, configJson);
      logger.info('Configuration written to', { path: configPath });

      const io = require('socket.io-client');
      const socket = io('http://localhost:3000', { timeout: 5000 });
      socket.emit('config_updated');
      setTimeout(() => socket.close(), 1000);

      logger.info('Configuration updated successfully');

      return { success: true };
    } catch (error) {
      logger.error('Configuration update failed:', error);
      throw error;
    }
  },

  async reboot() {
    logger.warn('System reboot requested');

    setTimeout(async () => {
      try {
        await execAsync('sudo reboot');
      } catch (error) {
        logger.error('Reboot command failed:', error);
      }
    }, 2000);

    return { success: true, message: 'Rebooting in 2 seconds' };
  },

  async restart_service(data) {
    const { service } = data;

    logger.info('Restarting service', { service });

    try {
      await execAsync(`sudo systemctl restart ${service}`);

      await new Promise(resolve => setTimeout(resolve, 3000));

      const { stdout } = await execAsync(`sudo systemctl is-active ${service}`);

      if (stdout.trim() === 'active') {
        logger.info('Service restarted successfully', { service });
        return { success: true, status: 'active' };
      } else {
        throw new Error(`Service ${service} is not active after restart`);
      }
    } catch (error) {
      logger.error('Service restart failed:', error);
      throw error;
    }
  },

  async get_logs(data) {
    const { service, lines = 100 } = data;

    logger.info('Retrieving logs', { service, lines });

    try {
      let command;

      if (service === 'sync-agent') {
        command = `tail -n ${lines} ${config.logging.path}`;
      } else {
        command = `sudo journalctl -u ${service} -n ${lines} --no-pager`;
      }

      const { stdout } = await execAsync(command);

      return {
        success: true,
        logs: stdout,
      };
    } catch (error) {
      logger.error('Failed to retrieve logs:', error);
      throw error;
    }
  },

  async get_system_info() {
    logger.info('Retrieving system information');

    try {
      const metricsCollector = require('../metrics');
      const systemInfo = await metricsCollector.getSystemInfo();
      const networkStatus = await metricsCollector.getNetworkStatus();
      const metrics = await metricsCollector.collectAll();

      return {
        success: true,
        systemInfo,
        networkStatus,
        metrics,
      };
    } catch (error) {
      logger.error('Failed to retrieve system info:', error);
      throw error;
    }
  },

  async get_config() {
    logger.info('Retrieving site configuration');

    try {
      // Single source of truth: webapp/configuration.json (served by app :8080)
      const configPath = config.paths.root + '/webapp/configuration.json';

      if (!await fs.pathExists(configPath)) {
        logger.warn('Configuration file not found', { configPath });
        return {
          success: true,
          configuration: null,
          message: 'No configuration file found',
        };
      }

      const configContent = await fs.readFile(configPath, 'utf8');
      const configuration = JSON.parse(configContent);

      logger.info('Configuration retrieved successfully', { path: configPath });

      return {
        success: true,
        configuration,
      };
    } catch (error) {
      logger.error('Failed to retrieve configuration:', error);
      throw error;
    }
  },
};

module.exports = commands;
