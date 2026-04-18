/**
 * Remote PIN Middleware tests — ADR-058 Phase 1
 *
 * Vérifie les 3 chemins principaux :
 *   1. Aucun PIN configuré (profil OU site legacy) → next() sans token
 *   2. PIN requis + token profile-scope valide → next() + req.remoteProfile
 *   3. PIN requis + token legacy site-scope valide → next()
 *   + cas d'erreur : pas de token (401), token révoqué (401), token expiré (401),
 *     signature invalide (401), siteId mismatch (401).
 */

process.env.JWT_SECRET = 'test-secret-for-remote-pin-middleware';

import { Request, Response, NextFunction } from 'express';

jest.mock('../repositories', () => ({
  siteRepository: {
    getRemotePinHash: jest.fn(),
  },
}));

jest.mock('../repositories/config-profile.repository', () => ({
  configProfileRepository: {
    findBySite: jest.fn(),
  },
  profileDeviceTokenRepository: {
    findByHash: jest.fn(),
    touchLastUsed: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import jwt from 'jsonwebtoken';
import {
  verifyRemotePin,
  generateRemotePinToken,
  generateRemoteProfilePinToken,
  hashDeviceToken,
} from './remote-pin.middleware';
import { siteRepository } from '../repositories';
import {
  configProfileRepository,
  profileDeviceTokenRepository,
} from '../repositories/config-profile.repository';

const createRes = (): Response => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
};

const makeReq = (overrides: Partial<Request> = {}): Request =>
  ({
    params: { siteId: 'site-1' },
    headers: {},
    body: {},
    ...overrides,
  } as unknown as Request);

beforeEach(() => {
  jest.clearAllMocks();
  (siteRepository.getRemotePinHash as jest.Mock).mockResolvedValue(null);
  (configProfileRepository.findBySite as jest.Mock).mockResolvedValue([]);
});

describe('verifyRemotePin — passthrough', () => {
  it('calls next() when no profile PIN and no legacy site PIN are configured', async () => {
    const req = makeReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await verifyRemotePin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 when siteId is missing', async () => {
    const req = makeReq({ params: {} as Request['params'] });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await verifyRemotePin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('verifyRemotePin — profile-scoped token', () => {
  beforeEach(() => {
    (configProfileRepository.findBySite as jest.Mock).mockResolvedValue([
      { id: 'profile-1', remote_pin_required: true },
    ]);
  });

  it('returns 401 when no token is provided and a PIN is required', async () => {
    const req = makeReq();
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await verifyRemotePin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when JWT signature is invalid', async () => {
    const req = makeReq({ headers: { 'x-remote-token': 'not-a-jwt' } });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await verifyRemotePin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the profile token siteId does not match the URL siteId', async () => {
    const token = generateRemoteProfilePinToken({
      siteId: 'OTHER-SITE',
      profileId: 'profile-1',
      deviceId: 'dev-1',
      tokenId: 'token-1',
    });
    const req = makeReq({ headers: { 'x-remote-token': token } });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await verifyRemotePin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when the device token has been revoked (DB row absent)', async () => {
    const token = generateRemoteProfilePinToken({
      siteId: 'site-1',
      profileId: 'profile-1',
      deviceId: 'dev-1',
      tokenId: 'token-1',
    });
    (profileDeviceTokenRepository.findByHash as jest.Mock).mockResolvedValueOnce(null);

    const req = makeReq({ headers: { 'x-remote-token': token } });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await verifyRemotePin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and exposes req.remoteProfile when token is valid and active', async () => {
    const token = generateRemoteProfilePinToken({
      siteId: 'site-1',
      profileId: 'profile-1',
      deviceId: 'dev-1',
      tokenId: 'token-1',
    });
    (profileDeviceTokenRepository.findByHash as jest.Mock).mockResolvedValueOnce({
      id: 'token-1',
      profile_id: 'profile-1',
    });

    const req = makeReq({ headers: { 'x-remote-token': token } });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await verifyRemotePin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(profileDeviceTokenRepository.findByHash).toHaveBeenCalledWith(hashDeviceToken(token));
    const tagged = req as Request & { remoteProfile?: { profileId: string; siteId: string } };
    expect(tagged.remoteProfile).toMatchObject({
      profileId: 'profile-1',
      siteId: 'site-1',
    });
  });

  it('falls back permissively (next) when profile_device_tokens lookup throws (pre-migration)', async () => {
    const token = generateRemoteProfilePinToken({
      siteId: 'site-1',
      profileId: 'profile-1',
      deviceId: 'dev-1',
      tokenId: 'token-1',
    });
    (profileDeviceTokenRepository.findByHash as jest.Mock).mockRejectedValueOnce(
      new Error('relation does not exist')
    );

    const req = makeReq({ headers: { 'x-remote-token': token } });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await verifyRemotePin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('verifyRemotePin — legacy site-scope token', () => {
  beforeEach(() => {
    // No profile PIN, but a legacy site hash is present
    (siteRepository.getRemotePinHash as jest.Mock).mockResolvedValue('some-legacy-hash');
  });

  it('accepts a valid legacy site-scope token', async () => {
    const token = generateRemotePinToken('site-1');
    const req = makeReq({ headers: { 'x-remote-token': token } });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await verifyRemotePin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a legacy token signed for a different siteId', async () => {
    const token = generateRemotePinToken('OTHER-SITE');
    const req = makeReq({ headers: { 'x-remote-token': token } });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await verifyRemotePin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 (TokenExpired) when a legacy token is expired', async () => {
    const expired = jwt.sign(
      { siteId: 'site-1', type: 'remote-pin' },
      process.env.JWT_SECRET as string,
      { expiresIn: -10 }
    );
    const req = makeReq({ headers: { 'x-remote-token': expired } });
    const res = createRes();
    const next = jest.fn() as NextFunction;

    await verifyRemotePin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.error).toMatch(/expir/i);
  });
});
