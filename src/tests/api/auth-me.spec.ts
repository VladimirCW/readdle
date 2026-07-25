import { test, expect } from '@playwright/test';
import { AuthApiService } from '../../services';
import { testConfig } from '../../config';
import { extractToken } from '../../helpers/api';

const auth = new AuthApiService();
const accountA = testConfig.accounts.A;

let tokenA: string;

test.beforeAll(async () => {
    tokenA = extractToken(await auth.signIn(accountA.email, accountA.password)) as string;
    expect(tokenA, 'precondition: sign in account A').toBeTruthy();
});

test.describe('API · GET /api/auth/me', () => {
    test('[API-ME-01] returns the current user for a valid token', async () => {
        const res = await auth.me(tokenA);
        expect(res.status).toBe(200);
        expect(res.data.email).toBe(accountA.email);
        expect(res.data.id).toMatch(/^[0-9a-f-]{36}$/i);
    });

    test('[API-ME-02] rejects a request with no token', async () => {
        const res = await auth.me(undefined);
        expect(res.status).toBe(401);
    });

    test('[API-ME-03] rejects a malformed/garbage token', async () => {
        const res = await auth.me('not-a-valid-jwt');
        expect(res.status).toBe(401);
    });

    // Requires an expired token; a freshly issued JWT lives ~1h and we cannot
    // forge one without the signing key. Enable on a local env with time control.
    test.skip('[API-ME-04] rejects an expired token', async () => {
        // Intentionally skipped — see note above.
    });

    test('[API-ME-05] rejects a token with a tampered payload', async () => {
        const [header, payload, signature] = tokenA.split('.');
        // Flip a character in the payload so the signature no longer matches.
        const tampered = `${header}.${payload.slice(0, -2)}${payload.slice(-2) === 'AA' ? 'BB' : 'AA'}.${signature}`;
        const res = await auth.me(tampered);
        expect(res.status).toBe(401);
    });
});
