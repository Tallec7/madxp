const fs = require('fs');
const path = require('path');

/**
 * Register all Socket.IO event handlers.
 *
 * Manages 18 event types across 6 domains: command relay, score, phase,
 * recording, TV sync (master-slave), options/timer, breaking news,
 * config/license updates, and connection lifecycle.
 *
 * @param {object} deps
 * @param {object} deps.io           - Socket.IO server instance
 * @param {import('../services/state.service')} deps.stateService - State manager
 * @param {string} deps.configPath   - Path to configuration.json
 *
 * @fires io#score-update — `{ home: number, away: number, sets?: object }`
 * @fires io#phase-change — `{ phase: string }`
 * @fires io#recording-state — `{ isRecording: boolean, startedAt?: string }`
 * @fires io#options-update — `{ matchType?: string, sport?: string, ... }`
 * @fires io#timer-update — `{ action: string, currentTime: number, isRunning: boolean }`
 * @fires io#tv-role-assigned — `{ role: 'master'|'slave' }`
 * @fires io#tv-loop-state — `{ currentIndex: number, currentVideo?: string }`
 * @fires io#breaking-news — `{ message: string, type?: string }`
 * @fires io#action — `{ type: string, data?: object }` (command relay + config reload)
 * @fires io#license_update — `{ status: string, reason?: string }`
 * @fires io#license_blocked — `{ status: string, reason?: string }`
 */
