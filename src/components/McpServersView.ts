import { Setting, Notice } from 'obsidian';
import { McpServer } from '../types/mcp';

export class McpServersView {
    private containerEl: HTMLElement;
    private servers: McpServer[];
    private onRemove: (toolHiveToolName: string) => void;
    private onStop: (toolHiveToolName: string) => void;

    constructor(
        containerEl: HTMLElement,
        servers: McpServer[],
        onStop: (toolHiveToolName: string) => void,
        onRemove: (toolHiveToolName: string) => void
    ) {
        this.containerEl = containerEl;
        this.servers = servers;
        this.onStop = onStop;
        this.onRemove = onRemove;
    }

    display(): void {
        this.containerEl.empty();
        
        if (this.servers.length === 0) {
            const emptyState = this.containerEl.createDiv('mcp-empty-state');
            emptyState.style.textAlign = 'center';
            emptyState.style.color = 'var(--text-muted)';
            emptyState.style.padding = '40px 20px';
            emptyState.textContent = 'No ToolHive MCPs managed. Install from the marketplace.';
            return;
        }
        
        this.servers.forEach(server => {
            this.createServerCard(server);
        });
    }

    private createServerCard(server: McpServer): void {
        const card = this.containerEl.createDiv('mcp-server-card');
        card.style.border = '1px solid var(--background-modifier-border)';
        card.style.borderRadius = '8px';
        card.style.padding = '16px';
        card.style.marginBottom = '12px';
        card.style.backgroundColor = 'var(--background-secondary)';
        
        // Header
        const header = card.createDiv('mcp-server-header');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '8px';
        
        const titleContainer = header.createDiv();
        const title = titleContainer.createEl('h4');
        title.textContent = server.displayName || server.toolHiveToolName;
        title.style.margin = '0';
        
        const statusEl = titleContainer.createEl('div');
        statusEl.style.fontSize = '12px';
        statusEl.style.marginTop = '4px';
        
        const statusColor = this.getStatusColor(server.status);
        statusEl.innerHTML = `<span style="color: ${statusColor};">● ${server.status}</span>`;
        if (server.ports) {
            const portsEl = titleContainer.createEl('div');
            portsEl.textContent = `Ports: ${server.ports}`;
            portsEl.style.fontSize = '10px';
            portsEl.style.color = 'var(--text-muted)';
        }
        if (server.containerId) {
            const containerIdEl = titleContainer.createEl('div');
            containerIdEl.textContent = `Container: ${server.containerId.substring(0, 12)}`;
            containerIdEl.style.fontSize = '10px';
            containerIdEl.style.color = 'var(--text-muted)';
        }
        
        // Controls
        const controls = header.createDiv();
        controls.style.display = 'flex';
        controls.style.gap = '8px';
        
        // Stop button (if running)
        if (server.status === 'running') {
            const stopButton = controls.createEl('button');
            stopButton.textContent = 'Stop';
            stopButton.onclick = () => this.onStop(server.toolHiveToolName);
        }
        
        // Remove button
        const removeButton = controls.createEl('button');
        removeButton.textContent = 'Remove';
        removeButton.style.backgroundColor = 'var(--interactive-accent)';
        removeButton.style.color = 'white';
        removeButton.onclick = () => this.onRemove(server.toolHiveToolName);
        
        // Error display
        if (server.error) {
            const errorContainer = card.createDiv('mcp-server-error');
            errorContainer.style.backgroundColor = 'var(--background-modifier-error)';
            errorContainer.style.padding = '8px';
            errorContainer.style.borderRadius = '4px';
            errorContainer.style.marginTop = '8px';
            
            const errorLabel = errorContainer.createEl('div');
            errorLabel.textContent = 'Error:';
            errorLabel.style.fontSize = '12px';
            errorLabel.style.fontWeight = 'bold';
            errorLabel.style.color = 'var(--text-error)';
            errorLabel.style.marginBottom = '4px';
            
            const errorText = errorContainer.createEl('div');
            errorText.textContent = server.error;
            errorText.style.fontSize = '12px';
            errorText.style.color = 'var(--text-error)';
        }
    }

    private getStatusColor(status: McpServer['status']): string {
        switch (status) {
            case 'running':
                return 'var(--text-success)';
            case 'stopped':
                return 'var(--text-warning)';
            case 'error':
                return 'var(--text-error)';
            case 'unknown':
            default:
                return 'var(--text-muted)';
        }
    }

    public updateServers(servers: McpServer[]): void {
        this.servers = servers;
        this.display();
    }
}
