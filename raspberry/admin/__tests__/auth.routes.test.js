/**
 * Tests for routes/auth.js — session management, rate limiting, CSRF, middleware
 */

// =============================================================================
// Mocks — must be set up BEFORE require('routes/auth')
// =============================================================================

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      readFile: jest.fn(),
      writeFile: jest.fn().mockResolvedValue(undefined),
      mkdir: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const fs = require('fs').promises;
const path = require('path');
const { NEOPRO_DIR } = require('../helpers');

// Default: loadSessions finds no file, getAdminPassword returns 'admin123'
const CONFIG_PATH = path.join(NEOPRO_DIR, 'webapp', 'configuration.json');

function mockConfigFile(password) {
  const config = password !== null
    ? { auth: { password } }
    : {}; // no password set
  fs.readFile.mockImplementation(async (filePath) => {
    if (filePath === CONFIG_PATH) {
      return JSON.stringify(config);
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

// Before requiring auth module, set up the default mock so loadSessions()
// (called at module level) doesn't blow up.
fs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

const authRouter = require('../routes/auth');
const { requireAuth, requireCsrf, validateSession } = authRouter;

// =============================================================================
// Helpers — mock Express req/res/next
// =============================================================================

function mockReq(overrides = {}) {
  return {
    path: '/api/test',
    method: 'POST',
    ip: '192.168.1.100',
    body: {},
    cookies: {},
    headers: {},
    socket: { remoteAddress: '192.168.1.100' },
    secure: false,
    ...overrides,
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    _json: null,
    _redirectUrl: null,
    _cookies: {},
    _clearedCookies: [],
    _sentHtml: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res._json = data;
      return res;
    },
    send(html) {
      res._sentHtml = html;
      return res;
    },
    redirect(url) {
      res._redirectUrl = url;
      return res;
    },
    cookie(name, value, options) {
      res._cookies[name] = { value, options };
      return res;
    },
    clearCookie(name, options) {
      res._clearedCookies.push({ name, options });
      return res;
    },
  };
  return res;
}

// =============================================================================
// Helper: perform a login via the route handler
// =============================================================================

function findRouteHandler(method, routePath) {
  const stack = authRouter.stack || [];
  for (const layer of stack) {
    if (layer.route && layer.route.path === routePath) {
      const handler = layer.route.methods[method]
        ? layer.route.stack.find(s => s.method === method)
        : null;
      if (handler) return handler.handle;
    }
  }
  return null;
}

async function loginAndGetTokens(password = 'admin123') {
  mockConfigFile(password);

  const handler = findRouteHandler('post', '/api/auth/login');
  const req = mockReq({
    path: '/api/auth/login',
    method: 'POST',
    body: { password },
  });
  const res = mockRes();

  await handler(req, res);

  if (!res._json?.success) {
    throw new Error(`Login failed: ${JSON.stringify(res._json)}`);
  }

  return {
    sessionToken: res._cookies.admin_session?.value,
    csrfToken: res._cookies.admin_csrf?.value,
  };
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

describe('Session management', () => {
  beforeEach(() => {
    // Reset mocks
    fs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    fs.writeFile.mockResolvedValue(undefined);
    fs.mkdir.mockResolvedValue(undefined);
  });

  it('createSession + validateSession: newly created session is valid', async () => {
    const { sessionToken } = await loginAndGetTokens();
    expect(sessionToken).toBeTruthy();
    expect(typeof sessionToken).toBe('string');
    expect(sessionToken.length).toBe(64); // 32 bytes hex
    expect(validateSession(sessionToken)).toBe(true);
  });

  it('validateSession returns false for unknown token', () => {
    expect(validateSession('nonexistent-token')).toBe(false);
  });

  it('validateSession returns false for null/undefined', () => {
    expect(validateSession(null)).toBe(false);
    expect(validateSession(undefined)).toBe(false);
    expect(validateSession('')).toBe(false);
  });

  it('destroySession: logout invalidates the session', async () => {
    const { sessionToken } = await loginAndGetTokens();
    expect(validateSession(sessionToken)).toBe(true);

    // Logout
    const logoutHandler = findRouteHandler('post', '/api/auth/logout');
    const req = mockReq({
      path: '/api/auth/logout',
      method: 'POST',
      cookies: { admin_session: sessionToken },
    });
    const res = mockRes();
    logoutHandler(req, res);

    expect(res._json).toEqual({ success: true });
    expect(validateSession(sessionToken)).toBe(false);
  });

  it('auth/status returns authenticated=true with valid session', async () => {
    const { sessionToken, csrfToken } = await loginAndGetTokens();

    const statusHandler = findRouteHandler('get', '/api/auth/status');
    const req = mockReq({
      path: '/api/auth/status',
      method: 'GET',
      cookies: { admin_session: sessionToken },
    });
    const res = mockRes();
    statusHandler(req, res);

    expect(res._json.authenticated).toBe(true);
    expect(res._json.csrfToken).toBe(csrfToken);
  });

  it('auth/status returns authenticated=false without session', () => {
    const statusHandler = findRouteHandler('get', '/api/auth/status');
    const req = mockReq({
      path: '/api/auth/status',
      method: 'GET',
      cookies: {},
    });
    const res = mockRes();
    statusHandler(req, res);

    expect(res._json.authenticated).toBe(false);
    expect(res._json.csrfToken).toBeNull();
  });

  it('session token is 64-char hex (32 bytes)', async () => {
    const { sessionToken } = await loginAndGetTokens();
    expect(sessionToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('CSRF token is 32-char hex (16 bytes)', async () => {
    const { csrfToken } = await loginAndGetTokens();
    expect(csrfToken).toMatch(/^[a-f0-9]{32}$/);
  });

  it('multiple logins create distinct sessions', async () => {
    const first = await loginAndGetTokens();
    const second = await loginAndGetTokens();
    expect(first.sessionToken).not.toBe(second.sessionToken);
    expect(first.csrfToken).not.toBe(second.csrfToken);
    // Both valid
    expect(validateSession(first.sessionToken)).toBe(true);
    expect(validateSession(second.sessionToken)).toBe(true);
  });
});

// =============================================================================
// LOGIN ROUTE
// =============================================================================

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    fs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    fs.writeFile.mockResolvedValue(undefined);
    fs.mkdir.mockResolvedValue(undefined);
  });

  it('returns 400 when password is missing', async () => {
    mockConfigFile('admin123');
    const handler = findRouteHandler('post', '/api/auth/login');
    const req = mockReq({ path: '/api/auth/login', body: {} });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res._json.success).toBe(false);
  });

  it('returns 401 for wrong password', async () => {
    mockConfigFile('admin123');
    const handler = findRouteHandler('post', '/api/auth/login');
    const req = mockReq({ path: '/api/auth/login', body: { password: 'wrong' } });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res._json.success).toBe(false);
  });

  it('returns 403 when no password configured', async () => {
    mockConfigFile(null);
    const handler = findRouteHandler('post', '/api/auth/login');
    const req = mockReq({ path: '/api/auth/login', body: { password: 'something' } });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res._json.success).toBe(false);
  });

  it('succeeds with correct password and sets cookies', async () => {
    mockConfigFile('admin123');
    const handler = findRouteHandler('post', '/api/auth/login');
    const req = mockReq({ path: '/api/auth/login', body: { password: 'admin123' } });
    const res = mockRes();
    await handler(req, res);

    expect(res._json.success).toBe(true);
    expect(res._cookies.admin_session).toBeDefined();
    expect(res._cookies.admin_session.options.httpOnly).toBe(true);
    expect(res._cookies.admin_csrf).toBeDefined();
    expect(res._cookies.admin_csrf.options.httpOnly).toBe(false);
  });

  it('sets secure flag when request is HTTPS', async () => {
    mockConfigFile('admin123');
    const handler = findRouteHandler('post', '/api/auth/login');
    const req = mockReq({
      path: '/api/auth/login',
      body: { password: 'admin123' },
      secure: true,
    });
    const res = mockRes();
    await handler(req, res);

    expect(res._cookies.admin_session.options.secure).toBe(true);
    expect(res._cookies.admin_csrf.options.secure).toBe(true);
  });
});

