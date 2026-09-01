import { defineConfig, devices, type ReporterDescription } from '@playwright/test';

// Load environment variables (BASE_URL, credentials, LOG_LEVEL, ...). Copy
// environments/.env.example to environments/.env and fill in the real values.
require('dotenv').config({ path: './environments/.env' });

process.env['testId'] = process.env['testId'] || '';

/* Resolved once and reused by `use.baseURL` and the Allure environment widget. */
const baseURL =
    process.env['BASE_URL'] ||
    (process.env['TEST_HOST'] ? `${process.env['TEST_HOST']}:4444` : undefined);

/* The API / MailHog URLs the suite actually talks to, so the Allure environment
   widget reports the same values the tests used instead of re-deriving them here.
   require(), NOT an `import`: an ES import is HOISTED above the dotenv call above,
   and testConfig resolves its URLs from process.env at module load — it would read
   an empty environment and report the hardcoded defaults. */
const { testConfig } =
    require('./src/config/testConfig') as typeof import('./src/config/testConfig');

/* Allure results for BOTH suites land in ./allure-results (raw JSON, not a
   browsable report). The CI workflow uploads that folder from the api and ui
   jobs and its "Allure report" job merges them into ONE report published to
   GitHub Pages; locally, `npm run allure:serve` renders the same data.
   NOTE: the reporter APPENDS to the folder and never cleans it — run
   `npm run allure:clean` before a local run you want a report of, or stale
   results from earlier runs show up as extra tests. */
const allureReporter: ReporterDescription = [
    'allure-playwright',
    {
        resultsDir: 'allure-results',
        /* Record every Playwright step as an Allure step. */
        detail: true,
        /* Suite tree = project > spec path > describe(), i.e.
           chromium > api/auth-signin.spec.ts > "API · POST /api/auth/signin".
           The spec path is what separates api/ from ui/ in the merged report;
           with suiteTitle: false the reporter emits NO `suite` label at all and
           both suites collapse into one flat list under the project. */
        suiteTitle: true,
        /* The report's "Environment" widget. undefined values are dropped by
           the reporter, so unset variables simply do not appear — and nothing
           here is a secret (no credentials). */
        environmentInfo: {
            'Target environment': process.env['APP_ENV'],
            'App URL': baseURL,
            'API base URL': testConfig.apiBaseUrl,
            'MailHog URL': testConfig.mailhogUrl,
            Node: process.version,
            Platform: `${process.platform} ${process.arch}`,
            'CI run': process.env['GITHUB_RUN_NUMBER']
                ? `${process.env['GITHUB_REPOSITORY'] ?? 'local'} #${process.env['GITHUB_RUN_NUMBER']}`
                : undefined,
        },
    },
];

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
    /* On CI, additionally emit a JSON report (playwright-report/report.json);
       it is parsed by the workflow's "Test summary" job. Keep 'json' listed after
       'html' — the HTML reporter clears its output folder when it writes.
       'allure-playwright' writes to its own ./allure-results folder, so its
       position in the list does not matter. */
    reporter: process.env.CI
        ? [
              ['github'],
              ['list'],
              ['html', { open: 'never' }],
              ['json', { outputFile: 'playwright-report/report.json' }],
              allureReporter,
          ]
        : [['list'], ['html', { open: 'never' }], allureReporter],
    /* 5-minute per-test timeout (override with TEST_TIMEOUT_IN_MINUTES). */
    timeout:
        (process.env['TEST_TIMEOUT_IN_MINUTES']
            ? Number(process.env['TEST_TIMEOUT_IN_MINUTES'])
            : 5) *
        60 *
        1_000,
    use: {
        /* Set TEST_HOST (or BASE_URL) to use relative page.goto('/') paths. */
        baseURL,
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
