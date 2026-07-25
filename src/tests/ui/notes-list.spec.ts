import { UI_MESSAGES } from '../../data/constants';
import { uniqueMarker } from '../../helpers/api';
import { test, expect } from '../../helpers/fixtures';
import { cleanupByMarker, loginToNotes, seedNote, uiToken } from '../../helpers/ui';

let token: string;
const searchMarker = uniqueMarker('UI-LS');
const pageMarker = uniqueMarker('UI-LP');

test.beforeAll(async () => {
    token = await uiToken();
    await seedNote(token, `${searchMarker} Alpha`, `${searchMarker} apple`);
    await seedNote(token, `${searchMarker} Bravo`, `${searchMarker} banana`);
    await seedNote(token, `${searchMarker} Charlie`, `${searchMarker} cherry`);
    for (let i = 1; i <= 6; i++) {
        await seedNote(token, `${pageMarker} ${String(i).padStart(2, '0')}`, 'x');
    }
});

test.afterAll(async () => {
    await cleanupByMarker(token, searchMarker);
    await cleanupByMarker(token, pageMarker);
});

test.beforeEach(async ({ page }) => {
    await loginToNotes(page, token);
});

test.describe('UI · Notes list (search, sort, pagination)', () => {
    test('[UI-LIST-01] free-text search (all fields)', async ({ notes }) => {
        await notes.search(searchMarker);
        await expect(notes.items()).toHaveCount(3);
    });

    test('[UI-LIST-02] search by Title only', async ({ notes }) => {
        await notes.selectField('title');
        await notes.search(`${searchMarker} Alpha`);
        await expect(notes.items()).toHaveCount(1);
        await expect(notes.card(`${searchMarker} Alpha`)).toBeVisible();
    });

    test('[UI-LIST-03] search by Content only', async ({ notes }) => {
        await notes.selectField('content');
        await notes.search(`${searchMarker} banana`);
        await expect(notes.items()).toHaveCount(1);
        await expect(notes.card(`${searchMarker} Bravo`)).toBeVisible();
    });

    test('[UI-LIST-04] list updates live while typing', async ({ notes }) => {
        await notes.selectField('title');
        await notes.search(searchMarker);
        await expect(notes.items()).toHaveCount(3);
        await notes.search(`${searchMarker} Charlie`);
        await expect(notes.items()).toHaveCount(1);
    });

    test('[UI-LIST-05] sort by title (A-Z / Z-A)', async ({ notes }) => {
        await notes.search(searchMarker);
        await expect(notes.items()).toHaveCount(3);

        await notes.selectSort('title_asc');
        await expect
            .poll(() => notes.titlesInOrder())
            .toEqual([`${searchMarker} Alpha`, `${searchMarker} Bravo`, `${searchMarker} Charlie`]);

        await notes.selectSort('title_desc');
        await expect
            .poll(() => notes.titlesInOrder())
            .toEqual([`${searchMarker} Charlie`, `${searchMarker} Bravo`, `${searchMarker} Alpha`]);
    });

    test('[UI-LIST-06] page size limits how many notes are shown', async ({ notes }) => {
        await notes.search(pageMarker);
        await expect(notes.items()).toHaveCount(6);

        await notes.selectPageSize('5');
        await expect(notes.items()).toHaveCount(5);
        await notes.prevPage.should.be.disabled();
        await notes.nextPage.should.not.be.disabled();
    });

    test('[UI-LIST-07] pagination next/prev navigates pages', async ({ notes }) => {
        await notes.search(pageMarker);
        await notes.selectPageSize('5');
        await expect(notes.items()).toHaveCount(5);

        await notes.goNextPage();
        await expect(notes.items()).toHaveCount(1);
        await notes.nextPage.should.be.disabled();
        await notes.prevPage.should.not.be.disabled();

        await notes.goPrevPage();
        await expect(notes.items()).toHaveCount(5);
    });

    test('[UI-LIST-08] search with no matches shows the empty state', async ({ notes }) => {
        await notes.search(uniqueMarker('UI-NORESULTS'));
        await notes.notesList.should.textContainString(UI_MESSAGES.noNotesFound);
    });
});
