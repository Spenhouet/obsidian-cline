// Obsigent Plugin Core Logic
// This file will be the main entry point for the Obsigent features.

declare const default_api: any; // Declare default_api as a global variable

import { Notice, Plugin, WorkspaceLeaf, App } from 'obsidian';
import { ObsigentSettingTab } from './settings';
import { ChatView, CHAT_VIEW_TYPE } from './views/ChatView';
import { OpenAIProvider, OpenAIMessage, OpenAIToolCall } from './api/OpenAIProvider';
import { OllamaProvider } from './api/OllamaProvider';
import { AnthropicProvider } from './api/AnthropicProvider';
import { LLMProvider, LLMProviderType, ProviderSettings, StreamCallbacks, LLM_PROVIDER_NAMES } from './api/LLMProvider'; // Added LLM_PROVIDER_NAMES
import { McpService } from './services/McpService';
import { LocalToolService } from './services/LocalToolService';
import { McpServer, McpMarketplaceCatalog, McpTool, McpToolSchema } from './types/mcp'; // McpTool and McpToolSchema correctly imported

export interface ObsigentPluginSettings {
  // Old global settings (will be deprecated or used as fallback initially)
  apiKey: string; 
  defaultModel?: string; 
  apiEndpoint?: string; 

  // New provider-specific settings
  selectedProvider: LLMProviderType;
  providerSettings: Partial<Record<LLMProviderType, ProviderSettings>>;

  // MCP settings - supporting multiple servers
  mcpServers: McpServer[];
  mcpMarketplaceCache?: McpMarketplaceCatalog; // Added for caching
  mcpMarketplaceCacheTimestamp?: number; // Added for cache expiry
  githubStarsCache?: { [url: string]: { stars: number; timestamp: number } }; // Added for GitHub stars cache
}

const DEFAULT_SETTINGS: ObsigentPluginSettings = {
  apiKey: '', // To be deprecated
  defaultModel: 'gpt-3.5-turbo', // To be deprecated
  apiEndpoint: 'https://api.openai.com/v1/chat/completions', // To be deprecated

  selectedProvider: 'openai',
  providerSettings: {
    openai: {
      apiKey: '',
      apiEndpoint: 'https://api.openai.com/v1/chat/completions',
      defaultModel: 'gpt-3.5-turbo',
    },
    anthropic: {
        apiKey: '',
        defaultModel: 'claude-3-haiku-20240307', // More cost-effective default
        apiEndpoint: 'https://api.anthropic.com', // Default base URL
    },
    google: {
        apiKey: '',
        defaultModel: 'gemini-pro',
    },
    cohere: {
        apiKey: '',
        defaultModel: 'command',
    },
    ollama: {
        apiEndpoint: 'http://localhost:11434/api/chat', 
        defaultModel: 'llama3', 
    }
  },
  mcpServers: [],
  mcpMarketplaceCache: undefined, // Initialize cache as undefined
  mcpMarketplaceCacheTimestamp: undefined, // Initialize timestamp as undefined
  githubStarsCache: {} // Initialize GitHub stars cache as an empty object
};

export default class ObsigentPluginCore {
  plugin: Plugin;
  app: App;
  settings: ObsigentPluginSettings;
  chatViewInstance: ChatView | null = null;
  chatHistory: OpenAIMessage[] = []; // Using OpenAIMessage for now
  mcpService!: McpService; 
  localToolService!: LocalToolService;
  activeLLMProvider!: LLMProvider; // To store the current LLM provider instance

  // Method to execute commands in the terminal via the default_api
  async runCommandInTerminal(command: string, explanation: string, isBackground: boolean): Promise<{ stdout?: string; stderr?: string; error?: any; terminalId?: string }> {
    try {
      // @ts-ignore (assuming default_api is globally available or injected appropriately)
      const result = await default_api.run_in_terminal({ command, explanation, isBackground });
      // The actual structure of 'result' will depend on how default_api.run_in_terminal resolves.
      // Assuming it returns an object with stdout, stderr, error, or a terminalId for background tasks.
      // For background tasks, stdout/stderr might not be immediately available.
      if (isBackground && result && result.terminalId) {
        return { terminalId: result.terminalId };
      }
      // For foreground tasks, expect stdout/stderr
      return { stdout: result?.stdout, stderr: result?.stderr };
    } catch (e: any) {
      console.error(`Error executing command in terminal: "${command}"`, e);
      return { error: e.message || 'Failed to run command in terminal' };
    }
  }

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  async onload() {
    await this.loadSettings();
    console.log('ObsigentPluginCore loaded');

    this.mcpService = new McpService(this.settings); 
    this.mcpService.setStatusChangeCallback((servers) => {
      // Update settings with server status changes
      this.settings.mcpServers = servers;
      this.saveSettings();
    });

    this.localToolService = new LocalToolService(this.app);
    this.updateActiveLLMProvider(); // Initialize the active LLM provider

    this.plugin.addSettingTab(new ObsigentSettingTab(this.plugin.app, this.plugin, this));

    this.plugin.registerView(
      CHAT_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => {
        this.chatViewInstance = new ChatView(leaf, this);
        this.chatHistory.forEach(msg => {
            if (this.chatViewInstance && msg.role !== 'system' && msg.content) {
                 this.chatViewInstance.displayMessage(msg.content, msg.role === 'user' ? 'user' : 'ai');
            }
        });
        return this.chatViewInstance;
      }
    );

    this.plugin.addRibbonIcon('bot', 'Open Obsigent Chat', () => {
      this.activateChatView();
    });

    this.plugin.addCommand({
      id: 'open-obsigent-chat',
      name: 'Open Obsigent Chat View',
      callback: () => {
        this.activateChatView();
      },
    });
    
    this.chatHistory.push({ role: 'system', content: 'You are a helpful assistant integrated into Obsidian.' });
  }

