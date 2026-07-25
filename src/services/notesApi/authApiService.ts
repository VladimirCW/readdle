import { AxiosResponse } from 'axios';
import { BaseHttpService } from '../baseHttpService';
import { testConfig } from '../../config';
import { ENDPOINTS } from '../../data/constants';

type Headers = Record<string, string>;

/**
 * Auth endpoints of the Notes API: sign-up, confirm, sign-in, me.
 * @group Services
 */
export class AuthApiService extends BaseHttpService {
    constructor(baseUrl: string = testConfig.apiBaseUrl) {
        super(baseUrl);
    }

    signUp(email?: string, password?: string, headers: Headers = {}): Promise<AxiosResponse> {
        return this.post({
            url: ENDPOINTS.signup,
            data: { email, password },
            headers: { Accept: 'application/json', ...headers },
        });
    }

    /**
     * Send a raw (possibly malformed) request body — used for JSON-parsing tests.
     * The body is sent as a Buffer so axios does not re-serialize the string
     * (which would turn malformed text into a valid JSON string literal).
     */
    signUpRaw(rawBody: string, headers: Headers = {}): Promise<AxiosResponse> {
        return this.post({
            url: ENDPOINTS.signup,
            data: Buffer.from(rawBody),
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
        });
    }

    confirm(email?: string, code?: string, headers: Headers = {}): Promise<AxiosResponse> {
        return this.post({
            url: ENDPOINTS.confirm,
            data: { email, code },
            headers: { Accept: 'application/json', ...headers },
        });
    }

    signIn(email?: string, password?: string, headers: Headers = {}): Promise<AxiosResponse> {
        return this.post({
            url: ENDPOINTS.signin,
            data: { email, password },
            headers: { Accept: 'application/json', ...headers },
        });
    }

    /**
     * GET /api/auth/me. Pass a token to send `Authorization: Bearer <token>`.
     * Pass `undefined` to send no auth header (unauthorized case).
     */
    me(token?: string, headers: Headers = {}): Promise<AxiosResponse> {
        return this.get({
            url: ENDPOINTS.me,
            headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
            },
        });
    }

    docJson(): Promise<AxiosResponse> {
        return this.get({ url: ENDPOINTS.docJson, headers: { Accept: 'application/json' } });
    }
}
