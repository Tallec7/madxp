/**
 * Tests for socket-proxy.js — Socket.IO reverse proxy wiring.
 *
 * Ces tests verrouillent l'architecture du proxy Socket.IO pour prévenir
 * les régressions qui réintroduiraient le bug CSP cross-origin (le client
 * chargeait Socket.IO depuis `http://<hostname>:3000/...`, bloqué par la
 * CSP `script-src 'self'` de l'admin UI).
 *
 * Les tests sont statiques (inspection du code source) : ils n'ouvrent pas
 * de socket ni n'exécutent admin-server.js, ce qui les rend rapides et
 * fiables en CI.
 */

const fs = require('fs');
const path = require('path');

const ADMIN_SERVER_PATH = path.join(__dirname, '..', 'admin-server.js');
const SOCKET_PROXY_PATH = path.join(__dirname, '..', 'socket-proxy.js');
const INDEX_HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');
const REALTIME_JS_PATH = path.join(
  __dirname,
  '..',
  'public',
  'modules',
  'core',
  'realtime.js'
);

describe('socket-proxy module', () => {
  let socketProxy;

  beforeAll(() => {
    socketProxy = require('../socket-proxy');
  });

  it('exports createSocketHttpProxy, attachSocketWsProxy, and pingSocketServer', () => {
    expect(typeof socketProxy.createSocketHttpProxy).toBe('function');
    expect(typeof socketProxy.attachSocketWsProxy).toBe('function');
    expect(typeof socketProxy.pingSocketServer).toBe('function');
  });

  it('pingSocketServer returns { reachable: false } when upstream is down', async () => {
    // En CI il n'y a pas de socket-server sur :3000 → doit répondre
    // reachable=false sans lever d'exception (pour préserver /api/admin/health).
    const result = await socketProxy.pingSocketServer(500);
    expect(result).toHaveProperty('reachable');
    expect(result.reachable).toBe(false);
    expect(typeof result.latencyMs).toBe('number');
    expect(typeof result.error).toBe('string');
  });

  it('createSocketHttpProxy returns an Express-style middleware', () => {
    const middleware = socketProxy.createSocketHttpProxy();
    expect(typeof middleware).toBe('function');
    // Express middleware = (req, res, next) → 3 args
    expect(middleware.length).toBe(3);
  });

  it('HTTP proxy passes through requests that are not /socket.io/*', (done) => {
    const middleware = socketProxy.createSocketHttpProxy();
    const req = { url: '/api/system', method: 'GET', headers: {} };
    const res = {};
    const next = jest.fn(() => {
      expect(next).toHaveBeenCalledTimes(1);
      done();
    });
    middleware(req, res, next);
  });

  it('HTTP proxy does NOT call next() for /socket.io/* (forwards upstream)', (done) => {
    // Silencer le warn async (ECONNREFUSED attendu — pas de socket-server en test)
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const middleware = socketProxy.createSocketHttpProxy();
    const req = {
      url: '/socket.io/?EIO=4&transport=polling',
      method: 'GET',
      headers: {},
      pipe: jest.fn(),
      on: jest.fn(),
    };
    const res = {
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false,
    };
    const next = jest.fn();
    middleware(req, res, next);
    // next() ne doit PAS être appelé — le proxy gère la requête.
    expect(next).not.toHaveBeenCalled();
    // Attendre que l'erreur async ECONNREFUSED se propage, puis clean up.
    setTimeout(() => {
      warnSpy.mockRestore();
      done();
    }, 50);
  });
});

