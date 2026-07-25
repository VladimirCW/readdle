import { test, expect } from '@playwright/test';
import { AuthApiService, NotesApiService } from '../../services';
import { testConfig } from '../../config';
import { LIMITS } from '../../data/constants';
import { extractToken, uniqueMarker, stringOfLength } from '../../helpers/api';

const auth = new AuthApiService();
const notes = new NotesApiService();

let tokenA: string;
let tokenB: string;
const createdIds: string[] = [];

function hasViolation(data: any, propertyPath: string): boolean {
    return Array.isArray(data?.violations) && data.violations.some((v: any) => v.propertyPath === propertyPath);
}

test.beforeAll(async () => {
    tokenA = extractToken(await auth.signIn(testConfig.accounts.A.email, testConfig.accounts.A.password)) as string;
    tokenB = extractToken(await auth.signIn(testConfig.accounts.B.email, testConfig.accounts.B.password)) as string;
    expect(tokenA && tokenB, 'precondition: sign in A and B').toBeTruthy();
});

test.afterAll(async () => {
    for (const id of createdIds) {
        await notes.remove(tokenA, id);
    }
});

test.describe('API · POST /api/notes', () => {
    test('[API-NC-01] creates a note and echoes its fields', async () => {
        const title = uniqueMarker('NC01');
        const res = await notes.create(tokenA, { title, content: 'hello world' });

        expect(res.status).toBe(201);
        expect(res.data.id).toBeTruthy();
        createdIds.push(res.data.id);
        expect(res.data.title).toBe(title);
        expect(res.data.content).toBe('hello world');
        expect(res.data.created_at).toBeTruthy();
        expect(res.data.updated_at).toBeTruthy();
    });

    test('[API-NC-02] owner cannot be spoofed via the request body', async () => {
        const res = await notes.create(tokenA, {
            title: uniqueMarker('NC02'),
            content: 'x',
            owner: '/api/users/somebody-else',
        });
        expect(res.status).toBe(201);
        createdIds.push(res.data.id);

        // The note is owned by A: A can read it, B cannot.
        expect((await notes.getOne(tokenA, res.data.id)).status).toBe(200);
        expect((await notes.getOne(tokenB, res.data.id)).status).toBe(404);
    });

    test('[API-NC-03] rejects a missing title (422)', async () => {
        const res = await notes.create(tokenA, { content: 'no title here' });
        expect(res.status).toBe(422);
        expect(hasViolation(res.data, 'title')).toBeTruthy();
    });

    test('[API-NC-04] rejects a missing content (422)', async () => {
        const res = await notes.create(tokenA, { title: uniqueMarker('NC04') });
        expect(res.status).toBe(422);
        expect(hasViolation(res.data, 'content')).toBeTruthy();
    });

    test('[API-NC-05] rejects a blank title (422)', async () => {
        const res = await notes.create(tokenA, { title: '   ', content: 'x' });
        expect(res.status).toBe(422);
        expect(hasViolation(res.data, 'title')).toBeTruthy();
    });

    test('[API-NC-06] rejects a blank content (422)', async () => {
        const res = await notes.create(tokenA, { title: uniqueMarker('NC06'), content: '' });
        expect(res.status).toBe(422);
        expect(hasViolation(res.data, 'content')).toBeTruthy();
    });

    test('[API-NC-07] enforces the title max length (255 ok, 256 rejected)', async () => {
        const ok = await notes.create(tokenA, { title: stringOfLength(LIMITS.titleMax), content: 'x' });
        expect(ok.status).toBe(201);
        createdIds.push(ok.data.id);

        const tooLong = await notes.create(tokenA, { title: stringOfLength(LIMITS.titleMax + 1), content: 'x' });
        expect(tooLong.status).toBe(422);
        expect(hasViolation(tooLong.data, 'title')).toBeTruthy();
    });

    test('[API-NC-08] enforces the content max length (10000 ok, 10001 rejected)', async () => {
        const ok = await notes.create(tokenA, { title: uniqueMarker('NC08'), content: stringOfLength(LIMITS.contentMax) });
        expect(ok.status).toBe(201);
        createdIds.push(ok.data.id);

        const tooLong = await notes.create(tokenA, {
            title: uniqueMarker('NC08b'),
            content: stringOfLength(LIMITS.contentMax + 1),
        });
        expect(tooLong.status).toBe(422);
        expect(hasViolation(tooLong.data, 'content')).toBeTruthy();
    });

    test('[API-NC-09] trims the title', async () => {
        const res = await notes.create(tokenA, { title: '  trimmed-title  ', content: 'x' });
        expect(res.status).toBe(201);
        createdIds.push(res.data.id);
        expect(res.data.title).toBe('trimmed-title');
    });

    test('[API-NC-10] rejects an unauthenticated create', async () => {
        const res = await notes.create(undefined, { title: 'x', content: 'y' });
        expect(res.status).toBe(401);
    });

    test('[API-NC-11] KNOWN DEFECT: validation error without JSON Accept returns 500', async () => {
        test.info().annotations.push({
            type: 'defect',
            description:
                'With Accept: */* the server negotiates jsonld and throws 500 ' +
                '("Serialization for the format \\"jsonld\\" is not supported") instead of a clean 4xx.',
        });
        test.fail(); // expected-to-fail until the defect is resolved
        const res = await notes.create(tokenA, { title: uniqueMarker('NC11') }, { Accept: '*/*' });
        expect(res.status).toBeLessThan(500);
    });
});
