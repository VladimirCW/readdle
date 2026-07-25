import { UI_MESSAGES } from '../../data/constants';
import { uniqueMarker } from '../../helpers/api';
import { test, expect } from '../../helpers/fixtures';
import { cleanupByMarker, loginToNotes, uiToken } from '../../helpers/ui';

let token: string;
const markers: string[] = [];

test.beforeAll(async () => {
    token = await uiToken();
});

test.beforeEach(async ({ page }) => {
    await loginToNotes(page, token);
});

test.afterEach(async () => {
    for (const marker of markers.splice(0)) {
        await cleanupByMarker(token, marker);
    }
});

test.describe('UI · Notes CRUD', () => {
    test('[UI-NOTE-01] creates a note', async ({ notes }) => {
        const title = uniqueMarker('UI-N01');
        markers.push(title);

        await notes.createNote(title, 'content body');

        await notes.status.should.textContainString(UI_MESSAGES.noteCreated);
        await expect(notes.card(title)).toBeVisible();
    });

    test('[UI-NOTE-02] shows a validation error when content is empty', async ({ notes }) => {
        const title = uniqueMarker('UI-N02');
        markers.push(title);

        await notes.noteTitle.fill(title);
        await notes.createSubmit.click();

        await notes.status.should.textContainString('required');
        await expect(notes.card(title)).toHaveCount(0);
    });

    test('[UI-NOTE-03] edits a note via the modal', async ({ notes }) => {
        const title = uniqueMarker('UI-N03');
        const newTitle = `${title}-edited`;
        markers.push(title);

        await notes.createNote(title, 'original');
        await expect(notes.card(title)).toBeVisible();

        await notes.openEditModal(title);
        await notes.submitEdit(newTitle, 'updated body');

        await notes.status.should.textContainString(UI_MESSAGES.noteUpdated);
        await expect(notes.card(newTitle)).toBeVisible();
        await expect(notes.card(title).filter({ hasText: 'original' })).toHaveCount(0);
    });

    test('[UI-NOTE-04] cancelling the edit modal keeps the note unchanged', async ({ notes }) => {
        const title = uniqueMarker('UI-N04');
        markers.push(title);

        await notes.createNote(title, 'original');
        await notes.openEditModal(title);
        await notes.modal().locator('input[name="title"]').fill(`${title}-should-not-save`);
        await notes.cancelModal();

        await expect(notes.card(title)).toBeVisible();
        await expect(notes.card(`${title}-should-not-save`)).toHaveCount(0);
    });

    test('[UI-NOTE-05] deletes a note after confirmation', async ({ notes }) => {
        const title = uniqueMarker('UI-N05');
        markers.push(title);

        await notes.createNote(title, 'to delete');
        await expect(notes.card(title)).toBeVisible();

        await notes.openDeleteModal(title);
        await notes.confirmDelete();

        await notes.status.should.textContainString(UI_MESSAGES.noteDeleted);
        await expect(notes.card(title)).toHaveCount(0);
    });

    test('[UI-NOTE-06] cancelling the delete modal keeps the note', async ({ notes }) => {
        const title = uniqueMarker('UI-N06');
        markers.push(title);

        await notes.createNote(title, 'keep me');
        await notes.openDeleteModal(title);
        await notes.cancelModal();

        await expect(notes.card(title)).toBeVisible();
    });

    test('[UI-NOTE-07] shows the empty state when a filtered list has no notes', async ({ notes }) => {
        const title = uniqueMarker('UI-N07');
        markers.push(title);

        await notes.createNote(title, 'x');
        await notes.search(title);
        await expect(notes.items()).toHaveCount(1);

        await notes.openDeleteModal(title);
        await notes.confirmDelete();

        await notes.notesList.should.textContainString(UI_MESSAGES.noNotesFound);
    });
});
