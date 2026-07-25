import { Page } from '@playwright/test';
import { AccountPage } from './accountPage';
import { Label } from '../../controlers';
import { UI } from '../../data/constants';

/**
 * Profile view (email + user id) inside #account-section.
 */
export class ProfilePage extends AccountPage {
    readonly profileView = this.generate(Label, '#profile-view', { elementName: 'Profile View' });
    readonly profileEmail = this.generate(Label, '#profile-email', { elementName: 'Profile Email' });
    readonly profileId = this.generate(Label, '#profile-id', { elementName: 'Profile Id' });

    constructor(page: Page) {
        super(page, UI.paths.profile);
    }
}
