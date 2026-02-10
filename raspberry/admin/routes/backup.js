/**
 * Routes de gestion des backups pour le serveur admin Neopro
 *
 * Contrôleur mince — délègue au BackupService.
 *
 * - GET    /api/backups              -> Liste des backups disponibles
 * - POST   /api/backups/create       -> Créer un backup manuel
 * - GET    /api/backups/download/:fn -> Télécharger un backup
 * - DELETE /api/backups/:filename    -> Supprimer un backup
 * - GET    /api/backups/auto-status  -> Statut du backup automatique
 * - POST   /api/backups/auto-toggle  -> Activer/désactiver le backup auto
 */

const express = require('express');

const { NotFoundError, ValidationError, CommandError } = require('../services/errors');

/**
 * @param {Object} deps
 * @param {import('../services/backup.service')} deps.backupService
 */
module.exports = function createBackupRouter({ backupService }) {
  const router = express.Router();

  /** Map service errors to HTTP status codes */
  function handleError(res, error) {
    if (error instanceof NotFoundError) return res.status(404).json({ error: error.message });
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    if (error instanceof CommandError) return res.status(500).json({ success: false, error: error.message });
    console.error('[admin] Backup error:', error);
    return res.status(500).json({ error: error.message });
  }

  // GET /api/backups
  router.get('/api/backups', async (req, res) => {
    try {
      const result = await backupService.listBackups();
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  // POST /api/backups/create
  router.post('/api/backups/create', async (req, res) => {
    try {
      const result = await backupService.createBackup();
      res.json({ success: true, message: 'Backup créé avec succès', output: result.output });
    } catch (error) {
      handleError(res, error);
    }
  });

  // GET /api/backups/download/:filename
  router.get('/api/backups/download/:filename', async (req, res) => {
    try {
      const backupPath = await backupService.getBackupPath(req.params.filename);
      res.download(backupPath, req.params.filename);
    } catch (error) {
      handleError(res, error);
    }
  });

  // DELETE /api/backups/:filename
  router.delete('/api/backups/:filename', async (req, res) => {
    try {
      await backupService.deleteBackup(req.params.filename);
      res.json({ success: true, message: 'Backup supprimé' });
    } catch (error) {
      handleError(res, error);
    }
  });

  // GET /api/backups/auto-status
  router.get('/api/backups/auto-status', async (req, res) => {
    try {
      const status = await backupService.getAutoBackupStatus();
      res.json(status);
    } catch (error) {
      handleError(res, error);
    }
  });

  // POST /api/backups/auto-toggle
  router.post('/api/backups/auto-toggle', async (req, res) => {
    try {
      const result = await backupService.toggleAutoBackup(req.body.enable);
      res.json({
        success: true,
        message: result.enabled ? 'Backup automatique activé' : 'Backup automatique désactivé',
        enabled: result.enabled,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
};
