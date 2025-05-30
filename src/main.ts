// Obsigent Plugin Core Logic
// This file will be the main entry point for the Obsigent features.

declare const default_api: unknown; // Declare default_api as unknown initially

import { Plugin, WorkspaceLeaf, App, Notice } from 'obsidian'; // Added Notice
import { ObsigentSettingTab } from './settings';
import { ChatView, CHAT_VIEW_TYPE } from './views/ChatView';
import { OpenAIProvider, OpenAIMessage } from './api/OpenAIProvider'; // Removed OpenAIToolCall
import { OllamaProvider } from './api/OllamaProvider';
import { AnthropicProvider } from './api/AnthropicProvider';
import { LLMProvider, LLMProviderType, ProviderSettings, StreamCallbacks, LLM_PROVIDER_NAMES, ToolCall } from './api/LLMProvider'; // Added ToolCall, LLM_PROVIDER_NAMES
import { McpService } from './services/McpService';
import { LocalToolService } from './services/LocalToolService';
import { McpServer, McpMarketplaceCatalog, CachedCommandMcpDetails, McpToolCallResult, McpToolSchema, McpToolAnnotations, GeneratedCommandMcpDetails } from './types/mcp'; 

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
  mcpMarketplaceCache?: McpMarketplaceCatalog; 
  mcpMarketplaceCacheTimestamp?: number; 
  githubStarsCache?: { [url: string]: { stars: number; timestamp: number } }; 
}

