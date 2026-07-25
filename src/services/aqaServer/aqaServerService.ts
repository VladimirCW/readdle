import { AxiosResponse } from 'axios';
import { BaseHttpService } from '../baseHttpService';

/**
 * @group Services
 */
export class AqaServerService extends BaseHttpService {
    constructor(){
        super('http://127.0.0.1:3000');
    }

    async getUsersList():Promise<AxiosResponse> {
        return this.get({
            url: '/users-list'
        });
    }

    async bookUser(): Promise<AxiosResponse> {
        return this.get({
            url: '/book-user'
        });
    }

    async releaseUser(userName: string): Promise<AxiosResponse> {
        return this.get({
            url: `/release-user/${userName}`
        });
    }
}