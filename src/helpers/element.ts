import { expect } from '@playwright/test';
import { createLogger, Logger } from '../config/logger';
// Type-only imports — erased at compile time, so no runtime circular dependency.
import type { BaseElement } from '../controlers/baseElement';
import type { Input } from '../controlers/input';

export enum TextCompareConditions {
    EQUALS = 'equals',
    CONTAINS = 'contains',
}

/**
 * Polling / delay helper. Trimmed copy of the framework's Waiter (no Allure wrapping).
 */
export class Waiter {
    static async delay(timeout: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, timeout));
    }

    static async delaySeconds(seconds: number): Promise<void> {
        return Waiter.delay(seconds * 1_000);
    }

    static async waitFor(
        fn: () => Promise<boolean> | boolean,
        description: string,
        params?: { timeToWait?: number; frequency?: number; errMsg?: string; initialWait?: boolean }
    ): Promise<void> {
        let timeToWait = params?.timeToWait ?? 60_000;
        const frequency = params?.frequency ?? 1_000;
        const errMsg =
            params?.errMsg ??
            `Timed out waiting for condition '${description}' after ${timeToWait}ms`;
        if (params?.initialWait) await Waiter.delay(1_000);
        while (timeToWait >= 0 && !(await fn())) {
            timeToWait -= frequency;
            await Waiter.delay(frequency);
        }
        if (timeToWait < 0) {
            throw new Error(errMsg);
        }
    }

    /**
     * Like `waitFor`, but polls until `fn` yields a defined value and returns it.
     * Useful for "wait until one of N things is present, then give me which one".
     */
    static async waitForResult<T>(
        fn: () => Promise<T | undefined> | T | undefined,
        description: string,
        params?: { timeToWait?: number; frequency?: number; errMsg?: string; initialWait?: boolean }
    ): Promise<T> {
        let timeToWait = params?.timeToWait ?? 60_000;
        const frequency = params?.frequency ?? 1_000;
        const errMsg =
            params?.errMsg ??
            `Timed out waiting for condition '${description}' after ${timeToWait}ms`;
        if (params?.initialWait) await Waiter.delay(1_000);
        let result = await fn();
        while (timeToWait >= 0 && result === undefined) {
            timeToWait -= frequency;
            await Waiter.delay(frequency);
            result = await fn();
        }
        if (result === undefined) {
            throw new Error(errMsg);
        }
        return result;
    }
}

/**
 * Shared base for the fluent assertion / waiter chains. Provides the readable
 * connector getters (to / have / be / not).
 */
export abstract class BaseElementAction {
    protected element: BaseElement;
    protected messagePart: string;
    protected readonly logger: Logger;
    protected isRevertAssertion = false;

    public constructor(element: BaseElement, messagePart: string) {
        this.element = element;
        this.messagePart = messagePart;
        this.logger = createLogger(' ');
    }

    get to(): this {
        this.messagePart += ' [TO]';
        return this;
    }

    get have(): this {
        this.messagePart += ' [HAVE]';
        return this;
    }

    get be(): this {
        this.messagePart += ' [BE]';
        return this;
    }

    get not(): this {
        this.messagePart += ' [NOT]';
        this.isRevertAssertion = true;
        return this;
    }

    protected logStep(stepName: string): void {
        if (this.element.isLogged) {
            this.logger.info(`${this.element.elementName.padEnd(70, '-')} - ${this.messagePart} ${stepName}`);
        }
    }
}

/**
 * Fluent assertions: `element.is.visible()`, `element.should.textContain('x')`,
 * `element.should.not.be.visible()`, etc. Backed by Playwright's `expect`.
 */
export class ElementAssertions extends BaseElementAction {
    async exist(): Promise<void> {
        this.logStep('exist');
        await expect(this.element.locator.nth(0)).toBeAttached({ attached: !this.isRevertAssertion });
    }

    async visible(): Promise<void> {
        this.logStep('visible');
        await expect(this.element.locator.nth(0)).toBeVisible({ visible: !this.isRevertAssertion });
    }

    async textEquals(expected = 'not_defined'): Promise<void> {
        this.logStep(`text equals to '${expected}'`);
        if (this.isRevertAssertion) {
            await expect(this.element.locator.nth(0)).not.toHaveText(expected);
        } else {
            await expect(this.element.locator.nth(0)).toHaveText(expected);
        }
    }

    async valueEquals(expected: string): Promise<void> {
        this.logStep(`value equals to '${expected}'`);
        if (this.isRevertAssertion) {
            await expect(this.element.locator.nth(0)).not.toHaveValue(expected);
        } else {
            await expect(this.element.locator.nth(0)).toHaveValue(expected);
        }
    }

    async textContain(expected: string | RegExp): Promise<void> {
        this.logStep(`text contains '${expected}'`);
        const expectedRegexp =
            typeof expected === 'string' ? new RegExp(expected.toString().replace('$', '\\$')) : expected;
        if (this.isRevertAssertion) {
            await expect(this.element.locator).not.toHaveText(expectedRegexp);
        } else {
            await expect(this.element.locator).toHaveText(expectedRegexp);
        }
    }

    async textContainString(expected: string): Promise<void> {
        this.logStep(`text contains string '${expected}'`);
        if (this.isRevertAssertion) {
            await expect(this.element.locator).not.toContainText(expected);
        } else {
            await expect(this.element.locator).toContainText(expected);
        }
    }

