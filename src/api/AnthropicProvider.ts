// src/api/AnthropicProvider.ts
import { Notice, requestUrl } from 'obsidian';
import type { ObsigentPluginSettings } from '../main';
import type { McpTool } from '../types/mcp';
import type { LLMProvider, StreamCallbacks, ProviderSettings, OpenAIMessage as GenericOpenAIMessage } from './LLMProvider';

// Anthropic specific interfaces
interface AnthropicMessageContentBlock {
    type: 'text';
    text: string;
    // TODO: Add other content block types like 'image', 'tool_use', 'tool_result' if needed later
}

interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: AnthropicMessageContentBlock[]; // Anthropic expects content to be an array of blocks
    // For text-only, it will be [{ type: 'text', text: '...' }]
}

interface AnthropicRequest {
    model: string;
    messages: AnthropicMessage[];
    system?: string; // System prompt is a top-level parameter
    max_tokens: number;
    temperature?: number;
    stream?: boolean;
    // TODO: Add other parameters like top_p, top_k, tool_choice, tools later
}

// Simplified stream event types based on reference
// (Actual SDK has more detailed types like Anthropic.RawMessageStreamEvent)
interface AnthropicStreamEvent {
    type: string; // e.g., 'message_start', 'content_block_delta', 'message_stop'
    delta?: {
        type?: 'text_delta' | 'thinking_delta'; // and others
        text?: string;
        thinking?: string;
    };
    message?: { // For message_start
        usage: { input_tokens: number; output_tokens: number };
    };
    usage?: { // For message_delta
        output_tokens: number;
    };
    content_block?: { // For content_block_start
        type: 'text' | 'thinking' | 'redacted_thinking'; // and others
        text?: string;
        thinking?: string;
    };
    index?: number; // For content_block_start
}


export class AnthropicProvider implements LLMProvider {
    readonly providerName = "anthropic";

