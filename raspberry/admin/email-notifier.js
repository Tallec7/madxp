#!/usr/bin/env node

/**
 * Service de notifications email pour Neopro
 *
 * Envoie des alertes par email pour :
 * - Échecs de backup
 * - Erreurs de traitement vidéo
 * - Espace disque faible
 * - Erreurs système critiques
 *
 * Utilise nodemailer avec support SMTP configurable
 */

const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

// Configuration depuis variables d'environnement
const config = {
  enabled: process.env.EMAIL_NOTIFICATIONS !== 'false',
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  },
  from: process.env.EMAIL_FROM || process.env.SMTP_USER,
  to: process.env.EMAIL_TO ? process.env.EMAIL_TO.split(',') : [],
  clubName: process.env.CLUB_NAME || 'Club',
  hostname: process.env.HOSTNAME || 'neopro.local'
};

let transporter = null;

/**
 * Initialiser le transporteur SMTP
 */
async function initTransporter() {
  if (!config.enabled) {
    console.log('[email] Notifications désactivées');
    return null;
  }

  if (!config.smtp.auth.user || !config.smtp.auth.pass) {
    console.warn('[email] SMTP_USER ou SMTP_PASS non configuré - notifications désactivées');
    return null;
  }

  if (config.to.length === 0) {
    console.warn('[email] EMAIL_TO non configuré - notifications désactivées');
    return null;
  }

  try {
    transporter = nodemailer.createTransport(config.smtp);

    // Vérifier la connexion
    await transporter.verify();
    console.log('[email] Service de notifications email prêt');
    console.log(`[email] Envoi depuis: ${config.from}`);
    console.log(`[email] Destinataires: ${config.to.join(', ')}`);

    return transporter;
  } catch (error) {
    console.error('[email] Erreur d\'initialisation SMTP:', error.message);
    return null;
  }
}

/**
 * Envoyer un email
 */
