import { App, Plugin, PluginSettingTab, Setting, Notice, ValueComponent } from 'obsidian';
import ObsigentPluginCore from '../main';
import { LLMProviderType, ALL_LLM_PROVIDERS, LLM_PROVIDER_NAMES, ProviderSettings } from '../api/LLMProvider';
import { McpMarketplaceView } from '../components/McpMarketplaceView';
import { McpServersView } from '../components/McpServersView';
import { McpServer, ToolHiveMarketplaceItem } from '../types/mcp';
import { McpMarketplaceService } from '../services/McpMarketplaceService';

export class ObsigentSettingTab extends PluginSettingTab {
    pluginCore: ObsigentPluginCore;
    private providerSettingsContainer: HTMLDivElement;
    private mcpServersContainer: HTMLDivElement;
    private mcpMarketplaceContainer: HTMLDivElement;
    private mcpMarketplaceView: McpMarketplaceView | null = null;
    private mcpServersView: McpServersView | null = null;
    private marketplaceService: McpMarketplaceService;

    constructor(app: App, plugin: Plugin, pluginCore: ObsigentPluginCore) {
        super(app, plugin);
        this.pluginCore = pluginCore;
        this.marketplaceService = new McpMarketplaceService();
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Obsigent Settings' });

        new Setting(containerEl)
            .setName('Select LLM Provider')
            .setDesc('Choose your preferred LLM provider for Obsigent.')
            .addDropdown(dropdown => {
                ALL_LLM_PROVIDERS.forEach(provider => {
                    dropdown.addOption(provider, LLM_PROVIDER_NAMES[provider]);
                });
                dropdown.setValue(this.pluginCore.settings.selectedProvider);
                dropdown.onChange(async (value) => {
                    this.pluginCore.settings.selectedProvider = value as LLMProviderType;
                    await this.pluginCore.saveSettings();
                    this.renderProviderSettings();
                });
            });

        this.providerSettingsContainer = containerEl.createDiv('provider-settings-container');
        this.renderProviderSettings();

        containerEl.createEl('h2', { text: 'Model Context Protocol (MCP) Settings' });

        containerEl.createEl('h3', { text: 'Managed ToolHive MCPs' });
        this.mcpServersContainer = containerEl.createDiv('mcp-servers-container');
        this.mcpServersContainer.style.marginBottom = '30px';

        containerEl.createEl('h3', { text: 'MCP Marketplace (ToolHive)' });
        this.mcpMarketplaceContainer = containerEl.createDiv('mcp-marketplace-container');

        this.renderMcpSections();
    }

    private renderProviderSettings(): void {
        this.providerSettingsContainer.empty();
        const selectedProvider = this.pluginCore.settings.selectedProvider;

        if (!this.pluginCore.settings.providerSettings[selectedProvider]) {
            this.pluginCore.settings.providerSettings[selectedProvider] = {};
        }
        const currentProviderSettings = this.pluginCore.settings.providerSettings[selectedProvider] as ProviderSettings;

        this.providerSettingsContainer.createEl('h3', { text: `${LLM_PROVIDER_NAMES[selectedProvider]} Settings` });

        if (selectedProvider !== 'ollama') {
            const apiKeySetting = new Setting(this.providerSettingsContainer)
                .setName('API Key');

            if (selectedProvider === 'openai') {
                apiKeySetting.setDesc(`Enter your API key for ${LLM_PROVIDER_NAMES[selectedProvider]}. Optional for some local OpenAI-compatible servers (e.g., LM Studio).`);
            } else {
                apiKeySetting.setDesc(`Enter your API key for ${LLM_PROVIDER_NAMES[selectedProvider]}.`);
            }

            apiKeySetting.addText(text => text
                .setPlaceholder('sk-...')
                .setValue(currentProviderSettings.apiKey || '')
                .onChange(async (value) => {
                    currentProviderSettings.apiKey = value;
                    await this.pluginCore.saveSettings();
                }));
        }

        new Setting(this.providerSettingsContainer)
            .setName('Default Model')
            .setDesc(`Enter the default model to use for ${LLM_PROVIDER_NAMES[selectedProvider]}.`)
            .addText(text => text
                .setPlaceholder('e.g., gpt-3.5-turbo, claude-3-opus-20240229')
                .setValue(currentProviderSettings.defaultModel || '')
                .onChange(async (value) => {
                    currentProviderSettings.defaultModel = value;
                    await this.pluginCore.saveSettings();
                }));

        if (selectedProvider === 'openai' || selectedProvider === 'ollama') {
            let placeholderEndpoint = '';
            let descriptionText = '';

            if (selectedProvider === 'openai') {
                placeholderEndpoint = 'https://api.openai.com/v1/chat/completions';
                descriptionText = `Enter the full chat completions URL. For OpenAI: ${placeholderEndpoint}. For local servers (e.g., LM Studio): http://localhost:PORT/v1/chat/completions.`;
            } else {
                placeholderEndpoint = 'http://localhost:11434/api/chat';
                descriptionText = `Default: ${placeholderEndpoint}. Override if your Ollama instance uses a different URL.`;
            }

            new Setting(this.providerSettingsContainer)
                .setName('API Endpoint')
                .setDesc(descriptionText)
                .addText(text => text
                    .setPlaceholder(placeholderEndpoint)
                    .setValue(currentProviderSettings.apiEndpoint || '')
                    .onChange(async (value) => {
                        currentProviderSettings.apiEndpoint = value;
                        await this.pluginCore.saveSettings();
                    }));
        }
    }