// =============================================================================
// RATE LIMITING
// =============================================================================

describe('Rate limiting', () => {
  beforeEach(() => {
    fs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    fs.writeFile.mockResolvedValue(undefined);
    fs.mkdir.mockResolvedValue(undefined);
  });

  it('locks out after MAX_LOGIN_ATTEMPTS (5) failed attempts', async () => {
    mockConfigFile('admin123');
    const handler = findRouteHandler('post', '/api/auth/login');
    const testIp = '10.0.0.' + Math.floor(Math.random() * 254 + 1);

    // 5 failed attempts
    for (let i = 0; i < 5; i++) {
      const req = mockReq({
        path: '/api/auth/login',
        body: { password: 'wrong' },
        ip: testIp,
        socket: { remoteAddress: testIp },
      });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(401);
    }

    // 6th attempt should be rate limited
    const req = mockReq({
      path: '/api/auth/login',
      body: { password: 'wrong' },
      ip: testIp,
      socket: { remoteAddress: testIp },
    });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(429);
    expect(res._json.success).toBe(false);
  });

  it('even correct password is rejected during lockout', async () => {
    mockConfigFile('admin123');
    const handler = findRouteHandler('post', '/api/auth/login');
    const testIp = '10.1.0.' + Math.floor(Math.random() * 254 + 1);

    // 5 failed attempts to trigger lockout
    for (let i = 0; i < 5; i++) {
      const req = mockReq({
        path: '/api/auth/login',
        body: { password: 'wrong' },
        ip: testIp,
        socket: { remoteAddress: testIp },
      });
      const res = mockRes();
      await handler(req, res);
    }

    // Correct password during lockout
    const req = mockReq({
      path: '/api/auth/login',
      body: { password: 'admin123' },
      ip: testIp,
      socket: { remoteAddress: testIp },
    });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(429);
  });

  it('successful login clears attempt counter', async () => {
    mockConfigFile('admin123');
    const handler = findRouteHandler('post', '/api/auth/login');
    const testIp = '10.2.0.' + Math.floor(Math.random() * 254 + 1);

    // 4 failed attempts (one less than lockout)
    for (let i = 0; i < 4; i++) {
      const req = mockReq({
        path: '/api/auth/login',
        body: { password: 'wrong' },
        ip: testIp,
        socket: { remoteAddress: testIp },
      });
      const res = mockRes();
      await handler(req, res);
    }

    // Successful login — clears attempts
    const reqOk = mockReq({
      path: '/api/auth/login',
      body: { password: 'admin123' },
      ip: testIp,
      socket: { remoteAddress: testIp },
    });
    const resOk = mockRes();
    await handler(reqOk, resOk);
    expect(resOk._json.success).toBe(true);

    // Another 4 failures — should NOT lock out (counter was cleared)
    for (let i = 0; i < 4; i++) {
      const req = mockReq({
        path: '/api/auth/login',
        body: { password: 'wrong' },
        ip: testIp,
        socket: { remoteAddress: testIp },
      });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(401); // not 429
    }
  });
});

