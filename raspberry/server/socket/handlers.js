const fs = require('fs');

/**
 * Register all Socket.IO event handlers.
 *
 * @param {object} deps
 * @param {object} deps.io           - Socket.IO server instance
 * @param {import('../services/state.service')} deps.stateService - State manager
 * @param {string} deps.configPath   - Path to configuration.json
 */
module.exports = function registerSocketHandlers({ io, stateService, configPath }) {
  io.on('connection', (socket) => {
    console.log('Client connect\u00e9:', socket.id);

    // --- Initial state sync ---
    const state = stateService.getFullState();
    socket.emit('score-update', state.score);
    socket.emit('phase-change', { phase: state.phase });
    socket.emit('recording-state', state.recordingState);
    if (state.options) {
      socket.emit('options-update', state.options);
    }
    if (state.timer.isRunning || state.timer.currentTime > 0) {
      socket.emit('timer-update', { action: 'sync', ...state.timer });
    }

    // --- Command relay ---
    socket.on('command', (data) => {
      console.log('Commande re\u00e7ue:', data);
      io.emit('action', data);
    });

    // --- Score ---
    socket.on('score-update', (data) => {
      console.log('Score update re\u00e7u:', data);
      const score = stateService.updateScore(data);
      io.emit('score-update', score);
    });

    socket.on('score-reset', () => {
      console.log('Score reset re\u00e7u');
      stateService.resetScore();
      io.emit('score-reset');
      io.emit('score-update', stateService.getScore());
    });

    // --- Phase ---
    socket.on('phase-change', (data) => {
      console.log('Phase change re\u00e7u:', data);
      stateService.setPhase(data.phase);
      io.emit('phase-change', data);
    });

    // --- State request (after Angular routing) ---
    socket.on('request-state', () => {
      console.log('Request state re\u00e7u de:', socket.id);
      const s = stateService.getFullState();
      socket.emit('score-update', s.score);
      socket.emit('phase-change', { phase: s.phase });
      socket.emit('recording-state', s.recordingState);
      if (s.options) {
        socket.emit('options-update', s.options);
      }
      if (s.timer.isRunning || s.timer.currentTime > 0) {
        socket.emit('timer-update', { action: 'sync', ...s.timer });
      }
    });

    // --- Recording state ---
    socket.on('recording-state', (data) => {
      console.log('[Recording] State update:', data);
      const recording = stateService.setRecordingState(data);
      io.emit('recording-state', recording);
    });

    // --- TV registration (master-slave) ---
    socket.on('tv-register', () => {
      const role = stateService.registerTv(socket.id);
      socket.emit('tv-role-assigned', { role });
      console.log(`[TV-Sync] Registered as ${role}:`, socket.id);

      // Send current loop state to new slaves
      if (role === 'slave') {
        socket.emit('tv-loop-state', stateService.getLoopState());
      }
    });

    // --- TV loop sync (master only) ---
    socket.on('tv-loop-update', (data) => {
      if (!stateService.isTvMaster(socket.id)) return;
      const loopState = stateService.updateLoopState(data);
      // Broadcast to slaves only (not back to master)
      socket.broadcast.emit('tv-loop-state', loopState);
    });

    // --- Options ---
    socket.on('options-update', (data) => {
      console.log('Options update re\u00e7u:', data);
      stateService.setOptions(data);
      socket.broadcast.emit('options-update', data);
    });

    // --- Timer ---
    socket.on('timer-update', (data) => {
      console.log('Timer update re\u00e7u:', data);
      stateService.updateTimer(data);
      socket.broadcast.emit('timer-update', data);
    });

    // --- Breaking news (no persistence, immediate relay) ---
    socket.on('breaking-news', (data) => {
      console.log('Breaking news re\u00e7u:', data);
      socket.broadcast.emit('breaking-news', data);
    });

    // --- Config update (from sync-agent) ---
    socket.on('config_updated', () => {
      console.log('[Config] Configuration updated notification received');
      try {
        if (fs.existsSync(configPath)) {
          const configData = fs.readFileSync(configPath, 'utf8');
          const config = JSON.parse(configData);
          console.log('[Config] Broadcasting reload-config to all clients');
          io.emit('action', { type: 'reload-config', data: config });
        } else {
          console.warn('[Config] Configuration file not found:', configPath);
        }
      } catch (error) {
        console.error('[Config] Error reading configuration:', error.message);
      }
    });

    // --- License events (from sync-agent) ---
    socket.on('license_update', (status) => {
      console.log('[License] Status update received:', status?.status, status?.reason);
      io.emit('license_update', status);
    });

    socket.on('license_blocked', (status) => {
      console.log('[License] BLOCKED received:', status?.status, status?.reason);
      io.emit('license_blocked', status);
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
      console.log('Client d\u00e9connect\u00e9:', socket.id);
      const { wasMaster, promoted } = stateService.unregisterTv(socket.id);
      if (wasMaster && !promoted) {
        console.log('[TV-Sync] Master disconnected, no slave to promote');
      } else if (wasMaster && promoted) {
        io.to(promoted).emit('tv-role-assigned', { role: 'master' });
      }
    });
  });
};
