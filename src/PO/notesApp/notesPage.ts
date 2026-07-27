import { Locator, Page } from '@playwright/test';
import { AccountPage } from './accountPage';
import { Button, Input, Label, Modal } from '../../controlers';
import { UI } from '../../data/constants';

export type SortOption = 'updated_desc' | 'updated_asc' | 'title_asc' | 'title_desc';
export type FieldOption = 'all' | 'title' | 'content';

export class NotesPage extends AccountPage {
    readonly notesView = this.generate(Label, '#notes-view', { elementName: 'Notes View' });

    readonly noteTitle = this.generate(Input, '#note-title', { elementName: 'Note Title' });
    readonly noteContent = this.generate(Input, '#note-content', { elementName: 'Note Content' });
    readonly createSubmit = this.generate(Button, '#create-note-form button[type="submit"]', { elementName: 'Create Note' });

    readonly searchQuery = this.generate(Input, '#notes-search-query', { elementName: 'Search Query' });
    readonly listTotal = this.generate(Label, '#notes-list-total', { elementName: 'List Total' });
    readonly pageInfo = this.generate(Label, '#notes-page-info', { elementName: 'Page Info' });
    readonly prevPage = this.generate(Button, '#notes-prev-page', { elementName: 'Prev Page' });
    readonly nextPage = this.generate(Button, '#notes-next-page', { elementName: 'Next Page' });
    readonly notesList = this.generate(Label, '#notes-list', { elementName: 'Notes List' });
    readonly modal = this.generate(Modal, '.modal-backdrop', { elementName: 'Modal' });

    constructor(page: Page) {
        super(page, UI.paths.notes);
    }

    async createNote(title: string, content: string): Promise<void> {
        this.logStep(`create note '${title}'`);
        await this.noteTitle.fill(title);
        await this.noteContent.fill(content);
        await this.createSubmit.click();
    }

    // --- search / sort / pagination ---
    /**
     * The app fires an un-debounced GET /api/notes on every input/change and
     * does not discard stale responses, so two overlapping fetches can resolve
     * out of order and an older (e.g. unfiltered) response overwrites the
     * newer list. Wait for the fetch each control triggers before returning so
     * consecutive interactions never have requests in flight simultaneously.
     */
    private async withNotesRefresh(action: () => Promise<void>): Promise<void> {
        const refreshed = this.page.waitForResponse(
            (response) => response.url().includes('/api/notes') && response.request().method() === 'GET',
        );
        await action();
        await refreshed;
    }

    async search(query: string): Promise<void> {
        this.logStep(`search '${query}'`);
        await this.withNotesRefresh(() => this.searchQuery.fill(query));
    }

    async selectField(value: FieldOption): Promise<void> {
        this.logStep(`select field '${value}'`);
        await this.withNotesRefresh(async () => {
            await this.page.locator('#notes-search-field').selectOption(value);
        });
    }

    async selectSort(value: SortOption): Promise<void> {
        this.logStep(`select sort '${value}'`);
        await this.withNotesRefresh(async () => {
            await this.page.locator('#notes-search-sort').selectOption(value);
        });
    }

    async selectPageSize(value: string): Promise<void> {
        this.logStep(`select page size '${value}'`);
        await this.withNotesRefresh(async () => {
            await this.page.locator('#notes-page-size').selectOption(value);
        });
    }

    async goNextPage(): Promise<void> {
        await this.withNotesRefresh(() => this.nextPage.click());
    }

    async goPrevPage(): Promise<void> {
        await this.withNotesRefresh(() => this.prevPage.click());
    }

    // --- note cards ---
    items(): Locator {
        return this.page.locator('#notes-list article.note-item');
    }

    card(title: string): Locator {
        return this.items().filter({ has: this.page.locator('h3', { hasText: title }) });
    }

    titlesInOrder(): Promise<string[]> {
        return this.page.locator('#notes-list article.note-item h3').allInnerTexts();
    }

    // --- update modal ---
    async openEditModal(title: string): Promise<void> {
        this.logStep(`open edit modal for '${title}'`);
        await this.card(title).locator('[data-action="edit"]').click();
        await this.modal.locator.waitFor({ state: 'visible' });
    }

    async submitEdit(newTitle: string, newContent: string): Promise<void> {
        const modal = this.modal.locator;
        await this.modal.titleInput.fill(newTitle);
        await modal.locator('textarea[name="content"]').fill(newContent);
        await modal.locator('button[type="submit"]').click();
        await modal.waitFor({ state: 'detached' });
    }

    async cancelModal(): Promise<void> {
        const modal = this.modal.locator;
        await modal.locator('[data-action="cancel"]').click();
        await modal.waitFor({ state: 'detached' });
    }

    // --- delete modal ---
    async openDeleteModal(title: string): Promise<void> {
        this.logStep(`open delete modal for '${title}'`);
        await this.card(title).locator('[data-action="delete"]').click();
        await this.modal.locator.waitFor({ state: 'visible' });
    }

    async confirmDelete(): Promise<void> {
        const modal = this.modal.locator;
        await modal.locator('[data-action="delete"]').click();
        await modal.waitFor({ state: 'detached' });
    }
}
