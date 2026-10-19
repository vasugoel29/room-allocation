export default {
  testEnvironment: 'node',
  transform: {},
  globalSetup: './test/global-setup.js',
  setupFiles: ['./test/test-env.js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  testTimeout: 30000,
};
