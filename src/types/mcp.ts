// MCP Types for Obsidian Plugin
// Adapted from Obsigent's MCP types
// Original source or inspiration can be noted here if applicable

export const DEFAULT_MCP_TIMEOUT_SECONDS = 60;
export const MIN_MCP_TIMEOUT_SECONDS = 1;
export type McpMode = "full" | "server-use-only" | "off";

export type McpTool = {
	name: string;
	description?: string;
	inputSchema: McpToolSchema;
	annotations?: McpToolAnnotations;
};

export interface McpToolAnnotations {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
}

// Define McpToolSchema (moved from McpService.ts and exported)
export interface McpToolParameter {
    name: string;
    type: string; // e.g., "string", "number", "boolean", "object", "array"
    description?: string;
    required?: boolean;
    properties?: Record<string, McpToolParameter>; // For object type
    items?: McpToolParameter; // For array type
}

export interface McpToolSchemaProperties {
    [key: string]: {
        type: string;
        description?: string;
        items?: { type: string; enum?: string[] } | { enum: string[] };
        enum?: string[];
    };
}

export interface McpToolSchema {
    type: "object";
    properties: McpToolSchemaProperties;
    required?: string[];
}

export interface CachedCommandMcpDetails {
    id: string;
    originalName: string; // Store original command name for comparison
    description?: string; // Human-readable description, potentially LLM generated
    inputSchema: McpToolSchema; // JSON schema for parameters
    annotations?: McpToolAnnotations; // Optional hints about tool behavior
}

// This interface defines the expected structure from an LLM call
// when generating full details for an Obsidian command.
export interface GeneratedCommandMcpDetails {
    description: string;
    inputSchema: McpToolSchema;
    annotations: McpToolAnnotations;
}

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
	_meta?: Record<string, unknown>; // Changed any to unknown
	contents: Array<{
		uri: string;
		mimeType?: string;
		text?: string;
		blob?: string;
	}>;
};

export type McpToolCallResponse = {
	_meta?: Record<string, unknown>; // Changed any to unknown
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
	versions: Record<string, unknown>[]; // Changed any[] to Record<string, unknown>[]
	dependencies: Record<string, unknown>; // Changed any to Record<string, unknown>
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
	permissions?: Record<string, unknown>; // Changed any to Record<string, unknown>
	transport?: string;
	target_port?: number;
	provenance?: Record<string, unknown>; // Changed any to Record<string, unknown>
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

export interface McpMessageContent {
    type: 'text' | 'image_url' | 'tool_use' | 'tool_result';
    text?: string;
    image_url?: { url: string };
    tool_use_id?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    tool_content?: McpMessageContent[]; // For tool_result, if it contains structured content
    is_error?: boolean; // For tool_result
}

export interface McpMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | McpMessageContent[];
    name?: string; // Optional: The name of the tool that was called (for role: 'tool')
    tool_call_id?: string; // Optional: The ID of the tool call (for role: 'tool')
    tool_calls?: { // For role: 'assistant', when it wants to call tools
        id: string;
        type: 'function'; // MCP typically uses 'tool' or implies it, 'function' is common in OpenAI
        function: {
            name: string;
            arguments: string; // JSON string of arguments
        };
    }[];
}

// For executeTool return type
export interface McpToolCallResultContent {
    type: "text"; // Can be expanded later (e.g., "json", "markdown")
    text: string;
}

export interface McpToolCallResult {
    isError?: boolean;
    content: McpToolCallResultContent[];
}