async function sendEmail({ subject, text, html, priority = 'normal' }) {
  if (!transporter) {
    console.log('[email] Notifications désactivées - email non envoyé');
    return false;
  }

  try {
    const mailOptions = {
      from: config.from,
      to: config.to.join(', '),
      subject: `[${config.clubName}] ${subject}`,
      text: text,
      html: html || text.replace(/\n/g, '<br>'),
      priority: priority === 'high' ? 'high' : 'normal'
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[email] Email envoyé:', info.messageId);
    return true;
  } catch (error) {
    console.error('[email] Erreur d\'envoi:', error.message);
    return false;
  }
}

/**
 * Notification: Échec de backup
 */
async function notifyBackupFailure(error, backupDetails = {}) {
  const subject = '⚠️ Échec du Backup Automatique';
  const text = `
Le backup automatique a échoué.

Erreur: ${error}

Détails:
- Date: ${new Date().toLocaleString('fr-FR')}
- Hôte: ${config.hostname}
- Club: ${config.clubName}

Veuillez vérifier les logs pour plus de détails:
ssh pi@${config.hostname} "journalctl -u neopro-backup.service -n 50"

---
Notification automatique Neopro
  `;

  const html = `
    <h2 style="color: #fe5949;">⚠️ Échec du Backup Automatique</h2>
    <p>Le backup automatique a échoué.</p>

    <div style="background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
      <strong>Erreur:</strong> ${error}
    </div>

    <h3>Détails</h3>
    <ul>
      <li><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</li>
      <li><strong>Hôte:</strong> ${config.hostname}</li>
      <li><strong>Club:</strong> ${config.clubName}</li>
    </ul>

    <h3>Action requise</h3>
    <p>Veuillez vérifier les logs:</p>
    <code style="background: #f4f4f4; padding: 10px; display: block; margin: 10px 0;">
      ssh pi@${config.hostname} "journalctl -u neopro-backup.service -n 50"
    </code>

    <hr style="margin: 20px 0;">
    <p style="color: #666; font-size: 12px;">Notification automatique Neopro</p>
  `;

  return sendEmail({ subject, text, html, priority: 'high' });
}

/**
 * Notification: Backup réussi (optionnel)
 */
async function notifyBackupSuccess(backupDetails) {
  const subject = '✅ Backup Automatique Réussi';
  const text = `
Le backup automatique s'est terminé avec succès.

Détails:
- Archive: ${backupDetails.archive || 'N/A'}
- Taille: ${backupDetails.size || 'N/A'}
- Date: ${new Date().toLocaleString('fr-FR')}
- Backups conservés: ${backupDetails.count || 'N/A'}

---
Notification automatique Neopro
  `;

  return sendEmail({ subject, text, priority: 'normal' });
}

/**
 * Notification: Échec de traitement vidéo
 */
async function notifyVideoProcessingFailure(jobDetails, error) {
  const subject = '⚠️ Échec du Traitement Vidéo';
  const text = `
Le traitement d'une vidéo a échoué.

Vidéo: ${jobDetails.filename || 'N/A'}
Job ID: ${jobDetails.jobId || 'N/A'}
Erreur: ${error}

Détails:
- Date: ${new Date().toLocaleString('fr-FR')}
- Catégorie: ${jobDetails.category || 'N/A'}
- Taille: ${jobDetails.size || 'N/A'}

Veuillez vérifier les logs:
ssh pi@${config.hostname} "journalctl -u neopro-video-processor -n 50"

---
Notification automatique Neopro
  `;

  const html = `
    <h2 style="color: #fe5949;">⚠️ Échec du Traitement Vidéo</h2>
    <p>Le traitement d'une vidéo a échoué.</p>

    <div style="background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
      <strong>Erreur:</strong> ${error}
    </div>

    <h3>Détails de la vidéo</h3>
    <ul>
      <li><strong>Fichier:</strong> ${jobDetails.filename || 'N/A'}</li>
      <li><strong>Job ID:</strong> ${jobDetails.jobId || 'N/A'}</li>
      <li><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</li>
      <li><strong>Catégorie:</strong> ${jobDetails.category || 'N/A'}</li>
      <li><strong>Taille:</strong> ${jobDetails.size || 'N/A'}</li>
    </ul>

    <p>La vidéo originale est conservée.</p>

    <hr style="margin: 20px 0;">
    <p style="color: #666; font-size: 12px;">Notification automatique Neopro</p>
  `;

  return sendEmail({ subject, text, html, priority: 'high' });
}

/**
 * Notification: Espace disque faible
 */
async function notifyLowDiskSpace(diskInfo) {
  const subject = '⚠️ Espace Disque Faible';
  const text = `
L'espace disque disponible est faible.

Détails:
- Utilisé: ${diskInfo.used || 'N/A'}
- Disponible: ${diskInfo.available || 'N/A'}
- Pourcentage: ${diskInfo.percent || 'N/A'}
- Date: ${new Date().toLocaleString('fr-FR')}

Actions recommandées:
1. Supprimer les anciennes vidéos
2. Supprimer les anciens backups
3. Nettoyer les fichiers temporaires

Commandes utiles:
ssh pi@${config.hostname} "df -h /home/pi"
ssh pi@${config.hostname} "du -sh /home/pi/neopro/videos"
ssh pi@${config.hostname} "du -sh /home/pi/neopro-backups"

---
Notification automatique Neopro
  `;

  const html = `
    <h2 style="color: #ffc107;">⚠️ Espace Disque Faible</h2>
    <p>L'espace disque disponible est faible.</p>

    <div style="background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
      <strong>Attention:</strong> Risque de saturation du disque
    </div>

    <h3>État du disque</h3>
    <ul>
      <li><strong>Utilisé:</strong> ${diskInfo.used || 'N/A'}</li>
      <li><strong>Disponible:</strong> ${diskInfo.available || 'N/A'}</li>
      <li><strong>Pourcentage:</strong> ${diskInfo.percent || 'N/A'}</li>
    </ul>

    <h3>Actions recommandées</h3>
    <ol>
      <li>Supprimer les anciennes vidéos</li>
      <li>Supprimer les anciens backups</li>
      <li>Nettoyer les fichiers temporaires</li>
    </ol>

    <hr style="margin: 20px 0;">
    <p style="color: #666; font-size: 12px;">Notification automatique Neopro</p>
  `;

  return sendEmail({ subject, text, html, priority: 'high' });
}

/**
 * Notification: Erreur système critique
 */
async function notifySystemError(service, error, details = {}) {
  const subject = '🚨 Erreur Système Critique';
  const text = `
Une erreur système critique s'est produite.

Service: ${service}
Erreur: ${error}

Détails:
- Date: ${new Date().toLocaleString('fr-FR')}
- Hôte: ${config.hostname}
${Object.entries(details).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Veuillez vérifier le système immédiatement.

---
Notification automatique Neopro
  `;

  const html = `
    <h2 style="color: #dc3545;">🚨 Erreur Système Critique</h2>
    <p>Une erreur système critique s'est produite.</p>

    <div style="background: #f8d7da; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
      <strong>Service:</strong> ${service}<br>
      <strong>Erreur:</strong> ${error}
    </div>

    <h3>Détails</h3>
    <ul>
      <li><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</li>
      <li><strong>Hôte:</strong> ${config.hostname}</li>
      ${Object.entries(details).map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join('')}
    </ul>

    <p style="color: #dc3545; font-weight: bold;">⚠️ Action immédiate requise</p>

    <hr style="margin: 20px 0;">
    <p style="color: #666; font-size: 12px;">Notification automatique Neopro</p>
  `;

  return sendEmail({ subject, text, html, priority: 'high' });
}

/**
 * Test de configuration email
 */
async function sendTestEmail() {
  const subject = '✅ Test des Notifications Email';
  const text = `
Ceci est un email de test.

Configuration:
- SMTP Host: ${config.smtp.host}:${config.smtp.port}
- De: ${config.from}
- Vers: ${config.to.join(', ')}
- Hôte: ${config.hostname}
- Club: ${config.clubName}

Si vous recevez cet email, les notifications sont correctement configurées.

---
Notification automatique Neopro
  `;

  const html = `
    <h2 style="color: #51b28b;">✅ Test des Notifications Email</h2>
    <p>Ceci est un email de test.</p>

    <div style="background: #d4edda; padding: 15px; border-left: 4px solid #51b28b; margin: 20px 0;">
      <strong>Succès!</strong> Si vous recevez cet email, les notifications sont correctement configurées.
    </div>

    <h3>Configuration</h3>
    <ul>
      <li><strong>SMTP Host:</strong> ${config.smtp.host}:${config.smtp.port}</li>
      <li><strong>De:</strong> ${config.from}</li>
      <li><strong>Vers:</strong> ${config.to.join(', ')}</li>
      <li><strong>Hôte:</strong> ${config.hostname}</li>
      <li><strong>Club:</strong> ${config.clubName}</li>
    </ul>

    <hr style="margin: 20px 0;">
    <p style="color: #666; font-size: 12px;">Notification automatique Neopro</p>
  `;

  return sendEmail({ subject, text, html, priority: 'normal' });
}

/**
 * Obtenir la configuration actuelle
 */
function getConfig() {
  return {
    enabled: config.enabled,
    configured: !!(config.smtp.auth.user && config.smtp.auth.pass && config.to.length > 0),
    smtp: {
      host: config.smtp.host,
      port: config.smtp.port,
      user: config.smtp.auth.user ? config.smtp.auth.user.replace(/^(.{3}).*(@.*)$/, '$1***$2') : null
    },
    from: config.from,
    to: config.to,
    hostname: config.hostname,
    clubName: config.clubName
  };
}

// Export des fonctions
module.exports = {
  init: initTransporter,
  sendEmail,
  notifyBackupFailure,
  notifyBackupSuccess,
  notifyVideoProcessingFailure,
  notifyLowDiskSpace,
  notifySystemError,
  sendTestEmail,
  getConfig
};

// Si exécuté directement, envoyer un email de test
if (require.main === module) {
  (async () => {
    await initTransporter();
    if (transporter) {
      console.log('Envoi d\'un email de test...');
      const success = await sendTestEmail();
      console.log(success ? 'Email de test envoyé!' : 'Échec de l\'envoi');
      process.exit(success ? 0 : 1);
    } else {
      console.error('Impossible d\'initialiser le transporteur SMTP');
      process.exit(1);
    }
  })();
}