    private convertToAnthropicMessages(messages: GenericOpenAIMessage[]): { anthropicMessages: AnthropicMessage[], systemPrompt?: string } {
        const anthropicMessages: AnthropicMessage[] = [];
        let systemPrompt: string | undefined = undefined;

        for (const msg of messages) {
            if (msg.role === 'system') {
                if (msg.content) {
                    // Anthropic takes the last system prompt if multiple are present.
                    // Or, concatenate them, but the API expects a single string.
                    systemPrompt = msg.content;
                }
                continue;
            }

            if (msg.role === 'user' || msg.role === 'assistant') {
                if (msg.content) { // Ensure content is not null
                    anthropicMessages.push({
                        role: msg.role,
                        content: [{ type: 'text', text: msg.content }] // Simple text content for now
                    });
                } else if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                    // TODO: Handle assistant messages with tool_calls if/when implementing tools for Anthropic
                    // This would involve creating 'tool_use' content blocks.
                    // For now, skipping assistant messages that only contain tool_calls and no text content.
                    console.warn("AnthropicProvider: Skipping assistant message with only tool_calls and no text content.");
                }
            }
            // TODO: Handle 'tool' role messages if/when implementing tools for Anthropic
            // This would involve creating 'tool_result' content blocks.
        }
        return { anthropicMessages, systemPrompt };
    }

    public async generateResponse(
        messages: GenericOpenAIMessage[],
        settings: ObsigentPluginSettings,
        callbacks: StreamCallbacks,
        availableTools?: McpTool[], // Tools are not yet implemented for Anthropic in this provider
        abortController?: AbortController
    ): Promise<void> {
        const providerSettings = settings.providerSettings?.[this.providerName] as ProviderSettings || {};
        const apiKey = providerSettings.apiKey;
        const apiBaseUrl = providerSettings.apiEndpoint || 'https://api.anthropic.com'; // Default Anthropic API base
        const defaultModel = providerSettings.defaultModel || 'claude-3-haiku-20240307'; // A common default

        if (!apiKey) {
            callbacks.onError('Anthropic API key is not set.');
            return;
        }
        if (!defaultModel) {
            callbacks.onError('Anthropic Default model is not set.');
            return;
        }

        const { anthropicMessages, systemPrompt } = this.convertToAnthropicMessages(messages);

        if (anthropicMessages.length === 0 && !systemPrompt) {
            callbacks.onError("No messages to send to Anthropic.");
            return;
        }
        
        // Ensure the last message is from the user if the API requires it (Anthropic does)
        if (anthropicMessages.length > 0 && anthropicMessages[anthropicMessages.length - 1].role !== 'user') {
            // This can happen if the last message was an assistant response (e.g. from history)
            // or a tool call that wasn't followed by a user message.
            // For now, we'll let it proceed, but Anthropic might error.
            // A more robust solution might involve prompting the user or adding a placeholder.
            console.warn("AnthropicProvider: Last message is not from user. Anthropic API might reject this.");
        }


        const requestBody: AnthropicRequest = {
            model: defaultModel,
            messages: anthropicMessages,
            max_tokens: 4096, // A common default, should be configurable
            stream: true,
            temperature: 0.7, // A common default, should be configurable
        };

        if (systemPrompt) {
            requestBody.system = systemPrompt;
        }
        
        const fullApiUrl = `${apiBaseUrl.replace(/\/+$/, '')}/v1/messages`; // Standard Anthropic messages endpoint

        try {
            const response = await fetch(fullApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01', // Common version
                    // TODO: Add 'anthropic-beta': 'prompt-caching-2024-07-31' or similar if implementing caching
                },
                body: JSON.stringify(requestBody),
                signal: abortController?.signal, // Add abort signal support
            });

            if (!response.ok) {
                let errorDetails = `HTTP Error ${response.status}`;
                try {
                    const errorJson = await response.json(); // Anthropic error structure might differ
                    if (errorJson && errorJson.error && errorJson.error.message) {
                      errorDetails = `${errorJson.error.type || 'API Error'}: ${errorJson.error.message}`;
                    } else if (errorJson && errorJson.detail) { // Another possible error format
                        errorDetails = `API Error: ${errorJson.detail}`;
                    }
                     else {
                        errorDetails = `HTTP Error ${response.status}: ${await response.text() || 'No additional details'}`;
                    }
                } catch (e) {
                    errorDetails = `HTTP Error ${response.status}: ${await response.text() || 'Failed to parse error response.'}`;
                }
                callbacks.onError(errorDetails);
                return;
            }

            if (!response.body) {
                callbacks.onError('Response body is null.');
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // Stream parsing logic adapted for Anthropic's SSE format
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                
                // Anthropic SSEs are newline-separated events
                let eventEndIndex;
                while ((eventEndIndex = buffer.indexOf('\n\n')) !== -1) {
                    const eventLines = buffer.substring(0, eventEndIndex).split('\n');
                    buffer = buffer.substring(eventEndIndex + 2);

                    let eventType = '';
                    let eventData = '';

                    for (const line of eventLines) {
                        if (line.startsWith('event: ')) {
                            eventType = line.substring(7).trim();
                        } else if (line.startsWith('data: ')) {
                            eventData = line.substring(6).trim();
                        }
                    }

                    if (eventData) {
                        try {
                            const parsedData: AnthropicStreamEvent = JSON.parse(eventData);
                            
                            switch (eventType) {
                                case 'message_start':
                                    // console.log("Anthropic message_start:", parsedData);
                                    // Can get input/output tokens from parsedData.message.usage
                                    break;
                                case 'content_block_delta':
                                    if (parsedData.delta?.type === 'text_delta' && parsedData.delta.text) {
                                        callbacks.onContent(parsedData.delta.text, false);
                                    }
                                    // TODO: Handle 'thinking_delta' if needed
                                    break;
                                case 'message_delta':
                                    // console.log("Anthropic message_delta:", parsedData);
                                    // Can get incremental output_tokens from parsedData.usage
                                    break;
                                case 'message_stop':
                                    // console.log("Anthropic message_stop");
                                    callbacks.onFinish("stop"); // Or map reason if available
                                    return; // Stream finished
                                case 'ping':
                                    // console.log("Anthropic ping");
                                    break;
                                case 'error':
                                    console.error("Anthropic stream error event:", parsedData);
                                    callbacks.onError(`Anthropic API Error: ${(parsedData as any).error?.message || 'Unknown stream error'}`);
                                    return;
                                default:
                                    // Potentially other events like content_block_start, content_block_stop
                                    // console.log(`Anthropic unhandled event type: ${eventType}`, parsedData);
                                    break;
                            }
                        } catch (e: any) {
                            console.error('Error parsing Anthropic stream data JSON:', e, 'Data:', eventData);
                        }
                    }
                }
            }
             // If loop finishes without message_stop, it might be an incomplete stream or different termination
            callbacks.onFinish("done_outside_loop");


        } catch (error: any) {
            // Handle abort errors gracefully
            if (error.name === 'AbortError') {
                callbacks.onFinish('aborted');
                return;
            }
            callbacks.onError(`Failed to connect to Anthropic API: ${error.message || 'Unknown error'}`);
        }
    }
}
