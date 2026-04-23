'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function createWebUi({ emitter, host = '127.0.0.1', port = 4100 }) {
  const lastFrames = new Map();

  function recordFrame(msgId, buf) {
    lastFrames.set(msgId, {
      hex: Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join(' '),
      bytes: buf.length,
      at: Date.now(),
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(INDEX_HTML);
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(emitter.getState()));
    }
    if (req.method === 'GET' && url.pathname === '/api/frames') {
      const out = {};
      for (const [k, v] of lastFrames) out[k] = v;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(out));
    }
    if (req.method === 'POST' && url.pathname === '/api/event') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const event = JSON.parse(body || '{}');
          emitter.injectEvent(event);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, state: emitter.getState() }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, host, () => {
    console.log(`[sim-web] UI available at http://${host}:${port}`);
  });

  return {
    recordFrame,
    stop: () => server.close(),
  };
}

module.exports = { createWebUi };