    private renderMcpSections(): void {
        this.mcpServersView = new McpServersView(
            this.mcpServersContainer,
            this.pluginCore.settings.mcpServers,
            (toolName: string) => this.stopMcpServer(toolName), // onStop callback
            (toolName: string) => this.removeMcpServer(toolName)  // onRemove callback
        );
        this.mcpServersView.display();

        this.mcpMarketplaceView = new McpMarketplaceView(
            this.mcpMarketplaceContainer,
            this.pluginCore.settings.mcpServers,
            (item: ToolHiveMarketplaceItem) => this.installMcpFromMarketplace(item)
        );
        this.mcpMarketplaceView.display();
        this.refreshRunningServers();
    }

    private async updateMcpServersState(servers: McpServer[]): Promise<void> {
        this.pluginCore.settings.mcpServers = servers;
        await this.pluginCore.saveSettings();

        if (this.mcpServersView) {
            this.mcpServersView.updateServers(servers);
        }
        if (this.mcpMarketplaceView) {
            this.mcpMarketplaceView.updateManagedToolHiveTools(servers);
        }
    }

    private async stopMcpServer(toolHiveToolName: string): Promise<void> {
        new Notice(`Attempting to stop ${toolHiveToolName}...`);
        try {
            const stopCommand = this.marketplaceService.prepareStopToolCommand(toolHiveToolName);
            console.log(`Executing for stop: ${stopCommand}`);
            await this.pluginCore.runCommandInTerminal(stopCommand, `Stopping ${toolHiveToolName} via ToolHive.`, false);
            new Notice(`${toolHiveToolName} stop command executed. Refreshing list...`);
        } catch (error) {
            console.error(`Error stopping ${toolHiveToolName}:`, error);
            new Notice(`Failed to stop ${toolHiveToolName}. Check console.`);
        } finally {
            this.refreshRunningServers();
        }
    }

