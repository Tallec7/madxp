/**
 * Configuration partagee pour les tests de charge k6
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
export const AUTH_EMAIL = __ENV.AUTH_EMAIL || 'admin@test.com';
export const AUTH_PASSWORD = __ENV.AUTH_PASSWORD || 'testpassword123';
export const TEST_SITE_ID = __ENV.TEST_SITE_ID || '';

/** Seuils de performance standard */
export const THRESHOLDS = {
  http_req_duration: ['p(95)<500', 'p(99)<1000'],
  http_req_failed: ['rate<0.01'],
  http_reqs: ['rate>10'],
};

/** Seuils relaxes pour les operations lourdes */
export const RELAXED_THRESHOLDS = {
  http_req_duration: ['p(95)<2000', 'p(99)<5000'],
  http_req_failed: ['rate<0.05'],
};

/** Headers standard */
export function authHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

export function jsonHeaders() {
  return {
    headers: {
      'Content-Type': 'application/json',
    },
  };
}
