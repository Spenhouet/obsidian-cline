import { Notice, Setting, DropdownComponent } from 'obsidian';
import type { ToolHiveMarketplaceItem, McpServer } from '../../types/mcp';
import { McpMarketplaceService } from '../../services/McpMarketplaceService';

export class McpMarketplaceView {
    private containerEl: HTMLElement;
    private marketplaceService: McpMarketplaceService;
    private items: ToolHiveMarketplaceItem[] = [];
    private filteredItems: ToolHiveMarketplaceItem[] = [];
    private managedToolHiveTools: McpServer[];
    private isLoading = false;
    
    private searchQuery = '';
    private selectedCategory: string | null = null;
    private sortBy: 'stars' | 'name' = 'stars';
    
    private onInstall: (item: ToolHiveMarketplaceItem) => void;

    private marketplaceWrapperEl: HTMLElement;
    private controlsAreaEl: HTMLElement;
    private itemsAreaEl: HTMLElement;
    private categoryDropdown: DropdownComponent;
    private statsTextEl: HTMLElement;

    constructor(
        containerEl: HTMLElement, 
        managedToolHiveTools: McpServer[],
        onInstall: (item: ToolHiveMarketplaceItem) => void
    ) {
        this.containerEl = containerEl;
        this.managedToolHiveTools = managedToolHiveTools;
        this.onInstall = onInstall;
        this.marketplaceService = new McpMarketplaceService();
    }

    async display(): Promise<void> {
        this.containerEl.empty();
        
        const loadingMessageDiv = this.containerEl.createDiv();
        loadingMessageDiv.textContent = 'Loading ToolHive marketplace...';
        loadingMessageDiv.addClass('mcp-marketplace-loading-message');

        this.marketplaceWrapperEl = this.containerEl.createDiv('mcp-marketplace-wrapper');
        this.marketplaceWrapperEl.style.border = '1px solid var(--background-modifier-border)';
        this.marketplaceWrapperEl.style.borderRadius = '8px';
        this.marketplaceWrapperEl.style.padding = '16px';
        this.marketplaceWrapperEl.style.backgroundColor = 'var(--background-primary)';
        this.marketplaceWrapperEl.style.display = 'none';

        this.controlsAreaEl = this.marketplaceWrapperEl.createDiv('mcp-marketplace-controls-area');
        this.itemsAreaEl = this.marketplaceWrapperEl.createDiv('mcp-marketplace-items-area');

        await this.loadDataAndUpdateFilters();

        loadingMessageDiv.remove();
        this.marketplaceWrapperEl.style.display = 'block';
        
        this.createControls(this.controlsAreaEl);
        this.createItemsListLayout(this.itemsAreaEl);
        this.renderItems();
    }

    private async loadDataAndUpdateFilters(forceRefresh = false): Promise<void> {
        if (this.isLoading && !forceRefresh) return;
        
        this.isLoading = true;
        if (this.itemsAreaEl) {
            this.itemsAreaEl.empty();
            this.itemsAreaEl.createDiv({text: 'Refreshing ToolHive catalog...', cls: 'mcp-loading-text'});
        }
        
        try {
            const catalog = await this.marketplaceService.fetchMarketplaceCatalog();
            this.items = catalog.items || [];
        } catch (error) {
            console.error('Failed to load ToolHive marketplace data:', error);
            this.items = [];
            this.showError('Failed to load ToolHive marketplace. Please try again.');
        } finally {
            this.isLoading = false;
            this.updateFilteredItems();
            if (this.controlsAreaEl && !this.categoryDropdown) {
                this.createControls(this.controlsAreaEl);
            }
            this.renderItems();
        }
    }

