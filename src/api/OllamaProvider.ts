// src/api/OllamaProvider.ts
import { Notice } from 'obsidian';
import { ObsigentPluginSettings } from '../main';
import { McpTool } from '../types/mcp';
import { LLMProvider, StreamCallbacks, ProviderSettings, LLMProviderType } from './LLMProvider'; 
import { OpenAIMessage } from './OpenAIProvider'; // Import OpenAIMessage directly

// Ollama specific request/response structures (simplified for chat)
interface OllamaChatRequest {
  model: string;
  messages: OpenAIMessage[]; // Assuming Ollama can take OpenAI-like message structure
  stream?: boolean;
  options?: Record<string, any>; // For temperature, etc.
  // format?: "json"; // For JSON mode if needed later
}

interface OllamaChatStreamResponse {
  model: string;
  created_at: string;
  message?: { // Content is within 'message'
    role: 'assistant';
    content: string;
  };
  done: boolean; // True if this is the final response
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  error?: string; // Ollama might return an error field in the stream
}

export class OllamaProvider implements LLMProvider {
    providerName: LLMProviderType = "ollama";

    async generateResponse(
        messages: OpenAIMessage[],
        settings: ObsigentPluginSettings,
        callbacks: StreamCallbacks,
        availableTools?: McpTool[], // Tools might be ignored for Ollama v1
        abortController?: AbortController
    ): Promise<void> {
        const providerSettings = settings.providerSettings?.[this.providerName] as ProviderSettings | undefined;
        
        if (!providerSettings || !providerSettings.apiEndpoint || !providerSettings.defaultModel) {
            callbacks.onError('Ollama API endpoint or default model is not set.');
            return;
        }
        const { apiEndpoint, defaultModel } = providerSettings;

        // Note: Ollama's /api/chat expects a slightly different message format if not using OpenAI compatibility.
        // For simplicity, we're assuming the OpenAIMessage structure is broadly compatible or
        // that the Ollama instance is set up for OpenAI compatibility if needed.
        // Tools are not directly supported in the same way as OpenAI's function calling by default in Ollama's core API.
        // Some Ollama models might interpret structured prompts for tool-like behavior, or one might use JSON mode.
        // For now, we ignore `availableTools` for basic Ollama chat.

        const requestBody: OllamaChatRequest = {
            model: defaultModel,
            messages: messages,
            stream: true,
            // options: { temperature: 0.7 } // Example: add options if needed
        };

        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: abortController?.signal, // Add abort signal support
            });

            if (!response.ok) {
                let errorDetails = `HTTP Error ${response.status}`;
                try {
                    const errorJson = await response.json();
                    errorDetails = `Ollama API Error: ${errorJson.error || await response.text()}`;
                } catch (e) {
                    errorDetails = `HTTP Error ${response.status}: ${await response.text() || 'Failed to parse error response.'}`;
                }
                console.error('Ollama API Error:', errorDetails);
                callbacks.onError(errorDetails);
                return;
            }

            if (!response.body) {
                callbacks.onError('Response body is null from Ollama.');
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            // Ollama streams NDJSON (newline-delimited JSON)
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    // If buffer has remaining content (should not happen if NDJSON is well-formed and stream ends cleanly)
                    if (buffer.trim()) {
                        try {
                            const parsed = JSON.parse(buffer) as OllamaChatStreamResponse;
                            if (parsed.message?.content) {
                                callbacks.onContent(parsed.message.content, parsed.done);
                            }
                            if (parsed.done) {
                                callbacks.onFinish(parsed.error ? "error" : "stop"); // Check for explicit error in final chunk
                                break;
                            }
                        } catch (e: any) {
                            console.error('Error parsing final Ollama stream chunk:', e, 'Chunk:', buffer);
                        }
                    }
                    callbacks.onFinish("stop"); // Ensure onFinish is called if loop terminates cleanly
                    break;
                }
                
                buffer += decoder.decode(value, { stream: true });
                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex);
                    buffer = buffer.substring(newlineIndex + 1);

                    if (line.trim() === '') continue;

                    try {
                        const parsed = JSON.parse(line) as OllamaChatStreamResponse;
                        if (parsed.error) { // Handle error within a stream chunk
                            callbacks.onError(`Ollama stream error: ${parsed.error}`);
                            callbacks.onFinish("error");
                            return; // Stop processing on stream error
                        }
                        if (parsed.message?.content) {
                            callbacks.onContent(parsed.message.content, false); // isFinal is false until 'done' is true
                        }
                        if (parsed.done) {
                            callbacks.onContent("", true); // Send final empty content if not already sent
                            callbacks.onFinish("stop");
                            return; // Stream finished
                        }
                    } catch (e: any) {
                        console.error('Error parsing Ollama stream line:', e, 'Line:', line);
                        // Potentially skip malformed line or error out
                    }
                }
            }
        } catch (error: any) {
            // Handle abort errors gracefully
            if (error.name === 'AbortError') {
                callbacks.onFinish('aborted');
                return;
            }
            const errorMsg = `Failed to connect to Ollama API: ${error.message || 'Unknown error'}`;
            console.error('Ollama API Request Failed:', error);
            callbacks.onError(errorMsg);
            callbacks.onFinish("error");
        }
    }
}
