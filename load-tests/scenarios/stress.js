import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { BASE_URL, AUTH_EMAIL, AUTH_PASSWORD, TEST_SITE_ID, authHeaders, jsonHeaders } from '../config.js';

/**
 * Stress test — Trouver le point de rupture
 *
 * Monte progressivement la charge pour identifier :
 * - Le seuil de saturation du pool DB (5 connexions max)
 * - Le point ou le rate limiting commence a rejeter
 * - Le comportement sous pression memoire (Railway ~40MB)
 * - La latence p99 sous charge extreme
 */

const rateLimited = new Counter('rate_limited_requests');
const dbTimeout = new Counter('db_timeout_errors');
const responseTime = new Trend('api_response_time');

export const options = {
  stages: [
    { duration: '1m', target: 10 },    // Warm up
    { duration: '2m', target: 50 },    // Normal load
    { duration: '2m', target: 100 },   // High load
    { duration: '2m', target: 200 },   // Stress
    { duration: '1m', target: 300 },   // Breaking point
    { duration: '2m', target: 0 },     // Recovery
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],     // Relaxed for stress
    http_req_failed: ['rate<0.10'],        // Up to 10% failure acceptable under stress
    rate_limited_requests: ['count<1000'], // Track but don't fail
  },
};

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: AUTH_EMAIL, password: AUTH_PASSWORD }),
    jsonHeaders()
  );

  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    return { token: body.token || body.accessToken };
  }

  return { token: null };
}

export default function (data) {
  const iteration = __ITER;

  // Mix of authenticated and public requests
  if (data.token && iteration % 3 !== 0) {
    authenticatedRequests(data);
  } else {
    publicRequests();
  }

  sleep(Math.random() * 0.5); // Short sleep to maximize load
}

function authenticatedRequests(data) {
  const headers = authHeaders(data.token);

  group('API Stress - Authenticated', () => {
    // Sites listing (most common operation)
    const start = Date.now();
    const sitesRes = http.get(`${BASE_URL}/api/sites?page=1&limit=20`, headers);
    responseTime.add(Date.now() - start);

    check(sitesRes, {
      'sites returns success': (r) => r.status === 200,
    });

    if (sitesRes.status === 429) {
      rateLimited.add(1);
    }
    if (sitesRes.status === 504 || sitesRes.status === 408) {
      dbTimeout.add(1);
    }

    // Subscription stats
    const statsRes = http.get(`${BASE_URL}/api/subscriptions/stats`, headers);
    check(statsRes, {
      'stats returns success': (r) => r.status === 200 || r.status === 429,
    });

    if (statsRes.status === 429) {
      rateLimited.add(1);
    }

    // Alerts
    const alertsRes = http.get(`${BASE_URL}/api/alerts?page=1&limit=10`, headers);
    if (alertsRes.status === 429) {
      rateLimited.add(1);
    }

    // Content videos
    const videosRes = http.get(`${BASE_URL}/api/content/videos?page=1&limit=10`, headers);
    if (videosRes.status === 429) {
      rateLimited.add(1);
    }
  });
}

function publicRequests() {
  const siteId = TEST_SITE_ID || '00000000-0000-0000-0000-000000000000';

  group('API Stress - Public Remote', () => {
    const start = Date.now();
    const stateRes = http.get(`${BASE_URL}/api/remote/${siteId}/state`);
    responseTime.add(Date.now() - start);

    if (stateRes.status === 429) {
      rateLimited.add(1);
    }

    check(stateRes, {
      'remote returns expected': (r) => r.status === 200 || r.status === 404 || r.status === 429,
    });
  });

  group('Health Probes Under Load', () => {
    const healthRes = http.get(`${BASE_URL}/health`);
    check(healthRes, {
      'health OK under stress': (r) => r.status === 200,
    });
  });
}
