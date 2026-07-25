import { test, expect } from '@playwright/test';
import { AuthApiService } from '../../services';
import { testConfig } from '../../config';
import { ERROR_MESSAGES } from '../../data/constants';
import { extractToken, decodeJwt, uniqueEmail, DEFAULT_PASSWORD } from '../../helpers/api';

const auth = new AuthApiService();
const smoke = testConfig.accounts.smoke;

test.describe('API · POST /api/auth/signin', () => {
    test('[API-SI-01] signs in a verified user and returns a JWT', async () => {
        const res = await auth.signIn(smoke.email, smoke.password);
        expect(res.status).toBe(200);
        expect(extractToken(res)).toBeTruthy();
    });

    test('[API-SI-02] issued JWT carries expected claims and a 1h expiry', async () => {
        const token = extractToken(await auth.signIn(smoke.email, smoke.password));
        const claims = decodeJwt(token as string);

        expect(claims['username']).toBe(smoke.email);
        expect(claims['roles']).toContain('ROLE_USER');
        expect(Number(claims['exp']) - Number(claims['iat'])).toBe(3600);
    });

    test('[API-SI-03] rejects a wrong password', async () => {
        const res = await auth.signIn(smoke.email, 'definitely-wrong-password');
        expect(res.status).toBe(401);
        expect(res.data.message).toBe(ERROR_MESSAGES.invalidCredentials);
    });

    test('[API-SI-04] rejects a non-existent user', async () => {
        const res = await auth.signIn(uniqueEmail('aqa-si04-nouser'), DEFAULT_PASSWORD);
        expect(res.status).toBe(401);
        expect(res.data.message).toBe(ERROR_MESSAGES.invalidCredentials);
    });

    test('[API-SI-05] rejects an unverified user', async () => {
        const email = uniqueEmail('aqa-si05-unverified');
        expect((await auth.signUp(email, DEFAULT_PASSWORD)).status).toBe(201);

        const res = await auth.signIn(email, DEFAULT_PASSWORD);
        expect(res.status).toBe(401);
        expect(String(res.data.message)).toMatch(/not confirmed/i);
    });

    test('[API-SI-06] rejects missing credentials', async () => {
        const res = await auth.signIn(smoke.email, undefined);
        expect([400, 401]).toContain(res.status);
        expect(extractToken(res)).toBeFalsy();
    });

    test('[API-SI-07] does not leak whether an account exists (no user enumeration)', async () => {
        const wrongPassword = await auth.signIn(smoke.email, 'definitely-wrong-password');
        const unknownUser = await auth.signIn(uniqueEmail('aqa-si07-nouser'), DEFAULT_PASSWORD);

        expect(wrongPassword.status).toBe(401);
        expect(unknownUser.status).toBe(401);
        expect(wrongPassword.data.message).toBe(ERROR_MESSAGES.invalidCredentials);
        expect(unknownUser.data.message).toBe(ERROR_MESSAGES.invalidCredentials);
    });
});
