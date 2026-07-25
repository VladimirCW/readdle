import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { AuthApiService, MailhogService } from '../../services';
import { testConfig } from '../../config';
import { ERROR_MESSAGES, SUCCESS_MESSAGES, LIMITS } from '../../data/constants';
import { uniqueEmail, longValidEmail, stringOfLength, DEFAULT_PASSWORD } from '../../helpers/api';

const auth = new AuthApiService();
const mailhog = new MailhogService();

test.describe('API · POST /api/auth/signup', () => {
    test('[API-SU-01] signs up a new user and returns 201', async () => {
        const res = await auth.signUp(uniqueEmail('aqa-su01'), DEFAULT_PASSWORD);
        expect(res.status).toBe(201);
        expect(res.data.message).toBe(SUCCESS_MESSAGES.signup);
    });

    test('[API-SU-02] sends a confirmation email with a 6-digit code link', async () => {
        const email = uniqueEmail('aqa-su02');
        const res = await auth.signUp(email, DEFAULT_PASSWORD);
        expect(res.status).toBe(201);

        const confirmation = await mailhog.getLatestConfirmation(email);
        expect(confirmation.code).toMatch(/^\d{6}$/);
        expect(confirmation.link).toContain('confirm_code=');
        expect(confirmation.link).toContain('confirm_email=');
    });

    test('[API-SU-03] rejects an already-registered verified user', async () => {
        const res = await auth.signUp(testConfig.accounts.smoke.email, testConfig.accounts.smoke.password);
        expect(res.status).toBe(400);
        expect(res.data.error).toBe(ERROR_MESSAGES.userExists);
    });

    test('[API-SU-04] allows re-signup of an unverified email (new code works)', async () => {
        const email = uniqueEmail('aqa-su04');
        expect((await auth.signUp(email, DEFAULT_PASSWORD)).status).toBe(201);

        const second = await auth.signUp(email, 'AnotherPassw0rd!');
        expect(second.status).toBe(201);

        const { code } = await mailhog.getLatestConfirmation(email);
        const confirm = await auth.confirm(email, code);
        expect([200, 201]).toContain(confirm.status);
    });

    test('[API-SU-05] rejects an invalid email format', async () => {
        const res = await auth.signUp('not-an-email', DEFAULT_PASSWORD);
        expect(res.status).toBe(400);
        expect(res.data.error).toBe(ERROR_MESSAGES.invalidEmail);
    });

    test('[API-SU-06] rejects a missing email', async () => {
        const res = await auth.signUp(undefined, DEFAULT_PASSWORD);
        expect(res.status).toBe(400);
        expect(res.data.error).toBe(ERROR_MESSAGES.emailRequired);
    });

    test('[API-SU-07] rejects a missing password', async () => {
        const res = await auth.signUp(uniqueEmail('aqa-su07'), undefined);
        expect(res.status).toBe(400);
        expect(res.data.error).toBe(ERROR_MESSAGES.passwordRequired);
    });

    test('[API-SU-08] rejects a password shorter than the minimum', async () => {
        const res = await auth.signUp(uniqueEmail('aqa-su08'), stringOfLength(LIMITS.passwordMin - 1));
        expect(res.status).toBe(400);
        expect(res.data.error).toBe(ERROR_MESSAGES.passwordTooShort);
    });

    test('[API-SU-09] accepts a password at the minimum length (8)', async () => {
        const res = await auth.signUp(uniqueEmail('aqa-su09'), stringOfLength(LIMITS.passwordMin));
        expect(res.status).toBe(201);
    });

    test('[API-SU-10] enforces the maximum password length (255 ok, 256 rejected)', async () => {
        const ok = await auth.signUp(uniqueEmail('aqa-su10a'), stringOfLength(LIMITS.passwordMax));
        expect(ok.status).toBe(201);

        const tooLong = await auth.signUp(uniqueEmail('aqa-su10b'), stringOfLength(LIMITS.passwordMax + 1));
        expect(tooLong.status).toBe(400);
        expect(tooLong.data.error).toBe(ERROR_MESSAGES.passwordTooLong);
    });

    test('[API-SU-11] rejects an email longer than 190 characters', async () => {
        const email = longValidEmail(LIMITS.emailMax + 1);
        expect(email.length).toBeGreaterThan(LIMITS.emailMax);
        const res = await auth.signUp(email, DEFAULT_PASSWORD);
        expect(res.status).toBe(400);
        expect(res.data.error).toBe(ERROR_MESSAGES.emailTooLong);
    });

    test('[API-SU-12] normalizes email (trim + lowercase)', async () => {
        const normalized = `aqa-su12-${randomUUID()}@example.com`;
        const raw = `  ${normalized.toUpperCase()}  `;
        const res = await auth.signUp(raw, DEFAULT_PASSWORD);
        expect(res.status).toBe(201);

        // The confirmation email is delivered to the normalized address.
        const confirmation = await mailhog.getLatestConfirmation(normalized);
        expect(confirmation.code).toMatch(/^\d{6}$/);
    });

    test('[API-SU-13] rejects a malformed JSON body', async () => {
        const res = await auth.signUpRaw('{ this is not valid json ');
        expect(res.status).toBe(400);
        expect(res.data.error).toBe(ERROR_MESSAGES.invalidJson);
    });

    test('[API-SU-14] rejects an empty body', async () => {
        const res = await auth.signUp(undefined, undefined);
        expect(res.status).toBe(400);
        expect(res.data.error).toBe(ERROR_MESSAGES.emailRequired);
    });
});