    async attribute(attr: string, expected: string | RegExp): Promise<void> {
        this.logStep(`attribute '${attr}' with value '${expected}'`);
        await this.element.wait.to.have.attributePresence(attr);
        if (this.isRevertAssertion) {
            await expect(this.element.locator).not.toHaveAttribute(attr, expected);
        } else {
            await expect(this.element.locator).toHaveAttribute(attr, expected);
        }
    }

    async disabled(): Promise<void> {
        this.logStep('disabled');
        if (this.isRevertAssertion) {
            await expect(this.element.locator).toBeEnabled();
        } else {
            await expect(this.element.locator).toBeDisabled();
        }
    }

    async inViewport(): Promise<void> {
        this.logStep('in viewport');
        if (this.isRevertAssertion) {
            await expect(this.element.locator).not.toBeInViewport();
        } else {
            await expect(this.element.locator).toBeInViewport();
        }
    }

    async cssContains(style: string, value: string): Promise<void> {
        this.logStep(`CSS '${style}' contains: '${value}'`);
        if (this.isRevertAssertion) {
            await expect(this.element.locator).not.toHaveCSS(style, value);
        } else {
            await expect(this.element.locator).toHaveCSS(style, value);
        }
    }
}

/**
 * Fluent polling waiters: `element.wait.to.be.visible()`,
 * `element.wait.not.to.be.visible()`, etc.
 */
export class ElementWaiter extends BaseElementAction {
    get for(): this {
        this.messagePart += ' [FOR]';
        return this;
    }

    async visible(timeout = 60_000, options?: { preWait?: number; postWait?: number }): Promise<void> {
        this.logStep('visible');
        if (options?.preWait) await Waiter.delay(options.preWait);
        await Waiter.waitFor(
            async () =>
                this.isRevertAssertion
                    ? !(await this.element.isVisible())
                    : await this.element.isVisible(),
            `${this.element.elementName} - ${this.messagePart} visible`,
            {
                timeToWait: timeout,
                frequency: 500,
                errMsg: `Timed out waiting for '${this.element.elementName}' to be visible (${timeout}ms)`,
                initialWait: this.isRevertAssertion,
            }
        );
        if (options?.postWait) await Waiter.delay(options.postWait);
    }

    async invisible(timeout = 60_000): Promise<void> {
        this.logStep('invisible');
        await Waiter.waitFor(
            async () =>
                this.isRevertAssertion
                    ? await this.element.isVisible()
                    : !(await this.element.isVisible()),
            `${this.element.elementName} - ${this.messagePart} invisible`,
            {
                timeToWait: timeout,
                frequency: 500,
                errMsg: `Timed out waiting for '${this.element.elementName}' to be invisible (${timeout}ms)`,
                initialWait: this.isRevertAssertion,
            }
        );
    }

    async exist(timeout = 40_000): Promise<void> {
        this.logStep('exist');
        await Waiter.waitFor(
            async () =>
                this.isRevertAssertion ? !(await this.element.isExist()) : await this.element.isExist(),
            `${this.element.elementName} - ${this.messagePart} exist`,
            {
                timeToWait: timeout,
                frequency: 500,
                errMsg: `Timed out waiting for '${this.element.elementName}' to exist (${timeout}ms)`,
                initialWait: this.isRevertAssertion,
            }
        );
    }

    async textContains(expected: string): Promise<void> {
        this.logStep(`text contains: '${expected}'`);
        await Waiter.waitFor(
            async () => {
                const result = (await this.element.logsOff.getText()).includes(expected);
                return this.isRevertAssertion ? !result : result;
            },
            `${this.element.elementName} - ${this.messagePart} text contains: '${expected}'`
        );
    }

    async textEquals(expected: string): Promise<void> {
        this.logStep(`text equals: '${expected}'`);
        await Waiter.waitFor(
            async () => {
                const result = (await this.element.logsOff.getText()) === expected;
                return this.isRevertAssertion ? !result : result;
            },
            `${this.element.elementName} - ${this.messagePart} text equals: '${expected}'`
        );
    }

    async attributePresence(attribute: string, options?: { timeout?: number }): Promise<void> {
        this.logStep(`attribute '${attribute}' presence`);
        const timeout = options?.timeout ?? 30_000;
        await Waiter.waitFor(
            async () =>
                this.isRevertAssertion
                    ? typeof (await this.element.locator.getAttribute(attribute)) !== 'string'
                    : typeof (await this.element.locator.getAttribute(attribute)) === 'string',
            `${this.element.elementName} - ${this.messagePart} attribute '${attribute}' presence`,
            {
                timeToWait: timeout,
                frequency: 500,
                errMsg: `Timed out waiting for attribute '${attribute}' on '${this.element.elementName}' (${timeout}ms)`,
            }
        );
    }
}

/**
 * Input-specific waiters (value assertions).
 */
export class InputWaiter extends ElementWaiter {
    async valueContains(expected: string): Promise<void> {
        this.logStep(`value contains: '${expected}'`);
        await Waiter.waitFor(
            async () => {
                const result = (await (this.element as Input).logsOff.getValue()).includes(expected);
                return this.isRevertAssertion ? !result : result;
            },
            `${this.element.elementName} - ${this.messagePart} value contains: '${expected}'`
        );
    }

    async valueEquals(expected: string): Promise<void> {
        this.logStep(`value equals: '${expected}'`);
        await Waiter.waitFor(
            async () => {
                const result = (await (this.element as Input).logsOff.getValue()) === expected;
                return this.isRevertAssertion ? !result : result;
            },
            `${this.element.elementName} - ${this.messagePart} value equals: '${expected}'`
        );
    }
}
