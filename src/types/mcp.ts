// MCP Types for Obsidian Plugin
// Adapted from Obsigent's MCP types
// Original source or inspiration can be noted here if applicable

export const DEFAULT_MCP_TIMEOUT_SECONDS = 60;
export const MIN_MCP_TIMEOUT_SECONDS = 1;
export type McpMode = "full" | "server-use-only" | "off";

export type McpTool = {
	name: string;
	description?: string;
	inputSchema?: McpToolSchema; // Changed from object to McpToolSchema
	autoApprove?: boolean;
};

// Define McpToolSchema (moved from McpService.ts and exported)
export interface McpToolParameter {
    name: string;
    type: string; // e.g., "string", "number", "boolean", "object", "array"
    description?: string;
    required?: boolean;
    properties?: Record<string, McpToolParameter>; // For object type
    items?: McpToolParameter; // For array type
}

export interface McpToolSchema {
    type: "object";
    properties: Record<string, McpToolParameter>;
    required?: string[];
}

// This interface represents an MCP server instance managed by the plugin.
// With ToolHive, this will represent a tool that ToolHive is managing.
export interface McpServer {
	toolHiveToolName: string; // The unique name used by ToolHive (e.g., "stacklok/mcp-summary")
	displayName?: string; // User-friendly display name, can be derived from marketplace item
	status: 'running' | 'stopped' | 'unknown' | 'error'; // Status obtained from 'thv list' or after commands
	containerId?: string; // Docker container ID if running
	ports?: string; // Port mapping if available
	error?: string; 
}

export type McpResource = {
	uri: string;
	name: string;
	mimeType?: string;
	description?: string;
};

export type McpResourceTemplate = {
	uriTemplate: string;
	name: string;
	description?: string;
	mimeType?: string;
};

export type McpResourceResponse = {
	_meta?: Record<string, any>;
	contents: Array<{
		uri: string;
		mimeType?: string;
		text?: string;
		blob?: string;
	}>;
};

export type McpToolCallResponse = {
	_meta?: Record<string, any>;
	content: Array<
		| {
				type: "text";
				text: string;
		  }
		| {
				type: "image";
				data: string;
				mimeType: string;
		  }
		| {
				type: "audio";
				data: string;
				mimeType: string;
		  }
		| {
				type: "resource";
				resource: {
					uri: string;
					mimeType?: string;
					text?: string;
					blob?: string;
				};
		  }
	>;
	isError?: boolean;
};

// Raw API response from mcp-get.com
export interface McpGetApiItem {
	id: number;
	name: string;
	description: string;
	vendor: string;
	sourceUrl: string;
	homepage: string;
	license: string;
	runtime: string;
	versions: any[];
	dependencies: any;
	lastUpdated: string;
	viewCount: string;
	createdAt: string;
	isNew: boolean;
}

// Internal representation for marketplace items
export interface McpMarketplaceItem {
	mcpId: string; // Unique identifier for the marketplace item
	displayName: string;
	description: string;
	category: string;
	tags: string[];
	icon?: string; // URL or base64 encoded image
	author?: string;
	version?: string;
	stars?: number; // e.g., GitHub stars
	pulls?: number; // Download count or similar metric
}

export interface McpMarketplaceCatalog {
	items: McpMarketplaceItem[];
	totalCount: number;
	lastUpdated: string;
}

// ToolHive specific types

// Represents the metadata for a tool in the ToolHive registry
export interface ToolHiveToolMetadata {
	last_updated?: string;
	pulls?: number;
	stars?: number;
	// Add any other relevant metadata fields
}

// This interface represents a single tool/server entry in the ToolHive registry.json
export interface ToolHiveRegistryTool {
	description?: string;
	repository_url?: string;
	image?: string;
	tags?: string[];
	tools?: string[]; // List of capabilities/tools provided by the server
	metadata?: ToolHiveToolMetadata;
	args?: string[];
	env_vars?: Array<{ name: string; description?: string; required?: boolean; default?: string; }>;
	permissions?: any; // Define more strictly if needed
	transport?: string;
	target_port?: number;
	provenance?: any; // Define more strictly if needed
}

// Represents the structure of the ToolHive registry.json file
export interface ToolHiveRegistry {
	last_updated?: string;
	servers: Record<string, ToolHiveRegistryTool>; // Changed from tools: ToolHiveRegistryTool[]
	version?: string;
}

// Extends McpMarketplaceItem with ToolHive specific identifier
export interface ToolHiveMarketplaceItem extends McpMarketplaceItem {
	toolHiveToolName: string; // e.g., "stacklok/mcp-summary"
}

export interface ToolHiveMarketplaceCatalog {
	items: ToolHiveMarketplaceItem[];
	categories: string[];
	tags: string[];
}

export interface McpDownloadResponse {
	mcpId: string;
	githubUrl: string;
	name: string;
	author: string;
	description: string;
	readmeContent: string;
	llmsInstallationContent: string;
	requiresApiKey: boolean;
}

export type McpViewTab = "marketplace" | "addRemote" | "installed";
