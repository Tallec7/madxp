const fs = require('fs');
const bcrypt = require('bcryptjs');
const ProfilePinService = require('../services/profile-pin.service');

jest.mock('fs');

describe('ProfilePinService', () => {
  const PROFILES_DIR = '/tmp/profiles';
  const PROFILE_ID = 'profile-abc';
  let service;

  beforeEach(() => {
    service = new ProfilePinService({ profilesDir: PROFILES_DIR });
    jest.clearAllMocks();
  });

  const mockPinFile = (hash, required = true) => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(
      JSON.stringify({
        remote_pin_required: required,
        remote_pin_hash: hash,
        remote_pin_updated_at: new Date().toISOString(),
      })
    );
  };

  describe('isPinRequired', () => {
    it('returns false if file absent', () => {
      fs.existsSync.mockReturnValue(false);
      expect(service.isPinRequired(PROFILE_ID)).toBe(false);
    });

    it('returns false if remote_pin_required=false', () => {
      mockPinFile('$2a$12$hash', false);
      expect(service.isPinRequired(PROFILE_ID)).toBe(false);
    });

    it('returns true if required and hash present', () => {
      mockPinFile('$2a$12$hash', true);
      expect(service.isPinRequired(PROFILE_ID)).toBe(true);
    });

    it('returns false on malformed JSON', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{not json');
      expect(service.isPinRequired(PROFILE_ID)).toBe(false);
    });
  });

  describe('verify', () => {
    it('rejects missing profileId', async () => {
      const r = await service.verify({ pin: '1234' });
      expect(r.status).toBe(400);
    });

    it('rejects invalid PIN format', async () => {
      const r = await service.verify({ profileId: PROFILE_ID, pin: 'abcd' });
      expect(r.status).toBe(400);
    });

    it('returns success=true with pinRequired=false when no PIN configured', async () => {
      fs.existsSync.mockReturnValue(false);
      const r = await service.verify({ profileId: PROFILE_ID, pin: '1234', ip: '1.1.1.1' });
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      expect(r.body.pinRequired).toBe(false);
    });

    it('returns success when PIN matches bcrypt hash', async () => {
      const hash = await bcrypt.hash('4242', 4);
      mockPinFile(hash, true);
      const r = await service.verify({ profileId: PROFILE_ID, pin: '4242', ip: '1.1.1.1' });
      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      expect(r.body.pinRequired).toBe(true);
    });

    it('returns 401 when PIN does not match', async () => {
      const hash = await bcrypt.hash('4242', 4);
      mockPinFile(hash, true);
      const r = await service.verify({ profileId: PROFILE_ID, pin: '0000', ip: '1.1.1.1' });
      expect(r.status).toBe(401);
    });

    it('locks out after 5 failures from same ip', async () => {
      const hash = await bcrypt.hash('4242', 4);
      mockPinFile(hash, true);
      const ip = '2.2.2.2';
      for (let i = 0; i < 5; i++) {
         
        await service.verify({ profileId: PROFILE_ID, pin: '0000', ip });
      }
      const r = await service.verify({ profileId: PROFILE_ID, pin: '4242', ip });
      expect(r.status).toBe(429);
      expect(r.body.retryInMs).toBeGreaterThan(0);
    });

    it('clears lockout on successful verification', async () => {
      const hash = await bcrypt.hash('4242', 4);
      mockPinFile(hash, true);
      const ip = '3.3.3.3';
      await service.verify({ profileId: PROFILE_ID, pin: '0000', ip });
      await service.verify({ profileId: PROFILE_ID, pin: '0000', ip });
      const ok = await service.verify({ profileId: PROFILE_ID, pin: '4242', ip });
      expect(ok.status).toBe(200);
      // Next failed attempt should be counted fresh (not locked)
      const after = await service.verify({ profileId: PROFILE_ID, pin: '0000', ip });
      expect(after.status).toBe(401);
    });
  });
});
