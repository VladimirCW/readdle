import { Page } from '@playwright/test';
import { BasePage } from '../basePage';
import { Button, Input, Label } from '../../controlers';
import { UI } from '../../data/constants';

/**
 * Landing / authentication page (sign-up + sign-in cards).
 */
export class AuthPage extends BasePage {
    readonly authSection = this.generate(Label, '#auth-section', { elementName: 'Auth Section' });
    readonly status = this.generate(Label, '#status', { elementName: 'Status' });

    readonly signUpEmail = this.generate(Input, '#signup-email', { elementName: 'Sign Up Email' });
    readonly signUpPassword = this.generate(Input, '#signup-password', { elementName: 'Sign Up Password' });
    readonly signUpSubmit = this.generate(Button, '#signup-form button[type="submit"]', { elementName: 'Sign Up Submit' });

    readonly signInEmail = this.generate(Input, '#signin-email', { elementName: 'Sign In Email' });
    readonly signInPassword = this.generate(Input, '#signin-password', { elementName: 'Sign In Password' });
    readonly signInSubmit = this.generate(Button, '#signin-form button[type="submit"]', { elementName: 'Sign In Submit' });

    constructor(page: Page) {
        super(page, UI.paths.root);
    }

    async signUp(email: string, password: string): Promise<void> {
        this.logStep(`sign up as '${email}'`);
        await this.signUpEmail.fill(email);
        await this.signUpPassword.fill(password);
        await this.signUpSubmit.click();
    }

    async signIn(email: string, password: string): Promise<void> {
        this.logStep(`sign in as '${email}'`);
        await this.signInEmail.fill(email);
        await this.signInPassword.fill(password);
        await this.signInSubmit.click();
    }
}
