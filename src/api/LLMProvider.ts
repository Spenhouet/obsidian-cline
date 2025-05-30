// src/api/LLMProvider.ts
import { ObsigentPluginSettings } from '../main'; 
import { OpenAIMessage, OpenAIToolCall } from './OpenAIProvider'; // Imported from OpenAIProvider
export type { OpenAIMessage, OpenAIToolCall }; // Re-export OpenAIMessage for use by other modules importing from LLMProvider
import { McpTool } from '../types/mcp'; // Corrected import path

// Define ToolCall and ToolCallFunction here as they are used by StreamCallbacks
export interface ToolCallFunction {
    name: string;
    arguments: string; // JSON string of arguments
}

export interface ToolCall {
    id: string; // Unique ID for the tool call, to be sent back with the result
    type: 'function'; // Currently, only 'function' is supported
    function: ToolCallFunction;
}

// Callbacks for streaming API - this can be a shared interface
// For now, let's assume StreamCallbacks will also be defined here or imported if it's truly generic.
// Re-defining it here for clarity during refactor, can consolidate later.
export interface StreamCallbacks {
    onUpdate: (contentChunk: string, isFinal: boolean) => void; 
    onToolCall?: (toolCalls: ToolCall[]) => Promise<void>; 
    onError: (errorMsg: string, errorDetails?: unknown) => void; 
    onFinish: (reason?: string) => void; 
}

// Define a structure for tool calls that the LLM provider can return
// Moved ToolCallFunction and ToolCall to mcp.ts as they are more generic
// export interface ToolCallFunction {
// name: string;
// arguments: string; // JSON string of arguments
// }

// export interface ToolCall {
// id: string; // Unique ID for the tool call, to be sent back with the result
// type: 'function'; // Currently, only 'function' is supported
// function: ToolCallFunction;
// }


export interface LLMProvider {
    readonly providerName: string;

    // Method to generate response, potentially with streaming and tool use
    generateResponse(
        messages: OpenAIMessage[], 
        settings: ObsigentPluginSettings, 
        callbacks: StreamCallbacks,
        availableTools?: McpTool[],
        abortController?: AbortController
    ): Promise<void>;

    // Optional: Method to validate settings for this provider
    // validateSettings?(providerSettings: any): { isValid: boolean; errors?: string[] };
}

// Define a type for provider-specific settings
export interface ProviderSettings {
    apiKey?: string;
    apiEndpoint?: string;
    defaultModel?: string;
    // Add other common or provider-specific fields here
    [key: string]: unknown; // Allow for arbitrary provider-specific settings
}

export type LLMProviderType = 
    | 'openai' 
    | 'anthropic' 
    | 'google' 
    | 'cohere' 
    | 'ollama' 
    /* | add other providers here */ ;

export const ALL_LLM_PROVIDERS: LLMProviderType[] = [
    'openai', 
    'anthropic', 
    'google', 
    'cohere', 
    'ollama'
];

export const LLM_PROVIDER_NAMES: Record<LLMProviderType, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google AI",
    cohere: "Cohere",
    ollama: "Ollama (Self-Hosted)",
};
