import { UI } from '../../data/constants';
import { uniqueMarker } from '../../helpers/api';
import { test, expect } from '../../helpers/fixtures';
import { cleanupByMarker, loginToNotes, setRawToken, uiToken } from '../../helpers/ui';

let token: string;
const markers: string[] = [];

test.beforeAll(async () => {
    token = await uiToken();
});

test.afterEach(async () => {
    for (const marker of markers.splice(0)) {
        await cleanupByMarker(token, marker);
    }
});

test.describe('UI · Robustness & security', () => {
    test('[UI-SEC-01] note content is rendered as text (no XSS execution)', async ({ page, notes }) => {
        await loginToNotes(page, token);

        const marker = uniqueMarker('UI-XSS');
        markers.push(marker);
        const payload = '<img src=x onerror="window.__xssExecuted=true">';

        await notes.createNote(`${marker} ${payload}`, `${payload} body`);
        await notes.search(marker);
        await expect(notes.items()).toHaveCount(1);

        // The injected handler must NOT have run, and the markup is shown literally.
        const executed = await page.evaluate(() => (window as unknown as { __xssExecuted?: boolean }).__xssExecuted);
        expect(executed).toBeFalsy();
        await expect(notes.items().first()).toContainText('onerror');
    });

    test('[UI-SEC-03] an invalid/expired token is cleared and auth UI is shown', async ({ page, auth, notes }) => {
        await setRawToken(page, 'invalid.jwt.token');
        await notes.goTo();

        await auth.authSection.wait.to.be.visible();
        const stored = await page.evaluate((key) => localStorage.getItem(key), UI.tokenKey);
        expect(stored).toBeNull();
    });
});
