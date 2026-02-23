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
      const role = service.registerTv('socket-1');
      expect(role).toBe('master');
    });

    it('should assign subsequent TVs as slave', () => {
      service.registerTv('socket-1');
      const role = service.registerTv('socket-2');
      expect(role).toBe('slave');
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
  });

  // --- Full State ---
  describe('getFullState', () => {
    it('should return all state objects', () => {
      const state = service.getFullState();
      expect(state).toHaveProperty('score');
      expect(state).toHaveProperty('phase');
      expect(state).toHaveProperty('options');
      expect(state).toHaveProperty('timer');
      expect(state).toHaveProperty('recordingState');
      expect(state).toHaveProperty('loopState');
    });
  });
});