module.exports = function registerSocketHandlers({ io, stateService, configPath, hdmiService }) {
  io.on('connection', (socket) => {
    console.log('Client connect\u00e9:', socket.id);

    // --- Initial state sync (send full state to newly connected client) ---
    const state = stateService.getFullState();
    // N'envoyer le score que s'il y a un match actif (évite le "DOMICILE 0-0" au boot)
    if (state.score) {
      socket.emit('score-update', state.score);
    }
    socket.emit('phase-change', { phase: state.phase });
    socket.emit('recording-state', state.recordingState);
    if (state.options) {
      socket.emit('options-update', state.options);
    }
    if (state.timer.isRunning || state.timer.currentTime > 0) {
      socket.emit('timer-update', { action: 'sync', ...state.timer });
    }

    /**
     * Generic command relay — forwards any action to all clients.
     * @event command
     * @param {object} data — `{ type: string, ...payload }`
     */
    socket.on('command', (data) => {
      console.log('Commande re\u00e7ue:', data);
      io.emit('action', data);
    });

    /**
     * Score update — merges partial score data into in-memory state.
     * @event score-update
     * @param {object} data — `{ home?: number, away?: number, sets?: object }`
     */
    socket.on('score-update', (data) => {
      console.log('Score update re\u00e7u:', data);
      const score = stateService.updateScore(data);
      io.emit('score-update', score);
    });

    /**
     * Score reset — resets to null (no active match) and broadcasts.
     * @event score-reset
     */
    socket.on('score-reset', () => {
      console.log('Score reset reçu');
      stateService.resetScore();
      io.emit('score-reset');
    });

    /**
     * Phase change — switches match phase (e.g. warmup, live, halftime, ended).
     * @event phase-change
     * @param {object} data — `{ phase: string }`
     */
    socket.on('phase-change', (data) => {
      console.log('Phase change re\u00e7u:', data);
      stateService.setPhase(data.phase);
      io.emit('phase-change', data);
    });

    /**
     * Request full state — used after Angular routing to re-sync a client.
     * Sends all current state back to the requesting socket only.
     * @event request-state
     */
    socket.on('request-state', () => {
      console.log('Request state reçu de:', socket.id);
      const s = stateService.getFullState();
      if (s.score) {
        socket.emit('score-update', s.score);
      }
      socket.emit('phase-change', { phase: s.phase });
      socket.emit('recording-state', s.recordingState);
      if (s.options) {
        socket.emit('options-update', s.options);
      }
      if (s.timer.isRunning || s.timer.currentTime > 0) {
        socket.emit('timer-update', { action: 'sync', ...s.timer });
      }
    });

    /**
     * Transition quality metrics — accumulates counters from TV component.
     * @event transition-metrics
     * @param {object} data — `{ earlySwitchCount, safetyTimeoutCount, cleanupSkippedCount, videoErrorCount, totalTransitions }`
     */
    socket.on('transition-metrics', (data) => {
      stateService.updateTransitionMetrics(data);
    });

    /**
     * E-23 US-23.3.4: Boot-to-video timing metric (one-shot per boot).
     * Emitted by the TV component when the first video frame plays after HDMI detection.
     * @event boot-to-video
     */
    socket.on('boot-to-video', (data) => {
      if (data && typeof data.bootToVideoMs === 'number') {
        stateService.setBootToVideoMs(data.bootToVideoMs);
        console.log(`[handlers] Boot-to-video metric: ${data.bootToVideoMs}ms`);
      }
    });

    /**
     * Fetch transition metrics for heartbeat (get + reset).
     * @event get-transition-metrics
     */
    socket.on('get-transition-metrics', (callback) => {
      const metrics = stateService.getAndResetTransitionMetrics();
      if (typeof callback === 'function') {
        callback(metrics);
      } else {
        socket.emit('transition-metrics-response', metrics);
      }
    });

    /**
     * Fetch transition metrics read-only (for debug bundle, no reset).
     * @event get-transition-metrics-readonly
     */
    socket.on('get-transition-metrics-readonly', (callback) => {
      const metrics = stateService.getTransitionMetrics();
      if (typeof callback === 'function') {
        callback(metrics);
      }
    });

    /**
     * Recording state toggle — updates and broadcasts recording status.
     * @event recording-state
     * @param {object} data — `{ isRecording: boolean, startedAt?: string }`
     */
    socket.on('recording-state', (data) => {
      console.log('[Recording] State update:', data);
      const recording = stateService.setRecordingState(data);
      io.emit('recording-state', recording);
    });

    /**
     * Recording toggle from cloud remote — toggles recording on/off.
     * @event recording-toggle
     */
    socket.on('recording-toggle', () => {
      console.log('[Recording] Cloud remote toggle received');
      const current = stateService.getRecordingState();
      const newState = stateService.setRecordingState({
        isRecording: !current.isRecording,
        isManualOverride: true,
      });
      io.emit('recording-state', newState);
    });

    /**
     * TV registration — registers a TV screen as master (first) or slave.
     * Slaves receive the current loop state immediately.
     * @event tv-register
     */
    socket.on('tv-register', (data) => {
      const displayType = data?.displayType || 'tv';
      const userAgent = socket.handshake?.headers?.['user-agent'] || null;
      const ip = socket.handshake?.address || null;
      const { role, demoted } = stateService.registerTv(socket.id, displayType, { userAgent, ip });
      socket.emit('tv-role-assigned', { role });
      console.log(`[TV-Sync] Registered as ${role} (${displayType}):`, socket.id);

      // If a previous master was demoted (Pi kiosk priority), notify it
      if (demoted) {
        const demotedSocket = io.sockets.sockets.get(demoted);
        if (demotedSocket) {
          demotedSocket.emit('tv-role-assigned', { role: 'slave' });
          demotedSocket.emit('tv-loop-state', stateService.getLoopState());
          console.log(`[TV-Sync] Demoted ${demoted} to slave (Pi kiosk priority)`);
        }
      }

      // Send current loop state to new slaves
      if (role === 'slave') {
        socket.emit('tv-loop-state', stateService.getLoopState());
      }
    });

    /**
     * TV loop update (master only) — syncs video loop position to all slaves.
     * Ignored if the sender is not the current master.
     * @event tv-loop-update
     * @param {object} data — `{ currentIndex: number, currentVideo?: string }`
     */
    socket.on('tv-loop-update', (data) => {
      if (!stateService.isTvMaster(socket.id)) return;
      const loopState = stateService.updateLoopState(data);
      // Broadcast to slaves only (not back to master)
      socket.broadcast.emit('tv-loop-state', loopState);
    });

    /**
     * Options update — stores match options and broadcasts to other clients.
     * @event options-update
     * @param {object} data — `{ matchType?: string, sport?: string, teamHome?: string, teamAway?: string, ... }`
     */
    socket.on('options-update', (data) => {
      console.log('Options update re\u00e7u:', data);
      stateService.setOptions(data);
      socket.broadcast.emit('options-update', data);
    });

    /**
     * Timer update — stores timer state and broadcasts to other clients.
     * @event timer-update
     * @param {object} data — `{ action: 'start'|'stop'|'reset'|'sync', currentTime: number, isRunning: boolean }`
     */
    socket.on('timer-update', (data) => {
      console.log('Timer update re\u00e7u:', data);
      stateService.updateTimer(data);
      socket.broadcast.emit('timer-update', data);
    });

    /**
     * Breaking news relay — immediate broadcast, no persistence.
     * @event breaking-news
     * @param {object} data — `{ message: string, type?: string }`
     */
    socket.on('breaking-news', (data) => {
      console.log('Breaking news re\u00e7u:', data);
      socket.broadcast.emit('breaking-news', data);
    });

    /**
     * Match info updated (from sync-agent/cloud remote) — relays to TV/Remote clients.
     * @event match-info-updated
     * @param {object} data — `{ sessionId, matchDate, matchName, audienceEstimate }`
     */
    socket.on('match-info-updated', (data) => {
      console.log('Match info updated reçu:', data);
      socket.broadcast.emit('match-info-updated', data);
    });

    /**
     * Config updated notification (from sync-agent) — re-reads configuration.json
     * from disk and broadcasts a reload-config action to all clients.
     * @event config_updated
     */
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

    /**
     * Profile switch (from Angular remote) — writes the active profile marker,
     * reads the profile config from profiles/{id}.json, merges with local settings,
     * writes configuration.json, and broadcasts reload-config.
     * @event profile-switch
     * @param {object} data — `{ profileId: string }`
     */
    socket.on('profile-switch', (data) => {
      const { profileId } = data || {};
      if (!profileId) {
        console.warn('[Profile] Missing profileId in profile-switch event');
        return;
      }

      const profilesDir = path.resolve(path.dirname(configPath), 'profiles');
      const activeProfilePath = path.join(profilesDir, 'active-profile');
      const profilePath = path.join(profilesDir, `${profileId}.json`);

      console.log('[Profile] Switch requested to:', profileId);

      try {
        if (!fs.existsSync(profilePath)) {
          console.warn('[Profile] Profile file not found:', profilePath);
          return;
        }

        // Mettre a jour le marqueur de profil actif
        fs.writeFileSync(activeProfilePath, profileId, 'utf8');

        // Lire le profil
        const profileData = fs.readFileSync(profilePath, 'utf8');
        const profileConfig = JSON.parse(profileData);

        // Merger avec les settings locaux de configuration.json
        let mergedConfig = profileConfig;
        if (fs.existsSync(configPath)) {
          try {
            const currentData = fs.readFileSync(configPath, 'utf8');
            const currentConfig = JSON.parse(currentData);
            const LOCAL_ONLY_SETTINGS = [
              'settings', 'siteId', 'siteName', 'clubName', 'apiKey',
              'hotspot', 'localNetwork', 'localSponsors',
            ];
            mergedConfig = { ...profileConfig };
            for (const key of LOCAL_ONLY_SETTINGS) {
              if (currentConfig[key] !== undefined) {
                mergedConfig[key] = currentConfig[key];
              }
            }
          } catch (mergeErr) {
            console.warn('[Profile] Could not merge local settings:', mergeErr.message);
          }
        }

        // Persister dans configuration.json pour cohérence avec config_updated
        fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), 'utf8');

        // Monitoring: incrémenter les métriques de profile-switch
        stateService.updateTransitionMetrics({
          profileSwitchCount: 1,
          lastProfileId: profileId,
          lastProfileSwitchAt: Date.now(),
        });

        console.log('[Profile] Active profile set to:', profileId, '(configuration.json updated)');
        io.emit('action', { type: 'reload-config', data: mergedConfig });
      } catch (error) {
        console.error('[Profile] Error switching profile:', error.message);
        stateService.updateTransitionMetrics({ profileSwitchErrorCount: 1 });
      }
    });

    /**
     * License status update (from sync-agent) — relays to all clients.
     * @event license_update
     * @param {object} status — `{ status: string, reason?: string, expiresAt?: string }`
     */
    socket.on('license_update', (status) => {
      console.log('[License] Status update received:', status?.status, status?.days_left != null ? `${status.days_left}d left` : status?.reason);
      io.emit('license_update', status);
    });

    /**
     * License blocked (from sync-agent) — relays blocking status to all clients.
     * @event license_blocked
     * @param {object} status — `{ status: 'BLOCKED', reason: string }`
     */
    socket.on('license_blocked', (status) => {
      console.log('[License] BLOCKED received:', status?.status, status?.reason);
      io.emit('license_blocked', status);
    });

    // =========================================================================
    // CLOUD MONITORING — Player state + screenshots
    // =========================================================================

    /**
     * Player state update (from TV component) — stores and broadcasts.
     * Picked up by sync-agent for heartbeat relay to central server.
     * @event player-state
     * @param {object} data — PlayerState object (currentVideo, phase, progress, etc.)
     */
    socket.on('player-state', (data) => {
      stateService.setPlayerState(data);
      socket.broadcast.emit('player-state', data);
    });

    /**
     * Get player state (from sync-agent via callback) — returns current state.
     * @event get-player-state
     */
    socket.on('get-player-state', (callback) => {
      const state = stateService.getPlayerState();
      if (typeof callback === 'function') {
        callback(state);
      }
    });

    /**
     * Get recording state (from sync-agent via callback) — returns current state.
     * Needed by persistent connections that don't get the auto-emit on connect.
     * @event get-recording-state
     */
    socket.on('get-recording-state', (callback) => {
      const state = stateService.getRecordingState();
      if (typeof callback === 'function') {
        callback(state);
      }
    });

    /**
     * Screenshot request (from sync-agent/cloud) — broadcasts to TV component.
     * @event screenshot-request
     */
    socket.on('screenshot-request', (data) => {
      console.log('[Screenshot] Request received');
      io.emit('screenshot-request', data);
    });

    /**
     * Screenshot data (from TV component) — broadcasts to all (sync-agent picks it up).
     * @event screenshot-data
     * @param {object} data — `{ image: string (base64), timestamp: number, currentVideo: string }`
     */
    socket.on('screenshot-data', (data) => {
      console.log('[Screenshot] Data received, relaying');
      socket.broadcast.emit('screenshot-data', data);
    });

    // =========================================================================
    // HDMI STATUS MONITORING (E-23)
    // =========================================================================

    /**
     * HDMI status update (from watchdog/hdmi.service) — stores and broadcasts.
     * @event hdmi-status-update
     * @param {object} data — `{ hdmi0: boolean, hdmi1: boolean, wrongPort?: boolean }`
     */
    socket.on('hdmi-status-update', (data) => {
      stateService.updateHdmiState(data);
      socket.broadcast.emit('hdmi-status-update', stateService.getHdmiState());
    });

    /**
     * Get HDMI state (from sync-agent via callback).
     * @event get-hdmi-state
     */
    socket.on('get-hdmi-state', (callback) => {
      if (typeof callback === 'function') {
        callback(stateService.getHdmiState());
      }
    });

    /**
     * Get connected clients (from sync-agent via callback).
     * Returns all TV/secondary instances with metadata.
     * @event get-connected-clients
     */
    socket.on('get-connected-clients', (callback) => {
      if (typeof callback === 'function') {
        callback(stateService.getConnectedClients());
      }
    });

    /**
     * Client disconnect — unregisters TV if applicable.
     * If the master disconnects, promotes the next slave to master.
     * @event disconnect
     */
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

  // --- Periodic HDMI status check (every 10s) ---
  if (hdmiService && typeof hdmiService.getBothPortsStatus === 'function') {
    setInterval(() => {
      try {
        const ports = hdmiService.getBothPortsStatus();
        const prev = stateService.getHdmiState();
        const changed = prev.hdmi0 !== ports.hdmi0 || prev.hdmi1 !== ports.hdmi1;

        stateService.updateHdmiState(ports);

        if (changed) {
          io.emit('hdmi-status-update', stateService.getHdmiState());
          console.log(`[HDMI] Status changed: HDMI-0=${ports.hdmi0 ? 'connected' : 'disconnected'}, HDMI-1=${ports.hdmi1 ? 'connected' : 'disconnected'}`);

          // E-23 US-23.6.1: Alert when primary display lost during dual-display
          if (!ports.hdmi0 && ports.hdmi1 && prev.hdmi0) {
            io.emit('hdmi-alert', {
              type: 'primary_display_lost',
              message: 'Écran principal (HDMI-0) déconnecté pendant le dual-display',
              hdmi0: false,
              hdmi1: true,
              timestamp: Date.now(),
            });
            console.log('[HDMI] ALERT: Primary display lost during dual-display');

            // E-23 US-23.6.2: Check for failover flag — if watchdog activated failover,
            // emit tv-role-promotion so the secondary Angular switches to full TV mode
            try {
              if (fs.existsSync('/tmp/hdmi-failover-active')) {
                io.emit('tv-role-promotion', {
                  reason: 'hdmi_failover',
                  message: 'HDMI-0 lost, secondary promoted to primary TV mode',
                  timestamp: Date.now(),
                });
                // E-23 US-23.6.5: Track failover metric
                stateService.updateTransitionMetrics({ failoverCount: 1 });
                console.log('[HDMI] FAILOVER: Secondary promoted to primary TV mode');
              }
            } catch (_e) { /* ignore fs errors */ }
          }

          // E-23 US-23.6.2: Check for failover recovery — HDMI-0 back while failover was active
          if (ports.hdmi0 && !prev.hdmi0) {
            try {
              if (!fs.existsSync('/tmp/hdmi-failover-active')) {
                // Failover was deactivated by watchdog, emit demotion
                io.emit('tv-role-demotion', {
                  reason: 'hdmi_recovery',
                  message: 'HDMI-0 recovered, secondary returns to secondary mode',
                  timestamp: Date.now(),
                });
                // E-23 US-23.6.5: Track failover recovery metric
                stateService.updateTransitionMetrics({ failoverRecoveryCount: 1 });
                console.log('[HDMI] RECOVERY: Secondary demoted back to secondary mode');
              }
            } catch (_e) { /* ignore fs errors */ }
          }

          // Alert when no display connected at all
          if (!ports.hdmi0 && !ports.hdmi1) {
            io.emit('hdmi-alert', {
              type: 'no_display',
              message: 'Aucun écran branché (HDMI-0 et HDMI-1 déconnectés)',
              hdmi0: false,
              hdmi1: false,
              timestamp: Date.now(),
            });
            console.log('[HDMI] ALERT: No display connected');
          }
        }
      } catch (err) {
        // Silently ignore on non-Pi environments
      }
    }, 10000);
  }
};
