import { randomUUID } from 'crypto';
import { AxiosResponse } from 'axios';

/** Default password used for accounts/users created at runtime. */
export const DEFAULT_PASSWORD = 'Passw0rd123!';

/**
 * Extract a JWT from an auth response, tolerating the different key names the
 * API may use (`token` in healthy mode; `jwt` / `access_token` in broken mode).
 */
export function extractToken(response: AxiosResponse | undefined): string | null {
    const data = response?.data ?? {};
    return data.token ?? data.jwt ?? data.access_token ?? null;
}

/** Decode a JWT payload (no signature verification) for claim assertions. */
export function decodeJwt(token: string): Record<string, unknown> {
    const segment = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(segment, 'base64').toString('utf8'));
}

/** Unique, syntactically valid email for disposable (lifecycle) users. */
export function uniqueEmail(prefix = 'aqa'): string {
    return `${prefix}-${randomUUID()}@example.com`;
}

/** Unique marker string used to scope list/search assertions to a test's own data. */
export function uniqueMarker(prefix: string): string {
    return `${prefix}-${randomUUID()}`;
}

/** Build a string of a given length (for boundary tests). */
export function stringOfLength(length: number, char = 'a'): string {
    return char.repeat(length);
}

/** A syntactically valid email whose total length exceeds `minLength` characters. */
export function longValidEmail(minLength = 191): string {
    // local@label.label.label.com — keep each DNS label <= 63 chars.
    let email = `qa@${'a'.repeat(60)}.${'b'.repeat(60)}.${'c'.repeat(60)}.com`;
    while (email.length < minLength) {
        email = `qa@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(60)}.com`;
    }
    return email;
}
