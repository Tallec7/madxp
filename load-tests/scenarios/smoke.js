import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { BASE_URL, AUTH_EMAIL, AUTH_PASSWORD, THRESHOLDS, authHeaders, jsonHeaders } from '../config.js';

/**
 * Smoke test — Validation fonctionnelle rapide
 * Verifie que les endpoints critiques repondent correctement sous charge minimale.
 */
export const options = {
  stages: [
    { duration: '30s', target: 2 },
    { duration: '30s', target: 5 },
    { duration: '30s', target: 0 },
  ],
  thresholds: THRESHOLDS,
};

let authToken = null;

export function setup() {
  // Login pour obtenir un token
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: AUTH_EMAIL, password: AUTH_PASSWORD }),
    jsonHeaders()
  );

  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    return { token: body.token || body.accessToken };
  }

  console.warn(`Login failed with status ${loginRes.status}. Continuing with public endpoints only.`);
  return { token: null };
}

export default function (data) {
  group('Health Checks', () => {
    const health = http.get(`${BASE_URL}/health`);
    check(health, {
      'health returns 200': (r) => r.status === 200,
    });

    const ready = http.get(`${BASE_URL}/ready`);
    check(ready, {
      'ready returns 200': (r) => r.status === 200,
    });
  });

  if (data.token) {
    group('Authenticated API', () => {
      const headers = authHeaders(data.token);

      // GET /api/auth/me
      const me = http.get(`${BASE_URL}/api/auth/me`, headers);
      check(me, {
        'auth/me returns 200': (r) => r.status === 200,
      });

      // GET /api/sites (paginated)
      const sites = http.get(`${BASE_URL}/api/sites?page=1&limit=20`, headers);
      check(sites, {
        'sites returns 200': (r) => r.status === 200,
        'sites returns array': (r) => {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data || body);
        },
      });

      // GET /api/subscriptions/stats
      const stats = http.get(`${BASE_URL}/api/subscriptions/stats`, headers);
      check(stats, {
        'subscription stats returns 200': (r) => r.status === 200,
      });

      // GET /api/alerts
      const alerts = http.get(`${BASE_URL}/api/alerts?page=1&limit=10`, headers);
      check(alerts, {
        'alerts returns 200': (r) => r.status === 200,
      });

      // GET /api/content/videos
      const videos = http.get(`${BASE_URL}/api/content/videos?page=1&limit=20`, headers);
      check(videos, {
        'content videos returns 200': (r) => r.status === 200,
      });
    });
  }

  group('Public Endpoints', () => {
    // Cloud remote endpoints (public, rate-limited to 60/min by IP)
    // Use a dummy site ID - will return 404 but validates routing
    const remoteState = http.get(`${BASE_URL}/api/remote/00000000-0000-0000-0000-000000000000/state`);
    check(remoteState, {
      'remote state returns expected status': (r) => r.status === 404 || r.status === 200,
    });
  });

  sleep(1);
}
