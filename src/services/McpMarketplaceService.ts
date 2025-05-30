import { requestUrl } from 'obsidian';
import type {
    ToolHiveRegistry, 
    ToolHiveRegistryTool,
    ToolHiveMarketplaceItem,
    ToolHiveMarketplaceCatalog,
    McpServer
} from '../types/mcp';

const TOOLHIVE_REGISTRY_URL = 'https://raw.githubusercontent.com/stacklok/toolhive/main/pkg/registry/data/registry.json';

export class McpMarketplaceService {
    public cachedCatalog: ToolHiveMarketplaceCatalog | null = null;

    constructor() {}

    async fetchMarketplaceCatalog(forceRefresh: boolean = false): Promise<ToolHiveMarketplaceCatalog> {
        if (this.cachedCatalog && !forceRefresh) {
            return this.cachedCatalog;
        }

        try {
            const response = await requestUrl({ url: TOOLHIVE_REGISTRY_URL });
            if (response.status !== 200) {
                console.error(`Failed to fetch ToolHive registry: ${response.status}`, response.text);
                throw new Error(`Failed to fetch ToolHive registry: ${response.status}`);
            }
            const registry = response.json as ToolHiveRegistry;
            
            const items: ToolHiveMarketplaceItem[] = [];
            for (const toolKey in registry.servers) {
                if (Object.prototype.hasOwnProperty.call(registry.servers, toolKey)) {
                    const toolData = registry.servers[toolKey];
                    const marketplaceItem = this.transformToolHiveToolToMarketplaceItem(toolKey, toolData);
                    items.push(marketplaceItem);
                }
            }

            const categories = [...new Set(items.map(item => item.category).filter(c => c !== 'Other'))].sort();
            if (items.some(item => item.category === 'Other')) {
                categories.push('Other');
            }
            const tags = [...new Set(items.flatMap(item => item.tags))].sort();

            this.cachedCatalog = { items, categories, tags };
            return this.cachedCatalog;
        } catch (error) {
            console.error('Error fetching or processing ToolHive marketplace catalog:', error);
            return { items: [], categories: [], tags: [] };
        }
    }

    public async findMarketplaceItemByName(toolName: string): Promise<ToolHiveMarketplaceItem | undefined> {
        if (!this.cachedCatalog) {
            await this.fetchMarketplaceCatalog();
        }
        return this.cachedCatalog?.items.find(item => item.toolHiveToolName === toolName);
    }

    public transformToolHiveToolToMarketplaceItem(toolName: string, toolData: ToolHiveRegistryTool): ToolHiveMarketplaceItem {
        const category = this.inferCategoryFromTagsOrName(toolData.tags, toolName);
        const author = this.extractAuthorFromSourceUrl(toolData.repository_url) || 'ToolHive Community';
        
        const stars = toolData.metadata?.stars;
        const pulls = toolData.metadata?.pulls;

        return {
            mcpId: toolName, 
            toolHiveToolName: toolName,
            displayName: this.formatDisplayName(toolName),
            description: toolData.description || 'No description available.',
            category: category,
            tags: toolData.tags || [],
            icon: this.inferIconFromToolName(toolName), 
            author: author,
            version: 'latest', 
            stars: stars, 
            pulls: pulls, 
        };
    }