    private createControls(container: HTMLElement): void {
        container.empty();
        const filterBar = container.createDiv('mcp-filter-bar');
        filterBar.style.display = 'flex';
        filterBar.style.gap = '16px';
        filterBar.style.alignItems = 'flex-end';
        filterBar.style.marginBottom = '16px';

        const searchSettingEl = filterBar.createDiv();
        searchSettingEl.style.flexGrow = '1';
        new Setting(searchSettingEl)
            .setName('Search')
            .setDesc('')
            .addText(text => {
                text.setPlaceholder('Search ToolHive MCPs...')
                    .setValue(this.searchQuery)
                    .onChange((value) => {
                        this.searchQuery = value;
                        this.updateFilteredItems();
                        this.renderItems();
                    });
            });
        
        const categories = this.getAvailableCategories();
        if (categories.length > 0) {
            const categorySettingEl = filterBar.createDiv();
            new Setting(categorySettingEl)
                .setName('Category/Tag')
                .setDesc('')
                .addDropdown(dropdown => {
                    this.categoryDropdown = dropdown;
                    dropdown.addOption('', 'All Categories/Tags');
                    categories.forEach((category: string) => {
                        dropdown.addOption(category, category);
                    });
                    dropdown.setValue(this.selectedCategory || '')
                        .onChange((value) => {
                            this.selectedCategory = value || null;
                            this.updateFilteredItems();
                            this.renderItems();
                        });
                });
        }
        
        const sortSettingEl = filterBar.createDiv();
        new Setting(sortSettingEl)
            .setName('Sort by')
            .setDesc('')
            .addDropdown(dropdown => {
                dropdown.addOption('stars', 'Most Stars');
                dropdown.addOption('name', 'Name (A-Z)');
                dropdown.setValue(this.sortBy)
                    .onChange((value) => {
                        this.sortBy = value as 'stars' | 'name';
                        this.updateFilteredItems();
                        this.renderItems();
                    });
            });
        
        const statsRefreshContainer = container.createDiv('mcp-marketplace-stats-refresh');
        statsRefreshContainer.style.display = 'flex';
        statsRefreshContainer.style.justifyContent = 'space-between';
        statsRefreshContainer.style.alignItems = 'center';
        statsRefreshContainer.style.marginTop = '12px';
        statsRefreshContainer.style.fontSize = '12px';
        statsRefreshContainer.style.color = 'var(--text-muted)';
        
        this.statsTextEl = statsRefreshContainer.createDiv();
        this.updateStatsDisplay();
        
        const refreshIcon = statsRefreshContainer.createEl('span');
        refreshIcon.textContent = '\u21BB';
        refreshIcon.style.fontSize = '16px'; 
        refreshIcon.style.cursor = 'pointer';
        refreshIcon.setAttribute('role', 'button');
        refreshIcon.setAttribute('aria-label', 'Refresh Catalog');
        refreshIcon.style.padding = '4px';
        refreshIcon.style.color = 'var(--text-muted)';
        refreshIcon.addEventListener('mouseenter', () => refreshIcon.style.color = 'var(--text-accent)');
        refreshIcon.addEventListener('mouseleave', () => refreshIcon.style.color = 'var(--text-muted)');
        refreshIcon.onclick = () => this.loadDataAndUpdateFilters(true);
    }

    private createItemsListLayout(container: HTMLElement): void {
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '12px';
    }

    private updateFilteredItems(): void {
        let filtered = [...this.items];
        
        if (this.searchQuery) {
            filtered = this.marketplaceService.searchMarketplaceItems(this.searchQuery, filtered);
        }
        
        if (this.selectedCategory) {
            filtered = this.marketplaceService.filterMarketplaceItems(this.selectedCategory, null, filtered);
        }
        
        filtered = this.marketplaceService.sortMarketplaceItems(this.sortBy, filtered);
        this.filteredItems = filtered;
    }

