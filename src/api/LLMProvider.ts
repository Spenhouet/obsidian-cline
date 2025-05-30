// src/api/LLMProvider.ts
import { ObsigentPluginSettings } from '../main'; 
import { OpenAIMessage } from './OpenAIProvider'; // Imported from OpenAIProvider
export type { OpenAIMessage }; // Re-export OpenAIMessage for use by other modules importing from LLMProvider
import { McpTool, McpToolSchema } from '../types/mcp'; // Corrected import path
// Note: OpenAIMessage and McpTool might need to become more generic if providers differ significantly

// Callbacks for streaming API - this can be a shared interface
// For now, let's assume StreamCallbacks will also be defined here or imported if it's truly generic.
// Re-defining it here for clarity during refactor, can consolidate later.
export interface StreamCallbacks {
    onContent: (contentChunk: string, isFinal: boolean) => void;
    onToolCallChunk?: (toolCallChunk: any, isFinal: boolean, toolCallIndex: number) => void; // 'any' for now, ideally generic
    onToolCallsDone?: (toolCalls: any[]) => void; // 'any[]' for now
    onError: (error: string) => void;
    onFinish: (reason: string) => void; // e.g., "stop", "tool_calls", "error"
}


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
    [key: string]: any; // Allow for arbitrary provider-specific settings
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
