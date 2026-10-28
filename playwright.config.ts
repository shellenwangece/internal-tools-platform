import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120000,
  use: { baseURL: 'http://localhost:3100', headless: true },
  webServer: {
    command: 'rm -f var/e2e.sqlite && npm run build && PORT=3100 DATABASE_PATH=var/e2e.sqlite DEVIN_MOCK=1 GITHUB_MOCK=1 SESSION_SECRET=e2e npm start',
    url: 'http://localhost:3100/api/auth/users',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
