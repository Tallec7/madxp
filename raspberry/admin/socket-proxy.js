/**
 * socket-proxy.js
 *
 * Reverse proxy minimal pour forwarder /socket.io/* depuis l'admin server
 * (port 8080) vers le socket-server local (port 3000 sur le même Pi).
 *
 * Raison d'être : supprimer le cross-origin entre l'UI admin et Socket.IO,
 * ce qui permet (1) d'éviter les violations CSP quel que soit le hostname
 * utilisé (neopro.local / IP LAN / localhost), et (2) de charger le client
 * JS via un chemin relatif `/socket.io/socket.io.js`.
 *
 * Implémenté avec le module http natif — pas de dépendance ajoutée.
 */

const http = require('http');

const SOCKET_HOST = '127.0.0.1';
const SOCKET_PORT = 3000;
const PROXY_PREFIX = '/socket.io/';

/**
 * Crée un middleware Express qui proxifie les requêtes HTTP (GET/POST)
 * du transport Socket.IO polling vers le socket-server local.
 */
function createSocketHttpProxy() {
  return function socketHttpProxy(req, res, next) {
    if (!req.url.startsWith(PROXY_PREFIX)) {
      return next();
    }

    const options = {
      host: SOCKET_HOST,
      port: SOCKET_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${SOCKET_HOST}:${SOCKET_PORT}` },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.warn('[socket-proxy] HTTP error:', err.message);
      if (!res.headersSent) {
        // res.writeHead/end natif (pas res.status Express) pour rester
        // couplé au seul contrat http.ServerResponse — plus robuste et
        // plus facile à tester.
        try {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'socket-server unavailable' }));
        } catch (writeErr) {
          console.warn('[socket-proxy] write error after upstream failure:', writeErr.message);
        }
      } else {
        try { res.end(); } catch (_) { /* already closed */ }
      }
    });

    req.pipe(proxyReq);
  };
}

/**
 * Attache le handler 'upgrade' sur le serveur HTTP admin pour forwarder
 * le handshake WebSocket Socket.IO vers le socket-server local.
 */
function attachSocketWsProxy(server) {
  server.on('upgrade', (req, clientSocket, head) => {
    if (!req.url.startsWith(PROXY_PREFIX)) {
      return;
    }

    const options = {
      host: SOCKET_HOST,
      port: SOCKET_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `${SOCKET_HOST}:${SOCKET_PORT}` },
    };

    const proxyReq = http.request(options);

    proxyReq.on('upgrade', (proxyRes, upstreamSocket, upstreamHead) => {
      // Envoyer les headers du handshake upgrade au client
      const headers = ['HTTP/1.1 101 Switching Protocols'];
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        headers.push(`${key}: ${value}`);
      }
      headers.push('', '');
      clientSocket.write(headers.join('\r\n'));

      if (upstreamHead && upstreamHead.length) clientSocket.write(upstreamHead);
      if (head && head.length) upstreamSocket.write(head);

      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);

      const closeBoth = () => {
        upstreamSocket.destroy();
        clientSocket.destroy();
      };
      upstreamSocket.on('error', closeBoth);
      clientSocket.on('error', closeBoth);
      upstreamSocket.on('close', closeBoth);
      clientSocket.on('close', closeBoth);
    });

    proxyReq.on('error', (err) => {
      console.warn('[socket-proxy] WS error:', err.message);
      clientSocket.destroy();
    });

    proxyReq.end();
  });
}

/**
 * Ping rapide du socket-server upstream pour vérifier que le proxy a une
 * cible joignable. Utilisé par l'endpoint `/api/admin/health` pour remonter
 * l'état du proxy dans le monitoring (surface un downtime du socket-server
 * avant qu'un client ne tente de se connecter et échoue silencieusement).
 *
 * Fait un GET HTTP court (HEAD n'est pas supporté par Socket.IO polling).
 * Résout toujours — pas de throw — pour ne pas casser l'endpoint health.
 *
 * @param {number} [timeoutMs=1000] timeout en millisecondes
 * @returns {Promise<{reachable: boolean, status?: number, error?: string, latencyMs: number}>}
 */
function pingSocketServer(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request(
      {
        host: SOCKET_HOST,
        port: SOCKET_PORT,
        method: 'GET',
        path: '/socket.io/?EIO=4&transport=polling',
        timeout: timeoutMs,
      },
      (res) => {
        // Consommer le body pour libérer le socket.
        res.resume();
        resolve({
          reachable: true,
          status: res.statusCode,
          latencyMs: Date.now() - start,
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({
        reachable: false,
        error: 'timeout',
        latencyMs: Date.now() - start,
      });
    });

    req.on('error', (err) => {
      resolve({
        reachable: false,
        error: err.code || err.message,
        latencyMs: Date.now() - start,
      });
    });

    req.end();
  });
}

module.exports = { createSocketHttpProxy, attachSocketWsProxy, pingSocketServer };