// =============================================================================
// requireAuth MIDDLEWARE
// =============================================================================

describe('requireAuth middleware', () => {
  beforeEach(() => {
    fs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    fs.writeFile.mockResolvedValue(undefined);
    fs.mkdir.mockResolvedValue(undefined);
  });

  it('allows /login path without auth', async () => {
    const req = mockReq({ path: '/login' });
    const res = mockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('allows /api/auth/login path without auth', async () => {
    const req = mockReq({ path: '/api/auth/login' });
    const res = mockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('allows /api/auth/status path without auth', async () => {
    const req = mockReq({ path: '/api/auth/status' });
    const res = mockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('allows static files (.css, .js, .png) without auth', async () => {
    for (const ext of ['.css', '.js', '.png', '.jpg', '.ico', '.svg', '.woff2']) {
      const req = mockReq({ path: `/assets/style${ext}` });
      const res = mockRes();
      let nextCalled = false;
      await requireAuth(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    }
  });

  it('allows localhost POST to /api/system/apply-services', async () => {
    const req = mockReq({
      path: '/api/system/apply-services',
      method: 'POST',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    });
    const res = mockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('allows localhost ::1 POST to /api/system/fix-ownership', async () => {
    const req = mockReq({
      path: '/api/system/fix-ownership',
      method: 'POST',
      ip: '::1',
      socket: { remoteAddress: '::1' },
    });
    const res = mockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('blocks unauthenticated API request with 401', async () => {
    const req = mockReq({ path: '/api/videos', cookies: {} });
    const res = mockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res._json.code).toBe('AUTH_REQUIRED');
  });

  it('redirects unauthenticated page request to /login', async () => {
    const req = mockReq({ path: '/dashboard', cookies: {} });
    const res = mockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res._redirectUrl).toBe('/login');
  });

  it('allows authenticated request with valid session cookie', async () => {
    const { sessionToken } = await loginAndGetTokens();
    const req = mockReq({
      path: '/api/videos',
      cookies: { admin_session: sessionToken },
    });
    const res = mockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('blocks request with invalid session cookie', async () => {
    const req = mockReq({
      path: '/api/videos',
      cookies: { admin_session: 'invalid-token' },
    });
    const res = mockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// requireCsrf MIDDLEWARE
// =============================================================================

describe('requireCsrf middleware', () => {
  beforeEach(() => {
    fs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    fs.writeFile.mockResolvedValue(undefined);
    fs.mkdir.mockResolvedValue(undefined);
  });

  it('skips CSRF for GET requests', () => {
    const req = mockReq({ method: 'GET' });
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('skips CSRF for OPTIONS requests', () => {
    const req = mockReq({ method: 'OPTIONS' });
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('skips CSRF for HEAD requests', () => {
    const req = mockReq({ method: 'HEAD' });
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('skips CSRF for localhost requests', () => {
    const req = mockReq({
      method: 'POST',
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    });
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('skips CSRF for ::1 localhost', () => {
    const req = mockReq({
      method: 'POST',
      ip: '::1',
      socket: { remoteAddress: '::1' },
    });
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('skips CSRF for /api/auth/login', () => {
    const req = mockReq({ method: 'POST', path: '/api/auth/login' });
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('skips CSRF for /api/auth/logout', () => {
    const req = mockReq({ method: 'POST', path: '/api/auth/logout' });
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('blocks POST without CSRF token', async () => {
    const { sessionToken } = await loginAndGetTokens();
    const req = mockReq({
      method: 'POST',
      path: '/api/videos/delete',
      cookies: { admin_session: sessionToken },
      headers: {},
    });
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res._json.code).toBe('CSRF_INVALID');
  });

  it('blocks POST with wrong CSRF token', async () => {
    const { sessionToken } = await loginAndGetTokens();
    const req = mockReq({
      method: 'POST',
      path: '/api/videos/delete',
      cookies: { admin_session: sessionToken },
      headers: { 'x-csrf-token': 'wrong-token' },
    });
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('allows POST with correct CSRF token', async () => {
    const { sessionToken, csrfToken } = await loginAndGetTokens();
    const req = mockReq({
      method: 'POST',
      path: '/api/videos/delete',
      cookies: { admin_session: sessionToken },
      headers: { 'x-csrf-token': csrfToken },
    });
    const res = mockRes();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});

// =============================================================================
// LOGOUT ROUTE
// =============================================================================

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    fs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    fs.writeFile.mockResolvedValue(undefined);
    fs.mkdir.mockResolvedValue(undefined);
  });

  it('clears session cookie', async () => {
    const { sessionToken } = await loginAndGetTokens();
    const handler = findRouteHandler('post', '/api/auth/logout');
    const req = mockReq({
      path: '/api/auth/logout',
      cookies: { admin_session: sessionToken },
    });
    const res = mockRes();
    handler(req, res);

    expect(res._clearedCookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'admin_session' }),
      ])
    );
    expect(res._json.success).toBe(true);
  });

  it('succeeds even without a session cookie', () => {
    const handler = findRouteHandler('post', '/api/auth/logout');
    const req = mockReq({ path: '/api/auth/logout', cookies: {} });
    const res = mockRes();
    handler(req, res);
    expect(res._json.success).toBe(true);
  });
});

// =============================================================================
// PASSWORD CHANGE ROUTE
// =============================================================================

describe('POST /api/auth/change-password', () => {
  beforeEach(() => {
    fs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    fs.writeFile.mockResolvedValue(undefined);
    fs.mkdir.mockResolvedValue(undefined);
  });

  it('returns 400 when current or new password is missing', async () => {
    mockConfigFile('admin123');
    const handler = findRouteHandler('post', '/api/auth/change-password');
    const req = mockReq({
      path: '/api/auth/change-password',
      body: { currentPassword: 'admin123' },
    });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when current password is wrong', async () => {
    mockConfigFile('admin123');
    const handler = findRouteHandler('post', '/api/auth/change-password');
    const req = mockReq({
      path: '/api/auth/change-password',
      body: { currentPassword: 'wrong', newPassword: 'newpass' },
    });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when new password is too short', async () => {
    mockConfigFile('admin123');
    const handler = findRouteHandler('post', '/api/auth/change-password');
    const req = mockReq({
      path: '/api/auth/change-password',
      body: { currentPassword: 'admin123', newPassword: 'ab' },
    });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('succeeds and writes new password to config', async () => {
    mockConfigFile('admin123');
    const handler = findRouteHandler('post', '/api/auth/change-password');

    // After first readFile for getAdminPassword, mock readFile for the
    // change-password flow (reads config, then writes it)
    const configData = JSON.stringify({ auth: { password: 'admin123' } });
    fs.readFile.mockResolvedValue(configData);

    const req = mockReq({
      path: '/api/auth/change-password',
      body: { currentPassword: 'admin123', newPassword: 'newpass123' },
    });
    const res = mockRes();
    await handler(req, res);

    expect(res._json.success).toBe(true);
    expect(fs.writeFile).toHaveBeenCalledWith(
      CONFIG_PATH,
      expect.stringContaining('newpass123')
    );
  });
});

// =============================================================================
// LOGIN PAGE (GET /login)
// =============================================================================

describe('GET /login', () => {
  beforeEach(() => {
    fs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    fs.writeFile.mockResolvedValue(undefined);
    fs.mkdir.mockResolvedValue(undefined);
  });

  it('renders login page HTML', async () => {
    mockConfigFile('admin123');
    const handler = findRouteHandler('get', '/login');
    const req = mockReq({ path: '/login', method: 'GET', cookies: {} });
    const res = mockRes();
    await handler(req, res);

    expect(res._sentHtml).toBeTruthy();
    expect(res._sentHtml).toContain('NeoPro Admin');
    expect(res._sentHtml).toContain('loginForm');
  });

  it('redirects to / if already authenticated', async () => {
    const { sessionToken } = await loginAndGetTokens();
    const handler = findRouteHandler('get', '/login');
    const req = mockReq({
      path: '/login',
      method: 'GET',
      cookies: { admin_session: sessionToken },
    });
    const res = mockRes();
    await handler(req, res);

    expect(res._redirectUrl).toBe('/');
  });

  it('shows setup notice when no password configured', async () => {
    mockConfigFile(null);
    const handler = findRouteHandler('get', '/login');
    const req = mockReq({ path: '/login', method: 'GET', cookies: {} });
    const res = mockRes();
    await handler(req, res);

    expect(res._sentHtml).toContain('configurer un mot de passe');
  });
});
