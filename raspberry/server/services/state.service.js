/**
 * StateService - In-memory state management for the Socket.IO server.
 *
 * Manages: score, phase, options, timer, recording state, TV instances
 * (master-slave sync), and video loop state.
 */
class StateService {
  constructor() {
    this._score = {
      homeTeam: 'DOMICILE',
      awayTeam: 'EXTÉRIEUR',
      homeScore: 0,
      awayScore: 0,
    };

    this._phase = 'neutral';
    this._options = null;

    this._timer = {
      currentTime: 0,
      isRunning: false,
      halfDuration: 45,
      countDown: true,
    };

    this._recordingState = {
      isRecording: false,
      isManualOverride: false,
    };

    // Transition quality metrics (accumulated from TV component, reset after heartbeat fetch)
    this._transitionMetrics = {
      earlySwitchCount: 0,
      safetyTimeoutCount: 0,
      cleanupSkippedCount: 0,
      videoErrorCount: 0,
      totalTransitions: 0,
      lastUpdatedAt: null,
    };

    // Player state (current video, phase, progress — for cloud monitoring)
    this._playerState = null;

    // TV master-slave instances: socketId -> { role, connectedAt }
    this._tvInstances = new Map();

    this._loopState = {
      videoIndex: 0,
      videoPath: '',
      videoStartedAt: null,
      isManualMode: false,
      manualVideoPath: null,
      manualVideoStartedAt: null,
      updatedAt: Date.now(),
    };
  }

  // --- Score ---
  getScore() {
    return { ...this._score };
  }

  updateScore(data) {
    this._score = {
      homeTeam: data.homeTeam || this._score.homeTeam,
      awayTeam: data.awayTeam || this._score.awayTeam,
      homeScore: data.homeScore ?? this._score.homeScore,
      awayScore: data.awayScore ?? this._score.awayScore,
    };
    return this.getScore();
  }

  resetScore() {
    this._score.homeScore = 0;
    this._score.awayScore = 0;
    return this.getScore();
  }

  // --- Phase ---
  getPhase() {
    return this._phase;
  }

  setPhase(phase) {
    this._phase = phase;
    return this._phase;
  }

  // --- Options ---
  getOptions() {
    return this._options;
  }

  setOptions(data) {
    this._options = data;
  }

  // --- Timer ---
  getTimer() {
    return { ...this._timer };
  }

  updateTimer(data) {
    if (data.currentTime !== undefined) this._timer.currentTime = data.currentTime;
    if (data.isRunning !== undefined) this._timer.isRunning = data.isRunning;
    if (data.halfDuration !== undefined) this._timer.halfDuration = data.halfDuration;
    if (data.countDown !== undefined) this._timer.countDown = data.countDown;
    return this.getTimer();
  }

  // --- Recording ---
  getRecordingState() {
    return { ...this._recordingState };
  }

  setRecordingState(data) {
    this._recordingState = {
      isRecording: data.isRecording || false,
      isManualOverride: data.isManualOverride || false,
    };
    return this.getRecordingState();
  }

  // --- Transition Metrics ---
  getTransitionMetrics() {
    return { ...this._transitionMetrics };
  }

  updateTransitionMetrics(data) {
    this._transitionMetrics.earlySwitchCount += data.earlySwitchCount || 0;
    this._transitionMetrics.safetyTimeoutCount += data.safetyTimeoutCount || 0;
    this._transitionMetrics.cleanupSkippedCount += data.cleanupSkippedCount || 0;
    this._transitionMetrics.videoErrorCount += data.videoErrorCount || 0;
    this._transitionMetrics.totalTransitions += data.totalTransitions || 0;
    this._transitionMetrics.lastUpdatedAt = Date.now();
    return this.getTransitionMetrics();
  }

  getAndResetTransitionMetrics() {
    const metrics = this.getTransitionMetrics();
    this._transitionMetrics.earlySwitchCount = 0;
    this._transitionMetrics.safetyTimeoutCount = 0;
    this._transitionMetrics.cleanupSkippedCount = 0;
    this._transitionMetrics.videoErrorCount = 0;
    this._transitionMetrics.totalTransitions = 0;
    return metrics;
  }

  // --- Player State (cloud monitoring) ---
  getPlayerState() {
    return this._playerState ? { ...this._playerState } : null;
  }

  setPlayerState(data) {
    this._playerState = { ...data };
    return this.getPlayerState();
  }

  // --- Loop State ---
  getLoopState() {
    return { ...this._loopState };
  }

  updateLoopState(data) {
    this._loopState = {
      ...this._loopState,
      ...data,
      updatedAt: Date.now(),
    };
    return this.getLoopState();
  }

  // --- TV Registration (Master-Slave) ---
  registerTv(socketId) {
    const masterId = this._getMasterId();
    if (!masterId) {
      this._tvInstances.set(socketId, { role: 'master', connectedAt: Date.now() });
      return 'master';
    }
    this._tvInstances.set(socketId, { role: 'slave', connectedAt: Date.now() });
    return 'slave';
  }

  unregisterTv(socketId) {
    const instance = this._tvInstances.get(socketId);
    if (!instance) return { wasMaster: false, promoted: null };

    const wasMaster = instance.role === 'master';
    this._tvInstances.delete(socketId);

    let promoted = null;
    if (wasMaster) {
      promoted = this._promoteSlave();
    }
    return { wasMaster, promoted };
  }

  isTvMaster(socketId) {
    const instance = this._tvInstances.get(socketId);
    return instance ? instance.role === 'master' : false;
  }

  // --- Full State (for initial sync on client connect) ---
  getFullState() {
    return {
      score: this.getScore(),
      phase: this._phase,
      options: this._options,
      timer: this.getTimer(),
      recordingState: this.getRecordingState(),
      loopState: this.getLoopState(),
    };
  }

  // --- Private ---
  _getMasterId() {
    for (const [socketId, info] of this._tvInstances) {
      if (info.role === 'master') return socketId;
    }
    return null;
  }

  _promoteSlave() {
    let oldestId = null;
    let oldestTime = Infinity;
    for (const [socketId, info] of this._tvInstances) {
      if (info.role === 'slave' && info.connectedAt < oldestTime) {
        oldestId = socketId;
        oldestTime = info.connectedAt;
      }
    }
    if (oldestId) {
      this._tvInstances.get(oldestId).role = 'master';
      console.log('[TV-Sync] Promoted', oldestId, 'to master');
    }
    return oldestId;
  }
}

module.exports = StateService;