  updateActiveLLMProvider() {
    const providerType = this.settings.selectedProvider;
    switch (providerType) {
        case 'openai':
            this.activeLLMProvider = new OpenAIProvider();
            break;
        case 'ollama':
            this.activeLLMProvider = new OllamaProvider();
            break;
        case 'anthropic':
            this.activeLLMProvider = new AnthropicProvider();
            break;
        case 'google':
        case 'cohere':
            // These providers are defined in types but not yet implemented
            const providerFriendlyName = LLM_PROVIDER_NAMES[providerType] || providerType;
            console.warn(`Provider "${providerFriendlyName}" is selected but not yet implemented in Obsigent.`);
            this.activeLLMProvider = {
                providerName: "error_unimplemented", // Specific error type
                generateResponse: async (_m, _s, callbacks, _at, _ac) => {
                    callbacks.onError(`The selected LLM provider "${providerFriendlyName}" is not yet supported by Obsigent. Please choose a different provider or wait for an update.`);
                }
            };
            break;
        default:
            // This case should ideally not be reached if selectedProvider is always a valid LLMProviderType
            // as per the settings dropdown.
            console.error(`Unknown or unhandled provider type "${providerType}" selected. This should not happen. Please check Obsigent settings or report a bug.`);
            this.activeLLMProvider = {
                providerName: "error_unknown_type", // Specific error type
                generateResponse: async (_m, _s, callbacks, _at, _ac) => {
                    callbacks.onError(`An unknown LLM provider type ("${providerType}") was selected. Please check Obsigent settings or report this as a bug.`);
                }
            };
            break;
    }
    // Fallback if no provider was set (e.g. if a new provider type was added to settings but not to this switch)
    if (!this.activeLLMProvider) { 
        console.error("Critical: activeLLMProvider was not set after provider selection logic. This indicates a programming error. Defaulting to a critical error provider.");
        this.activeLLMProvider = {
            providerName: "error_critical_init", // Specific error type
            generateResponse: async (_m, _s, callbacks, _at, _ac) => {
                callbacks.onError("A critical error occurred while initializing the LLM provider. Please check plugin settings or report this issue.");
            }
        };
    }
    console.log(`Active LLM Provider set to: ${this.activeLLMProvider.providerName}`);
  }

