import { test as base, expect } from '@playwright/test';
import { AuthPage, NotesPage, ProfilePage } from '../PO/notesApp';

/**
 * Page-object fixtures for the UI suite.
 *
 * Fixtures are lazy (a page object is only built when a test requests it) and
 * per-test (each is bound to that test's own fresh `page`), which is why they
 * replace both the per-test `new XxxPage(page)` calls and beforeEach wiring.
 */
interface PageObjects {
    auth: AuthPage;
    notes: NotesPage;
    profile: ProfilePage;
}

export const test = base.extend<PageObjects>({
    auth: async ({ page }, use) => {
        await use(new AuthPage(page));
    },
    notes: async ({ page }, use) => {
        await use(new NotesPage(page));
    },
    profile: async ({ page }, use) => {
        await use(new ProfilePage(page));
    },
});

export { expect };
