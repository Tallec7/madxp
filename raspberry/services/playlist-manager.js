/**
 * Playlist Manager Service
 *
 * Ce service génère et maintient le fichier playlist FFmpeg concat
 * à partir de la configuration Neopro.
 *
 * Il écoute les changements de phase (neutral, before, during, after)
 * et régénère la playlist en conséquence.
 */

const fs = require('fs');
const path = require('path');
const io = require('socket.io-client');

// Configuration
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3000';
const NEOPRO_DIR = process.env.NEOPRO_DIR || '/home/pi/neopro';
const SCORE_DIR = process.env.SCORE_DIR || '/tmp';

// Fichiers
const CONFIG_FILE = path.join(NEOPRO_DIR, 'webapp', 'configuration.json');
const PLAYLIST_FILE = path.join(SCORE_DIR, 'neopro-playlist.txt');
const PHASE_FILE = path.join(SCORE_DIR, 'neopro-phase.txt');

// État
let currentPhase = 'neutral';
let currentConfig = null;

/**
 * Charge la configuration depuis le fichier JSON
 */
function loadConfiguration() {
  try {
    // Essayer plusieurs emplacements possibles
    const possiblePaths = [
      CONFIG_FILE,
      path.join(NEOPRO_DIR, 'public', 'configuration.json'),
      path.join(NEOPRO_DIR, 'configuration.json'),
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf8');
        currentConfig = JSON.parse(data);
        console.log(`[PlaylistManager] Configuration chargée depuis: ${configPath}`);
        return currentConfig;
      }
    }

    console.error('[PlaylistManager] Fichier de configuration non trouvé!');
    console.error('[PlaylistManager] Chemins essayés:', possiblePaths);
    return null;
  } catch (error) {
    console.error('[PlaylistManager] Erreur chargement config:', error.message);
    return null;
  }
}

/**
 * Extrait les vidéos pour une phase donnée
 */
function getVideosForPhase(config, phase) {
  if (!config) return [];

  let videos = [];

  if (phase === 'neutral') {
    // Phase neutre: utiliser la boucle sponsors
    if (config.sponsors && Array.isArray(config.sponsors)) {
      videos = config.sponsors.map(s => ({
        path: s.path,
        name: s.name
      }));
    }
  } else {
    // Phases temporelles (before, during, after)
    if (config.timeCategories && Array.isArray(config.timeCategories)) {
      const timeCategory = config.timeCategories.find(tc => tc.id === phase);
      if (timeCategory && timeCategory.loopVideos) {
        videos = timeCategory.loopVideos.map(v => ({
          path: v.path,
          name: v.name
        }));
      }
    }
  }

  // Si aucune vidéo pour cette phase, fallback sur les sponsors
  if (videos.length === 0 && config.sponsors && Array.isArray(config.sponsors)) {
    console.log(`[PlaylistManager] Aucune vidéo pour phase '${phase}', utilisation des sponsors`);
    videos = config.sponsors.map(s => ({
      path: s.path,
      name: s.name
    }));
  }

  return videos;
}

/**
 * Résout le chemin complet d'une vidéo
 */
