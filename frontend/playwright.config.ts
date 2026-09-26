import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:8081',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:8081',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