    private async removeMcpServer(toolHiveToolName: string): Promise<void> {
        new Notice(`Attempting to remove ${toolHiveToolName} (after stopping if running)...`);
        try {
            const serverState = this.pluginCore.settings.mcpServers.find(s => s.toolHiveToolName === toolHiveToolName);
            if (serverState && (serverState.status === 'running' || serverState.status === 'unknown')) {
                const stopCommand = this.marketplaceService.prepareStopToolCommand(toolHiveToolName);
                console.log(`Executing for stop (before remove): ${stopCommand}`);
                await this.pluginCore.runCommandInTerminal(stopCommand, `Stopping ${toolHiveToolName} before removal.`, false);
                new Notice(`${toolHiveToolName} stop command executed.`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            const removeCommand = this.marketplaceService.prepareRemoveToolCommand(toolHiveToolName);
            console.log(`Executing for remove: ${removeCommand}`);
            await this.pluginCore.runCommandInTerminal(removeCommand, `Removing ${toolHiveToolName} via ToolHive.`, false);

            this.pluginCore.settings.mcpServers = this.pluginCore.settings.mcpServers.filter(
                server => server.toolHiveToolName !== toolHiveToolName
            );
            await this.pluginCore.saveSettings();
            new Notice(`${toolHiveToolName} remove command executed. Refreshing server list.`);
        } catch (error) {
            console.error(`Error removing ${toolHiveToolName}:`, error);
            new Notice(`Failed to remove ${toolHiveToolName}. Check console.`);
        } finally {
            this.refreshRunningServers();
        }
    }

    private async installMcpFromMarketplace(item: ToolHiveMarketplaceItem): Promise<void> {
        new Notice(`Attempting to run ${item.displayName || item.toolHiveToolName} via ToolHive...`);
        try {
            const runCommand = this.marketplaceService.prepareRunToolCommand(item.toolHiveToolName);
            console.log(`Executing: ${runCommand}`);
            await this.pluginCore.runCommandInTerminal(runCommand, `Running ${item.displayName || item.toolHiveToolName} via ToolHive.`, true);

            const existingServer = this.pluginCore.settings.mcpServers.find(s => s.toolHiveToolName === item.toolHiveToolName);
            if (!existingServer) {
                const newServerEntry: McpServer = {
                    toolHiveToolName: item.toolHiveToolName,
                    displayName: item.displayName || item.toolHiveToolName,
                    status: 'unknown',
                };
                this.pluginCore.settings.mcpServers.push(newServerEntry);
                await this.pluginCore.saveSettings();
            }
            new Notice(`${item.displayName || item.toolHiveToolName} run command initiated. Refreshing list...`);
        } catch (error) {
            console.error(`Failed to initiate run for ${item.toolHiveToolName}:`, error);
            new Notice(`Failed to run ${item.displayName || item.toolHiveToolName}. See console.`);
        } finally {
            this.refreshRunningServers();
        }
    }

    public async refreshRunningServers(): Promise<void> {
        new Notice('Refreshing ToolHive MCP list...');
        try {
            const listCommand = this.marketplaceService.prepareListToolsCommand();
            console.log(`Executing: ${listCommand}`);
            const commandOutput = await this.pluginCore.runCommandInTerminal(listCommand, "Fetching list of running ToolHive tools.", false);
            let toolhiveTools: { name: string; status: string; image: string; ports?: string; container_id?: string }[] = [];

            if (commandOutput && commandOutput.stdout) {
                try {
                    toolhiveTools = JSON.parse(commandOutput.stdout);
                    if (!Array.isArray(toolhiveTools)) {
                        console.error("Parsed thv list output is not an array:", toolhiveTools);
                        new Notice("Error: Unexpected format from 'thv list'. Check console.");
                        toolhiveTools = [];
                    }
                } catch (e) {
                    console.error("Failed to parse JSON from 'thv list':", e);
                    console.error("Raw output from 'thv list':", commandOutput.stdout);
                    new Notice("Error parsing ToolHive list. Check console for raw output.");
                    toolhiveTools = [];
                }
            } else {
                console.warn("'thv list' did not produce any output or an error occurred.");
                new Notice("Warning: 'thv list' command returned no output.");
            }

            const currentTrackedServers = [...this.pluginCore.settings.mcpServers];
            const newServerList: McpServer[] = [];
            const processedToolNames = new Set<string>();

            for (const trackedServer of currentTrackedServers) {
                const liveTool = toolhiveTools.find(t => t.name === trackedServer.toolHiveToolName);
                if (liveTool) {
                    newServerList.push({
                        ...trackedServer,
                        status: liveTool.status === 'running' ? 'running' : 'stopped',
                        containerId: liveTool.container_id,
                        ports: liveTool.ports,
                    });
                } else {
                    newServerList.push({
                        ...trackedServer,
                        status: 'stopped',
                        containerId: undefined,
                        ports: undefined,
                    });
                }
                processedToolNames.add(trackedServer.toolHiveToolName);
            }

            for (const liveTool of toolhiveTools) {
                if (!processedToolNames.has(liveTool.name)) {
                    const marketplaceItem = await this.marketplaceService.findMarketplaceItemByName(liveTool.name);
                    newServerList.push({
                        toolHiveToolName: liveTool.name,
                        displayName: marketplaceItem?.displayName || liveTool.name,
                        status: liveTool.status === 'running' ? 'running' : 'stopped',
                        containerId: liveTool.container_id,
                        ports: liveTool.ports,
                    });
                }
            }

            this.pluginCore.settings.mcpServers = newServerList;
            await this.pluginCore.saveSettings();

            if (this.mcpServersView) {
                this.mcpServersView.updateServers(this.pluginCore.settings.mcpServers);
            }
            if (this.mcpMarketplaceView) {
                this.mcpMarketplaceView.updateManagedToolHiveTools(this.pluginCore.settings.mcpServers);
            }
            new Notice('ToolHive MCP list refreshed.');

        } catch (error) {
            console.error('Failed to refresh ToolHive MCP list:', error);
            new Notice('Error refreshing ToolHive MCP list. See console.');
            if (this.mcpServersView) {
                this.mcpServersView.updateServers(this.pluginCore.settings.mcpServers);
            }
        }
    }
}
