import { AuthApiService, MailhogService } from '../../services';
import { testConfig } from '../../config';
import { UI, UI_MESSAGES } from '../../data/constants';
import { uniqueEmail, DEFAULT_PASSWORD } from '../../helpers/api';
import { test, expect } from '../../helpers/fixtures';
import { uiToken, authenticate } from '../../helpers/ui';

const authApi = new AuthApiService();
const mailhog = new MailhogService();
const uiAccount = testConfig.accounts.ui;

test.describe('UI · Authentication & session', () => {
    test('[UI-AUTH-01] sign-up happy path shows a confirmation message', async ({ auth }) => {
        const email = uniqueEmail('ui-su');
        await auth.goTo();
        await auth.signUp(email, DEFAULT_PASSWORD);

        await auth.status.should.textContainString(UI_MESSAGES.signUpSent);
        await auth.status.should.textContainString(email);
    });

    test('[UI-AUTH-02] full sign-up → email link → confirm → lands on Notes', async ({ page, auth, notes }) => {
        const email = uniqueEmail('ui-confirm');
        await auth.goTo();
        await auth.signUp(email, DEFAULT_PASSWORD);
        await auth.status.should.textContainString(UI_MESSAGES.signUpSent);

        const { link } = await mailhog.getLatestConfirmation(email);
        await page.goto(link, { waitUntil: 'commit' });

        await notes.accountSection.wait.to.be.visible();
        await notes.status.should.textContainString(UI_MESSAGES.accountConfirmed);
    });

    test('[UI-AUTH-03] sign-in happy path enters the account', async ({ auth, notes }) => {
        await auth.goTo();
        await auth.signIn(uiAccount.email, uiAccount.password);

        await notes.accountSection.wait.to.be.visible();
        await notes.status.should.textContainString(UI_MESSAGES.signedIn);
        await notes.accountTitle.should.textContainString('Notes');
    });

    test('[UI-AUTH-04] sign-in with a wrong password shows an error', async ({ auth }) => {
        await auth.goTo();
        await auth.signIn(uiAccount.email, 'wrong-password-123');

        await auth.status.should.textContainString(UI_MESSAGES.invalidCredentials);
        await auth.authSection.should.be.visible();
    });

    test('[UI-AUTH-05] sign-in with an unverified account shows an error', async ({ auth }) => {
        const email = uniqueEmail('ui-unverified');
        expect((await authApi.signUp(email, DEFAULT_PASSWORD)).status).toBe(201);

        await auth.goTo();
        await auth.signIn(email, DEFAULT_PASSWORD);

        await auth.status.should.textContainString('not confirmed');
        await auth.authSection.should.be.visible();
    });

    test('[UI-AUTH-06] sign-up with an existing verified email shows an error', async ({ auth }) => {
        await auth.goTo();
        await auth.signUp(testConfig.accounts.smoke.email, testConfig.accounts.smoke.password);

        await auth.status.should.textContainString('User already exists.');
    });

    test('[UI-AUTH-07] session persists across a page reload', async ({ page, notes }) => {
        await authenticate(page, await uiToken());
        await notes.goTo();
        await notes.accountSection.wait.to.be.visible();

        await page.reload({ waitUntil: 'commit' });
        await notes.accountSection.wait.to.be.visible();
    });

    test('[UI-AUTH-08] logout clears the session', async ({ page, auth, notes }) => {
        await authenticate(page, await uiToken());
        await notes.goTo();
        await notes.accountSection.wait.to.be.visible();

        await notes.logout();

        await auth.authSection.wait.to.be.visible();
        await auth.status.should.textContainString(UI_MESSAGES.loggedOut);
        const stored = await page.evaluate((key) => localStorage.getItem(key), UI.tokenKey);
        expect(stored).toBeNull();
    });

    test('[UI-AUTH-09] a protected route without a token falls back to auth UI', async ({ auth, notes }) => {
        await notes.goTo(); // /account/notes with an empty (fresh) localStorage

        await auth.authSection.wait.to.be.visible();
        await notes.accountSection.should.not.be.visible();
    });

    test('[UI-AUTH-10] an invalid confirmation link shows an error and the auth UI', async ({ page, auth }) => {
        await page.goto(
            `${testConfig.apiBaseUrl}/app?confirm_email=${encodeURIComponent(uniqueEmail('ui-nolink'))}&confirm_code=000000`,
            { waitUntil: 'commit' },
        );

        await auth.authSection.wait.to.be.visible();
        await auth.status.should.textContainString('User not found.');
    });
});
