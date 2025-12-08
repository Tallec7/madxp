// Set up environment variables for tests
process.env.JWT_SECRET = 'test-secret-key-for-jest-tests';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';

// Use manual mocks from __mocks__ directories
jest.mock('../config/database');
jest.mock('../config/logger');

// Clean up mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