    private getAvailableCategories(): string[] {
        return this.marketplaceService.cachedCatalog?.categories.concat(this.marketplaceService.cachedCatalog?.tags || []).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).sort() || [];
    }

    private renderItems(): void {
        const itemsContainer = this.itemsAreaEl;
        if (!itemsContainer) return;
        
        itemsContainer.empty();
        this.updateStatsDisplay();
        
        if (this.isLoading) {
            itemsContainer.createDiv({text: 'Loading ToolHive MCPs...', cls: 'mcp-loading-text'});
            return;
        }

        if (this.filteredItems.length === 0) {
            const emptyState = itemsContainer.createDiv();
            emptyState.style.textAlign = 'center';
            emptyState.style.padding = '40px 20px';
            emptyState.style.color = 'var(--text-muted)';
            
            if (this.searchQuery || this.selectedCategory) {
                emptyState.textContent = 'No ToolHive MCPs match your filters';
                const clearButton = itemsContainer.createEl('button', {cls: 'mod-muted'});
                clearButton.textContent = 'Clear Filters';
                clearButton.style.marginTop = '8px';
                clearButton.onclick = () => {
                    this.searchQuery = '';
                    this.selectedCategory = null;
                    if (this.categoryDropdown) this.categoryDropdown.setValue('');
                    const searchInput = this.controlsAreaEl.querySelector('input[type="text"][placeholder*="Search"]');
                    if (searchInput) (searchInput as HTMLInputElement).value = '';

                    this.updateFilteredItems();
                    this.renderItems();
                };
            } else {
                emptyState.textContent = 'No ToolHive MCPs found in the catalog.';
            }
            return;
        }
        
        this.filteredItems.forEach(item => {
            this.createMarketplaceCard(itemsContainer, item);
        });
    }

    private createMarketplaceCard(container: HTMLElement, item: ToolHiveMarketplaceItem): void {
        const isManaged = this.managedToolHiveTools.some(server => server.toolHiveToolName === item.toolHiveToolName);
        
        const card = container.createDiv('mcp-marketplace-card');
        card.style.border = '1px solid var(--background-modifier-border)';
        card.style.borderRadius = '8px';
        card.style.padding = '16px';
        card.style.backgroundColor = 'var(--background-secondary)';
        card.style.transition = 'all 0.2s ease';
        card.addEventListener('mouseenter', () => card.style.borderColor = 'var(--interactive-accent)');
        card.addEventListener('mouseleave', () => card.style.borderColor = 'var(--background-modifier-border)');
        
        const header = card.createDiv('mcp-card-header');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'flex-start';
        header.style.marginBottom = '12px';
        
        const titleSection = header.createDiv();
        const title = titleSection.createEl('h4');
        title.textContent = item.displayName;
        title.style.margin = '0 0 4px 0';
        title.style.fontSize = '16px';
        title.style.fontWeight = 'bold';
        
        if (item.category) {
            const categoryBadge = titleSection.createEl('span');
            categoryBadge.textContent = item.category;
            categoryBadge.style.fontSize = '10px';
            categoryBadge.style.padding = '2px 6px';
            categoryBadge.style.backgroundColor = 'var(--interactive-accent)';
            categoryBadge.style.color = 'white';
            categoryBadge.style.borderRadius = '4px';
            categoryBadge.style.marginRight = '8px';
        }
        
        const stats = titleSection.createDiv();
        stats.style.fontSize = '11px';
        stats.style.color = 'var(--text-muted)';
        stats.style.marginTop = '4px';
        
        const statsItems: string[] = []; // Initialize as string[]
        if (item.stars !== undefined) {
            statsItems.push(`${item.icon || '⭐'} ${item.stars} stars`);
        }
        
        stats.textContent = statsItems.join(' • ');
        
        const installButton = header.createEl('button', {cls: 'mod-cta'});
        installButton.textContent = isManaged ? 'Manage' : 'Run with ToolHive';
        installButton.style.minWidth = '120px';
        
        if (isManaged) {
            installButton.style.backgroundColor = 'var(--background-modifier-success)';
            installButton.style.color = 'var(--text-on-accent)';
        }
        installButton.onclick = () => this.handleInstall(item);
        
        const description = card.createEl('p');
        description.textContent = item.description || 'No description available';
        description.style.margin = '0 0 12px 0';
        description.style.color = 'var(--text-normal)';
        description.style.lineHeight = '1.4';
        
        if (item.tags && item.tags.length > 0) {
            const tagsContainer = card.createDiv();
            tagsContainer.style.display = 'flex';
            tagsContainer.style.gap = '4px';
            tagsContainer.style.flexWrap = 'wrap';
            tagsContainer.style.marginTop = '8px';
            
            item.tags.forEach((tag: string) => {
                const tagEl = tagsContainer.createEl('span');
                tagEl.textContent = tag;
                tagEl.style.fontSize = '10px';
                tagEl.style.padding = '2px 6px';
                tagEl.style.backgroundColor = 'var(--background-modifier-border)';
                tagEl.style.color = 'var(--text-muted)';
                tagEl.style.borderRadius = '3px';
                tagEl.style.cursor = 'pointer';
                tagEl.onclick = () => {
                    this.selectedCategory = tag;
                    if (this.categoryDropdown) this.categoryDropdown.setValue(tag);
                    this.updateFilteredItems();
                    this.renderItems();
                };
            });
        }
        
        if (item.author) {
            const authorInfo = card.createDiv();
            authorInfo.style.fontSize = '11px';
            authorInfo.style.color = 'var(--text-muted)';
            authorInfo.style.marginTop = '8px';
            authorInfo.textContent = `by ${item.author}`;
        }
    }

    private async handleInstall(item: ToolHiveMarketplaceItem): Promise<void> {
        try {
            await this.onInstall(item);
        } catch (error) {
            console.error(`Failed to initiate run for ${item.displayName}:`, error);
            new Notice(`Failed to run ${item.displayName}. See console.`);
        }
    }

    private showError(message: string): void {
        const displayParent = this.itemsAreaEl || this.marketplaceWrapperEl || this.containerEl;
        displayParent.empty();
        const errorDiv = displayParent.createDiv();
        errorDiv.style.textAlign = 'center';
        errorDiv.style.padding = '20px';
        errorDiv.style.color = 'var(--text-error)';
        errorDiv.textContent = message;
        if (this.marketplaceWrapperEl && this.marketplaceWrapperEl.style.display === 'none') {
            this.marketplaceWrapperEl.style.display = 'block';
        }
    }

    public updateManagedToolHiveTools(managedTools: McpServer[]): void {
        this.managedToolHiveTools = managedTools;
        this.renderItems();
    }

    private updateStatsDisplay(): void {
        if (this.statsTextEl) {
            this.statsTextEl.textContent = `${this.filteredItems.length} of ${this.items.length} ToolHive MCPs`;
        }
    }
}
