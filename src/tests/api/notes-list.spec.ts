import { test, expect } from '@playwright/test';
import { AuthApiService, NotesApiService } from '../../services';
import { testConfig } from '../../config';
import { LIMITS } from '../../data/constants';
import { extractToken, uniqueMarker } from '../../helpers/api';

// List/search/sort/pagination tests depend on a stable seeded dataset, so this
// file runs serially in a single worker (seed once, assert, clean up).
test.describe.configure({ mode: 'serial' });

const auth = new AuthApiService();
const notes = new NotesApiService();

const A = testConfig.accounts.A;
const B = testConfig.accounts.B;

const isSortedAsc = (nums: number[]): boolean => nums.every((n, i) => i === 0 || nums[i - 1] <= n);
const isSortedDesc = (nums: number[]): boolean => nums.every((n, i) => i === 0 || nums[i - 1] >= n);

test.describe('API · GET /api/notes (list, search, sort, pagination)', () => {
    const M = uniqueMarker('LIST');
    const seeded: any[] = [];
    let tokenA: string;
    let tokenB: string;

    test.beforeAll(async () => {
        tokenA = extractToken(await auth.signIn(A.email, A.password)) as string;
        tokenB = extractToken(await auth.signIn(B.email, B.password)) as string;

        const data: Array<[string, string]> = [
            [`${M} Apple`, `${M} red fruit`],
            [`${M} Banana`, `${M} yellow fruit`],
            [`${M} Cherry`, `${M} red berry`],
        ];
        for (const [title, content] of data) {
            const res = await notes.create(tokenA, { title, content });
            expect(res.status, 'seed note').toBe(201);
            seeded.push(res.data);
            // space out timestamps so updatedAt sorting is deterministic (second granularity)
            await new Promise((r) => setTimeout(r, 1100));
        }
    });

    test.afterAll(async () => {
        for (const note of seeded) {
            await notes.remove(tokenA, note.id);
        }
    });

    test('[API-NL-01] lists the owner notes with expected fields', async () => {
        const res = await notes.list(tokenA, { q: M });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBeTruthy();
        expect(res.data.length).toBe(3);
        for (const note of res.data) {
            expect(note.id).toBeTruthy();
            expect(note.title).toContain(M);
            expect(note).toHaveProperty('content');
            expect(note).toHaveProperty('created_at');
            expect(note).toHaveProperty('updated_at');
        }
    });

    test('[API-NL-02] does not return another user\'s notes (ownership isolation)', async () => {
        const res = await notes.list(tokenB, { q: M });
        expect(res.status).toBe(200);
        expect(res.data.length).toBe(0);
    });

    test('[API-NL-03] returns an empty array when nothing matches', async () => {
        const res = await notes.list(tokenA, { q: uniqueMarker('NONE') });
        expect(res.status).toBe(200);
        expect(res.data.length).toBe(0);
    });

    test('[API-NL-04] rejects an unauthenticated list (401)', async () => {
        const res = await notes.list(undefined, { q: M });
        expect(res.status).toBe(401);
    });

    test('[API-NL-05] free-text q matches across title and content', async () => {
        const res = await notes.list(tokenA, { q: M });
        expect(res.status).toBe(200);
        expect(res.data.length).toBe(3);
    });

    test('[API-NL-06] title filter (partial match)', async () => {
        const res = await notes.list(tokenA, { title: `${M} Banana` });
        expect(res.status).toBe(200);
        expect(res.data.length).toBe(1);
        expect(res.data[0].title).toContain('Banana');
    });

    test('[API-NL-07] content filter (partial match)', async () => {
        const res = await notes.list(tokenA, { content: `${M} red` });
        expect(res.status).toBe(200);
        expect(res.data.length).toBe(2);
    });

    test('[API-NL-08] sort by updatedAt (asc / desc)', async () => {
        const asc = await notes.list(tokenA, { q: M, 'sort[updatedAt]': 'asc' });
        expect(asc.status).toBe(200);
        expect(isSortedAsc(asc.data.map((n: any) => new Date(n.updated_at).getTime()))).toBeTruthy();

        const desc = await notes.list(tokenA, { q: M, 'sort[updatedAt]': 'desc' });
        expect(isSortedDesc(desc.data.map((n: any) => new Date(n.updated_at).getTime()))).toBeTruthy();
    });

    test('[API-NL-09] sort by title (asc / desc)', async () => {
        const asc = await notes.list(tokenA, { q: M, 'sort[title]': 'asc' });
        const ascTitles = asc.data.map((n: any) => n.title);
        expect(ascTitles).toEqual([...ascTitles].sort());

        const desc = await notes.list(tokenA, { q: M, 'sort[title]': 'desc' });
        const descTitles = desc.data.map((n: any) => n.title);
        expect(descTitles).toEqual([...descTitles].sort().reverse());
    });

    test('[API-NL-10] pagination splits results across pages', async () => {
        const p1 = await notes.list(tokenA, { q: M, itemsPerPage: 2, page: 1 });
        const p2 = await notes.list(tokenA, { q: M, itemsPerPage: 2, page: 2 });
        expect(p1.status).toBe(200);
        expect(p1.data.length).toBe(2);
        expect(p2.data.length).toBe(1);

        const ids1: string[] = p1.data.map((n: any) => n.id);
        const ids2: string[] = p2.data.map((n: any) => n.id);
        expect(ids1.filter((id) => ids2.includes(id)).length).toBe(0);
        expect(new Set([...ids1, ...ids2]).size).toBe(3);
    });

    test('[API-NL-12] combined filter + sort + pagination', async () => {
        const res = await notes.list(tokenA, { q: M, 'sort[title]': 'asc', itemsPerPage: 5 });
        expect(res.status).toBe(200);
        expect(res.data.length).toBe(3);
        const titles = res.data.map((n: any) => n.title);
        expect(titles).toEqual([...titles].sort());
    });

    test('[API-NL-13] tolerates invalid query params without a 500', async () => {
        const res = await notes.list(tokenA, { q: M, itemsPerPage: 'abc', page: -1 });
        expect(res.status).toBeLessThan(500);
    });
});

test.describe('API · GET /api/notes pagination cap', () => {
    const M2 = uniqueMarker('CAP');
    const capIds: string[] = [];
    let tokenA: string;

    test.beforeAll(async () => {
        tokenA = extractToken(await auth.signIn(A.email, A.password)) as string;
        for (let i = 0; i < LIMITS.notesItemsPerPageMax + 1; i++) {
            const res = await notes.create(tokenA, { title: `${M2} ${i}`, content: 'x' });
            expect(res.status, `seed cap note ${i}`).toBe(201);
            capIds.push(res.data.id);
        }
    });

    test.afterAll(async () => {
        for (const id of capIds) {
            await notes.remove(tokenA, id);
        }
    });

    test('[API-NL-11] caps itemsPerPage at 50', async () => {
        const res = await notes.list(tokenA, { q: M2, itemsPerPage: 1000 });
        expect(res.status).toBe(200);
        expect(res.data.length).toBe(LIMITS.notesItemsPerPageMax);
    });
});
