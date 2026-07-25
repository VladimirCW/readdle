import { testConfig } from '../../config';
import { test, expect } from '../../helpers/fixtures';
import { loginToNotes, uiToken } from '../../helpers/ui';

let token: string;
const uiAccount = testConfig.accounts.ui;

test.beforeAll(async () => {
    token = await uiToken();
});

test.beforeEach(async ({ page }) => {
    await loginToNotes(page, token);
});

test.describe('UI · Profile & navigation', () => {
    test('[UI-PROF-01] profile shows account email and id', async ({ notes, profile }) => {
        await notes.openProfile();

        await profile.profileView.wait.to.be.visible();
        await profile.profileEmail.should.textContainString(uiAccount.email);
        await expect(profile.profileId.locator).toHaveText(/[0-9a-f-]{36}/i);
    });

    test('[UI-NAV-01] navigate between Notes and Profile', async ({ page, notes, profile }) => {
        await notes.accountTitle.should.textContainString('Notes');
        await expect(page).toHaveURL(/\/account\/notes$/);

        await notes.openProfile();
        await profile.accountTitle.should.textContainString('Profile');
        await expect(page).toHaveURL(/\/account\/profile$/);
        await profile.profileEmail.should.textContainString(uiAccount.email);

        await profile.openNotes();
        await notes.accountTitle.should.textContainString('Notes');
        await expect(page).toHaveURL(/\/account\/notes$/);
    });

    test('[UI-NAV-02] browser back/forward re-renders the previous view', async ({ page, notes }) => {
        await notes.accountTitle.should.textContainString('Notes');

        await notes.openProfile();
        await notes.accountTitle.should.textContainString('Profile');

        await page.goBack();
        await notes.accountTitle.should.textContainString('Notes');

        await page.goForward();
        await notes.accountTitle.should.textContainString('Profile');
    });
});
