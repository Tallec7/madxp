/**
 * Service de queue de commandes offline
 *
 * Quand le Raspberry Pi est déconnecté du serveur central,
 * les commandes locales sont mises en queue pour être synchronisées
 * lors de la reconnexion.
 */

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');
const { config } = require('../config');

const QUEUE_FILE = path.join(config.paths.root, 'data', 'offline-queue.json');
const DEAD_LETTER_FILE = path.join(config.paths.root, 'data', 'dead-letter-queue.json');
const MAX_RETRIES = 3;

class OfflineQueueService {
  constructor() {
    this.isProcessing = false;
    this.socket = null;
  }

  /**
   * Initialise le service avec la connexion socket
   * @param {Object} socket - Socket.io client
   */
  initialize(socket) {
    this.socket = socket;
    logger.info('OfflineQueueService initialized');
  }

  /**
   * Charge la queue depuis le fichier
   * @returns {Promise<Array>} Queue de commandes
   */
  async loadQueue() {
    try {
      await fs.ensureDir(path.dirname(QUEUE_FILE));

      if (await fs.pathExists(QUEUE_FILE)) {
        const content = await fs.readFile(QUEUE_FILE, 'utf8');
        return JSON.parse(content);
      }
      return [];
    } catch (error) {
      logger.error('Failed to load offline queue:', error);
      return [];
    }
  }

