/**
 * Routes de notification email pour le serveur admin Neopro
 *
 * - GET  /api/email/config -> Configuration des notifications email
 * - POST /api/email/test   -> Envoyer un email de test
 * - POST /api/email/send   -> Envoyer une notification personnalisée
 */

const express = require('express');

module.exports = function createEmailRouter(emailNotifier) {
  const router = express.Router();

  // API: Configuration des notifications email
  router.get('/api/email/config', async (req, res) => {
    try {
      const config = emailNotifier.getConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Envoyer un email de test
  router.post('/api/email/test', async (req, res) => {
    try {
      const success = await emailNotifier.sendTestEmail();
      if (success) {
        res.json({
          success: true,
          message: 'Email de test envoyé avec succès'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Échec de l\'envoi de l\'email de test'
        });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Envoyer une notification personnalisée
  router.post('/api/email/send', async (req, res) => {
    try {
      const { subject, text, html, priority } = req.body;

      if (!subject || !text) {
        return res.status(400).json({ error: 'subject et text sont requis' });
      }

      const success = await emailNotifier.sendEmail({ subject, text, html, priority });

      if (success) {
        res.json({
          success: true,
          message: 'Email envoyé avec succès'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Échec de l\'envoi de l\'email'
        });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
