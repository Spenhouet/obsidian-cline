// src/api/OpenAIProvider.ts
import { Notice } from 'obsidian';
import { ObsigentPluginSettings } from '../main';
import { McpTool } from '../types/mcp';
import { LLMProvider, StreamCallbacks, ProviderSettings, ToolCall } from './LLMProvider'; // Import new interfaces

// OpenAI specific message and tool structures (can remain here)
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIFunction {
    name: string;
    description?: string;
    parameters: any; // JSON Schema object
}

export interface OpenAITool {
    type: "function";
    function: OpenAIFunction;
}

export interface OpenAIToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string; // JSON string of arguments
    };
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAITool[];
  tool_choice?: "none" | "auto" | { type: "function", function: { name: string } };
  stream?: boolean;
}

interface OpenAIResponseChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: string;
}

interface OpenAIErrorResponse { // Renamed to avoid conflict if OpenAIResponse is used for success
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  }
}


export class OpenAIProvider implements LLMProvider {
    readonly providerName = "openai";

    public async generateResponse(
        messages: OpenAIMessage[], // Using OpenAI specific message type for now
        settings: ObsigentPluginSettings,
        callbacks: StreamCallbacks,
        availableTools?: McpTool[],
        abortController?: AbortController
    ): Promise<void> {
        const providerSettings = settings.providerSettings?.[this.providerName] as ProviderSettings || {};
        const apiKey = providerSettings.apiKey || settings.apiKey; // Fallback to old global key for transition
        const apiEndpoint = providerSettings.apiEndpoint || settings.apiEndpoint; // Fallback
        const defaultModel = providerSettings.defaultModel || settings.defaultModel; // Fallback

        // API key is now optional; primary checks are for endpoint and model.
        if (!apiEndpoint) {
            callbacks.onError('OpenAI API endpoint is not set. Please configure it in settings.');
            return;
        }
        if (!defaultModel) {
            callbacks.onError('OpenAI Default model is not set. Please configure it in settings.');
            return;
        }

        const requestBody: OpenAIRequest = {
            model: defaultModel,
            messages: [...messages], // Ensure a shallow copy of the messages array is used
            stream: true,
        };

        // Add temperature and max_tokens if they are defined in providerSettings
        if (providerSettings.temperature !== undefined) {
            requestBody.temperature = providerSettings.temperature as number;
        }
        if (providerSettings.max_tokens !== undefined) {
            requestBody.max_tokens = providerSettings.max_tokens as number;
        }

        // if (availableTools && availableTools.length > 0) {
        //     requestBody.tools = availableTools.map(tool => ({
        //         type: "function",
        //         function: {
        //             name: tool.name,
        //             description: tool.description,
        //             parameters: tool.input_schema,
        //         }
        //     }));
        //     requestBody.tool_choice = "auto";
        // }

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };
        if (apiKey && apiKey.trim() !== "") { // Only add Authorization header if apiKey is present and not empty
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        // Log the request details for debugging
        console.log('Obsigent Plugin OpenAI Request Details:');
        console.log('Endpoint:', apiEndpoint);
        console.log('Headers:', JSON.stringify(headers, null, 2));
        console.log('Body:', JSON.stringify(requestBody, null, 2));

        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: headers, // Use the conditionally constructed headers
                body: JSON.stringify(requestBody),
                signal: abortController?.signal, // Add abort signal support
            });

            if (!response.ok) {
                let errorDetails = `HTTP Error ${response.status}`;
                try {
                    const errorJson = await response.json() as OpenAIErrorResponse;
                    if (errorJson.error) {
                      errorDetails = `${errorJson.error.type || 'API Error'}: ${errorJson.error.message}`;
                    } else {
                        errorDetails = `HTTP Error ${response.status}: ${await response.text() || 'No additional details'}`;
                    }
                } catch (e) {
                    errorDetails = `HTTP Error ${response.status}: ${await response.text() || 'Failed to parse error response.'}`;
                }
                console.error('OpenAI API Error:', errorDetails, 'Full response status:', response.status);
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
            let currentToolCallsAccumulator: OpenAIToolCall[] = []; 

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                let boundary = buffer.indexOf('\n\n');

                while (boundary !== -1) {
                    const chunk = buffer.substring(0, boundary);
                    buffer = buffer.substring(boundary + 2);
                    boundary = buffer.indexOf('\n\n');

                    if (chunk.startsWith('data: ')) {
                        const jsonData = chunk.substring(6);
                        if (jsonData.trim() === '[DONE]') {
                            continue; 
                        }
                        try {
                            const parsed = JSON.parse(jsonData);
                            if (parsed.choices && parsed.choices.length > 0) {
                                const delta = parsed.choices[0].delta;
                                const finishReason = parsed.choices[0].finish_reason;

                                if (delta?.content) {
                                    callbacks.onUpdate(delta.content, false); // Changed to onUpdate
                                }
                                
                                if (delta?.tool_calls) {
                                    delta.tool_calls.forEach((tcChunk: any) => {
                                        const index = tcChunk.index;
                                        if (!currentToolCallsAccumulator[index]) {
                                            currentToolCallsAccumulator[index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                                        }
                                        if (tcChunk.id) currentToolCallsAccumulator[index].id = tcChunk.id;
                                        if (tcChunk.type) currentToolCallsAccumulator[index].type = tcChunk.type as "function";
                                        if (tcChunk.function?.name) currentToolCallsAccumulator[index].function.name += tcChunk.function.name;
                                        if (tcChunk.function?.arguments) currentToolCallsAccumulator[index].function.arguments += tcChunk.function.arguments;
                                    });
                                }

                                if (finishReason) {
                                    if (finishReason === "tool_calls") {
                                        if (callbacks.onToolCall) { // Use onToolCall
                                            await callbacks.onToolCall(currentToolCallsAccumulator.filter(tc => tc && tc.id && tc.function.name && tc.function.arguments) as ToolCall[]);
                                        }
                                    } else {
                                        callbacks.onUpdate("", true); // Changed to onUpdate
                                    }
                                    callbacks.onFinish(finishReason);
                                    return; 
                                }
                            }
                        } catch (e: any) {
                            console.error('Error parsing stream chunk:', e, 'Chunk:', jsonData);
                        }
                    }
                }
            }
        } catch (error: any) {
            // Handle abort errors gracefully
            if (error.name === 'AbortError') {
                callbacks.onFinish('aborted');
                return;
            }
            const errorMsg = `Failed to connect to OpenAI API (stream): ${error.message || 'Unknown error'}`;
            console.error('OpenAI API Stream Request Failed:', error);
            callbacks.onError(errorMsg);
        }
    }
}
