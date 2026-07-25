import { AuthApiService, MailhogService } from '../services';
import { testConfig, createLogger, Account } from '../config';
import { extractToken } from '../helpers/api';

/**
 * Global setup — runs once before the whole suite.
 *
 * Ensures the dedicated, long-lived accounts (A, B, UI and the read-only
 * smoke account) exist and are verified so that every authenticated test can
 * simply sign in. Provisioning is idempotent: if the account already signs in,
 * nothing happens; otherwise it is signed up (the API re-sends a code even for
 * an existing unverified user) and confirmed via the code captured in MailHog.
 *
 * Only these accounts are provisioned here. The account-lifecycle specs create
 * their own disposable users.
 */

const logger = createLogger(' [global-setup] ');

async function ensureAccount(
    auth: AuthApiService,
    mailhog: MailhogService,
    account: Account,
): Promise<void> {
    const existing = await auth.signIn(account.email, account.password);
    if (existing?.status === 200 && extractToken(existing)) {
        logger.info(`Account '${account.email}' already verified.`);
        return;
    }

    const signup = await auth.signUp(account.email, account.password);
    if (![200, 201].includes(signup?.status)) {
        throw new Error(
            `Provisioning failed at signup for '${account.email}': ${signup?.status} ${JSON.stringify(signup?.data)}`,
        );
    }

    const { code } = await mailhog.getLatestConfirmation(account.email);
    const confirm = await auth.confirm(account.email, code);
    if (![200, 201].includes(confirm?.status)) {
        throw new Error(
            `Provisioning failed at confirm for '${account.email}': ${confirm?.status} ${JSON.stringify(confirm?.data)}`,
        );
    }

    const verify = await auth.signIn(account.email, account.password);
    if (!(verify?.status === 200 && extractToken(verify))) {
        throw new Error(`Provisioning: '${account.email}' still cannot sign in after confirmation.`);
    }
    logger.info(`Account '${account.email}' provisioned and verified.`);
}

export default async function globalSetup(): Promise<void> {
    logger.info(`Target API: ${testConfig.apiBaseUrl}`);
    logger.info(`MailHog:    ${testConfig.mailhogUrl}`);

    const auth = new AuthApiService();
    const mailhog = new MailhogService();

    // Health check — fail fast with a clear message if the API is unreachable.
    const doc = await auth.docJson();
    if (!doc || doc.status !== 200) {
        throw new Error(`API health check failed at ${testConfig.apiBaseUrl}${'/api/doc.json'} (status ${doc?.status}).`);
    }

    await ensureAccount(auth, mailhog, testConfig.accounts.A);
    await ensureAccount(auth, mailhog, testConfig.accounts.B);
    await ensureAccount(auth, mailhog, testConfig.accounts.ui);
    await ensureAccount(auth, mailhog, testConfig.accounts.smoke);
}
