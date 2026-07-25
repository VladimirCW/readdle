import { Page } from '@playwright/test';
import { testConfig } from '../config/testConfig';
import { PageContext } from '../controlers';
import { Waiter } from '../helpers/element';

export abstract class BasePage extends PageContext {
    private static readonly LOGGED_LENGTH = 30;
    private _baseUrl: string;
    private _urlPart: string;

    protected constructor(page: Page, urlPart = '') {
        super(page);
        this._baseUrl = process.env['BASE_URL'] || testConfig.apiBaseUrl;
        this._urlPart = urlPart;
    }

    get baseUrl(): string {
        return this._baseUrl;
    }

    get urlPart(): string {
        return this._urlPart;
    }

    /** Current browser URL. */
    get url(): string {
        return this.page.url();
    }


    protected set baseUrl(text: string) {
        this._baseUrl = text;
    }

    protected set urlPart(text: string) {
        this._urlPart = text;
    }

    protected logComponent(componentName: string): string {
        return `[${this.pageName()}] ${componentName}`;
    }

    protected logStep(stepName: string): void {
        this.logger.info(`[${this.pageName()}] ${stepName}`);
    }

    private pageName(): string {
        const raw =
            this.constructor.name.length > BasePage.LOGGED_LENGTH
                ? this.constructor.name.replace('Page', '')
                : this.constructor.name;
        return raw.padEnd(BasePage.LOGGED_LENGTH, '_');
    }


    /**
     * Open `${baseUrl}${urlPart}` in the browser.
     * ```
     * await new HomePage(page).goTo();
     * ```
     */
    async goTo(): Promise<void> {
        const url = `${this._baseUrl}${this._urlPart}`;
        this.logStep(`go to URL: '${url}'`);
        await this.page.goto(url, { waitUntil: 'commit' });
        await Waiter.delay(1_000);
    }

    async typeText(text: string): Promise<void> {
        this.logStep(`type: '${text}'`);
        await this.page.keyboard.type(text);
    }
}