const DEFAULT_SETTINGS: ObsigentPluginSettings = {
  apiKey: '', 
  defaultModel: 'gpt-3.5-turbo', 
  apiEndpoint: 'https://api.openai.com/v1/chat/completions', 

  selectedProvider: 'openai',
  providerSettings: {
    openai: {
      apiKey: '',
      apiEndpoint: 'https://api.openai.com/v1/chat/completions',
      defaultModel: 'gpt-3.5-turbo',
    },
    anthropic: {
        apiKey: '',
        defaultModel: 'claude-3-haiku-20240307', 
        apiEndpoint: 'https://api.anthropic.com', 
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
  mcpMarketplaceCache: undefined, 
  mcpMarketplaceCacheTimestamp: undefined, 
  githubStarsCache: {}, 
};

const COMMAND_CACHE_FILE_NAME = 'command-mcp-cache.json'; // Added for cache file

// Interim type for validation purposes
interface PartialGeneratedCommandMcpDetailsForValidation {
  description?: unknown;
  inputSchema?: { type?: unknown; properties?: unknown; required?: unknown; [key: string]: unknown };
  annotations?: { title?: unknown; readOnlyHint?: unknown; destructiveHint?: unknown; idempotentHint?: unknown; openWorldHint?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}

// Define a type for the run_in_terminal function if possible, or use any with a cast
interface DefaultApi {
    run_in_terminal: (args: { command: string; explanation: string; isBackground: boolean }) => Promise<{ stdout?: string; stderr?: string; error?: unknown; terminalId?: string }>;
    // Add other default_api methods here if known
}

export default class ObsigentPluginCore {
  plugin: Plugin;
  app: App;
  settings: ObsigentPluginSettings;
  chatViewInstance: ChatView | null = null;
  chatHistory: OpenAIMessage[] = []; 
  mcpService!: McpService; 
  localToolService!: LocalToolService;
  activeLLMProvider!: LLMProvider; 
  private commandGenerationStatus: Record<string, boolean> = {}; // Added for per-command generation tracking

  async runCommandInTerminal(command: string, explanation: string, isBackground: boolean): Promise<{ stdout?: string; stderr?: string; error?: unknown; terminalId?: string }> {
    try {
      const result = await (default_api as DefaultApi).run_in_terminal({ command, explanation, isBackground });
      if (isBackground && result && result.terminalId) {
        return { terminalId: result.terminalId };
      }
      return { stdout: result?.stdout, stderr: result?.stderr };
    } catch (e: unknown) {
      console.error(`Error executing command in terminal: "${command}"`, e);
      return { error: (e instanceof Error ? e.message : String(e)) || 'Failed to run command in terminal' };
    }
  }

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    // Settings are loaded in onload
    this.settings = DEFAULT_SETTINGS; 
  }

  async onload() {
    await this.loadSettings();
    console.log('ObsigentPluginCore loaded');

    this.mcpService = new McpService(this.settings); 
    this.mcpService.setStatusChangeCallback((servers) => {
      this.settings.mcpServers = servers;
      this.saveSettings();
    });

    // Initialize LocalToolService first
    this.localToolService = new LocalToolService(this.app, this);

    // Ensure LLM provider is ready
    await this.ensureLLMProviderReady(); 

    // Defer LocalToolService internal initialization until app is ready and LLM provider is set up
    if (this.app.workspace.layoutReady) {
        console.log("Obsigent: App layout is ready, initializing LocalToolService internals.");
        await this.localToolService.init();
    } else {
        this.app.workspace.onLayoutReady(async () => {
            console.log("Obsigent: App layout became ready, initializing LocalToolService internals.");
            await this.localToolService.init();
        });
    }

    this.plugin.addSettingTab(new ObsigentSettingTab(this.plugin.app, this.plugin, this));

    this.plugin.registerView(
      CHAT_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => {
        this.chatViewInstance = new ChatView(leaf, this);
        this.chatHistory.forEach(msg => {
            if (this.chatViewInstance && msg.role !== 'system' && msg.content) {
                 this.chatViewInstance.displayMessage(msg.content as string, msg.role === 'user' ? 'user' : 'ai');
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

  async ensureLLMProviderReady(): Promise<void> {
    if (!this.activeLLMProvider || this.activeLLMProvider.providerName.startsWith("error_")) {
        console.log("Obsigent: LLM provider not ready or in error state. Attempting to update/initialize.");
        this.updateActiveLLMProvider();
        if (!this.activeLLMProvider || this.activeLLMProvider.providerName.startsWith("error_")) {
            console.error("Obsigent: Critical - Failed to initialize a valid LLM provider after attempt.");
            // Optionally, throw an error or set a flag indicating a critical failure
            // For now, a console error and allowing LocalToolService to proceed (it has fallbacks)
            new Notice("Obsigent: Could not initialize LLM provider. Command description generation will be skipped.");
        } else {
            console.log("Obsigent: LLM provider initialized successfully via ensureLLMProviderReady.");
        }
    } else {
        console.log("Obsigent: LLM provider already ready.");
    }
  }

  getActiveLLMProvider(): LLMProvider | null {
    if (!this.activeLLMProvider || this.activeLLMProvider.providerName.startsWith("error_")) {
        return null;
    }
    return this.activeLLMProvider;
  }

  isCommandGenerationInProgress(commandId: string): boolean {
    return !!this.commandGenerationStatus[commandId];
  }

  setCommandGenerationInProgress(commandId: string, isInProgress: boolean): void {
    if (isInProgress) {
        this.commandGenerationStatus[commandId] = true;
    } else {
        delete this.commandGenerationStatus[commandId];
    }
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
        case 'cohere': { // Added braces
            const providerFriendlyName = LLM_PROVIDER_NAMES[providerType] || providerType;
            console.warn(`Provider "${providerFriendlyName}" is selected but not yet implemented in Obsigent.`);
            this.activeLLMProvider = {
                providerName: "error_unimplemented", 
                generateResponse: async (_m, _s, callbacks, _at, _ac) => {
                    callbacks.onError(`The selected LLM provider "${providerFriendlyName}" is not yet supported by Obsigent. Please choose a different provider or wait for an update.`);
                }
            };
            break;
        }
        default: { // Added braces
            console.error(`Unknown or unhandled provider type "${providerType}" selected. This should not happen. Please check Obsigent settings or report a bug.`);
            this.activeLLMProvider = {
                providerName: "error_unknown_type", 
                generateResponse: async (_m, _s, callbacks, _at, _ac) => {
                    callbacks.onError(`An unknown LLM provider type ("${providerType}") was selected. Please check Obsigent settings or report this as a bug.`);
                }
            };
            break;
        }
    }
    if (!this.activeLLMProvider) { 
        console.error("Critical: activeLLMProvider was not set after provider selection logic. This indicates a programming error. Defaulting to a critical error provider.");
        this.activeLLMProvider = {
            providerName: "error_critical_init", 
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

  activateChatView = async () => {
    this.plugin.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE);
    await this.plugin.app.workspace.getRightLeaf(false)?.setViewState({
      type: CHAT_VIEW_TYPE,
      active: true,
    });
    this.plugin.app.workspace.revealLeaf(
      this.plugin.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]
    );
  }

  async handleUserMessage(messageText: string, chatView: ChatView, abortController: AbortController) {
    this.chatHistory.push({ role: 'user', content: messageText });

    const streamCallbacks: StreamCallbacks = {
      onUpdate: (chunk: string, isFinal: boolean) => {
        // This will be handled by the new streaming methods in ChatView (overridden below)
      },
      onFinish: (reason?: string) => {
        chatView.onGenerationFinished();
        if (reason) {
          console.log("Streaming finished with reason:", reason);
        }
      },
      onError: (errorMsg: string, errorDetails?: unknown) => {
        console.error("LLM Error:", errorMsg, errorDetails);
        chatView.displayMessage(`Error: ${errorMsg}`, 'error');
        chatView.onGenerationFinished();
      },
      onToolCall: async (toolCalls: ToolCall[]) => {
        if (!toolCalls || toolCalls.length === 0) return;
        console.log("Tool call requested:", toolCalls);

        const toolResultMessages: OpenAIMessage[] = []; // Changed name for clarity

        for (const toolCall of toolCalls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);

            chatView.displayMessage(`Running tool: ${toolName} with arguments: ${JSON.stringify(toolArgs, null, 2)}`, 'tool', {
                toolDetails: { name: toolName, content: `Args: ${JSON.stringify(toolArgs, null, 2)}` }
            });

            const localTool = this.localToolService.getLocalTools().find(t => t.name === toolName);
            if (localTool) {
                const result: McpToolCallResult = await this.localToolService.executeTool(toolName, toolArgs);
                
                // Convert McpToolCallResult.content to a string for OpenAIMessage
                // MCP allows multiple content blocks, OpenAI tool message expects a single string.
                // We'll join them or take the first text block.
                let resultContentString = "";
                if (result.content && result.content.length > 0) {
                    resultContentString = result.content.map(c => c.text).join("\n"); 
                }
                if (result.isError) {
                    resultContentString = `Error: ${resultContentString}`; // Prepend Error if isError is true
                }

                toolResultMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: resultContentString
                });

                if (result.isError) {
                    chatView.displayMessage(`Error executing tool ${toolName}: ${resultContentString}`, 'error');
                } else {
                    // Optionally display success, but can be verbose.
                    // chatView.displayMessage(`Tool ${toolName} executed.`, 'tool', { toolDetails: { name: toolName, content: resultContentString }});
                }
            } else {
                const errorMessage = `Tool '${toolName}' is not a recognized local or Obsidian command.`;
                toolResultMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: `Error: ${errorMessage}`
                });
                chatView.displayMessage(errorMessage, 'error');
            }
        }

        this.chatHistory.push(...toolResultMessages);
        this.continueGenerationWithTools(chatView, abortController);
      }
    };

    let activeStreamingMessageEl: HTMLDivElement | null = null;
    try {
      activeStreamingMessageEl = await chatView.startStreamingResponse();
      if (!activeStreamingMessageEl) {
        throw new Error("Could not create streaming message element.");
      }

      const toolsForProvider = this.localToolService.getLocalTools();
      
      // Create a new set of callbacks for this specific call, overriding onUpdate
      const currentCallStreamCallbacks: StreamCallbacks = {
          ...streamCallbacks, // Spread existing callbacks
          onUpdate: async (chunk: string, isFinal: boolean) => { 
            if (activeStreamingMessageEl) {
              await chatView.updateStreamingResponse(activeStreamingMessageEl, chunk);
              if (isFinal) {
                await chatView.finalizeStreamingResponse(activeStreamingMessageEl, chunk);
                this.chatHistory.push({ role: 'assistant', content: chunk });
                // onGenerationFinished is called by the main onFinish or onError
              }
            }
          }
      };
      
      await this.activeLLMProvider.generateResponse(
        this.chatHistory, 
        this.settings, 
        currentCallStreamCallbacks, 
        toolsForProvider, 
        abortController 
      );
    } catch (error: unknown) {
      const errorMessage = (error instanceof Error ? error.message : String(error));
      console.error("Error during LLM response generation or streaming setup:", errorMessage, error);
      if (activeStreamingMessageEl) {
        await chatView.finalizeStreamingResponse(activeStreamingMessageEl, `Error: ${errorMessage || 'Failed to get response.'}`);
      } else {
        chatView.displayMessage(`Error: ${errorMessage || 'Failed to get response.'}`, 'error');
      }
      chatView.onGenerationFinished(); // Ensure this is called
      this.chatHistory.push({ role: 'assistant', content: `Error: ${errorMessage || 'Failed to get response.'}` });
    }
  }

  async continueGenerationWithTools(chatView: ChatView, abortController: AbortController) {
    let activeStreamingMessageEl: HTMLDivElement | null = null;
    try {
      activeStreamingMessageEl = await chatView.startStreamingResponse();
      if (!activeStreamingMessageEl) {
        throw new Error("Could not create streaming message element for continued generation.");
      }

      const toolsForProvider = this.localToolService.getLocalTools(); 
      
      // History already updated in onToolCall
      const currentCallStreamCallbacks: StreamCallbacks = {
          onUpdate: async (chunk: string, isFinal: boolean) => {
            if (activeStreamingMessageEl) {
              await chatView.updateStreamingResponse(activeStreamingMessageEl, chunk);
              if (isFinal) {
                await chatView.finalizeStreamingResponse(activeStreamingMessageEl, chunk);
                this.chatHistory.push({ role: 'assistant', content: chunk });
                // onGenerationFinished is called by the main onFinish or onError
              }
            }
          },
          onFinish: (reason?: string) => {
            chatView.onGenerationFinished();
            if (reason) console.log("Streaming (after tools) finished with reason:", reason);
          },
          onError: (errorMsg: string, errorDetails?: unknown) => {
            console.error("LLM Error (after tools):", errorMsg, errorDetails);
            chatView.displayMessage(`Error after tool use: ${errorMsg}`, 'error');
            chatView.onGenerationFinished();
          },
          // No onToolCall expected here, as we are responding to previous tool calls.
      };

      await this.activeLLMProvider.generateResponse(
        this.chatHistory, 
        this.settings, 
        currentCallStreamCallbacks, 
        toolsForProvider, 
        abortController 
      );
    } catch (error: unknown) {
      const errorMessage = (error instanceof Error ? error.message : String(error));
      console.error("Error during continued LLM response generation:", errorMessage, error);
      if (activeStreamingMessageEl) {
        await chatView.finalizeStreamingResponse(activeStreamingMessageEl, `Error: ${errorMessage || 'Failed to continue response.'}`);
      } else {
        chatView.displayMessage(`Error: ${errorMessage || 'Failed to continue response.'}`, 'error');
      }
      chatView.onGenerationFinished(); // Ensure this is called
      this.chatHistory.push({ role: 'assistant', content: `Error: ${errorMessage || 'Failed to continue response.'}` });
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData());
  }

  async saveSettings() {
    await this.plugin.saveData(this.settings);
  }

  // --- New methods for file-based command cache ---
  private getCommandCacheFilePath(): string {
    // Ensure the plugin data directory exists. Using manifest.id for robustness.
    const pluginDataDir = `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
    return `${pluginDataDir}/${COMMAND_CACHE_FILE_NAME}`;
  }

  async loadCommandMcpCacheFromFile(): Promise<Record<string, CachedCommandMcpDetails>> {
    const filePath = this.getCommandCacheFilePath();
    try {
      if (!await this.app.vault.adapter.exists(filePath)) {
        return {};
      }
      const fileContent = await this.app.vault.adapter.read(filePath);
      if (fileContent) {
        return JSON.parse(fileContent) as Record<string, CachedCommandMcpDetails>;
      }
      return {};
    } catch (error) {
      console.error("Error loading command MCP cache from file:", error);
      new Notice("Error loading command MCP cache. Check console for details.");
      return {}; // Return empty cache on error
    }
  }

  async saveCommandMcpCacheToFile(cache: Record<string, CachedCommandMcpDetails>): Promise<void> {
    const filePath = this.getCommandCacheFilePath();
    const pluginDataDir = `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
    try {
      // Ensure plugin directory exists
      if (!await this.app.vault.adapter.exists(pluginDataDir)) {
        await this.app.vault.adapter.mkdir(pluginDataDir);
      }

      await this.app.vault.adapter.write(filePath, JSON.stringify(cache, null, 2));
    } catch (error) {
      console.error(`ObsigentPluginCore.saveCommandMcpCacheToFile: Error saving command MCP cache to file from ObsigentPluginCore:`, error); // Clarified log source
      new Notice("Error saving command MCP cache. Check console for details.");
    }
  }
  // --- End of new methods ---

  // Method to generate command description using LLM
  public async generateCommandDescription(commandId: string, commandName: string): Promise<string | null> {
    const currentLLMProvider = this.getActiveLLMProvider();
    if (!currentLLMProvider) {
        return null;
    }

    const prompt = `Analyze the Obsidian command named "${commandName}" (ID: "${commandId}").
Provide a concise, one-sentence description of what this command likely does. This description is for a tool manifest.
Focus on the action it performs (e.g., "Opens the daily note.", "Toggles bold formatting for selected text.").

IMPORTANT: Your final output for the description MUST BE ONLY the single sentence description itself. 
Do NOT include any introductory phrases like "This command..." or "It is used to...". 
Do NOT include any XML-like tags (such as <think> or </think>) in the part of your response that contains the actual description text. 
The description itself must be plain text.

Example of a good response (this is the entire response you should give):
Saves the current file.

Example of a bad response:
<think>Okay, I will provide a description.</think> This command saves the current file.`;

    const messages: OpenAIMessage[] = [
        { role: 'system', content: 'You are an expert in Obsidian and its commands. Your task is to provide very concise, single-sentence descriptions for Obsidian commands, formatted as plain text only for the final answer. Adhere strictly to the output format requested by the user.' },
        { role: 'user', content: prompt }
    ];

    let fullResponse = "";
    let descriptionGenerationTimeoutId: ReturnType<typeof setTimeout> | undefined; // Corrected type for timeout ID

    try {
        const streamCallbacks: StreamCallbacks = {
            onUpdate: (chunk: string, isFinal: boolean) => {
                if (descriptionGenerationTimeoutId) { // If timer is active, clear it
                    clearTimeout(descriptionGenerationTimeoutId);
                    descriptionGenerationTimeoutId = undefined;
                }
                fullResponse += chunk;
            },
            onFinish: (reason?: string) => {
                // console.log(`generateCommandDescription (${commandName}): LLM stream finished. Reason: ${reason || 'N/A'}`);
            },
            onError: (errorMsg: string, errorDetails?: unknown) => {
                console.error(`LLM error generating description for ${commandName}: ${errorMsg}`, errorDetails);
                fullResponse = ""; 
            }
        };

        const abortController = new AbortController();
        const modifiedSettings = JSON.parse(JSON.stringify(this.settings));

        if (!modifiedSettings.providerSettings) {
            modifiedSettings.providerSettings = {};
        }
        if (!modifiedSettings.providerSettings[this.settings.selectedProvider]) {
            modifiedSettings.providerSettings[this.settings.selectedProvider] = {};
        }
        modifiedSettings.providerSettings[this.settings.selectedProvider].temperature = 0.3; // Lowered temperature further

        const generationPromise = currentLLMProvider.generateResponse(
            messages,
            modifiedSettings,
            streamCallbacks, // streamCallbacks now includes logic to clear the timer
            [], 
            abortController
        );
        
        const timeoutPromise = new Promise<void>((_, reject) => {
            descriptionGenerationTimeoutId = setTimeout(() => {
                // This callback executes if the timeout is reached before onUpdate clears descriptionGenerationTimeoutId
                if (descriptionGenerationTimeoutId) { // Check if timer is still active (i.e., not cleared by onUpdate)
                    descriptionGenerationTimeoutId = undefined; // Mark as handled to prevent race conditions
                    if (!abortController.signal.aborted) {
                        abortController.abort(); // Abort the LLM call
                    }
                    reject(new Error(`Timeout (15s) waiting for initial LLM response for command: ${commandName}`));
                }
            }, 15000);
        });

        // Ensure the timer is cleared if generationPromise finishes or errors out before the timeout,
        // and if onUpdate hasn't already cleared it.
        generationPromise
            .finally(() => {
                if (descriptionGenerationTimeoutId) {
                    clearTimeout(descriptionGenerationTimeoutId);
                    descriptionGenerationTimeoutId = undefined;
                }
            })
            .catch(error => {
                // This catch is primarily to prevent unhandled promise rejections from generationPromise
                // if it fails for reasons other than the timeout (e.g. network error before timeout, or abort).
                // The main error from Promise.race (either timeout or generation error) is handled by the outer try/catch.
                // Avoid logging AbortError if it's due to our own timeout or explicit abort.
                if (error.name !== 'AbortError' && !(error instanceof Error && error.message.includes('Timeout'))) {
                   // console.warn(`generateCommandDescription (${commandName}): generationPromise error: ${error.message}`);
                }
            });

        await Promise.race([generationPromise, timeoutPromise]);
        
        if (fullResponse && fullResponse.trim().length > 0) {
            const strippedResponse = fullResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(); // Case-insensitive replace
            
            // Check if the response *is* the think block or contains it despite stripping (e.g. malformed tags)
            if (strippedResponse.toLowerCase().includes("<think") || strippedResponse.toLowerCase().includes("</think>")) {
                return null;
            }
            // Check for other common LLM conversational filler not caught by simple stripping
            if (strippedResponse.startsWith("Okay, here's a description:") || strippedResponse.startsWith("Here's a description:") || strippedResponse.startsWith("Sure, here's the description:")) {
                return null; 
            }

            return strippedResponse.length > 0 ? strippedResponse : null;
        }
        return null;

    } catch (error) {
        console.error(`Error in generateCommandDescription for ${commandName}:`, error);
        return null;
    }
  }

  // New method to generate full MCP details for a command using LLM
  public async generateCommandMcpDetails(commandId: string, commandName: string): Promise<GeneratedCommandMcpDetails | null> {
    const currentLLMProvider = this.getActiveLLMProvider();
    if (!currentLLMProvider) {
        new Notice(`Obsigent: LLM provider not available. Cannot generate details for ${commandName}.`);
        return null;
    }

    const prompt = `
You are an expert AI assistant specializing in Obsidian (obsidian.md) and its command system.
Your task is to analyze an Obsidian command and provide its details in a structured JSON format.

Command Name: "${commandName}"
Command ID: "${commandId}"

Please generate a JSON object with the following structure:
{
  "description": "A concise, human-readable description of what the command does. Focus on the action. Example: 'Saves the current active file.'",
  "inputSchema": {
    "type": "object",
    "properties": {
      // Define JSON schema for any parameters the command might implicitly or explicitly take.
      // For most Obsidian commands that don't take direct input, this can be an empty object: {}
      // If a command implies input (e.g., 'Insert template' might imply a 'templateName' parameter), define it.
      // Example for a hypothetical command that takes a 'filePath' parameter:
      // "filePath": { "type": "string", "description": "The path to the file." }
    },
    "required": [] // Optional: list required parameters e.g. ["filePath"]
  },
  "annotations": {
    "title": "${commandName}", // Should be the command's human-readable name
    "readOnlyHint": true, // boolean: true if the command primarily reads data or state, false if it modifies things. Default to true if unsure but lean towards false if any modification.
    "destructiveHint": false, // boolean: true if the command might cause irreversible data loss or significant changes.
    "idempotentHint": false, // boolean: true if calling the command multiple times with the same (or no) arguments has the same effect as calling it once.
    "openWorldHint": false // boolean: true if the command interacts with external systems or the internet (rare for core Obsidian commands).
  }
}

Guidelines for each field:
- description: Clear, concise, action-oriented.
- inputSchema.properties: For most Obsidian UI commands, this will be empty ({}). Only define properties if the command is known to accept specific inputs (even if not explicitly typed in Obsidian's API).
- inputSchema.required: Only list properties that are truly essential for the command to function if it takes inputs.
- annotations.title: Use the provided command name.
- annotations.readOnlyHint: Carefully consider if the command changes any state or files. Saving a file is not read-only. Toggling a setting is not read-only. Opening a file could be considered read-only.
- annotations.destructiveHint: Be cautious. Deleting files/folders is destructive. Overwriting content without backup could be.
- annotations.idempotentHint: Many toggle commands are idempotent if toggling twice brings back to original state, but consider the definition strictly. Creating a new unique note is not idempotent.
- annotations.openWorldHint: Most core Obsidian commands will be false.

IMPORTANT: Your entire response MUST be ONLY the valid JSON object described above.
Do NOT include any other text, comments, explanations, or markdown formatting like \`\`\`json ... \`\`\`.
The JSON should be directly parsable.

Example for "editor:save-file":
{
  "description": "Saves the currently active file to disk.",
  "inputSchema": { "type": "object", "properties": {}, "required": [] },
  "annotations": {
    "title": "Save current file",
    "readOnlyHint": false,
    "destructiveHint": false,
    "idempotentHint": true, 
    "openWorldHint": false
  }
}

Now, provide the JSON for the command: "${commandName}" (ID: "${commandId}"):\n`;

    try {
      const messages: OpenAIMessage[] = [{ role: 'user', content: prompt }];
      let llmResponseJsonString = '';
      
      const generationCallbacks: StreamCallbacks = {
        onUpdate: (chunk, isFinal) => { llmResponseJsonString += chunk; },
        onFinish: () => { /* console.log(`Obsigent: MCP details generation finished for ${commandName}.`); */ },
        onError: (errorMsg, errorDetails) => {
          console.error(`Obsigent: Error generating MCP details for ${commandName}: ${errorMsg}`, errorDetails);
          llmResponseJsonString = ''; 
        }
      };

      await currentLLMProvider.generateResponse(messages, this.settings, generationCallbacks, [], new AbortController());
      
      if (!llmResponseJsonString || llmResponseJsonString.trim() === '') {
        console.warn(`Obsigent: LLM returned empty response for ${commandName} MCP details.`);
        return null;
      }

      // Strip <think>...</think> blocks before parsing
      const strippedJsonString = llmResponseJsonString.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      if (!strippedJsonString) {
        console.warn(`Obsigent: LLM response for ${commandName} was empty after stripping <think> blocks.`);
        return null;
      }

      let parsedJsonOutput: unknown;
      try {
        // Use the stripped string for parsing
        parsedJsonOutput = JSON.parse(strippedJsonString);
      } catch (parseError) {
        console.error(`Obsigent: Failed to parse JSON response for ${commandName}. Error: ${parseError}. Original Response: "${llmResponseJsonString}". Stripped Response: "${strippedJsonString}"`);
        new Notice(`Obsigent: Could not understand LLM response for ${commandName}. Using defaults.`);
        return null;
      }

      const detailsToValidate = parsedJsonOutput as PartialGeneratedCommandMcpDetailsForValidation;

      if (!detailsToValidate || 
          typeof detailsToValidate.description !== 'string' ||
          typeof detailsToValidate.inputSchema !== 'object' || detailsToValidate.inputSchema === null ||
          detailsToValidate.inputSchema.type !== 'object' || 
          typeof detailsToValidate.inputSchema.properties !== 'object' || detailsToValidate.inputSchema.properties === null ||
          (detailsToValidate.inputSchema.required !== undefined && !Array.isArray(detailsToValidate.inputSchema.required)) ||
          typeof detailsToValidate.annotations !== 'object' || detailsToValidate.annotations === null ||
          typeof detailsToValidate.annotations.title !== 'string') {
        console.warn(`Obsigent: LLM response for ${commandName} has incorrect structure. Details: `, detailsToValidate);
        new Notice(`Obsigent: LLM response for ${commandName} had unexpected structure. Using defaults.`);
        return null;
      }
      
      const ensureBoolean = (value: unknown, defaultValue: boolean): boolean => typeof value === 'boolean' ? value : defaultValue;
      
      const validatedAnnotationsSource = detailsToValidate.annotations as { title: string; readOnlyHint?: unknown; destructiveHint?: unknown; idempotentHint?: unknown; openWorldHint?: unknown; [key: string]: unknown };

      // Initialize with McpToolAnnotations and allow other string properties via index signature
      const finalAnnotations: McpToolAnnotations & { [key: string]: unknown } = {
        title: validatedAnnotationsSource.title, // Already validated as string
        readOnlyHint: ensureBoolean(validatedAnnotationsSource.readOnlyHint, false),
        destructiveHint: ensureBoolean(validatedAnnotationsSource.destructiveHint, false),
        idempotentHint: ensureBoolean(validatedAnnotationsSource.idempotentHint, false),
        openWorldHint: ensureBoolean(validatedAnnotationsSource.openWorldHint, false),
      };
      
      // Add other string properties from the source to finalAnnotations
      for (const key in validatedAnnotationsSource) {
        if (Object.prototype.hasOwnProperty.call(validatedAnnotationsSource, key) && !Object.prototype.hasOwnProperty.call(finalAnnotations, key)) {
            if (typeof validatedAnnotationsSource[key] === 'string') { 
                finalAnnotations[key] = validatedAnnotationsSource[key] as string;
            }
            // Optionally handle other types if necessary, or ignore them if only strings are expected for additional annotations
        }
      }

      const validatedInputSchema = detailsToValidate.inputSchema as { type: "object"; properties: Record<string, unknown>; required?: unknown[] };
      const finalInputSchema: McpToolSchema = {
        type: "object",
        properties: validatedInputSchema.properties as McpToolSchema['properties'], 
        required: (Array.isArray(validatedInputSchema.required) && validatedInputSchema.required.every(r => typeof r === 'string')) ? validatedInputSchema.required as string[] : [],
      };

      const validatedDetails: GeneratedCommandMcpDetails = {
        description: detailsToValidate.description as string,
        inputSchema: finalInputSchema,
        annotations: finalAnnotations as McpToolAnnotations // Cast to the precise type for the return value
      };

      return validatedDetails;

    } catch (error) {
      console.error(`Obsigent: Exception during generateCommandMcpDetails for ${commandName}:`, error);
      new Notice(`Obsigent: Error generating details for ${commandName}. Using defaults.`);
      return null;
    }
  }
}
