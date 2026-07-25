/**
 * Central test configuration for the Notes app under test.
 *
 * All values are environment-driven (loaded from environments/.env by
 * playwright.config.ts) with sensible defaults pointing at the deployed
 * instance so the suite runs out of the box.
 */

// Single host for the instance under test; API (:4444) and MailHog (:8025)
// differ only by port. Override the whole host with TEST_HOST, or individual
// URLs with API_BASE_URL / BASE_URL / MAILHOG_URL if they ever diverge.
const HOST = process.env['TEST_HOST'] || 'http://ec2-3-19-72-76.us-east-2.compute.amazonaws.com';

export interface Account {
    email: string;
    password: string;
}

export interface TestConfig {
    apiBaseUrl: string;
    mailhogUrl: string;
    accounts: {
        /** Primary account for all authenticated "overall" testing. */
        A: Account;
        /** Secondary account used only for ownership-isolation checks. */
        B: Account;
        /** Dedicated account for UI E2E flows (kept small/deterministic). */
        ui: Account;
        /** Read-only smoke account (never mutated). */
        smoke: Account;
    };
}

export const testConfig: TestConfig = {
    apiBaseUrl: process.env['API_BASE_URL'] || process.env['BASE_URL'] || `${HOST}:4444`,
    mailhogUrl: process.env['MAILHOG_URL'] || `${HOST}:8025`,
    accounts: {
        A: {
            email: process.env['ACCOUNT_A_EMAIL'] || 'aqa-account-a@example.com',
            password: process.env['ACCOUNT_A_PASSWORD'] || 'Passw0rd123!',
        },
        B: {
            email: process.env['ACCOUNT_B_EMAIL'] || 'aqa-account-b@example.com',
            password: process.env['ACCOUNT_B_PASSWORD'] || 'Passw0rd123!',
        },
        ui: {
            email: process.env['ACCOUNT_UI_EMAIL'] || 'aqa-account-ui@example.com',
            password: process.env['ACCOUNT_UI_PASSWORD'] || 'Passw0rd123!',
        },
        smoke: {
            email: process.env['SMOKE_EMAIL'] || 'test@test.test',
            password: process.env['SMOKE_PASSWORD'] || '12345678',
        },
    },
};
