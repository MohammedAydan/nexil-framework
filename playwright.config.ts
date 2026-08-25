import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: true,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  testIgnore: ['**/deno-runtime.spec.ts'],
  webServer: [
    {
      command:
        'pnpm --filter @mohammedaydan/example-basic-app build && pnpm --filter @mohammedaydan/example-landing-page build && node tests/e2e/serve.mjs',
      url: 'http://127.0.0.1:4173/tests/e2e/fixtures/resumability/index.html',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @mohammedaydan/example-nexis-showcase dev',
      url: 'http://127.0.0.1:5173/',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        NEXIS_HOST: '127.0.0.1',
        NEXIS_PORT: '5173',
      },
    },
  ],
})
