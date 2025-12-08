export const query = jest.fn();

// Mock client for transactions
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

export const getClient = jest.fn().mockResolvedValue(mockClient);

// Pool with query method for controllers using pool.query directly
export const pool = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
};

// Default export for `import pool from '../config/database'`
export default pool;

// Export mockClient for tests that need to configure it
export { mockClient };
