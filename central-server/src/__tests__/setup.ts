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

// ADR-124 Phase 2 — Mock global pour `@imgly/background-removal-node`.
// La lib amène des deps transitives (onnxruntime-node native bindings + webpack
// shims) qui polluent les tests jest parallèles avec `RawModule is not a
// constructor`. Le mock global vide évite l'import réel et garde les suites
// rapides + déterministes. Le worker `photo-cutout.service.ts` charge la lib
// via `require()` dynamique en runtime prod uniquement.
jest.mock('@imgly/background-removal-node', () => ({
  removeBackground: jest.fn().mockResolvedValue(new Blob([])),
}));

// Clean up mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
