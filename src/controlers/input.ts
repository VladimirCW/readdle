import { BaseElement } from './baseElement';
import { InputWaiter, Waiter } from '../helpers/element';

export class Input extends BaseElement {
    get wait(): InputWaiter {
        return new InputWaiter(this, '[WAIT]');
    }

    async clear(): Promise<void> {
        this.logStep('clear');
        await this.locator.clear();
        await Waiter.delay(100);
    }

    async fill(text: string | number): Promise<void> {
        this.logStep(`fill: '${text}'`);
        await this.locator.fill(text.toString());
    }

    async pressSequentially(value: string, options?: { delay: number }): Promise<void> {
        this.logStep(`press sequntially: '${value}'`);
        await this.locator.pressSequentially(value.toString(), { delay: options?.delay || 50 });
    }

}