  onunload() {
    console.log('ObsigentPluginCore unloaded');
    this.plugin.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData());
  }

  async saveSettings() {
    await this.plugin.saveData(this.settings);
    if (this.mcpService) {
        this.mcpService = new McpService(this.settings);
        this.mcpService.setStatusChangeCallback((servers) => {
          this.settings.mcpServers = servers;
        });
    }
    this.updateActiveLLMProvider(); // Re-initialize provider on settings change
  }

  activateChatView() {
    this.plugin.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE); 
    const rightLeaf = this.plugin.app.workspace.getRightLeaf(false);
    if (rightLeaf) {
      rightLeaf.setViewState({
        type: CHAT_VIEW_TYPE,
        active: true,
      }).then(() => {
        const leaf = this.plugin.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
        if (leaf) {
            this.plugin.app.workspace.revealLeaf(leaf);
            const view = leaf.view as ChatView;
            if (view && view.displayMessage) {
                this.chatHistory.forEach(msg => {
                    if (msg.role !== 'system' && msg.content) {
                         view.displayMessage(msg.content, msg.role === 'user' ? 'user' : 'ai');
                    }
                });
            }
        }
      });
    }
  }

  async handleUserMessage(messageText: string, view: ChatView, abortController?: AbortController) {
    // Check for error providers (unimplemented, unknown, critical init)
    // These providers have their own specific error messages in their generateResponse -> callbacks.onError
    if (this.activeLLMProvider.providerName.startsWith("error_")) {
        let userFriendlyMessage = "LLM Provider issue. Please check Obsigent settings."; // Default message
        if (this.activeLLMProvider.providerName === "error_unimplemented") {
            const providerType = this.settings.selectedProvider;
            const providerFriendlyName = LLM_PROVIDER_NAMES[providerType] || providerType;
            userFriendlyMessage = `The selected LLM provider "${providerFriendlyName}" is not yet supported.`;
        } else if (this.activeLLMProvider.providerName === "error_unknown_type") {
            userFriendlyMessage = "An unknown LLM provider type was selected. Please check settings.";
        } else if (this.activeLLMProvider.providerName === "error_critical_init") {
            userFriendlyMessage = "A critical error occurred initializing the LLM provider.";
        }
        new Notice(userFriendlyMessage);
        // The actual error display in chat will be handled by the error provider's generateResponse
        // calling callbacks.onError. We don't need to call view.displayMessage here for the error itself.
        // However, we still need to call generateResponse to trigger that callback.
    } else {
        // Specific checks for *implemented* providers
        const selectedProviderType = this.settings.selectedProvider;
        const providerSettings = this.settings.providerSettings[selectedProviderType];

        let misconfigured = false;
        let missingFields: string[] = [];

        if (selectedProviderType === 'openai') {
            // API Key is not strictly required for all OpenAI-compatible endpoints (e.g., LM Studio)
            // The endpoint itself will error out if an API key is required but not provided.
            // We still require a model to be set.
            if (!providerSettings?.defaultModel) missingFields.push("Default Model");
        } else if (selectedProviderType === 'ollama') {
            if (!providerSettings?.defaultModel) missingFields.push("Default Model");
            if (!providerSettings?.apiEndpoint) missingFields.push("API Endpoint");
        } else if (selectedProviderType === 'anthropic') {
            if (!providerSettings?.apiKey) missingFields.push("API Key");
            if (!providerSettings?.defaultModel) missingFields.push("Default Model");
            // apiEndpoint for Anthropic is its base URL, defaults in provider if not set
        }
        // Add checks for other implemented providers here

        if (missingFields.length > 0) {
            misconfigured = true;
            const providerFriendlyName = LLM_PROVIDER_NAMES[selectedProviderType] || selectedProviderType;
            const message = `${providerFriendlyName} provider is not configured correctly. Missing: ${missingFields.join(', ')}. Please check Obsigent settings.`;
            new Notice(message);
            view.displayMessage(message, 'error');
            return;
        }
    }

    let processedMessageText = messageText;
    // ... (rest of the handleUserMessage method remains the same)
    let contextMessages: OpenAIMessage[] = [];

    const mentionRegex = /@(?:\[\[([^\]]+)\]\]|([^\s@][^@]*))/g;
    let match;
    const fileReadPromises: Promise<void>[] = [];

    while ((match = mentionRegex.exec(messageText)) !== null) {
        const noteNameWithPossibleAlias = match[1] || match[2];
        const noteName = noteNameWithPossibleAlias.split('|')[0].trim(); 

        fileReadPromises.push((async () => {
            const file = this.app.vault.getFiles().find(
                (f) => f.basename.toLowerCase() === noteName.toLowerCase() || f.path.toLowerCase() === noteName.toLowerCase()
            );
            if (file) {
                try {
                    const content = await this.app.vault.read(file);
                    contextMessages.push({
                        role: 'user', 
                        content: `--- Context from file: ${file.path} ---\n${content}\n--- End of context from file: ${file.path} ---`,
                    });
                    view.displayMessage(`Included context from: ${file.path}`, 'system');
                } catch (e: any) {
                    view.displayMessage(`Error reading context from ${noteName}: ${e.message}`, 'error');
                }
            } else {
                view.displayMessage(`Could not find note for @mention: ${noteName}`, 'system');
            }
        })());
    }
    
    await Promise.all(fileReadPromises);
    this.chatHistory.push(...contextMessages);
    this.chatHistory.push({ role: 'user', content: processedMessageText }); 
    
    const localTools = this.localToolService.getLocalTools();
    const allAvailableTools: McpTool[] = [...localTools];

    let accumulatedContent = "";
    let aiMessageContentEl: HTMLDivElement | null = null;
    let currentToolCalls: OpenAIToolCall[] = []; // Using OpenAI specific type for now

    (async () => { 
        aiMessageContentEl = await view.displayMessage(" Obsigent is thinking...", 'ai');
    })();

    const processLlmTurn = async (messagesForLlm: OpenAIMessage[], isFollowUp: boolean = false) => {
        accumulatedContent = ""; 
        if (!isFollowUp && aiMessageContentEl) { 
             view.updateAIMessageContent(aiMessageContentEl, " ", false); 
        } else if (isFollowUp) { 
            aiMessageContentEl = await view.displayMessage(" ", 'ai');
        }
        currentToolCalls = [];

        const streamCallbacks: StreamCallbacks = {
            onContent: (contentChunk: string, isFinal: boolean) => {
                if (!aiMessageContentEl) return;
                accumulatedContent += contentChunk;
                view.updateAIMessageContent(aiMessageContentEl, accumulatedContent, isFinal);
            },
            onToolCallsDone: async (toolCallsFromProvider: any[]) => { 
                const typedToolCalls = toolCallsFromProvider as OpenAIToolCall[];
                if (!typedToolCalls || typedToolCalls.length === 0) return;
                
                currentToolCalls = typedToolCalls; 
                this.chatHistory.push({
                    role: 'assistant',
                    content: accumulatedContent, 
                    tool_calls: currentToolCalls 
                });
                accumulatedContent = ""; 
                
                const toolCallSummary = typedToolCalls.map(tc => `\`${tc.function.name}\``).join(', ');
                view.displayMessage(`Assistant wants to use tool(s): ${toolCallSummary}`, 'system');

                for (const toolCall of typedToolCalls) {
                    let args: any;
                    let argsStringForDisplay = toolCall.function.arguments;
                    try {
                        args = JSON.parse(toolCall.function.arguments);
                        argsStringForDisplay = "```json\n" + JSON.stringify(args, null, 2) + "\n```";
                    } catch (e: any) {
                        console.warn(`Arguments for tool ${toolCall.function.name} are not valid JSON: ${toolCall.function.arguments}`);
                        argsStringForDisplay = toolCall.function.arguments;
                    }
                    
                    view.displayMessage(`**Calling Tool:** \`${toolCall.function.name}\`\n**Arguments:**\n${argsStringForDisplay}`, 'system');
                    
                    try {
                        args = JSON.parse(toolCall.function.arguments);
                    } catch (e: any) {
                        const errorMsg = `Error parsing arguments for tool ${toolCall.function.name}: ${e.message}`;
                        view.displayMessage(errorMsg, 'error');
                        this.chatHistory.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: JSON.stringify({ error: errorMsg }),
                        });
                        continue;
                    }

                    let toolExecutionResult;
                    if (toolCall.function.name.startsWith('obsidian_')) {
                        toolExecutionResult = await this.localToolService.executeTool(toolCall.function.name, args);
                    } else {
                        toolExecutionResult = { error: `ToolHive-managed MCP tool execution for '${toolCall.function.name}' is not yet fully implemented here.` };
                        new Notice(`ToolHive tool '${toolCall.function.name}' execution is pending full integration.`);
                    }
                    
                    const toolResponseMessageContent = toolExecutionResult.error 
                        ? "```json\n" + JSON.stringify({ error: toolExecutionResult.error }, null, 2) + "\n```"
                        : "```json\n" + JSON.stringify(toolExecutionResult.result, null, 2) + "\n```";
                    
                    const originalToolResultForHistory = toolExecutionResult.error
                        ? JSON.stringify({ error: toolExecutionResult.error })
                        : JSON.stringify(toolExecutionResult.result);

                    this.chatHistory.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: originalToolResultForHistory,
                    });
                    view.displayMessage(`**Tool Result for \`${toolCall.function.name}\`:**\n${toolResponseMessageContent}`, 'system');
                }

                view.displayMessage("Sending tool results back to assistant...", 'system');
                await processLlmTurn([...this.chatHistory], true); 
            },
            onError: (error: string) => {
                if (aiMessageContentEl && accumulatedContent.trim() === "" && !error.toLowerCase().includes("unsupported")) { // Avoid double error messages if already shown by Notice
                    view.updateAIMessageContent(aiMessageContentEl, error, true); 
                } else if (!aiMessageContentEl || accumulatedContent.trim() !== "") {
                    view.displayMessage(error, 'error');
                }
                // If it's an "unsupported" error, the Notice might have already covered it.
                // Notify view that generation finished (due to error)
                view.onGenerationFinished();
            },
            onFinish: (reason: string) => {
                console.log("LLM Stream finished with reason:", reason);
                if (reason === "stop" && !currentToolCalls?.length) { 
                    this.chatHistory.push({ role: 'assistant', content: accumulatedContent });
                }
                // Notify view that generation finished
                view.onGenerationFinished();
            }
        };

        await this.activeLLMProvider.generateResponse(
            messagesForLlm,
            this.settings,
            streamCallbacks,
            allAvailableTools,
            abortController
        );
    };

    try {
        await processLlmTurn([...this.chatHistory]);
    } catch (error: any) {
        console.error('Error in handleUserMessage main try block:', error);
        view.displayMessage(`Critical error processing message: ${error.message}`, 'error');
    }
  }
}
