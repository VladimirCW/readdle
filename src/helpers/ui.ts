import { Page, expect } from '@playwright/test';
import { AuthApiService, NotesApiService } from '../services';
import { testConfig } from '../config';
import { UI } from '../data/constants';
import { extractToken } from './api';

const auth = new AuthApiService();
const notes = new NotesApiService();

/** Sign in (via API) and return a JWT for the given account. */
export async function apiToken(email: string, password: string): Promise<string> {
    const token = extractToken(await auth.signIn(email, password));
    if (!token) {
        throw new Error(`Could not obtain a token for '${email}'`);
    }
    return token;
}

/** JWT for the dedicated UI account. */
export function uiToken(): Promise<string> {
    return apiToken(testConfig.accounts.ui.email, testConfig.accounts.ui.password);
}

/**
 * Seed the SPA's localStorage token on the app origin (does not navigate away).
 */
export async function authenticate(page: Page, token: string): Promise<void> {
    await page.goto(`${testConfig.apiBaseUrl}${UI.paths.root}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: UI.tokenKey, value: token },
    );
}

export async function loginToNotes(page: Page, token: string): Promise<void> {
    const notesUrl = `${testConfig.apiBaseUrl}${UI.paths.notes}`;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
        await authenticate(page, token);
        await page.goto(notesUrl, { waitUntil: 'domcontentloaded' });
        try {
            await expect(page.locator('#account-section')).toBeVisible({ timeout: 10_000 });
            return;
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(`Could not establish an authenticated notes session after 3 attempts: ${String(lastError)}`);
}

export async function setRawToken(page: Page, token: string): Promise<void> {
    await authenticate(page, token);
}

export async function seedNote(token: string, title: string, content: string): Promise<string> {
    const res = await notes.create(token, { title, content });
    if (res.status !== 201) {
        throw new Error(`Failed to seed note '${title}': ${res.status}`);
    }
    return res.data.id;
}

export async function cleanupByMarker(token: string, marker: string): Promise<void> {
    const res = await notes.list(token, { q: marker, itemsPerPage: 1000 });
    if (res.status !== 200 || !Array.isArray(res.data)) {
        return;
    }
    for (const note of res.data) {
        await notes.remove(token, note.id);
    }
}
