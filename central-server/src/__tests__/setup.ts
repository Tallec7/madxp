// Set up environment variables for tests
process.env.JWT_SECRET = 'test-secret-key-for-jest-tests';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';
// Audit P1 #7 — secret HMAC pour le service template-proxy-signing.
// Sans ce default, l'import du service throw au module-load et casse
// toutes les suites qui l'importent transitivement (controllers, smoke tests).
process.env.TEMPLATE_PROXY_HMAC_SECRET =
  process.env.TEMPLATE_PROXY_HMAC_SECRET ||
  'test-template-proxy-hmac-secret-min32chars-x';

// Use manual mocks from __mocks__ directories
jest.mock('../config/database');
jest.mock('../config/logger');

// Clean up mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