  /**
   * Sauvegarde la queue dans le fichier
   * @param {Array} queue - Queue à sauvegarder
   */
  async saveQueue(queue) {
    try {
      await fs.ensureDir(path.dirname(QUEUE_FILE));
      await fs.writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2));
    } catch (error) {
      logger.error('Failed to save offline queue:', error);
      throw error;
    }
  }

  /**
   * Ajoute une commande à la queue
   * @param {string} commandType - Type de commande
   * @param {Object} data - Données de la commande
   * @param {Object} options - Options supplémentaires
   * @returns {Promise<Object>} Commande ajoutée
   */
  async enqueue(commandType, data, options = {}) {
    const queue = await this.loadQueue();

    const command = {
      id: uuidv4(),
      type: commandType,
      data,
      timestamp: new Date().toISOString(),
      retries: 0,
      lastError: null,
      priority: options.priority || 'normal',
      source: options.source || 'local',
    };

    queue.push(command);

    // Trier par priorité (high first)
    queue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    await this.saveQueue(queue);

    logger.info('Command enqueued for offline processing', {
      id: command.id,
      type: commandType,
      queueSize: queue.length,
    });

    return command;
  }

  /**
   * Retire une commande de la queue
   * @param {string} commandId - ID de la commande
   */
  async dequeue(commandId) {
    const queue = await this.loadQueue();
    const filteredQueue = queue.filter(cmd => cmd.id !== commandId);
    await this.saveQueue(filteredQueue);
    logger.info('Command removed from queue', { id: commandId });
  }

  /**
   * Déplace une commande vers la dead letter queue
   * @param {Object} command - Commande à déplacer
   */
  async moveToDeadLetter(command) {
    try {
      await fs.ensureDir(path.dirname(DEAD_LETTER_FILE));

      let deadLetterQueue = [];
      if (await fs.pathExists(DEAD_LETTER_FILE)) {
        const content = await fs.readFile(DEAD_LETTER_FILE, 'utf8');
        deadLetterQueue = JSON.parse(content);
      }

      deadLetterQueue.push({
        ...command,
        movedAt: new Date().toISOString(),
        reason: 'max_retries_exceeded',
      });

      // Garder seulement les 100 dernières commandes échouées
      if (deadLetterQueue.length > 100) {
        deadLetterQueue = deadLetterQueue.slice(-100);
      }

      await fs.writeFile(DEAD_LETTER_FILE, JSON.stringify(deadLetterQueue, null, 2));
      await this.dequeue(command.id);

      logger.warn('Command moved to dead letter queue', {
        id: command.id,
        type: command.type,
        retries: command.retries,
      });
    } catch (error) {
      logger.error('Failed to move command to dead letter queue:', error);
    }
  }

  /**
   * Traite toutes les commandes en queue lors de la reconnexion
   * @returns {Promise<Object>} Résultat du traitement
   */
  async processOnReconnect() {
    if (this.isProcessing) {
      logger.warn('Queue processing already in progress');
      return { skipped: true };
    }

    this.isProcessing = true;
    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      retrying: 0,
    };

    try {
      const queue = await this.loadQueue();

      if (queue.length === 0) {
        logger.info('No offline commands to process');
        return results;
      }

      logger.info('Processing offline queue', { queueSize: queue.length });

      for (const command of queue) {
        results.processed++;

        try {
          await this.executeCommand(command);
          await this.dequeue(command.id);
          results.succeeded++;

          logger.info('Offline command executed successfully', {
            id: command.id,
            type: command.type,
          });
        } catch (error) {
          command.retries++;
          command.lastError = error.message;
          command.lastRetryAt = new Date().toISOString();

          if (command.retries >= MAX_RETRIES) {
            await this.moveToDeadLetter(command);
            results.failed++;
          } else {
            const updatedQueue = await this.loadQueue();
            const index = updatedQueue.findIndex(c => c.id === command.id);
            if (index >= 0) {
              updatedQueue[index] = command;
              await this.saveQueue(updatedQueue);
            }
            results.retrying++;

            logger.warn('Offline command failed, will retry', {
              id: command.id,
              type: command.type,
              retries: command.retries,
              error: error.message,
            });
          }
        }
      }

      logger.info('Offline queue processing completed', results);
      return results;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Exécute une commande via le socket central
   * @param {Object} command - Commande à exécuter
   */
  async executeCommand(command) {
    if (!this.socket || !this.socket.connected) {
      throw new Error('Not connected to central server');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Command execution timeout'));
      }, 30000);

      this.socket.emit('offline_command_sync', {
        commandId: command.id,
        type: command.type,
        data: command.data,
        originalTimestamp: command.timestamp,
      }, (response) => {
        clearTimeout(timeout);

        if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Command execution failed'));
        }
      });
    });
  }

  /**
   * Retourne les statistiques de la queue
   * @returns {Promise<Object>} Statistiques
   */
  async getStats() {
    const queue = await this.loadQueue();

    let deadLetterQueue = [];
    if (await fs.pathExists(DEAD_LETTER_FILE)) {
      const content = await fs.readFile(DEAD_LETTER_FILE, 'utf8');
      deadLetterQueue = JSON.parse(content);
    }

    const stats = {
      queueSize: queue.length,
      deadLetterSize: deadLetterQueue.length,
      byType: {},
      byPriority: { high: 0, normal: 0, low: 0 },
      oldestCommand: null,
    };

    for (const cmd of queue) {
      stats.byType[cmd.type] = (stats.byType[cmd.type] || 0) + 1;
      stats.byPriority[cmd.priority] = (stats.byPriority[cmd.priority] || 0) + 1;

      if (!stats.oldestCommand || cmd.timestamp < stats.oldestCommand) {
        stats.oldestCommand = cmd.timestamp;
      }
    }

    return stats;
  }

  /**
   * Vide la queue (pour debug/maintenance)
   */
  async clearQueue() {
    await this.saveQueue([]);
    logger.warn('Offline queue cleared');
  }

  /**
   * Récupère les commandes de la dead letter queue
   * @returns {Promise<Array>} Commandes échouées
   */
  async getDeadLetterQueue() {
    if (await fs.pathExists(DEAD_LETTER_FILE)) {
      const content = await fs.readFile(DEAD_LETTER_FILE, 'utf8');
      return JSON.parse(content);
    }
    return [];
  }

  /**
   * Remet une commande de la dead letter dans la queue principale
   * @param {string} commandId - ID de la commande
   */
  async retryDeadLetter(commandId) {
    const deadLetterQueue = await this.getDeadLetterQueue();
    const commandIndex = deadLetterQueue.findIndex(c => c.id === commandId);

    if (commandIndex < 0) {
      throw new Error('Command not found in dead letter queue');
    }

    const command = deadLetterQueue[commandIndex];
    command.retries = 0;
    command.lastError = null;
    delete command.movedAt;
    delete command.reason;

    deadLetterQueue.splice(commandIndex, 1);
    await fs.writeFile(DEAD_LETTER_FILE, JSON.stringify(deadLetterQueue, null, 2));

    const queue = await this.loadQueue();
    queue.push(command);
    await this.saveQueue(queue);

    logger.info('Command moved from dead letter to main queue', { id: commandId });
    return command;
  }
}

module.exports = new OfflineQueueService();
