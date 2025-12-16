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
    // Target: Realistic thresholds accounting for WebSocket/stream-based services
    global: {
      branches: 60,    // WebSocket/health services have many edge case branches
      functions: 75,   // Some async handlers difficult to trigger in unit tests
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 10000,
  verbose: true,
};
