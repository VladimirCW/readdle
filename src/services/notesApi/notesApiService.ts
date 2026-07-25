import { AxiosResponse } from 'axios';
import { BaseHttpService } from '../baseHttpService';
import { testConfig } from '../../config';
import { ENDPOINTS } from '../../data/constants';

type Headers = Record<string, string>;
type Params = Record<string, string | number>;

export interface NotePayload {
    title?: unknown;
    content?: unknown;
    [key: string]: unknown;
}

/**
 * Notes CRUD endpoints of the Notes API.
 * @group Services
 */
export class NotesApiService extends BaseHttpService {
    constructor(baseUrl: string = testConfig.apiBaseUrl) {
        super(baseUrl);
    }

    private auth(token?: string, headers: Headers = {}): Headers {
        return {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers,
        };
    }

    list(token?: string, params: Params = {}, headers: Headers = {}): Promise<AxiosResponse> {
        return this.get({ url: ENDPOINTS.notes, params, headers: this.auth(token, headers) });
    }

    /**
     * Create a note. `headers` override the defaults, e.g. pass `{ Accept: '*&#47;*' }`
     * to reproduce content-negotiation behavior.
     */
    create(token: string | undefined, body: NotePayload | string, headers: Headers = {}): Promise<AxiosResponse> {
        return this.post({ url: ENDPOINTS.notes, data: body, headers: this.auth(token, headers) });
    }

    getOne(token: string | undefined, id: string, headers: Headers = {}): Promise<AxiosResponse> {
        return this.get({ url: `${ENDPOINTS.notes}/${id}`, headers: this.auth(token, headers) });
    }

    update(token: string | undefined, id: string, body: NotePayload, headers: Headers = {}): Promise<AxiosResponse> {
        return this.put({ url: `${ENDPOINTS.notes}/${id}`, data: body, headers: this.auth(token, headers) });
    }

    remove(token: string | undefined, id: string, headers: Headers = {}): Promise<AxiosResponse> {
        return this.delete({ url: `${ENDPOINTS.notes}/${id}`, headers: this.auth(token, headers) });
    }
}
