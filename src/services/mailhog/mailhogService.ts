import { AxiosResponse } from 'axios';
import { BaseHttpService } from '../baseHttpService';
import { testConfig } from '../../config';

export interface ConfirmationEmail {
    code: string;
    email: string;
    link: string;
}

interface MailhogItem {
    Created?: string;
    Content?: { Body?: string };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decode quoted-printable text (MailHog stores emails QP-encoded: soft line
 * breaks as `=\r\n`, literal chars as `=XX`).
 */
function decodeQuotedPrintable(input: string): string {
    return input
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Reads captured emails from MailHog.
 * @group Services
 */
export class MailhogService extends BaseHttpService {
    constructor(baseUrl: string = testConfig.mailhogUrl) {
        super(baseUrl);
    }

    /** Search captured messages by recipient address. */
    searchByRecipient(email: string): Promise<AxiosResponse> {
        return this.get({ url: '/api/v2/search', params: { kind: 'to', query: email } });
    }

    /** Delete all captured messages (housekeeping between runs, if needed). */
    deleteAll(): Promise<AxiosResponse> {
        return this.delete({ url: '/api/v1/messages' });
    }

    /**
     * Poll MailHog until the latest confirmation email for `email` is available,
     * then return its 6-digit code, confirm email and full link.
     */
    async getLatestConfirmation(
        email: string,
        options: { timeoutMs?: number; pollMs?: number } = {},
    ): Promise<ConfirmationEmail> {
        const { timeoutMs = 20_000, pollMs = 1_000 } = options;
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const response = await this.searchByRecipient(email);
            const items: MailhogItem[] = response?.data?.items ?? [];

            if (items.length > 0) {
                // newest first
                items.sort(
                    (a, b) =>
                        new Date(b?.Created ?? 0).getTime() - new Date(a?.Created ?? 0).getTime(),
                );

                for (const item of items) {
                    const body = decodeQuotedPrintable(String(item?.Content?.Body ?? ''));
                    const codeMatch = body.match(/confirm_code=(\d{6})/);
                    if (codeMatch) {
                        const emailMatch = body.match(/confirm_email=([^&\s"<]+)/);
                        const linkMatch = body.match(/https?:\/\/[^\s"<]*confirm_code=\d{6}/);
                        return {
                            code: codeMatch[1],
                            email: emailMatch?.[1] ?? email,
                            link: linkMatch?.[0] ?? '',
                        };
                    }
                }
            }

            await sleep(pollMs);
        }

        throw new Error(`No confirmation email with a code found for '${email}' within ${timeoutMs}ms`);
    }
}
