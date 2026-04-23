'use strict';

/**
 * ADR-088 — Cloud push (SaaS-first) pour sim-bodet-scorepad.
 *
 * Poll le getState() de l'emitter et POSTe le MatchState décodé au central
 * server, qui broadcast Socket.IO `scoreboard-state` vers la room siteId.
 *
 * Usage via CLI : --push-url http://localhost:3001/api/scoreboard \
 *                 --site-id <uuid> --site-api-key <key>
 *
 * Zéro dépendance : utilise http/https natif de Node.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

function buildMatchState(simState) {
  return {
    vendor: 'bodet',
    sport: 'basketball',
    period: simState.period,
    chronoMs: Math.round(simState.chronoMs),
    clockRunning: !!simState.clockRunning,
    homeScore: simState.homeScore,
    guestScore: simState.guestScore,
    homeTeamFouls: simState.homeTeamFouls,
    guestTeamFouls: simState.guestTeamFouls,
    shotClockMs: Math.round(simState.shotClockMs),
    timeoutActive: simState.timeoutActive ?? null,
    timeoutRemainingMs: Math.round(simState.timeoutRemainingMs || 0),
  };
}

function createCloudPusher({
  baseUrl,
  siteId,
  siteApiKey,
  getState,
  intervalMs = 500,
  verbose = false,
}) {
  if (!baseUrl || !siteId || !siteApiKey) {
    throw new Error('cloud-push requires baseUrl, siteId, siteApiKey');
  }
  const endpoint = new URL(`${baseUrl.replace(/\/$/, '')}/${siteId}/state`);
  const client = endpoint.protocol === 'https:' ? https : http;
  let lastSent = '';
  let timer = null;
  let inflight = false;

  const pushOnce = () => {
    if (inflight) return;
    const payload = JSON.stringify(buildMatchState(getState()));
    if (payload === lastSent) return;
    inflight = true;
    const req = client.request(
      {
        hostname: endpoint.hostname,
        port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
        path: endpoint.pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          authorization: `Bearer ${siteApiKey}`,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          inflight = false;
          if (res.statusCode === 202) {
            lastSent = payload;
            if (verbose) console.log(`[cloud-push] 202 accepted`);
          } else {
            console.log(`[cloud-push] HTTP ${res.statusCode}`);
          }
        });
      }
    );
    req.on('error', (err) => {
      inflight = false;
      console.log(`[cloud-push] error: ${err.message}`);
    });
    req.write(payload);
    req.end();
  };

  return {
    start() {
      timer = setInterval(pushOnce, intervalMs);
      console.log(`[cloud-push] → ${endpoint.href} every ${intervalMs}ms`);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

module.exports = { createCloudPusher, buildMatchState };
