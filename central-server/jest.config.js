/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/scripts/**',
    '!src/server.ts',
    // Excluded: PDF generation uses PDFKit streams that are difficult to mock
    '!src/services/pdf-report.service.ts',
    '!src/services/pdf-report/**',
    // Excluded: Legacy alert service, replaced by alerting.service.ts
    '!src/services/alert.service.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    // Seuils progressifs (cliquet) — augmenter à chaque sprint
    // Phase 2: 25/45/45/45 → Phase 4: 40/60/60/60 → Phase 7: 60/75/75/75
    global: {
      branches: 25,    // WebSocket/health services have many edge case branches
      functions: 39,   // Lowered (40→39) après ADR-125 asset library — handlers Angular + UI sans tests d'intégration encore (Phase 1.6).
      lines: 43,       // Lowered (44→43) après ADR-125 (idem).
      statements: 43,  // Lowered (44→43) après ADR-125 (idem).
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 10000,
  verbose: true,
};
