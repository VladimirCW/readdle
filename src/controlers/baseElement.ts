import { Locator, Page } from '@playwright/test';
import { Logger } from 'log4js';
import { ElementAssertions, ElementWaiter, Waiter } from '../helpers/element';
import { createLogger } from '../config/logger';

/**
 * Base context shared by page objects and elements: holds the `page`, a logger,
 * and helpers to instantiate child elements. Extend this in your page objects.
 */
export abstract class PageContext {
    protected page: Page;
    protected readonly logger: Logger;
    locator!: Locator;

    protected constructor(page: Page) {
        if (page === undefined) {
            throw new Error('Page object constructor is called without a page argument');
        }
        this.page = page;
        this.logger = createLogger(' ');
    }

    protected logComponent(componentName: string): string {
        return componentName;
    }

    protected generate<T extends BaseElement>(
        type: new (page: Page, selector: string, name: string, parent?: Locator ) => T,
        selector: string,
        options?: { elementName?: string, parent?: Locator }
    ): T {
        let elementName: string;
        if(options?.elementName) {
            elementName = options.elementName;
        } else {
            const stackTrace = new Error().stack;
            const callingFunctionName = stackTrace?.split('\n')[2]?.trim().replace(/at [a-zA-Z]+\.([a-zA-Z]+) .+/, '$1') || 'notDefined';
            elementName = callingFunctionName.charAt(0).toUpperCase() + callingFunctionName.slice(1);
            elementName = elementName.replace(/([a-z])([A-Z])/g, '$1 $2');
        }
        const TCreator: new (page: Page, selector: string, name: string, parent?: Locator ) => T = type;
        return new TCreator(this.page, selector, this.logComponent(elementName), options?.parent || this.locator);
    }
}

export abstract class BaseElement extends PageContext {
    private _isLogged = true;
    private readonly IS_LOGGED_DEFAULT_STATUS = true;
    protected selector: string;
    protected _elementName: string;

    constructor(page: Page, selector: string, name: string, parentLocator?: Locator) {
        super(page);
        this.selector = selector;
        this._elementName = name;
        if (selector && parentLocator) {
            this.locator = parentLocator.locator(selector);
        } else if (!selector && parentLocator) {
            this.locator = parentLocator;
        } else if (selector) {
            this.locator = this.page.locator(selector);
        } else {
            throw new Error(
                `Wrong Locator/Element combination: selector='${selector}', parentLocator='${parentLocator}'`
            );
        }
    }

    get elementName(): string {
        return this._elementName;
    }

    /** Reads once, then resets to the default (matches framework behaviour). */
    get isLogged(): boolean {
        const current = this._isLogged;
        this._isLogged = this.IS_LOGGED_DEFAULT_STATUS;
        return current;
    }

    /** Suppress logging for the next single operation: `element.logsOff.click()`. */
    get logsOff(): this {
        this._isLogged = false;
        return this;
    }

    get should(): ElementAssertions {
        return new ElementAssertions(this, '[SHOULD]');
    }

    get wait(): ElementWaiter {
        return new ElementWaiter(this, '[WAIT]');
    }

    protected logComponent(componentName: string): string {
        return `${this.elementName} > ${componentName}`;
    }

    protected logStep(stepName: string): void {
        if (this.isLogged) {
            this.logger.info(`${this.elementName.padEnd(70, '-')} - ${stepName}`);
        }
    }

    async isExist(): Promise<boolean> {
        try {
            const count = await this.locator.count();
            return count !== null && count !== 0;
        } catch {
            return false;
        }
    }

    async isVisible(timeout = 0): Promise<boolean> {
        if (await this.isExist()) {
            return this.locator.nth(0).isVisible({ timeout });
        }
        return false;
    }

    async isEnabled(timeout = 0): Promise<boolean> {
        if (await this.isExist()) {
            return this.locator.nth(0).isEnabled({ timeout });
        }
        return false;
    }

    async click(
        clickOptions: { timeout?: number; position?: { x: number; y: number }; noWaitAfter?: boolean } = {}
    ): Promise<void> {
        this.logStep('click');
        await this.locator.click({ ...clickOptions });
    }

    async clickAndWaitForResponse(
        urlPart: string | RegExp,
        delayAtEnd = 250,
        options?: { responseTimeout?: number; clickTimeout?: number }
    ): Promise<void> {
        const responseTimeout = options?.responseTimeout ?? 60_000;
        const clickOptions = options?.clickTimeout ? { timeout: options.clickTimeout } : {};
        await Promise.all([
            this.page.waitForResponse(urlPart, { timeout: responseTimeout }),
            this.click(clickOptions),
        ]);
        if (delayAtEnd) await Waiter.delay(delayAtEnd);
    }

    async getText(): Promise<string> {
        this.logStep('get text');
        return (await this.locator.innerText()).trim();
    }
}
