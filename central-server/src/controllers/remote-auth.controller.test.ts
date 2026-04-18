/**
 * Remote Auth Controller tests — ADR-058 Phase 1
 *
 * Couvre :
 * - requireSuperAdmin (403 pour non-admin)
 * - setProfilePin : clear (pin=null) et set (pin="1234") → bcrypt + revokeAll + sync
 * - listProfileDevices : shape de réponse
 * - revokeProfileDevice / revokeAllProfileDevices
 * - verifyProfilePin : profile not found (404), no PIN (400), wrong PIN (401),
 *   correct PIN (200 + token), lockout brute-force (429)
 */

import { Request, Response } from 'express';

// --- Mocks BEFORE imports ---

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('bcrypt-hash'),
  compare: jest.fn(),
}));

jest.mock('uuid', () => ({ v4: () => 'token-uuid-1' }));

jest.mock('../repositories/config-profile.repository', () => ({
  configProfileRepository: {
    findById: jest.fn(),
    findPin: jest.fn(),
    setPin: jest.fn(),
  },
  profileDeviceTokenRepository: {
    revokeAllForProfile: jest.fn(),
    findActiveByProfile: jest.fn(),
    revoke: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('../services/profile-sync.service', () => ({
  sendSyncProfilesToSite: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../middleware/remote-pin.middleware', () => ({
  generateRemoteProfilePinToken: jest.fn().mockReturnValue('jwt.token.signed'),
  hashDeviceToken: jest.fn().mockReturnValue('sha256-of-token'),
}));

jest.mock('../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../services/metrics.service', () => ({
  __esModule: true,
  default: {
    recordProfilePinVerification: jest.fn(),
  },
}));

import bcrypt from 'bcryptjs';
import {
  setProfilePin,
  listProfileDevices,
  revokeProfileDevice,
  revokeAllProfileDevices,
  verifyProfilePin,
} from './remote-auth.controller';
import {
  configProfileRepository,
  profileDeviceTokenRepository,
} from '../repositories/config-profile.repository';
import { sendSyncProfilesToSite } from '../services/profile-sync.service';
import { AuthRequest } from '../types';

const createRes = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

const asAdminReq = (overrides: Partial<AuthRequest> = {}): AuthRequest =>
  ({
    user: { id: 'u1', email: 'admin@neopro.tv', role: 'super_admin' },
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as AuthRequest);

beforeEach(() => {
  jest.clearAllMocks();
  (configProfileRepository.findById as jest.Mock).mockResolvedValue({
    id: 'profile-1',
    site_id: 'site-1',
  });
  (profileDeviceTokenRepository.revokeAllForProfile as jest.Mock).mockResolvedValue(3);
});

describe('remote-auth.controller — authz gate (super_admin or own club)', () => {
  it('setProfilePin — returns 403 for admin role (not super_admin, not club)', async () => {
    const req = asAdminReq({
      user: { id: 'u1', email: 'u@x.com', role: 'admin' },
      params: { siteId: 'site-1', profileId: 'profile-1' },
      body: { pin: '1234' },
    });
    const res = createRes();
    await setProfilePin(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it('listProfileDevices — returns 403 when club user accesses a foreign site', async () => {
    const req = asAdminReq({
      user: { id: 'u1', email: 'u@x.com', role: 'club', site_id: 'OTHER-SITE' },
      params: { siteId: 'site-1', profileId: 'profile-1' },
    });
    const res = createRes();
    await listProfileDevices(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('revokeAllProfileDevices — returns 403 for operator role', async () => {
    const req = asAdminReq({
      user: { id: 'u1', email: 'u@x.com', role: 'operator' },
      params: { siteId: 'site-1', profileId: 'profile-1' },
      body: {},
    });
    const res = createRes();
    await revokeAllProfileDevices(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  // --- Phase 2B : club peut gérer le PIN de son propre site ---

  it('setProfilePin — allows club user on own site (Phase 2B)', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValueOnce('$2b$12$hash');
    (configProfileRepository.setPin as jest.Mock).mockResolvedValueOnce(undefined);
    const req = asAdminReq({
      user: { id: 'u1', email: 'club@x.com', role: 'club', site_id: 'site-1' },
      params: { siteId: 'site-1', profileId: 'profile-1' },
      body: { pin: '1234' },
    });
    const res = createRes();
    await setProfilePin(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(bcrypt.hash).toHaveBeenCalledWith('1234', 12);
  });

  it('listProfileDevices — allows club user on own site (Phase 2B)', async () => {
    (profileDeviceTokenRepository.findActiveByProfile as jest.Mock).mockResolvedValueOnce([]);
    const req = asAdminReq({
      user: { id: 'u1', email: 'club@x.com', role: 'club', site_id: 'site-1' },
      params: { siteId: 'site-1', profileId: 'profile-1' },
    });
    const res = createRes();
    await listProfileDevices(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ devices: [] });
  });
});

describe('setProfilePin', () => {
  it('returns 404 when profile does not belong to site', async () => {
    (configProfileRepository.findById as jest.Mock).mockResolvedValueOnce({
      id: 'profile-1',
      site_id: 'OTHER-SITE',
    });
    const req = asAdminReq({
      params: { siteId: 'site-1', profileId: 'profile-1' },
      body: { pin: '1234' },
    });
    const res = createRes();
    await setProfilePin(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(configProfileRepository.setPin).not.toHaveBeenCalled();
  });

  it('clears the PIN when pin is null, revokes tokens, and syncs', async () => {
    const req = asAdminReq({
      params: { siteId: 'site-1', profileId: 'profile-1' },
      body: { pin: null },
    });
    const res = createRes();
    await setProfilePin(req, res);

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(configProfileRepository.setPin).toHaveBeenCalledWith('profile-1', {
      hash: null,
      required: false,
    });
    expect(profileDeviceTokenRepository.revokeAllForProfile).toHaveBeenCalledWith(
      'profile-1',
      'pin_cleared'
    );
    expect(sendSyncProfilesToSite).toHaveBeenCalledWith('site-1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      pin_required: false,
      revoked_tokens: 3,
    });
  });

  it('hashes the PIN with bcrypt rounds=12 and revokes active tokens', async () => {
    const req = asAdminReq({
      params: { siteId: 'site-1', profileId: 'profile-1' },
      body: { pin: '9876' },
    });
    const res = createRes();
    await setProfilePin(req, res);

    expect(bcrypt.hash).toHaveBeenCalledWith('9876', 12);
    expect(configProfileRepository.setPin).toHaveBeenCalledWith('profile-1', {
      hash: 'bcrypt-hash',
      required: true,
    });
    expect(profileDeviceTokenRepository.revokeAllForProfile).toHaveBeenCalledWith(
      'profile-1',
      'pin_changed'
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      pin_required: true,
      revoked_tokens: 3,
    });
  });

  it('still returns success if sync_profiles fails (non-fatal)', async () => {
    (sendSyncProfilesToSite as jest.Mock).mockRejectedValueOnce(new Error('pi offline'));
    const req = asAdminReq({
      params: { siteId: 'site-1', profileId: 'profile-1' },
      body: { pin: '1234' },
    });
    const res = createRes();
    await setProfilePin(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, pin_required: true })
    );
  });
});

describe('listProfileDevices', () => {
  it('returns only public fields', async () => {
    (profileDeviceTokenRepository.findActiveByProfile as jest.Mock).mockResolvedValueOnce([
      {
        id: 'tok-1',
        device_id: 'dev-1',
        label: 'iPad régie',
        token_hash: 'SECRET',
        created_at: 'c',
        last_used_at: 'l',
        expires_at: 'e',
      },
    ]);
    const req = asAdminReq({
      params: { siteId: 'site-1', profileId: 'profile-1' },
    });
    const res = createRes();
    await listProfileDevices(req, res);

    expect(res.json).toHaveBeenCalledWith({
      devices: [
        {
          id: 'tok-1',
          device_id: 'dev-1',
          label: 'iPad régie',
          created_at: 'c',
          last_used_at: 'l',
          expires_at: 'e',
        },
      ],
    });
    // token_hash MUST NOT leak
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(JSON.stringify(payload)).not.toContain('SECRET');
  });
});

describe('revokeProfileDevice / revokeAllProfileDevices', () => {
  it('revokeProfileDevice calls repository.revoke with tokenId', async () => {
    const req = asAdminReq({
      params: { siteId: 'site-1', profileId: 'profile-1', tokenId: 'tok-42' },
    });
    const res = createRes();
    await revokeProfileDevice(req, res);
    expect(profileDeviceTokenRepository.revoke).toHaveBeenCalledWith('tok-42', 'manual');
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('revokeAllProfileDevices forwards reason', async () => {
    (profileDeviceTokenRepository.revokeAllForProfile as jest.Mock).mockResolvedValueOnce(7);
    const req = asAdminReq({
      params: { siteId: 'site-1', profileId: 'profile-1' },
      body: { reason: 'compromise' },
    });
    const res = createRes();
    await revokeAllProfileDevices(req, res);
    expect(profileDeviceTokenRepository.revokeAllForProfile).toHaveBeenCalledWith(
      'profile-1',
      'compromise'
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, revoked: 7 });
  });
});

describe('verifyProfilePin (public endpoint)', () => {
  const publicReq = (overrides: Partial<Request> = {}): Request =>
    ({
      ip: '10.0.0.1',
      params: { siteId: 'site-1', profileId: 'profile-1' },
      body: { pin: '1234', deviceId: 'dev-1', label: 'iPad' },
      headers: {},
      ...overrides,
    } as unknown as Request);

  it('returns 404 when the profile does not belong to the site', async () => {
    (configProfileRepository.findById as jest.Mock).mockResolvedValueOnce({
      id: 'profile-1',
      site_id: 'OTHER',
    });
    const res = createRes();
    await verifyProfilePin(publicReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when no PIN is configured on the profile', async () => {
    (configProfileRepository.findPin as jest.Mock).mockResolvedValueOnce({
      remote_pin_required: false,
      remote_pin_hash: null,
    });
    const res = createRes();
    await verifyProfilePin(publicReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 401 with attemptsRemaining when PIN is wrong', async () => {
    (configProfileRepository.findPin as jest.Mock).mockResolvedValueOnce({
      remote_pin_required: true,
      remote_pin_hash: 'stored-hash',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

    const res = createRes();
    await verifyProfilePin(
      publicReq({ ip: '10.0.0.42', params: { siteId: 'site-1', profileId: 'profile-wrong' } }),
      res
    );

    expect(bcrypt.compare).toHaveBeenCalledWith('1234', 'stored-hash');
    expect(res.status).toHaveBeenCalledWith(401);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.error).toBe('PIN incorrect');
    expect(payload.attemptsRemaining).toBe(4);
  });

  it('returns 200 + token and persists a device_token row on success', async () => {
    (configProfileRepository.findPin as jest.Mock).mockResolvedValueOnce({
      remote_pin_required: true,
      remote_pin_hash: 'stored-hash',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    (profileDeviceTokenRepository.create as jest.Mock).mockResolvedValueOnce({ id: 'token-uuid-1' });

    const res = createRes();
    await verifyProfilePin(publicReq(), res);

    expect(profileDeviceTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'token-uuid-1',
        profileId: 'profile-1',
        siteId: 'site-1',
        deviceId: 'dev-1',
        label: 'iPad',
        tokenHash: 'sha256-of-token',
      })
    );
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({
        success: true,
        token: 'jwt.token.signed',
        tokenId: 'token-uuid-1',
      })
    );
  });

  it('locks out after 5 failed attempts per (ip, profileId)', async () => {
    (configProfileRepository.findPin as jest.Mock).mockResolvedValue({
      remote_pin_required: true,
      remote_pin_hash: 'stored-hash',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const ip = '10.0.0.77';
    const profileId = 'profile-lockout';

    for (let i = 0; i < 5; i++) {
      const res = createRes();
      await verifyProfilePin(
        publicReq({ ip, params: { siteId: 'site-1', profileId } }),
        res
      );
      expect(res.status).toHaveBeenLastCalledWith(401);
    }

    const res6 = createRes();
    await verifyProfilePin(
      publicReq({ ip, params: { siteId: 'site-1', profileId } }),
      res6
    );
    expect(res6.status).toHaveBeenCalledWith(429);
    const payload = (res6.json as jest.Mock).mock.calls[0][0];
    expect(payload.retryAfter).toBeGreaterThan(0);
  });
});
