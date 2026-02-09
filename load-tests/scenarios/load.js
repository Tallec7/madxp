import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, AUTH_EMAIL, AUTH_PASSWORD, TEST_SITE_ID, authHeaders, jsonHeaders } from '../config.js';

/**
 * Load test — Charge soutenue simulant une utilisation normale
 *
 * Simule :
 * - 50 Pi envoyant des heartbeats (via API, pas Socket.IO)
 * - 10 operateurs utilisant le dashboard
 * - 5 utilisateurs du cloud remote
 */

const dashboardLatency = new Trend('dashboard_latency');
const siteDetailLatency = new Trend('site_detail_latency');
const failRate = new Rate('failed_requests');

export const options = {
  scenarios: {
    // Scenario 1: Dashboard operators (heavy reads)
    dashboard_operators: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '3m', target: 10 },
        { duration: '1m', target: 0 },
      ],
      exec: 'dashboardOperator',
    },

    // Scenario 2: Cloud remote users (public, rate-limited)
    cloud_remote: {
      executor: 'constant-vus',
      vus: 5,
      duration: '5m',
      exec: 'cloudRemoteUser',
    },

    // Scenario 3: Monitoring polling (admin dashboard auto-refresh)
    monitoring_poll: {
      executor: 'constant-arrival-rate',
      rate: 30,         // 30 requests per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: 'monitoringPoll',
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.01'],
    dashboard_latency: ['p(95)<800'],
    site_detail_latency: ['p(95)<600'],
    failed_requests: ['rate<0.02'],
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
    const token = body.token || body.accessToken;

    // Fetch list of sites for realistic testing
    const sitesRes = http.get(`${BASE_URL}/api/sites?page=1&limit=50`, authHeaders(token));
    let siteIds = [];
    if (sitesRes.status === 200) {
      const sitesBody = JSON.parse(sitesRes.body);
      const sites = sitesBody.data || sitesBody;
      siteIds = Array.isArray(sites) ? sites.map((s) => s.id) : [];
    }

    return { token, siteIds };
  }

  console.warn(`Login failed: ${loginRes.status}`);
  return { token: null, siteIds: [] };
}

/** Scenario 1: Dashboard operator browsing sites, checking alerts, managing subscriptions */
export function dashboardOperator(data) {
  if (!data.token) return;

  const headers = authHeaders(data.token);

  group('Dashboard Overview', () => {
    const start = Date.now();

    // Parallel requests a dashboard makes on load
    const responses = http.batch([
      ['GET', `${BASE_URL}/api/sites?page=1&limit=20`, null, headers],
      ['GET', `${BASE_URL}/api/subscriptions/stats`, null, headers],
      ['GET', `${BASE_URL}/api/alerts?page=1&limit=10`, null, headers],
    ]);

    const elapsed = Date.now() - start;
    dashboardLatency.add(elapsed);

    responses.forEach((r) => {
      const ok = r.status === 200;
      failRate.add(!ok);
      check(r, { 'dashboard endpoint returns 200': (res) => res.status === 200 });
    });
  });

  // Browse a specific site
  if (data.siteIds.length > 0) {
    const siteId = data.siteIds[Math.floor(Math.random() * data.siteIds.length)];

    group('Site Detail', () => {
      const start = Date.now();

      const siteRes = http.get(`${BASE_URL}/api/sites/${siteId}`, headers);
      siteDetailLatency.add(Date.now() - start);

      check(siteRes, {
        'site detail returns 200': (r) => r.status === 200,
      });
      failRate.add(siteRes.status !== 200);

      // Get site subscription
      const subRes = http.get(`${BASE_URL}/api/sites/${siteId}/subscription`, headers);
      check(subRes, {
        'site subscription returns 200': (r) => r.status === 200,
      });
    });
  }

  // List content videos
  group('Content Management', () => {
    const videosRes = http.get(`${BASE_URL}/api/content/videos?page=1&limit=20`, headers);
    check(videosRes, {
      'videos list returns 200': (r) => r.status === 200,
    });
    failRate.add(videosRes.status !== 200);
  });

  sleep(Math.random() * 3 + 2); // 2-5s between page views
}

/** Scenario 2: Cloud remote user (staff in club using QR code) */
export function cloudRemoteUser() {
  if (!TEST_SITE_ID) {
    // Use dummy UUID - will get 404 but validates routing and rate limiting
    const dummyId = '00000000-0000-0000-0000-000000000000';

    const stateRes = http.get(`${BASE_URL}/api/remote/${dummyId}/state`);
    check(stateRes, {
      'remote returns 404 for unknown site': (r) => r.status === 404,
    });

    sleep(2);
    return;
  }

  group('Cloud Remote Polling', () => {
    // GET state (polled every 2s by remote)
    const stateRes = http.get(`${BASE_URL}/api/remote/${TEST_SITE_ID}/state`);
    check(stateRes, {
      'remote state returns 200': (r) => r.status === 200,
    });
    failRate.add(stateRes.status !== 200 && stateRes.status !== 404);

    // GET videos
    const videosRes = http.get(`${BASE_URL}/api/remote/${TEST_SITE_ID}/videos`);
    check(videosRes, {
      'remote videos returns 200': (r) => r.status === 200,
    });
  });

  sleep(2); // Cloud remote polls every 2s
}

/** Scenario 3: Monitoring polling (simulates dashboard auto-refresh) */
export function monitoringPoll(data) {
  if (!data.token) return;

  const headers = authHeaders(data.token);

  // Dashboard auto-refresh hits /api/sites for status updates
  const sitesRes = http.get(`${BASE_URL}/api/sites?page=1&limit=50`, headers);
  check(sitesRes, {
    'monitoring poll returns 200': (r) => r.status === 200,
  });
  failRate.add(sitesRes.status !== 200);
}
