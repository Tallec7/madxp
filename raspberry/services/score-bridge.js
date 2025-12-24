/**
 * Score Bridge Service
 *
 * Ce service écoute les mises à jour de score via Socket.IO et écrit les données
 * dans des fichiers texte que FFmpeg peut lire avec le filtre drawtext (reload=1).
 *
 * Cela permet d'incruster le score directement dans le flux vidéo.
 */

const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');

// Configuration
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3000';
const SCORE_DIR = process.env.SCORE_DIR || '/tmp';
const RECONNECT_DELAY = 5000;

// Fichiers de score pour FFmpeg
const SCORE_FILES = {
  simple: path.join(SCORE_DIR, 'neopro-score.txt'),           // "2 - 1"
  full: path.join(SCORE_DIR, 'neopro-score-full.txt'),        // "CESSON 2 - 1 NANTES"
  homeTeam: path.join(SCORE_DIR, 'neopro-home-team.txt'),     // "CESSON"
  homeScore: path.join(SCORE_DIR, 'neopro-home-score.txt'),   // "2"
  awayTeam: path.join(SCORE_DIR, 'neopro-away-team.txt'),     // "NANTES"
  awayScore: path.join(SCORE_DIR, 'neopro-away-score.txt'),   // "1"
  period: path.join(SCORE_DIR, 'neopro-period.txt'),          // "1ère Mi-temps"
  matchTime: path.join(SCORE_DIR, 'neopro-time.txt'),         // "45:30"
  phase: path.join(SCORE_DIR, 'neopro-phase.txt'),            // "during"
  meta: path.join(SCORE_DIR, 'neopro-score-meta.json'),       // JSON complet
};

// État actuel du score
let currentScore = {
  homeTeam: 'DOMICILE',
  awayTeam: 'EXTÉRIEUR',
  homeScore: 0,
  awayScore: 0,
  period: '',
  matchTime: ''
};

let currentPhase = 'neutral';

/**
 * Écrit un fichier de manière atomique (write to .tmp, then rename)
 * pour éviter les lectures partielles par FFmpeg
 */
function writeFileAtomic(filePath, content) {
  const tmpPath = filePath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    console.error(`[ScoreBridge] Erreur écriture ${filePath}:`, error.message);
  }
}

/**
 * Met à jour tous les fichiers de score
 */
function updateScoreFiles(scoreData) {
  currentScore = { ...currentScore, ...scoreData };

  const { homeTeam, awayTeam, homeScore, awayScore, period, matchTime } = currentScore;

  // Écriture des fichiers individuels
  writeFileAtomic(SCORE_FILES.simple, `${homeScore} - ${awayScore}`);
  writeFileAtomic(SCORE_FILES.full, `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`);
  writeFileAtomic(SCORE_FILES.homeTeam, homeTeam);
  writeFileAtomic(SCORE_FILES.homeScore, String(homeScore));
  writeFileAtomic(SCORE_FILES.awayTeam, awayTeam);
  writeFileAtomic(SCORE_FILES.awayScore, String(awayScore));
  writeFileAtomic(SCORE_FILES.period, period || '');
  writeFileAtomic(SCORE_FILES.matchTime, matchTime || '');

  // Fichier JSON complet pour debug/monitoring
  writeFileAtomic(SCORE_FILES.meta, JSON.stringify({
    ...currentScore,
    updatedAt: new Date().toISOString()
  }, null, 2));

  console.log(`[ScoreBridge] Score mis à jour: ${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`);
}

/**
 * Met à jour le fichier de phase
 */
function updatePhaseFile(phase) {
  currentPhase = phase;
  writeFileAtomic(SCORE_FILES.phase, phase);
  console.log(`[ScoreBridge] Phase mise à jour: ${phase}`);
}

/**
 * Réinitialise le score
 */
function resetScore() {
  updateScoreFiles({
    homeScore: 0,
    awayScore: 0
  });
  console.log('[ScoreBridge] Score réinitialisé');
}

/**
 * Initialise les fichiers avec des valeurs par défaut
 */
function initializeScoreFiles() {
  console.log('[ScoreBridge] Initialisation des fichiers de score...');
  updateScoreFiles(currentScore);
  updatePhaseFile(currentPhase);
}

/**
 * Connexion au serveur Socket.IO
 */
function connectSocket() {
  console.log(`[ScoreBridge] Connexion à ${SOCKET_URL}...`);

  const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: RECONNECT_DELAY,
    reconnectionAttempts: Infinity
  });

  socket.on('connect', () => {
    console.log(`[ScoreBridge] Connecté au serveur Socket.IO (id: ${socket.id})`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[ScoreBridge] Déconnecté: ${reason}`);
  });

  socket.on('connect_error', (error) => {
    console.error(`[ScoreBridge] Erreur de connexion:`, error.message);
  });

  // Écoute des événements de score
  socket.on('action', (data) => {
    // Les commandes passent par 'action' dans le système actuel
    if (data.type === 'score-update') {
      updateScoreFiles(data.payload || data);
    } else if (data.type === 'score-reset') {
      resetScore();
    } else if (data.type === 'phase-change') {
      updatePhaseFile(data.phase || data.payload?.phase);
    }
  });

  // Écoute directe des événements score-update (au cas où ils sont émis directement)
  socket.on('score-update', (scoreData) => {
    updateScoreFiles(scoreData);
  });

  socket.on('score-reset', () => {
    resetScore();
  });

  socket.on('phase-change', (data) => {
    updatePhaseFile(data.phase || data);
  });

  return socket;
}

/**
 * Surveille les fichiers de configuration pour les changements de phase
 * (Alternative si les événements Socket.IO ne sont pas disponibles)
 */
function watchConfigFile() {
  const configPath = path.join(
    process.env.HOME || '/home/pi',
    'neopro',
    'webapp',
    'configuration.json'
  );

  if (fs.existsSync(configPath)) {
    console.log(`[ScoreBridge] Surveillance du fichier config: ${configPath}`);

    fs.watchFile(configPath, { interval: 1000 }, (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        console.log('[ScoreBridge] Configuration modifiée, rechargement...');
        // On pourrait extraire la phase ici si nécessaire
      }
    });
  }
}

/**
 * Gestion propre de l'arrêt
 */
function handleShutdown(signal) {
  console.log(`[ScoreBridge] Signal ${signal} reçu, arrêt...`);
  process.exit(0);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Démarrage
console.log('='.repeat(60));
console.log('[ScoreBridge] Démarrage du service Score Bridge');
console.log(`[ScoreBridge] Socket URL: ${SOCKET_URL}`);
console.log(`[ScoreBridge] Score Directory: ${SCORE_DIR}`);
console.log('='.repeat(60));

initializeScoreFiles();
const socket = connectSocket();
watchConfigFile();

// Heartbeat pour le monitoring
setInterval(() => {
  const status = socket.connected ? 'connecté' : 'déconnecté';
  console.log(`[ScoreBridge] Heartbeat - Socket: ${status}, Score: ${currentScore.homeScore}-${currentScore.awayScore}`);
}, 60000);
