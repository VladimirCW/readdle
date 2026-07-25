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
    const res = await notes.create(tokenA, { title: uniqueMarker('ND'), content: 'to be deleted' });
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

test.describe('API · DELETE /api/notes/{id}', () => {
    test('[API-ND-01] deletes an owned note (204) and it becomes unreachable', async () => {
        const note = await createNoteAsA();
        const res = await notes.remove(tokenA, note.id);
        expect(res.status).toBe(204);
        expect((await notes.getOne(tokenA, note.id)).status).toBe(404);
    });

    test('[API-ND-02] cannot delete another user\'s note (404)', async () => {
        const note = await createNoteAsA();
        const res = await notes.remove(tokenB, note.id);
        expect(res.status).toBe(404);
        // Still there for the owner.
        expect((await notes.getOne(tokenA, note.id)).status).toBe(200);
    });

    test('[API-ND-03] returns 404 for a non-existent id', async () => {
        const res = await notes.remove(tokenA, 'non-existent-id-1234');
        expect(res.status).toBe(404);
    });

    test('[API-ND-04] deleting an already-deleted note returns 404', async () => {
        const note = await createNoteAsA();
        expect((await notes.remove(tokenA, note.id)).status).toBe(204);
        expect((await notes.remove(tokenA, note.id)).status).toBe(404);
    });

    test('[API-ND-05] rejects an unauthenticated delete (401)', async () => {
        const note = await createNoteAsA();
        const res = await notes.remove(undefined, note.id);
        expect(res.status).toBe(401);
    });
});