describe('admin-server.js — Socket.IO proxy wiring (regression guards)', () => {
  let adminServerSource;

  beforeAll(() => {
    adminServerSource = fs.readFileSync(ADMIN_SERVER_PATH, 'utf8');
  });

  it('imports the socket-proxy module', () => {
    expect(adminServerSource).toMatch(
      /require\(['"]\.\/socket-proxy['"]\)/
    );
  });

  it('mounts createSocketHttpProxy() as middleware', () => {
    expect(adminServerSource).toMatch(/app\.use\(createSocketHttpProxy\(\)\)/);
  });

  it('attaches attachSocketWsProxy on the HTTP server', () => {
    expect(adminServerSource).toMatch(/attachSocketWsProxy\(server\)/);
  });

  it('uses http.createServer(app) (not app.listen) so WS upgrade can be hooked', () => {
    expect(adminServerSource).toMatch(/http\.createServer\(app\)/);
    expect(adminServerSource).toMatch(/server\.listen\(PORT/);
  });

  it('mounts the proxy BEFORE body parsers (express.json / urlencoded)', () => {
    // Ignore les commentaires pour ne matcher que les appels `app.use(...)`.
    // Utilise un regex avec flag /m pour localiser les vrais sites d'appel.
    const proxyMatch = adminServerSource.match(
      /^\s*app\.use\(createSocketHttpProxy\(\)\)/m
    );
    const jsonMatch = adminServerSource.match(/^\s*app\.use\(express\.json\(\)\)/m);
    const urlEncodedMatch = adminServerSource.match(
      /^\s*app\.use\(express\.urlencoded/m
    );

    expect(proxyMatch).not.toBeNull();
    expect(jsonMatch).not.toBeNull();
    expect(urlEncodedMatch).not.toBeNull();

    const proxyIdx = proxyMatch.index;
    const jsonIdx = jsonMatch.index;
    const urlEncodedIdx = urlEncodedMatch.index;

    // Le proxy doit précéder les body parsers (sinon Socket.IO polling POSTs
    // sont consommés et l'upstream reçoit une requête vide).
    expect(proxyIdx).toBeLessThan(jsonIdx);
    expect(proxyIdx).toBeLessThan(urlEncodedIdx);
  });
});

describe('admin-server.js — CSP header (regression guards)', () => {
  let adminServerSource;

  beforeAll(() => {
    adminServerSource = fs.readFileSync(ADMIN_SERVER_PATH, 'utf8');
  });

  it('CSP script-src includes \'self\' (base hardening)', () => {
    expect(adminServerSource).toMatch(/script-src ['"]?[^;]*\bself\b/);
  });

  it('CSP does NOT allow cross-origin :3000 script sources', () => {
    // Une fois le proxy interne en place, les autorisations cross-origin
    // sur :3000 ne doivent pas réapparaître — elles seraient un signal que
    // quelqu'un a contourné le proxy au lieu de le réparer.
    const cspBlock = adminServerSource.match(
      /Content-Security-Policy[\s\S]*?'\);/
    );
    expect(cspBlock).not.toBeNull();
    expect(cspBlock[0]).not.toMatch(/:3000/);
    expect(cspBlock[0]).not.toMatch(/ws:\/\//);
  });

  it('CSP connect-src is restricted to \'self\'', () => {
    expect(adminServerSource).toMatch(/connect-src ['"]?[^;]*\bself\b[^;]*;/);
  });
});

describe('index.html — Socket.IO client loader (regression guard)', () => {
  let indexHtml;

  beforeAll(() => {
    indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  });

  it('loads socket.io.js via a relative path (same origin)', () => {
    expect(indexHtml).toMatch(/['"]\/socket\.io\/socket\.io\.js['"]/);
  });

  it('does NOT construct an absolute URL with window.location.hostname + :3000', () => {
    // Regression guard : l'ancienne implémentation chargeait
    //   window.location.protocol + '//' + window.location.hostname + ':3000/socket.io/socket.io.js'
    // ce qui violait la CSP. Ne doit pas revenir.
    expect(indexHtml).not.toMatch(
      /window\.location\.hostname\s*\+\s*['"]:3000/
    );
  });
});

describe('realtime.js — io() client (regression guard)', () => {
  let realtimeJs;

  beforeAll(() => {
    realtimeJs = fs.readFileSync(REALTIME_JS_PATH, 'utf8');
  });

  it('calls io() without an absolute URL (uses same origin)', () => {
    // Doit être `io({ ... })` et non `io(socketUrl, { ... })`.
    expect(realtimeJs).toMatch(/io\(\s*\{/);
    expect(realtimeJs).not.toMatch(/window\.location\.hostname\s*\+\s*['"]:3000/);
  });
});