function resolveVideoPath(videoPath) {
  // Si le chemin est déjà absolu
  if (path.isAbsolute(videoPath)) {
    return videoPath;
  }

  // Essayer différentes bases
  const possibleBases = [
    NEOPRO_DIR,
    path.join(NEOPRO_DIR, 'webapp'),
    path.join(NEOPRO_DIR, 'public'),
  ];

  for (const base of possibleBases) {
    const fullPath = path.join(base, videoPath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  // Retourner le chemin avec la base par défaut
  return path.join(NEOPRO_DIR, videoPath);
}

/**
 * Génère le fichier playlist au format FFmpeg concat
 */
function generatePlaylist(videos) {
  if (!videos || videos.length === 0) {
    console.error('[PlaylistManager] Aucune vidéo à mettre dans la playlist!');
    return false;
  }

  const lines = [];

  for (const video of videos) {
    const fullPath = resolveVideoPath(video.path);

    // Vérifier que le fichier existe
    if (!fs.existsSync(fullPath)) {
      console.warn(`[PlaylistManager] Vidéo non trouvée: ${fullPath}`);
      continue;
    }

    // Format FFmpeg concat: file 'path'
    // Les apostrophes dans le chemin doivent être échappées
    const escapedPath = fullPath.replace(/'/g, "'\\''");
    lines.push(`file '${escapedPath}'`);
  }

  if (lines.length === 0) {
    console.error('[PlaylistManager] Aucune vidéo valide trouvée!');
    return false;
  }

  // Écriture atomique
  const content = lines.join('\n') + '\n';
  const tmpFile = PLAYLIST_FILE + '.tmp';

  try {
    fs.writeFileSync(tmpFile, content, 'utf8');
    fs.renameSync(tmpFile, PLAYLIST_FILE);
    console.log(`[PlaylistManager] Playlist générée avec ${lines.length} vidéo(s)`);
    return true;
  } catch (error) {
    console.error('[PlaylistManager] Erreur écriture playlist:', error.message);
    return false;
  }
}

/**
 * Met à jour la playlist pour la phase actuelle
 */
function updatePlaylist() {
  const config = loadConfiguration();
  if (!config) {
    console.error('[PlaylistManager] Impossible de charger la configuration');
    return false;
  }

  const videos = getVideosForPhase(config, currentPhase);
  console.log(`[PlaylistManager] Phase '${currentPhase}': ${videos.length} vidéo(s)`);

  return generatePlaylist(videos);
}

/**
 * Change la phase et régénère la playlist
 */
function setPhase(phase) {
  const validPhases = ['neutral', 'before', 'during', 'after'];

  if (!validPhases.includes(phase)) {
    console.warn(`[PlaylistManager] Phase invalide: ${phase}`);
    return;
  }

  if (phase === currentPhase) {
    console.log(`[PlaylistManager] Déjà en phase '${phase}'`);
    return;
  }

  console.log(`[PlaylistManager] Changement de phase: ${currentPhase} -> ${phase}`);
  currentPhase = phase;

  // Sauvegarder la phase dans le fichier
  try {
    fs.writeFileSync(PHASE_FILE, phase, 'utf8');
  } catch (error) {
    console.error('[PlaylistManager] Erreur écriture phase:', error.message);
  }

  // Régénérer la playlist
  updatePlaylist();
}

/**
 * Lit la phase depuis le fichier (pour synchronisation)
 */
function readPhaseFromFile() {
  try {
    if (fs.existsSync(PHASE_FILE)) {
      const phase = fs.readFileSync(PHASE_FILE, 'utf8').trim();
      if (phase && ['neutral', 'before', 'during', 'after'].includes(phase)) {
        return phase;
      }
    }
  } catch (error) {
    // Ignorer les erreurs de lecture
  }
  return 'neutral';
}

/**
 * Surveille les changements du fichier de configuration
 */
function watchConfigFile() {
  const configPath = CONFIG_FILE;

  // Essayer de trouver le bon chemin
  const possiblePaths = [
    CONFIG_FILE,
    path.join(NEOPRO_DIR, 'public', 'configuration.json'),
    path.join(NEOPRO_DIR, 'configuration.json'),
  ];

  let watchPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      watchPath = p;
      break;
    }
  }

  if (watchPath) {
    console.log(`[PlaylistManager] Surveillance du fichier: ${watchPath}`);

    fs.watchFile(watchPath, { interval: 2000 }, (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        console.log('[PlaylistManager] Configuration modifiée, régénération de la playlist...');
        updatePlaylist();
      }
    });
  }
}

/**
 * Connexion Socket.IO pour les changements de phase
 */
function connectSocket() {
  console.log(`[PlaylistManager] Connexion à ${SOCKET_URL}...`);

  const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionAttempts: Infinity
  });

  socket.on('connect', () => {
    console.log(`[PlaylistManager] Connecté au serveur Socket.IO`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[PlaylistManager] Déconnecté: ${reason}`);
  });

  // Écoute des changements de phase
  socket.on('action', (data) => {
    if (data.type === 'phase-change') {
      setPhase(data.phase || data.payload?.phase);
    }
  });

  socket.on('phase-change', (data) => {
    setPhase(data.phase || data);
  });

  return socket;
}

/**
 * Gestion de l'arrêt propre
 */
function handleShutdown(signal) {
  console.log(`[PlaylistManager] Signal ${signal} reçu, arrêt...`);
  process.exit(0);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Démarrage
console.log('='.repeat(60));
console.log('[PlaylistManager] Démarrage du gestionnaire de playlist');
console.log(`[PlaylistManager] Config: ${CONFIG_FILE}`);
console.log(`[PlaylistManager] Playlist: ${PLAYLIST_FILE}`);
console.log('='.repeat(60));

// Lire la phase depuis le fichier (pour reprendre après un redémarrage)
currentPhase = readPhaseFromFile();
console.log(`[PlaylistManager] Phase initiale: ${currentPhase}`);

// Générer la playlist initiale
updatePlaylist();

// Démarrer les watchers et connexions
watchConfigFile();
connectSocket();

// Heartbeat
setInterval(() => {
  console.log(`[PlaylistManager] Heartbeat - Phase: ${currentPhase}`);
}, 60000);
