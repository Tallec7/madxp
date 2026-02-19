const fs = require('fs');
const LicenseService = require('../services/license.service');

// Mock fs
jest.mock('fs');

describe('LicenseService', () => {
  const CACHE_PATH = '/tmp/test_license_cache.json';
  let service;

  beforeEach(() => {
    service = new LicenseService({ licenseCachePath: CACHE_PATH });
    jest.clearAllMocks();
  });

  it('should return CONNECTION_WARNING when no cache file', () => {
    fs.existsSync.mockReturnValue(false);

    const status = service.getStatus();
    expect(status.status).toBe('CONNECTION_WARNING');
    expect(status.reason).toBe('no_cache');
    expect(status.needs_connection).toBe(true);
  });

  it('should return cached data when last_server_check is recent', () => {
    const now = new Date();
    const cacheData = {
      status: 'ACTIVE',
      last_server_check: now.toISOString(),
    };

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(cacheData));

    const status = service.getStatus();
    expect(status.status).toBe('ACTIVE');
    expect(status.days_since_check).toBe(0);
  });

  it('should return GRACE_PERIOD when 8-14 days old', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const cacheData = {
      status: 'ACTIVE',
      last_server_check: pastDate.toISOString(),
    };

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(cacheData));

    const status = service.getStatus();
    expect(status.status).toBe('GRACE_PERIOD');
    expect(status.reason).toBe('connection_grace');
    expect(status.needs_connection).toBe(true);
    expect(status.days_until_block).toBeGreaterThan(0);
  });

  it('should return BLOCKED when > 14 days old', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 20);
    const cacheData = {
      status: 'ACTIVE',
      last_server_check: pastDate.toISOString(),
    };

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(cacheData));

    const status = service.getStatus();
    expect(status.status).toBe('BLOCKED');
    expect(status.reason).toBe('connection_required');
    expect(status.needs_connection).toBe(true);
    expect(status.can_auto_unblock).toBe(true);
  });

  it('should return cached data without days_since_check when no last_server_check', () => {
    const cacheData = {
      status: 'ACTIVE',
      plan: 'pro',
    };

    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(cacheData));

    const status = service.getStatus();
    expect(status.status).toBe('ACTIVE');
    expect(status.plan).toBe('pro');
    expect(status.days_since_check).toBeUndefined();
  });
});
