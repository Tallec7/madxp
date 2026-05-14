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
      functions: 39,   // Lowered TEMPORAIREMENT (PR #1007) après xdescribe de command-queue + canary tests cassés par pollution Webpack — re-bump à 40 dès résolution issue #1008. Initialement lowered après chantier JOUEUR (PR #766).
      lines: 43,       // Lowered TEMPORAIREMENT (PR #1007) — re-bump à 44 dès résolution issue #1008.
      statements: 43,  // Idem lines.
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 10000,
  verbose: true,
};
