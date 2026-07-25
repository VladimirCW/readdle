import { test, expect } from '@playwright/test';
import { AuthApiService, NotesApiService } from '../../services';
import { testConfig } from '../../config';
import { ENDPOINTS } from '../../data/constants';
import { extractToken, uniqueMarker } from '../../helpers/api';

const auth = new AuthApiService();
const notes = new NotesApiService();

let tokenA: string;
let tokenB: string;
const createdIds: string[] = [];

test.beforeAll(async () => {
    tokenA = extractToken(await auth.signIn(testConfig.accounts.A.email, testConfig.accounts.A.password)) as string;
    tokenB = extractToken(await auth.signIn(testConfig.accounts.B.email, testConfig.accounts.B.password)) as string;
});

test.afterAll(async () => {
    for (const id of createdIds) {
        await notes.remove(tokenA, id);
    }
});

test.describe('API · cross-cutting', () => {
    test('[API-X-01] responses carry security headers', async () => {
        const res = await notes.list(tokenA, {});
        expect(res.status).toBe(200);
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBeTruthy();
    });

    test('[API-X-02] wrong HTTP method returns 405', async () => {
        const res = await auth.sendRaw('PATCH', ENDPOINTS.me, {
            headers: { Authorization: `Bearer ${tokenA}`, Accept: 'application/json' },
        });
        expect(res.status).toBe(405);
    });

    test('[API-X-03] unknown route returns 404', async () => {
        const res = await auth.sendRaw('GET', '/api/does-not-exist', {
            headers: { Authorization: `Bearer ${tokenA}`, Accept: 'application/json' },
        });
        expect(res.status).toBe(404);
    });

    test('[API-X-04] OpenAPI doc is reachable and lists all endpoints', async () => {
        const res = await auth.docJson();
        expect(res.status).toBe(200);
        const paths = Object.keys(res.data?.paths ?? {});
        for (const endpoint of [
            ENDPOINTS.signup,
            ENDPOINTS.confirm,
            ENDPOINTS.signin,
            ENDPOINTS.me,
            ENDPOINTS.notes,
        ]) {
            expect(paths).toContain(endpoint);
        }
        expect(paths.some((p) => p.startsWith(`${ENDPOINTS.notes}/`))).toBeTruthy();
    });

    test('[API-X-05] filters never leak another tenant notes', async () => {
        const title = uniqueMarker('X05');
        const created = await notes.create(tokenA, { title, content: 'secret' });
        expect(created.status).toBe(201);
        createdIds.push(created.data.id);

        const res = await notes.list(tokenB, { q: title });
        expect(res.status).toBe(200);
        expect(res.data.length).toBe(0);
    });

    test('[API-X-06] core endpoint responds within a reasonable time', async () => {
        const start = Date.now();
        const res = await notes.list(tokenA, {});
        const elapsed = Date.now() - start;
        expect(res.status).toBe(200);
        expect(elapsed).toBeLessThan(5000);
    });
});
