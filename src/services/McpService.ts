// src/services/McpService.ts
// This file is largely obsolete due to the shift to ToolHive.
// ToolHive manages the lifecycle and discovery of MCP servers (tools).
// The plugin will interact with ToolHive via CLI commands (`thv run`, `thv stop`, `thv rm`, `thv list`)
// and by fetching the ToolHive registry.
// Therefore, direct MCP server connection, manifest parsing, and tool execution logic
// within this plugin service are no longer the primary mechanisms.

// Keeping the file for now in case any utility functions are needed,
// but most of its previous responsibilities are now handled by:
// - McpMarketplaceService.ts (for fetching ToolHive registry and preparing thv commands)
// - SettingsTab.ts (for executing thv commands and managing McpServer state based on thv list)
// - main.ts (ObsigentPluginCore.runCommandInTerminal for actual command execution)

import { Notice } from 'obsidian';
import { ObsigentPluginSettings } from '../main';
import { McpServer, McpTool, McpToolSchema } from '../types/mcp'; // McpServer is now ToolHive-centric

// The McpTool, McpManifest, McpToolParameter, McpToolSchema interfaces
// were related to direct MCP server interaction and manifest parsing.
// These are less relevant now as ToolHive abstracts this.
// We might still use simplified versions if we need to display tool info
// obtained from ToolHive registry in a structured way, but not for connection/execution.

export class McpService {
    private settings: ObsigentPluginSettings;
    private statusChangeCallback?: (servers: McpServer[]) => void;
    private toolSchemas: Map<string, McpToolSchema> = new Map(); // Cache for tool schemas

    constructor(settings: ObsigentPluginSettings) {
        this.settings = settings;
        // this.initializeServers(); // Commented out as it's not defined and class is largely obsolete
    }

    public setStatusChangeCallback(callback: (servers: McpServer[]) => void): void {
        this.statusChangeCallback = callback;
    }

    // loadManifests, loadConfiguredServers, connectToServer, connectHttpServer
    // are now obsolete as ToolHive handles server management and connections.
    // The plugin will use `thv run` to start servers and `thv list` to get their status.

    // getAllTools is also largely obsolete in its current form.
    // Tool information will come from the ToolHive registry (McpMarketplaceService)
    // and the running tools list from `thv list` (SettingsTab).
    // If we need a unified view of available tools from running MCPs, that logic would change.

    // executeTool and executeServerTool are obsolete.
    // Tool execution will be via the standard chat interface, which will route
    // requests to the appropriate MCP server (now managed by ToolHive) if the LLM decides to use one.
    // The core plugin logic will need to know how to format requests for these ToolHive-managed tools,
    // potentially using a generic MCP client if the tools expose a standard MCP interface, or specific
    // client logic if they expose other APIs. ToolHive itself doesn't standardize the tool's operational protocol,
    // only its management (run, stop, etc.).

    // getConnectedServers might be useful, but its definition of "connected" changes.
    // It would rely on the `status` field of `McpServer` objects, which is populated by `thv list`.
    public getRunningToolHiveServers(): McpServer[] {
        return this.settings.mcpServers.filter(server => server.status === 'running');
    }

    // reconnectServer and disconnectServer are obsolete as direct connection management is removed.
    // Interactions will be `thv run`, `thv stop`.

    // This service might evolve to hold utility functions for interacting with
    // ToolHive-managed MCPs once they are running, e.g., if there's a need to
    // query their specific capabilities beyond what the ToolHive registry provides,
    // but this would be after `thv run` has successfully started them.

    // For now, most of the functionality is removed or commented out to reflect the new architecture.
    public async refreshServerStatesFromToolHive(): Promise<void> {
        // This method would be called by SettingsTab after `thv list`
        // to update the plugin's internal state of McpServers.
        // The actual `thv list` call and parsing should happen in SettingsTab.
        // This service could then be responsible for updating any other parts of the plugin
        // that depend on the server list, if any, beyond the SettingsTab UI.
        if (this.statusChangeCallback) {
            // Potentially pass a freshly updated list from settings
            this.statusChangeCallback([...this.settings.mcpServers]);
        }
    }
}
