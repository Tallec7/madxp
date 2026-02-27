const StateService = require('../services/state.service');

describe('StateService', () => {
  let service;

  beforeEach(() => {
    service = new StateService();
  });

  // --- Score ---
  describe('Score', () => {
    it('should return null by default (no active match)', () => {
      const score = service.getScore();
      expect(score).toBeNull();
    });

    it('should update score from null state', () => {
      const score = service.updateScore({ homeScore: 3 });
      expect(score.homeScore).toBe(3);
      expect(score.awayScore).toBe(0);
      expect(score.homeTeam).toBe('DOMICILE');
    });

    it('should update score partially', () => {
      service.updateScore({ homeTeam: 'PSG', homeScore: 1 });
      const score = service.updateScore({ homeScore: 3 });
      expect(score.homeScore).toBe(3);
      expect(score.awayScore).toBe(0);
      expect(score.homeTeam).toBe('PSG');
    });

    it('should update team names', () => {
      const score = service.updateScore({ homeTeam: 'PSG', awayTeam: 'OL' });
      expect(score.homeTeam).toBe('PSG');
      expect(score.awayTeam).toBe('OL');
    });

    it('should reset score to null (no active match)', () => {
      service.updateScore({ homeTeam: 'PSG', homeScore: 2, awayScore: 1 });
      const score = service.resetScore();
      expect(score).toBeNull();
    });

    it('should return copies, not references', () => {
      service.updateScore({ homeScore: 0 });
      const score1 = service.getScore();
      score1.homeScore = 99;
      const score2 = service.getScore();
      expect(score2.homeScore).toBe(0);
    });
  });

  // --- Phase ---
  describe('Phase', () => {
    it('should default to neutral', () => {
      expect(service.getPhase()).toBe('neutral');
    });

    it('should set and return phase', () => {
      const phase = service.setPhase('match');
      expect(phase).toBe('match');
      expect(service.getPhase()).toBe('match');
    });
  });

  // --- Options ---
  describe('Options', () => {
    it('should default to null', () => {
      expect(service.getOptions()).toBeNull();
    });

    it('should set and get options', () => {
      const opts = { theme: 'dark', lang: 'fr' };
      service.setOptions(opts);
      expect(service.getOptions()).toEqual(opts);
    });
  });

  // --- Timer ---
  describe('Timer', () => {
    it('should return default timer', () => {
      const timer = service.getTimer();
      expect(timer).toEqual({
        currentTime: 0,
        isRunning: false,
        halfDuration: 45,
        countDown: true,
      });
    });

    it('should update timer partially', () => {
      const timer = service.updateTimer({ currentTime: 120, isRunning: true });
      expect(timer.currentTime).toBe(120);
      expect(timer.isRunning).toBe(true);
      expect(timer.halfDuration).toBe(45);
    });

    it('should return copies, not references', () => {
      const timer1 = service.getTimer();
      timer1.currentTime = 999;
      const timer2 = service.getTimer();
      expect(timer2.currentTime).toBe(0);
    });
  });

  // --- Recording ---
  describe('RecordingState', () => {
    it('should default to not recording', () => {
      expect(service.getRecordingState()).toEqual({
        isRecording: false,
        isManualOverride: false,
      });
    });

    it('should set recording state', () => {
      const state = service.setRecordingState({ isRecording: true, isManualOverride: true });
      expect(state.isRecording).toBe(true);
      expect(state.isManualOverride).toBe(true);
    });

    it('should return a copy', () => {
      const s1 = service.getRecordingState();
      s1.isRecording = true;
      expect(service.getRecordingState().isRecording).toBe(false);
    });
  });

  // --- Loop State ---
  describe('LoopState', () => {
    it('should return default loop state', () => {
      const loop = service.getLoopState();
      expect(loop.videoIndex).toBe(0);
      expect(loop.videoPath).toBe('');
      expect(loop.isManualMode).toBe(false);
      expect(loop.updatedAt).toBeDefined();
    });

    it('should merge updates', () => {
      const loop = service.updateLoopState({ videoIndex: 3, videoPath: '/v/foo.mp4' });
      expect(loop.videoIndex).toBe(3);
      expect(loop.videoPath).toBe('/v/foo.mp4');
      expect(loop.isManualMode).toBe(false); // unchanged
    });

    it('should update timestamp on every update', () => {
      const before = Date.now();
      const loop = service.updateLoopState({ videoIndex: 1 });
      expect(loop.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  // --- TV Registration ---
  describe('TV Registration (Master-Slave)', () => {
    it('should assign first TV as master', () => {
      const { role, demoted } = service.registerTv('socket-1');
      expect(role).toBe('master');
      expect(demoted).toBeNull();
    });

    it('should assign subsequent TVs as slave', () => {
      service.registerTv('socket-1');
      const { role, demoted } = service.registerTv('socket-2');
      expect(role).toBe('slave');
      expect(demoted).toBeNull();
    });

    it('should report master status correctly', () => {
      service.registerTv('socket-1');
      service.registerTv('socket-2');
      expect(service.isTvMaster('socket-1')).toBe(true);
      expect(service.isTvMaster('socket-2')).toBe(false);
      expect(service.isTvMaster('socket-unknown')).toBe(false);
    });

    it('should unregister non-TV without side effects', () => {
      const result = service.unregisterTv('socket-unknown');
      expect(result).toEqual({ wasMaster: false, promoted: null });
    });

    it('should unregister slave without promotion', () => {
      service.registerTv('socket-1');
      service.registerTv('socket-2');
      const result = service.unregisterTv('socket-2');
      expect(result).toEqual({ wasMaster: false, promoted: null });
      expect(service.isTvMaster('socket-1')).toBe(true);
    });

    it('should promote oldest slave when master disconnects', () => {
      service.registerTv('socket-1'); // master
      service.registerTv('socket-2'); // slave (oldest)
      service.registerTv('socket-3'); // slave (newest)

      const result = service.unregisterTv('socket-1');
      expect(result.wasMaster).toBe(true);
      expect(result.promoted).toBe('socket-2');
      expect(service.isTvMaster('socket-2')).toBe(true);
      expect(service.isTvMaster('socket-3')).toBe(false);
    });

    it('should return promoted=null when master disconnects with no slaves', () => {
      service.registerTv('socket-1');
      const result = service.unregisterTv('socket-1');
      expect(result).toEqual({ wasMaster: true, promoted: null });
    });

    // E-23 US-23.3.1: Pi kiosk always master priority
    it('should give Pi kiosk (displayType=tv) master priority over PC', () => {
      // PC registers first as master
      service.registerTv('pc-socket', 'secondary');
      expect(service.isTvMaster('pc-socket')).toBe(true);

      // Pi kiosk registers — should take over as master
      const { role, demoted } = service.registerTv('pi-socket', 'tv');
      expect(role).toBe('master');
      expect(demoted).toBe('pc-socket');
      expect(service.isTvMaster('pi-socket')).toBe(true);
      expect(service.isTvMaster('pc-socket')).toBe(false);
    });

    it('should NOT demote an existing kiosk master when another kiosk registers', () => {
      // First kiosk is master
      service.registerTv('pi-1', 'tv');
      expect(service.isTvMaster('pi-1')).toBe(true);

      // Second kiosk registers — should become slave, not demote the first
      const { role, demoted } = service.registerTv('pi-2', 'tv');
      expect(role).toBe('slave');
      expect(demoted).toBeNull();
      expect(service.isTvMaster('pi-1')).toBe(true);
    });

    it('should NOT demote a kiosk master when a PC registers', () => {
      // Pi kiosk is master
      service.registerTv('pi-socket', 'tv');
      expect(service.isTvMaster('pi-socket')).toBe(true);

      // PC registers — should become slave
      const { role, demoted } = service.registerTv('pc-socket', 'secondary');
      expect(role).toBe('slave');
      expect(demoted).toBeNull();
      expect(service.isTvMaster('pi-socket')).toBe(true);
    });
  });

  // --- HDMI State (E-23) ---
  describe('HdmiState', () => {
    it('should return default HDMI state', () => {
      const state = service.getHdmiState();
      expect(state).toEqual({
        hdmi0: false,
        hdmi1: false,
        wrongPort: false,
        updatedAt: null,
      });
    });

    it('should update HDMI state partially', () => {
      const state = service.updateHdmiState({ hdmi0: true });
      expect(state.hdmi0).toBe(true);
      expect(state.hdmi1).toBe(false);
      expect(state.wrongPort).toBe(false);
      expect(state.updatedAt).toBeDefined();
    });

    it('should merge HDMI updates', () => {
      service.updateHdmiState({ hdmi0: true });
      const state = service.updateHdmiState({ hdmi1: true, wrongPort: true });
      expect(state.hdmi0).toBe(true);
      expect(state.hdmi1).toBe(true);
      expect(state.wrongPort).toBe(true);
    });

    it('should return a copy', () => {
      const s1 = service.getHdmiState();
      s1.hdmi0 = true;
      expect(service.getHdmiState().hdmi0).toBe(false);
    });
  });

  // --- Connected Clients (E-23 US-23.7.1) ---
  describe('ConnectedClients', () => {
    it('should return empty list by default', () => {
      expect(service.getConnectedClients()).toEqual([]);
    });

    it('should return registered clients with metadata', () => {
      service.registerTv('socket-1', 'tv', { userAgent: 'Mozilla/5.0 (Linux; aarch64)', ip: '192.168.1.10' });
      service.registerTv('socket-2', 'secondary', { userAgent: 'Mozilla/5.0 (Windows)', ip: '192.168.1.20' });
      const clients = service.getConnectedClients();
      expect(clients).toHaveLength(2);

      const master = clients.find(c => c.role === 'master');
      expect(master.socketId).toBe('socket-1');
      expect(master.displayType).toBe('tv');
      expect(master.userAgent).toContain('aarch64');
      expect(master.ip).toBe('192.168.1.10');

      const slave = clients.find(c => c.role === 'slave');
      expect(slave.socketId).toBe('socket-2');
      expect(slave.displayType).toBe('secondary');
    });

    it('should not include unregistered clients', () => {
      service.registerTv('socket-1', 'tv');
      service.registerTv('socket-2', 'secondary');
      service.unregisterTv('socket-2');
      expect(service.getConnectedClients()).toHaveLength(1);
    });
  });

  // --- Full State ---
  describe('getFullState', () => {
    it('should return all state objects including hdmiState', () => {
      const state = service.getFullState();
      expect(state).toHaveProperty('score');
      expect(state).toHaveProperty('phase');
      expect(state).toHaveProperty('options');
      expect(state).toHaveProperty('timer');
      expect(state).toHaveProperty('recordingState');
      expect(state).toHaveProperty('loopState');
      expect(state).toHaveProperty('hdmiState');
    });
  });

  // --- Transition Metrics (E-23 US-23.4.5 + US-23.6.5) ---
  describe('transitionMetrics', () => {
    it('should accumulate standard counters', () => {
      service.updateTransitionMetrics({ earlySwitchCount: 2, totalTransitions: 5 });
      service.updateTransitionMetrics({ earlySwitchCount: 1, totalTransitions: 3 });
      const m = service.getTransitionMetrics();
      expect(m.earlySwitchCount).toBe(3);
      expect(m.totalTransitions).toBe(8);
    });

    it('should accumulate dual-display metrics', () => {
      service.updateTransitionMetrics({ dualDisplayTransitions: 1 });
      service.updateTransitionMetrics({ dualDisplayTransitions: 2, dualDisplayRestarts: 1 });
      const m = service.getTransitionMetrics();
      expect(m.dualDisplayTransitions).toBe(3);
      expect(m.dualDisplayRestarts).toBe(1);
    });

    it('should accumulate failover metrics', () => {
      service.updateTransitionMetrics({ failoverCount: 1 });
      service.updateTransitionMetrics({ failoverRecoveryCount: 1, failoverDurationMs: 5000 });
      const m = service.getTransitionMetrics();
      expect(m.failoverCount).toBe(1);
      expect(m.failoverRecoveryCount).toBe(1);
      expect(m.failoverDurationMs).toBe(5000);
    });

    it('should reset counters but keep boot and failover duration on getAndReset', () => {
      service.setBootToVideoMs(1200);
      service.updateTransitionMetrics({
        totalTransitions: 10,
        failoverCount: 2,
        failoverDurationMs: 3000,
        dualDisplayTransitions: 3,
      });
      const m = service.getAndResetTransitionMetrics();
      expect(m.totalTransitions).toBe(10);
      expect(m.failoverCount).toBe(2);
      expect(m.dualDisplayTransitions).toBe(3);
      expect(m.bootToVideoMs).toBe(1200);
      expect(m.failoverDurationMs).toBe(3000);

      // After reset, counters should be 0 but one-shot values preserved
      const after = service.getTransitionMetrics();
      expect(after.totalTransitions).toBe(0);
      expect(after.failoverCount).toBe(0);
      expect(after.dualDisplayTransitions).toBe(0);
      expect(after.bootToVideoMs).toBe(1200);
      expect(after.failoverDurationMs).toBe(3000);
    });
  });
});
