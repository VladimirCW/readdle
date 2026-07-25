import { test, expect } from '@playwright/test';
import { AuthApiService, NotesApiService } from '../../services';
import { testConfig } from '../../config';
import { extractToken, uniqueMarker } from '../../helpers/api';

const auth = new AuthApiService();
const notes = new NotesApiService();

let tokenA: string;
let tokenB: string;
const createdIds: string[] = [];

async function createNoteAsA(title = uniqueMarker('NG'), content = 'content'): Promise<any> {
    const res = await notes.create(tokenA, { title, content });
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

test.describe('API · GET /api/notes/{id}', () => {
    test('[API-NG-01] returns an owned note', async () => {
        const note = await createNoteAsA();
        const res = await notes.getOne(tokenA, note.id);
        expect(res.status).toBe(200);
        expect(res.data.id).toBe(note.id);
        expect(res.data.title).toBe(note.title);
    });

    test('[API-NG-02] does not expose another user\'s note (404)', async () => {
        const note = await createNoteAsA();
        const res = await notes.getOne(tokenB, note.id);
        expect(res.status).toBe(404);
    });

    test('[API-NG-03] returns 404 for a non-existent id', async () => {
        const res = await notes.getOne(tokenA, 'non-existent-id-1234');
        expect(res.status).toBe(404);
    });

    test('[API-NG-04] rejects an unauthenticated request (401)', async () => {
        const note = await createNoteAsA();
        const res = await notes.getOne(undefined, note.id);
        expect(res.status).toBe(401);
    });
});
