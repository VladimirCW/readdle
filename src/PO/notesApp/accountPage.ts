import { Page } from '@playwright/test';
import { BasePage } from '../basePage';
import { Button, Label } from '../../controlers';
import { UI } from '../../data/constants';

/**
 * Shared "account" chrome (header + nav + logout + status) rendered inside
 * #account-section for both the Notes and Profile views.
 */
export class AccountPage extends BasePage {
    readonly accountSection = this.generate(Label, '#account-section', { elementName: 'Account Section' });
    readonly accountTitle = this.generate(Label, '#account-title', { elementName: 'Account Title' });
    readonly status = this.generate(Label, '#status', { elementName: 'Status' });

    readonly navNotesButton = this.generate(Button, '#nav-notes-button', { elementName: 'Nav Notes' });
    readonly navProfileButton = this.generate(Button, '#nav-profile-button', { elementName: 'Nav Profile' });
    readonly logoutButton = this.generate(Button, '#logout-button', { elementName: 'Logout' });

    constructor(page: Page, urlPart: string = UI.paths.notes) {
        super(page, urlPart);
    }

    async logout(): Promise<void> {
        this.logStep('logout');
        await this.logoutButton.click();
    }

    async openProfile(): Promise<void> {
        this.logStep('open profile');
        await this.navProfileButton.click();
    }

    async openNotes(): Promise<void> {
        this.logStep('open notes');
        await this.navNotesButton.click();
    }
}
