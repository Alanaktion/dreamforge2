import { defineConfig, devices } from '@playwright/test';

const runDirectory = `./work/e2e/${Date.now()}`;

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    actionTimeout: 15000,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }
  ],
  webServer: {
    command: 'node build/index.js',
    url: 'http://127.0.0.1:4173/healthz',
    reuseExistingServer: false,
    env: {
      HOST: '127.0.0.1',
      PORT: '4173',
      ORIGIN: 'http://127.0.0.1:4173',
      DATABASE_PATH: `${runDirectory}/dreamforge.db`,
      DATA_DIR: `${runDirectory}/projects`,
      BACKUP_DIR: `${runDirectory}/backups`,
      ADMIN_EMAIL: 'smoke@example.test',
      ADMIN_PASSWORD: 'Smoke-initial-password',
      PUBLIC_ALLOW_REGISTRATION: 'false'
    }
  }
});
