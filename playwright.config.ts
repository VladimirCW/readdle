import { defineConfig, devices } from '@playwright/test';

// Load environment variables (BASE_URL, credentials, LOG_LEVEL, ...). Copy
// environments/.env.example to environments/.env and fill in the real values.
require('dotenv').config({ path: './environments/.env' });

process.env['testId'] = process.env['testId'] || '';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: './src/tests',
    /* Ensure dedicated accounts A/B exist and are verified before any test. */
    globalSetup: './src/tests/global-setup.ts',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 1 : 0,
    /* Worker count from WORKERS_AMOUNT (environments/.env); unset falls back
       to Playwright's default (half the CPU cores). */
    workers: process.env['WORKERS_AMOUNT'] ? Number(process.env['WORKERS_AMOUNT']) : undefined,
    reporter: process.env.CI
        ? [['github'], ['list'], ['html', { open: 'never' }]]
        : [['list'], ['html', { open: 'never' }]],
    /* 5-minute per-test timeout (override with TEST_TIMEOUT_IN_MINUTES). */
    timeout:
        (process.env['TEST_TIMEOUT_IN_MINUTES']
            ? Number(process.env['TEST_TIMEOUT_IN_MINUTES'])
            : 5) *
        60 *
        1_000,
    use: {
        /* Set TEST_HOST (or BASE_URL) to use relative page.goto('/') paths. */
        baseURL:
            process.env['BASE_URL'] ||
            (process.env['TEST_HOST'] ? `${process.env['TEST_HOST']}:4444` : undefined),
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        actionTimeout: 60_000,
        ignoreHTTPSErrors: true,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
