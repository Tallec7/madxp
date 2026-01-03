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
    // Excluded: Legacy alert service, replaced by alerting.service.ts
    '!src/services/alert.service.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    // Thresholds réalistes pour un projet avec WebSocket/streams
    // Ces seuils peuvent être augmentés progressivement
    global: {
      branches: 30,    // WebSocket/health services have many edge case branches
      functions: 50,   // Some async handlers difficult to trigger in unit tests
      lines: 50,
      statements: 50,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 10000,
  verbose: true,
};
