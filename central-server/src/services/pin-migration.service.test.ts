/**
 * Unit tests — ADR-058 Phase 2A pin-migration.service.
 */

import bcrypt from 'bcryptjs';
import { migrateLegacyPinToDefaultProfile } from './pin-migration.service';
import { configProfileRepository } from '../repositories/config-profile.repository';
import { siteRepository } from '../repositories/site.repository';
import metricsService from './metrics.service';

jest.mock('bcryptjs', () => ({ hash: jest.fn() }));
jest.mock('../repositories/config-profile.repository', () => ({
  configProfileRepository: {
    findProfilesMetadata: jest.fn(),
    setPin: jest.fn(),
  },
}));
jest.mock('../repositories/site.repository', () => ({
  siteRepository: {
    clearRemotePin: jest.fn(),
  },
}));
jest.mock('./metrics.service', () => ({
  __esModule: true,
  default: {
    recordLegacyPinMigration: jest.fn(),
  },
}));
jest.mock('../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const findProfilesMetadata = configProfileRepository.findProfilesMetadata as jest.Mock;
const setPin = configProfileRepository.setPin as jest.Mock;
const clearRemotePin = siteRepository.clearRemotePin as jest.Mock;
const recordMigration = metricsService.recordLegacyPinMigration as jest.Mock;

function profile(overrides: Record<string, unknown>) {
  return {
    id: 'p1',
    name: 'default',
    display_name: null,
    city: null,
    sport: null,
    is_default: true,
    sort_order: 0,
    remote_pin_required: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('migrateLegacyPinToDefaultProfile (ADR-058 Phase 2A)', () => {
  it('migrates the legacy PIN to the default profile with bcrypt rounds=12 and clears the site hash', async () => {
    findProfilesMetadata.mockResolvedValueOnce([profile({})]);
    (bcrypt.hash as jest.Mock).mockResolvedValueOnce('$2b$12$bcryptedhash');

    const result = await migrateLegacyPinToDefaultProfile('site-1', '1234');

    expect(result).toBe('success');
    expect(bcrypt.hash).toHaveBeenCalledWith('1234', 12);
    expect(setPin).toHaveBeenCalledWith('p1', {
      hash: '$2b$12$bcryptedhash',
      required: true,
    });
    expect(clearRemotePin).toHaveBeenCalledWith('site-1');
    expect(recordMigration).toHaveBeenCalledWith('success');
  });

  it('skips migration when no default profile exists', async () => {
    findProfilesMetadata.mockResolvedValueOnce([
      profile({ is_default: false, id: 'p2' }),
    ]);

    const result = await migrateLegacyPinToDefaultProfile('site-1', '1234');

    expect(result).toBe('skipped_no_default');
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(setPin).not.toHaveBeenCalled();
    expect(clearRemotePin).not.toHaveBeenCalled();
    expect(recordMigration).toHaveBeenCalledWith('skipped_no_default');
  });

  it('skips migration when the default profile already has a PIN (no overwrite)', async () => {
    findProfilesMetadata.mockResolvedValueOnce([
      profile({ remote_pin_required: true }),
    ]);

    const result = await migrateLegacyPinToDefaultProfile('site-1', '1234');

    expect(result).toBe('skipped_already_set');
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(setPin).not.toHaveBeenCalled();
    expect(clearRemotePin).not.toHaveBeenCalled();
    expect(recordMigration).toHaveBeenCalledWith('skipped_already_set');
  });

  it('returns "failed" and records metric when an error is thrown (non-fatal)', async () => {
    findProfilesMetadata.mockRejectedValueOnce(new Error('db down'));

    const result = await migrateLegacyPinToDefaultProfile('site-1', '1234');

    expect(result).toBe('failed');
    expect(recordMigration).toHaveBeenCalledWith('failed');
  });
});
