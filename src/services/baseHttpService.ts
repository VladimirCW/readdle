import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import axios from 'axios';
import { Logger } from 'log4js';
import { createLogger } from '../config';

/**
 * @group Services
 */
export abstract class BaseHttpService {

    protected readonly logger: Logger;
    baseUrl: string;

    protected constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
        this.logger = createLogger(` [${new.target.name.padEnd(Number(process.env['LOGGED_INSTANCE_LENGTH']), '_')}] `);
    } 

    private async request(requestConfig: AxiosRequestConfig): Promise<AxiosResponse> {
        const loggedUrl = `${this.baseUrl}${requestConfig.url}`;
        this.logger.info(`- Sending [${requestConfig.method?.padEnd(6)}] request to '${loggedUrl}'`);
        return axios({
            method: requestConfig.method,
            url: `${this.baseUrl}${requestConfig.url}`,
            headers: {
                ...requestConfig.headers
            },
            data: requestConfig.data,
            params: requestConfig.params,
            // Never throw on 4xx/5xx — API tests assert on the returned status/body.
            validateStatus: () => true
        }).then((response: AxiosResponse) => {
            this.logger.debug(`- Response status code is: '${response.status}'`);
            return response;
        }).catch((error: AxiosError) => {
            this.logger.error(`- Request to '${loggedUrl}' failed without a response: ${error.message}`);
            return error.response as AxiosResponse;
        }) as Promise<AxiosResponse>;
    }

    protected async get (requestObject: AxiosRequestConfig): Promise<AxiosResponse> {
        return this.request({ ...requestObject, method: 'GET' });
    }

    protected async post (requestObject: AxiosRequestConfig): Promise<AxiosResponse> {
        return this.request({ ...requestObject, method: 'POST' });
    }

    protected async delete (requestObject: AxiosRequestConfig): Promise<AxiosResponse> {
        return this.request({ ...requestObject, method: 'DELETE' });
    }

    protected async put (requestObject: AxiosRequestConfig): Promise<AxiosResponse> {
        return this.request({ ...requestObject, method: 'PUT' });
    }

    protected async patch (requestObject: AxiosRequestConfig): Promise<AxiosResponse> {
        return this.request({ ...requestObject, method: 'PATCH' });
    }

    /** Generic escape hatch for cross-cutting checks (e.g. method-not-allowed, unknown routes). */
    public async sendRaw (method: string, url: string, requestObject: AxiosRequestConfig = {}): Promise<AxiosResponse> {
        return this.request({ ...requestObject, method, url });
    }
}