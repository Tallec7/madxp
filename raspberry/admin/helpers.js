/**
 * Re-export shim — préserve la compatibilité avec les imports existants.
 *
 * Les fonctions sont désormais organisées dans des modules dédiés :
 *   paths.js        — Chemins et constantes de configuration
 *   shell-exec.js   — Exécution sécurisée de commandes shell
 *   sanitize.js     — Assainissement de noms de fichiers
 *   formatting.js   — Formatage uptime et infos disque
 *   video-config.js — Gestion de la configuration vidéo
 */

module.exports = {
  ...require('./paths'),
  ...require('./shell-exec'),
  ...require('./sanitize'),
  ...require('./formatting'),
  ...require('./video-config'),
};
