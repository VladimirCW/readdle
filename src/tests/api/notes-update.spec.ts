import { test, expect } from '@playwright/test';
import { AuthApiService, NotesApiService } from '../../services';
import { testConfig } from '../../config';
import { extractToken, uniqueMarker } from '../../helpers/api';

const auth = new AuthApiService();
const notes = new NotesApiService();

let tokenA: string;
let tokenB: string;
const createdIds: string[] = [];

async function createNoteAsA(): Promise<any> {
    const res = await notes.create(tokenA, { title: uniqueMarker('NU'), content: 'original content' });
    expect(res.status, 'precondition: create note').toBe(201);
    createdIds.push(res.data.id);
    return res.data;
}

test.beforeAll(async () => {
    tokenA = extractToken(await auth.signIn(testConfig.accounts.A.email, testConfig.accounts.A.password)) as string;
    tokenB = extractToken(await auth.signIn(testConfig.accounts.B.email, testConfig.accounts.B.password)) as string;
});

test.afterAll(async () => {
    for (const id of createdIds) {
        await notes.remove(tokenA, id);
    }
});

test.describe('API · PUT /api/notes/{id}', () => {
    test('[API-NU-01] updates an owned note and bumps updated_at', async () => {
        const note = await createNoteAsA();
        const newTitle = uniqueMarker('NU01-updated');

        const res = await notes.update(tokenA, note.id, { title: newTitle, content: 'updated content' });
        expect(res.status).toBe(200);
        expect(res.data.title).toBe(newTitle);
        expect(res.data.content).toBe('updated content');
        expect(res.data.created_at).toBe(note.created_at);
        expect(new Date(res.data.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(note.created_at).getTime());
    });

    test('[API-NU-02] cannot update another user\'s note (404)', async () => {
        const note = await createNoteAsA();
        const res = await notes.update(tokenB, note.id, { title: 'hacked', content: 'hacked' });
        expect(res.status).toBe(404);

        // Original is unchanged.
        const check = await notes.getOne(tokenA, note.id);
        expect(check.data.title).toBe(note.title);
    });

    test('[API-NU-03] rejects invalid data (422) and leaves the note unchanged', async () => {
        const note = await createNoteAsA();
        const res = await notes.update(tokenA, note.id, { title: '', content: '' });
        expect(res.status).toBe(422);

        const check = await notes.getOne(tokenA, note.id);
        expect(check.data.title).toBe(note.title);
    });

    test('[API-NU-04] returns 404 for a non-existent id', async () => {
        const res = await notes.update(tokenA, 'non-existent-id-1234', { title: 'x', content: 'y' });
        expect(res.status).toBe(404);
    });

    test('[API-NU-05] rejects an unauthenticated update (401)', async () => {
        const note = await createNoteAsA();
        const res = await notes.update(undefined, note.id, { title: 'x', content: 'y' });
        expect(res.status).toBe(401);
    });

    test('[API-NU-06] updated_at increases across successive updates', async () => {
        const note = await createNoteAsA();
        const first = await notes.update(tokenA, note.id, { title: uniqueMarker('NU06-1'), content: 'a' });
        expect(first.status).toBe(200);

        await new Promise((r) => setTimeout(r, 1100));

        const second = await notes.update(tokenA, note.id, { title: uniqueMarker('NU06-2'), content: 'b' });
        expect(second.status).toBe(200);
        expect(new Date(second.data.updated_at).getTime()).toBeGreaterThan(
            new Date(first.data.updated_at).getTime(),
        );
    });
});