    private formatDisplayName(toolName: string): string {
        const namePart = toolName.split('/').pop() || toolName;
        return namePart
            .split('-')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    private inferCategoryFromTagsOrName(tags?: string[], toolName?: string): string {
        const commonCategories: Record<string, string[]> = {
            'API Integration': ['api', 'integration', 'connect'],
            'Data & Storage': ['database', 'storage', 'postgres', 'redis', 'sqlite', 'gdrive', 'filesystem'],
            'Development Tools': ['git', 'github', 'gitlab', 'code', 'semgrep', 'terraform', 'k8s', 'docker', 'oci-registry'],
            'AI/ML': ['ai', 'ml', 'nlp', 'llm', 'agent', 'bedrock', 'perplexity'],
            'Search & Retrieval': ['search', 'retrieval', 'brave', 'firecrawl', 'aws-kb'],
            'Utilities': ['util', 'tool', 'time', 'fetch', 'puppeteer', 'memory'],
            'Communication': ['slack', 'pushover', 'notification'],
            'Security': ['security', 'vulnerability', 'osv'],
            'Atlassian': ['atlassian', 'jira', 'confluence'],
            'Monitoring & Observability': ['grafana', 'sentry', 'monitoring', 'observability'],
            'IoT & Home Automation': ['hass-mcp', 'iot', 'home-assistant'],
            'Networking': ['netbird', 'vpn'],
        };

        if (tags && tags.length > 0) {
            for (const category in commonCategories) {
                if (tags.some(tag => commonCategories[category].includes(tag.toLowerCase()))) {
                    return category;
                }
            }
        }
        if (toolName) {
            const lowerToolName = toolName.toLowerCase();
            for (const category in commonCategories) {
                if (commonCategories[category].some(keyword => lowerToolName.includes(keyword))) {
                    return category;
                }
            }
            if (lowerToolName.includes('code')) return 'Development Tools';
            if (lowerToolName.includes('summary')) return 'AI/ML';
            if (lowerToolName.includes('doc')) return 'Documentation';
        }
        return 'Other';
    }

    private extractAuthorFromSourceUrl(sourceUrl?: string): string | undefined {
        if (!sourceUrl) return undefined;
        try {
            const url = new URL(sourceUrl);
            if (url.hostname === 'github.com') {
                const parts = url.pathname.split('/');
                if (parts.length > 1 && parts[1]) {
                    return parts[1]; 
                }
            }
        } catch (e) {
            console.warn('Could not parse source_url for author:', sourceUrl, e);
        }
        return undefined;
    }

    private inferIconFromToolName(toolName: string): string {
        const lowerToolName = toolName.toLowerCase();
        if (lowerToolName.includes('summary') || lowerToolName.includes('perplexity')) return '✍️'; 
        if (lowerToolName.includes('code') || lowerToolName.includes('git') || lowerToolName.includes('dev')) return '💻';
        if (lowerToolName.includes('search') || lowerToolName.includes('brave')) return '🔍';
        if (lowerToolName.includes('data') || lowerToolName.includes('sql') || lowerToolName.includes('graph')) return '📊';
        if (lowerToolName.includes('cloud') || lowerToolName.includes('aws') || lowerToolName.includes('oci')) return '☁️';
        if (lowerToolName.includes('security') || lowerToolName.includes('semgrep')) return '🛡️';
        if (lowerToolName.includes('atlassian') || lowerToolName.includes('jira')) return '🌐';
        if (lowerToolName.includes('slack')) return '💬';
        if (lowerToolName.includes('time')) return '⏱️';
        if (lowerToolName.includes('home') || lowerToolName.includes('hass')) return '🏠';
        return '⚙️'; 
    }

    public prepareRunToolCommand(toolName: string): string {
        return `thv run ${toolName}`;
    }

    public prepareStopToolCommand(toolName: string): string {
        return `thv stop ${toolName}`;
    }

    public prepareRemoveToolCommand(toolName: string): string {
        return `thv rm ${toolName}`;
    }

    public prepareListToolsCommand(): string {
        return 'thv list --output json';
    }

    public searchMarketplaceItems(query: string, items: ToolHiveMarketplaceItem[]): ToolHiveMarketplaceItem[] {
        if (!query) return items;
        const lowerQuery = query.toLowerCase();
        return items.filter(item => 
            item.displayName.toLowerCase().includes(lowerQuery) ||
            item.description.toLowerCase().includes(lowerQuery) ||
            (item.author && item.author.toLowerCase().includes(lowerQuery)) ||
            item.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }

    public filterMarketplaceItems(category: string | null, tags: string[] | null, items: ToolHiveMarketplaceItem[]): ToolHiveMarketplaceItem[] {
        let filteredItems = items;
        if (category) {
            filteredItems = filteredItems.filter(item => item.category === category);
        }
        if (tags && tags.length > 0) {
            filteredItems = filteredItems.filter(item => tags.every(tag => item.tags.includes(tag)));
        }
        return filteredItems;
    }

    public sortMarketplaceItems(sortBy: string, items: ToolHiveMarketplaceItem[]): ToolHiveMarketplaceItem[] {
        const sortedItems = [...items];
        switch (sortBy) {
            case 'stars':
                return sortedItems.sort((a, b) => (b.stars || 0) - (a.stars || 0));
            case 'name':
                return sortedItems.sort((a, b) => a.displayName.localeCompare(b.displayName));
            default:
                return sortedItems;
        }
    }
}
