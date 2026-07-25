import { test, expect } from '@playwright/test';
import { AuthApiService, MailhogService } from '../../services';
import { ERROR_MESSAGES } from '../../data/constants';
import { extractToken, uniqueEmail, DEFAULT_PASSWORD } from '../../helpers/api';

const auth = new AuthApiService();
const mailhog = new MailhogService();

/** Sign up a fresh, unverified user and return its email + active code. */
async function newUnverifiedUser(prefix = 'aqa-cf'): Promise<{ email: string; code: string }> {
    const email = uniqueEmail(prefix);
    const signup = await auth.signUp(email, DEFAULT_PASSWORD);
    expect(signup.status, 'precondition: signup').toBe(201);
    const { code } = await mailhog.getLatestConfirmation(email);
    return { email, code };
}

test.describe('API · POST /api/auth/confirm', () => {
    test('[API-CF-01] confirms with a valid code and returns a JWT', async () => {
        const { email, code } = await newUnverifiedUser('aqa-cf01');
        const res = await auth.confirm(email, code);

        expect([200, 201]).toContain(res.status);
        expect(extractToken(res)).toBeTruthy();

        // Account is now verified — it can sign in.
        const signin = await auth.signIn(email, DEFAULT_PASSWORD);
        expect(signin.status).toBe(200);
        expect(extractToken(signin)).toBeTruthy();
    });

    test('[API-CF-02] status-code contract (documented 200, actual 201)', async () => {
        test.info().annotations.push({
            type: 'contract-discrepancy',
            description: 'API doc advertises 200 OK; the app actually returns 201 Created.',
        });
        const { email, code } = await newUnverifiedUser('aqa-cf02');
        const res = await auth.confirm(email, code);
        expect(res.status).toBe(201);
    });

    test('[API-CF-03] rejects an invalid code', async () => {
        const { email, code } = await newUnverifiedUser('aqa-cf03');
        const wrong = code === '000000' ? '111111' : '000000';
        const res = await auth.confirm(email, wrong);
        expect(res.status).toBe(400);
        expect(res.data.error).toBe(ERROR_MESSAGES.invalidOrExpiredCode);
    });

    test('[API-CF-04] a code is single-use (cannot be reused)', async () => {
        const { email, code } = await newUnverifiedUser('aqa-cf04');
        expect([200, 201]).toContain((await auth.confirm(email, code)).status);

        const reuse = await auth.confirm(email, code);
        expect(reuse.status).toBe(400);
        expect(reuse.data.error).toBe(ERROR_MESSAGES.invalidOrExpiredCode);
    });

    // Requires waiting >10 minutes or manipulating expiry in the DB — not feasible
    // against the deployed instance. Enable on a local env with time control.
    test.skip('[API-CF-05] rejects an expired code (>10 min)', async () => {
        // Intentionally skipped — see note above.
    });

    test('[API-CF-06] rejects an unknown email', async () => {
        const res = await auth.confirm(uniqueEmail('aqa-cf06-unknown'), '123456');
        expect(res.status).toBe(400);
        expect(res.data.error).toBe(ERROR_MESSAGES.userNotFound);
    });

    test('[API-CF-07] rejects a code that belongs to another user', async () => {
        const userA = await newUnverifiedUser('aqa-cf07a');
        const userB = await newUnverifiedUser('aqa-cf07b');

        const res = await auth.confirm(userB.email, userA.code);
        expect(res.status).toBe(400);
        expect(res.data.error).toBe(ERROR_MESSAGES.invalidOrExpiredCode);
    });

    test('[API-CF-08] rejects malformed codes (not exactly 6 digits)', async () => {
        for (const bad of ['12ab56', '12345', '1234567', 'abcdef']) {
            const res = await auth.confirm('aqa-cf08@example.com', bad);
            expect(res.status, `code="${bad}"`).toBe(400);
            expect(res.data.error, `code="${bad}"`).toBe(ERROR_MESSAGES.codeSixDigits);
        }
    });

    test('[API-CF-09] rejects missing fields', async () => {
        const missingCode = await auth.confirm('aqa-cf09@example.com', undefined);
        expect(missingCode.status).toBe(400);

        const missingEmail = await auth.confirm(undefined, '123456');
        expect(missingEmail.status).toBe(400);
        expect(missingEmail.data.error).toBe(ERROR_MESSAGES.emailRequired);
    });
});
