// src/services/LocalToolService.ts
import { App, Notice, TFile, Command, debounce } from 'obsidian';
// Ensure GeneratedCommandMcpDetails is imported if it's defined in mcp.ts
import { McpTool, McpToolSchema, CachedCommandMcpDetails, McpToolCallResult, McpToolAnnotations, GeneratedCommandMcpDetails } from '../types/mcp';
import ObsigentPluginCore from '../main';

// Define an interface for the Obsidian commands object
interface ObsidianCommands {
    listCommands(): Command[];
    executeCommandById(id: string): boolean; // Returns boolean
    on(event: "changed", callback: () => void): void; // Changed from () => any to () => void
    off(event: "changed", callback: () => void): void; // Changed from () => any to () => void
}

// Augment App interface or create a new one for internal use
interface AppWithCommands extends App {
    commands: ObsidianCommands;
}

export class LocalToolService {
    private app: AppWithCommands; // Use the augmented type
    private pluginCore: ObsigentPluginCore;
    private localTools: McpTool[] = [];
    private isGeneratingDescription = false;
    private commandMcpCache: Record<string, CachedCommandMcpDetails> = {};

    // Type for the debounced function: a callable returning void, with a cancel method.
    private debouncedRegisterCommands: (() => void) & { cancel(): void };
    private initialized = false; // Removed boolean type annotation

    constructor(app: App, pluginCore: ObsigentPluginCore) {
        this.app = app as AppWithCommands; // Cast once here
        this.pluginCore = pluginCore;

        // Explicitly type the async function being debounced
        const debouncedLogic = async (): Promise<void> => {
            if (!this.initialized) return; // Don't run if not initialized
            await this.registerObsidianCommandsAsTools();
        };

        // debounce returns a function compatible with (() => void) & { cancel(): void; }
        // when the original function is async () => Promise<void>
        this.debouncedRegisterCommands = debounce(debouncedLogic, 5000, false);
        // DO NOT call loadCacheAndRegisterTools or app.commands.on here
    }

    public async init(): Promise<void> {
        if (this.initialized) {
            return;
        }
        try {
            // Ensure LLM provider is ready before loading cache which might trigger generation
            await this.pluginCore.ensureLLMProviderReady(); // Added this line
            await this.loadCacheAndRegisterTools(); // This uses app.commands
            this.app.commands.on("changed", this.debouncedRegisterCommands); // This uses app.commands
            this.initialized = true;
            // console.log("Obsigent: LocalToolService internals initialized successfully."); // Log was previously removed, keeping it removed
        } catch (error) {
            console.error("Obsigent: Error during LocalToolService initialization:", error);
            // Optionally, notify the user or handle the error more gracefully
            new Notice("Obsigent: Failed to initialize some internal components. Command-related features might be limited.");
        }
    }

    public async destroy(): Promise<void> {
        console.log("Obsigent: Destroying LocalToolService.");
        if (this.initialized) { // Only try to unregister if initialized
            try {
                this.app.commands.off("changed", this.debouncedRegisterCommands);
                console.log("Obsigent: Unregistered app.commands changed listener for debouncedRegisterCommands.");
            } catch (e) {
                console.warn("Obsigent: Error while unregistering app.commands changed listener.", e);
            }
        }

        if (this.debouncedRegisterCommands && typeof this.debouncedRegisterCommands.cancel === 'function') {
            this.debouncedRegisterCommands.cancel();
            console.log("Obsigent: Cancelled any pending debounced command registration.");
        }
        this.initialized = false; // Mark as not initialized
    }

    private async loadCacheAndRegisterTools(): Promise<void> {
        this.commandMcpCache = await this.pluginCore.loadCommandMcpCacheFromFile();
        this.registerLocalTools();
        await this.registerObsidianCommandsAsTools();
    }

    private async registerObsidianCommandsAsTools(): Promise<void> {
        if (!this.initialized && !this.pluginCore.app.workspace.layoutReady) {
            // Adding an early check, though init() is the main guard
            return;
        }
        // Additional guard: ensure LLM provider is ready before attempting generation
        if (!this.pluginCore.getActiveLLMProvider()) {
            // console.log("Obsigent: LLM provider not active, skipping description generation for now.");
        }
        const obsidianCommands: Command[] = this.app.commands.listCommands();
        const cachedCommands = this.commandMcpCache;
        let newCacheRequired = false;

        const currentCommandIds = new Set(obsidianCommands.map(cmd => cmd.id));
        const cachedCommandIds = Object.keys(cachedCommands);

        for (const cachedId of cachedCommandIds) {
            if (!currentCommandIds.has(cachedId)) {
                const isStaticLocalTool = this.localTools.some(lt => lt.name === cachedId);
                if (!isStaticLocalTool) {
                    delete cachedCommands[cachedId];
                    newCacheRequired = true;
                }
            }
        }

        if (obsidianCommands) {
            let commandsToGenerateCount = 0;
            if (this.pluginCore.getActiveLLMProvider()) { // Only count if LLM is available
                for (const command of obsidianCommands) {
                    const cachedDetail: CachedCommandMcpDetails | undefined = cachedCommands[command.id];
                    if (!cachedDetail || cachedDetail.originalName !== command.name || !cachedDetail.description || cachedDetail.description.startsWith('Obsidian Command:') || !cachedDetail.inputSchema || !cachedDetail.annotations) {
                        commandsToGenerateCount++;
                    }
                }
                if (commandsToGenerateCount > 0 && !this.isGeneratingDescription) {
                    new Notice(`Obsigent: Analyzing ${commandsToGenerateCount} command(s) for enhanced descriptions...`, 3000);
                }
            }

            const generationPromises: Promise<void>[] = [];

            for (const command of obsidianCommands) {
                const cachedDetail: CachedCommandMcpDetails | undefined = cachedCommands[command.id];

                if (this.pluginCore.getActiveLLMProvider() && (!cachedDetail || cachedDetail.originalName !== command.name || !cachedDetail.description || cachedDetail.description.startsWith('Obsidian Command:') || !cachedDetail.inputSchema || !cachedDetail.annotations )) {
                    const generationTask = async () => {
                        let taskMadeChangeAndShouldSave = false; // Flag for this specific task
                        let lockAcquired = false;
                        try {
                            // Check if another generation is in progress for THIS command ID to prevent redundant calls
                            // The global isGeneratingDescription is a broader semaphore
                            if (this.pluginCore.isCommandGenerationInProgress(command.id)) {
                                // console.log(`Obsigent: Generation already in progress for ${command.id}, skipping redundant task.`);
                                return;
                            }
                            this.pluginCore.setCommandGenerationInProgress(command.id, true);

                            while (this.isGeneratingDescription) { // Global semaphore
                                // console.log(`Obsigent: Waiting for global generation lock (command: ${command.id})`);
                                await new Promise(resolve => setTimeout(resolve, 200));
                            }
                            this.isGeneratingDescription = true; // Acquire global semaphore
                            lockAcquired = true;
                            // console.log(`Obsigent: Acquired global generation lock (command: ${command.id})`);

                            // Re-check cache, another process might have updated it
                            const currentCachedDetail = this.commandMcpCache[command.id];
                            if (currentCachedDetail &&
                                currentCachedDetail.originalName === command.name &&
                                currentCachedDetail.description && // Check new description field
                                !currentCachedDetail.description.startsWith('Obsidian Command:') &&
                                currentCachedDetail.inputSchema && // Ensure all parts are checked
                                currentCachedDetail.annotations) {
                                // console.log(`Obsigent: Command ${command.id} already processed by another task, releasing lock.`);
                                return; // Already processed by another concurrent task
                            }
                            // console.log(`Obsigent: Generating description for ${command.name} (${command.id})`);
                            
                            // Conceptual: Call LLM to get full structured details
                            // This method is assumed to exist on pluginCore and return the GeneratedCommandMcpDetails structure or null
                            const llmGeneratedDetails: GeneratedCommandMcpDetails | null = await this.pluginCore.generateCommandMcpDetails(command.id, command.name);

                            let finalDescription = `Obsidian Command: ${command.name}`;
                            let finalInputSchema: McpToolSchema = { type: "object", properties: {} };
                            let finalAnnotations: McpToolAnnotations = { 
                                title: command.name, 
                                readOnlyHint: false, 
                                destructiveHint: false, 
                                idempotentHint: false, 
                                openWorldHint: false 
                            };

                            if (llmGeneratedDetails) {
                                finalDescription = llmGeneratedDetails.description?.trim() || finalDescription;
                                
                                // Validate and use inputSchema
                                if (llmGeneratedDetails.inputSchema && 
                                    llmGeneratedDetails.inputSchema.type === "object" && 
                                    typeof llmGeneratedDetails.inputSchema.properties === "object") {
                                    finalInputSchema = llmGeneratedDetails.inputSchema;
                                }

                                // Merge annotations, ensuring title and defaults
                                finalAnnotations = {
                                    ...finalAnnotations, // Start with defaults
                                    ...llmGeneratedDetails.annotations, // Overlay LLM annotations
                                    title: command.name, // Ensure title is always command name
                                };
                            }

                            this.commandMcpCache[command.id] = {
                                id: command.id,
                                originalName: command.name,
                                description: finalDescription,
                                inputSchema: finalInputSchema,
                                annotations: finalAnnotations
                            };
                            newCacheRequired = true;
                            taskMadeChangeAndShouldSave = true;
                            // console.log(`Obsigent: LLM description generated for ${command.id}: ${llmGeneratedDescription.trim().substring(0,50)}...`);
                        } catch (error) {
                            console.error(`Failed to generate MCP details for ${command.name}:`, error);
                            // Corrected logic: ensure originalName is compared if this.commandMcpCache[command.id] exists
                            if (!this.commandMcpCache[command.id] || 
                                (this.commandMcpCache[command.id] && this.commandMcpCache[command.id].originalName !== command.name) || 
                                !this.commandMcpCache[command.id].description) { // Check new description field
                                this.commandMcpCache[command.id] = { // Directly update this.commandMcpCache
                                    id: command.id,
                                    originalName: command.name,
                                    description: `Obsidian Command: ${command.name}`, // Fallback description
                                    inputSchema: { type: "object", properties: {} }, // Default empty schema
                                    annotations: { 
                                        title: command.name, 
                                        readOnlyHint: false, 
                                        destructiveHint: false, 
                                        idempotentHint: false, 
                                        openWorldHint: false 
                                    }
                                };
                                newCacheRequired = true;
                                taskMadeChangeAndShouldSave = true;
                                // console.log(`Obsigent: Using fallback description for ${command.id} due to error.`);
                            }
                        } finally {
                            if (taskMadeChangeAndShouldSave) {
                                // console.log(`Obsigent: generationTask for ${command.id} (${command.name}) is saving cache immediately.`);
                                try {
                                    await this.pluginCore.saveCommandMcpCacheToFile(this.commandMcpCache);
                                } catch (saveError) {
                                    console.error(`Obsigent: generationTask for ${command.id} (${command.name}) failed to save cache immediately:`, saveError);
                                }
                            }
                            if (lockAcquired) {
                                this.isGeneratingDescription = false; // Release global semaphore
                                // console.log(`Obsigent: Released global generation lock (command: ${command.id})`);
                            }
                            this.pluginCore.setCommandGenerationInProgress(command.id, false);
                            // console.log(`Obsigent: Generation task finished for ${command.id}`);
                        }
                    };
                    generationPromises.push(generationTask());
                } else if (!cachedCommands[command.id] || cachedCommands[command.id].originalName !== command.name) {
                    // If LLM is not active, or if it's active but the command is already cached and up-to-date (name hasn't changed)
                    // but we still need to ensure it's in the cache if the name changed or it's missing.
                    cachedCommands[command.id] = {
                        id: command.id,
                        originalName: command.name,
                        description: cachedDetail?.description || `Obsidian Command: ${command.name}`, // Use existing or default
                        inputSchema: cachedDetail?.inputSchema || { type: "object", properties: {} }, // Use existing or default
                        annotations: cachedDetail?.annotations || { 
                            title: command.name, 
                            readOnlyHint: false, 
                            destructiveHint: false, 
                            idempotentHint: false, 
                            openWorldHint: false 
                        } // Use existing or default
                    };
                    newCacheRequired = true;
                    // console.log(`Obsigent: Updated/added non-LLM command to cache: ${command.id}`);
                }
            }

            if (generationPromises.length > 0) {
                // console.log(`Obsigent: Waiting for ${generationPromises.length} command description generations...`);
            }
            // Wait for all generation tasks to complete
            // Consider Promise.allSettled if you want to handle individual failures more gracefully
            // without stopping other generations. For now, Promise.all is fine.
            await Promise.all(generationPromises);

            console.log(`LocalToolService: Finished all generation tasks. newCacheRequired is: ${newCacheRequired}. Cache size: ${Object.keys(this.commandMcpCache).length}`); // Keep this log

            if (generationPromises.length > 0) {
                 // this.isGeneratingDescription = false; // This is now handled in the finally block of each task
                 // console.log("Obsigent: All generation promises settled.");
            }

            // Filter out old dynamic tools before re-adding/updating
            this.localTools = this.localTools.filter(tool =>
                tool.name === 'obsidian_readFile' ||
                tool.name === 'obsidian_writeFile' ||
                tool.name === 'obsidian_searchNotes'
            );

            for (const command of obsidianCommands) {
                const finalCachedDetail = cachedCommands[command.id];
                // Default description, possibly with hotkey info
                let finalMcpDescription = `Obsidian Command: ${command.name}${command.hotkeys && command.hotkeys.length > 0 ? ' (Hotkey: ' + command.hotkeys.map((hk: any) => hk.key).join(', ') + ')' : ''}`;
                let finalInputSchema: McpToolSchema = { type: "object", properties: {} };
                let finalAnnotations: McpToolAnnotations = { title: command.name, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
                
                // Use cached description if available and valid
                if (finalCachedDetail && finalCachedDetail.description && finalCachedDetail.description.trim() !== '') {
                    finalMcpDescription = finalCachedDetail.description;
                    finalInputSchema = finalCachedDetail.inputSchema || finalInputSchema; // Use cached or default
                    finalAnnotations = finalCachedDetail.annotations || finalAnnotations; // Use cached or default
                } else if (!this.pluginCore.getActiveLLMProvider()) {
                    // If no LLM and no valid cache, ensure it's at least the default.
                    // This case should be covered by the logic block above that sets default if LLM is not active.
                    // console.log(`Obsigent: No LLM, using default description for ${command.name}`);
                }

                const tool: McpTool = {
                    name: command.id,
                    description: finalMcpDescription,
                    inputSchema: finalInputSchema,
                    annotations: finalAnnotations
                };

                const existingToolIndex = this.localTools.findIndex(t => t.name === tool.name);
                if (existingToolIndex === -1) {
                    this.localTools.push(tool);
                } else {
                    this.localTools[existingToolIndex] = tool;
                }
            }

            // Always attempt to save if any generation was attempted, or if initial scan required it.
            // The newCacheRequired flag should cover all cases where a save is needed.
            if (newCacheRequired) {
                await this.pluginCore.saveCommandMcpCacheToFile(this.commandMcpCache);
            } else {
                // console.log("Obsigent: No changes to command MCP cache, skipping save.");
            }
        } else {
            console.warn("Obsigent: Could not retrieve Obsidian commands to register as MCP tools.");
        }
    }

    private registerLocalTools(): void {
        const addToolIfNotExists = (tool: McpTool) => {
            if (!this.localTools.find(t => t.name === tool.name)) {
                this.localTools.push(tool);
            }
        };

        addToolIfNotExists({
            name: 'obsidian_readFile',
            description: 'Reads the content of a specified file in the Obsidian vault. Provide the full path to the file.',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The full path to the file within the Obsidian vault (e.g., "folder/note.md").',
                    },
                },
                required: ['path'],
            } as McpToolSchema, // Cast to McpToolSchema
            annotations: {
                title: "Read File",
                readOnlyHint: true,
                openWorldHint: false,
            }
        });

        addToolIfNotExists({
            name: 'obsidian_writeFile',
            description: 'Writes or overwrites content to a specified file in the Obsidian vault. Provide the full path and content. If the file does not exist, it will be created.',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The full path to the file within the Obsidian vault (e.g., "folder/note.md").',
                    },
                    content: {
                        type: 'string',
                        description: 'The content to write to the file.',
                    },
                },
                required: ['path', 'content'],
            } as McpToolSchema, // Cast to McpToolSchema
            annotations: {
                title: "Write File",
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: false,
            }
        });
        addToolIfNotExists({
            name: 'obsidian_searchNotes',
            description: 'Searches the content of all notes in the Obsidian vault for a given query string. Returns a list of matching file paths and a brief snippet from each.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query string.',
                    },
                    max_results: {
                        type: 'number',
                        description: 'Optional. The maximum number of search results to return. Defaults to 5.',
                    }
                },
                required: ['query'],
            } as McpToolSchema, // Cast to McpToolSchema
            annotations: {
                title: "Search Notes",
                readOnlyHint: true,
                openWorldHint: false,
            }
        });
    }

    public getLocalTools(): McpTool[] {
        if (!this.initialized) {
            // console.warn("Obsigent: getLocalTools called before LocalToolService is fully initialized. Tool list might be incomplete.");
            // Return only very basic tools or an empty array if called too early.
            // For now, let's return what we have, but be mindful.
        }
        return this.localTools;
    }

    public async executeTool(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<McpToolCallResult> {
        const obsidianCommand = this.app.commands.listCommands()?.find((cmd: Command) => cmd.id === toolName);
        let result: McpToolCallResult; // Declare result here

        if (obsidianCommand) {
            try {
                this.app.commands.executeCommandById(toolName); 
                result = { // Assign to result
                    content: [{
                        type: "text",
                        text: `Successfully executed Obsidian command: ${obsidianCommand.name}`
                    }]
                };
            } catch (e: unknown) {
                const errorMsg = `Error executing Obsidian command '${toolName}': ${(e instanceof Error ? e.message : String(e))}`;
                console.error("LocalToolService:", errorMsg, e);
                new Notice(errorMsg);
                result = { // Assign to result
                    isError: true,
                    content: [{ type: "text", text: errorMsg }]
                };
            }
        } else { // Handle non-Obsidian commands (local tools)
            switch (toolName) {
                case 'obsidian_readFile':
                    result = await this.readFile(args?.path as string);
                    break;
                case 'obsidian_writeFile':
                    result = await this.writeFile(args?.path as string, args?.content as string);
                    break;
                case 'obsidian_searchNotes':
                    result = await this.searchNotes(args?.query as string, args?.max_results as number | undefined);
                    break;
                default: {
                    const errorMsg = `Local tool '${toolName}' not found.`;
                    console.error("LocalToolService:", errorMsg);
                    result = { // Assign to result
                        isError: true,
                        content: [{ type: "text", text: errorMsg }]
                    };
                    break;
                }
            }
        }

        // After execution, update the cache for the executed tool if it's an Obsidian command
        if (obsidianCommand) {
            const toolDefinition = this.localTools.find(t => t.name === toolName);
            if (toolDefinition) {
                this.commandMcpCache[toolName] = {
                    id: toolName,
                    originalName: obsidianCommand.name, 
                    description: toolDefinition.description || `Obsidian Command: ${obsidianCommand.name}`,
                    inputSchema: toolDefinition.inputSchema || { type: "object", properties: {} },
                    annotations: toolDefinition.annotations || { title: obsidianCommand.name }
                };
                // Immediately save the updated cache
                // console.log(`Obsigent: executeTool is saving cache for ${toolName}. Cache state before save:`, JSON.stringify(this.commandMcpCache[toolName], null, 2));
                await this.pluginCore.saveCommandMcpCacheToFile(this.commandMcpCache);
            } else {
                console.warn(`LocalToolService: Could not find McpTool definition for executed command '${toolName}' to update cache.`);
            }
        }
        return result; // Return the stored result
    }

    private async readFile(path: string): Promise<McpToolCallResult> {
        if (!path) return { isError: true, content: [{ type: "text", text: "Path is required for readFile." }] };

        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file) {
            return { isError: true, content: [{ type: "text", text: `File not found at path: ${path}` }] };
        }
        if (!(file instanceof TFile)) {
            return { isError: true, content: [{ type: "text", text: `Path does not point to a file: ${path}` }] };
        }

        try {
            const content = await this.app.vault.read(file as TFile);
            return { content: [{ type: "text", text: content }] };
        } catch (e: unknown) {
            const errorMsg = `Error reading file '${path}': ${(e instanceof Error ? e.message : String(e))}`;
            console.error("LocalToolService: readFile", errorMsg, e);
            new Notice(errorMsg);
            return { isError: true, content: [{ type: "text", text: errorMsg }] };
        }
    }

    private async writeFile(path: string, content: string): Promise<McpToolCallResult> {
        if (!path) return { isError: true, content: [{ type: "text", text: "Path is required for writeFile." }] };
        if (content === undefined || content === null) return { isError: true, content: [{ type: "text", text: "Content is required for writeFile." }] };

        try {
            let file = this.app.vault.getAbstractFileByPath(path);
            if (file && !(file instanceof TFile)) {
                return { isError: true, content: [{ type: "text", text: `Path exists but is not a file: ${path}` }] };
            }

            if (!file) {
                const parentPath = path.substring(0, path.lastIndexOf('/'));
                if (parentPath && !this.app.vault.getAbstractFileByPath(parentPath)) {
                    await this.app.vault.createFolder(parentPath);
                }
                file = await this.app.vault.create(path, content);
            } else {
                await this.app.vault.modify(file as TFile, content);
            }
            return { content: [{ type: "text", text: `Successfully wrote to file: ${path}` }] };
        } catch (e: unknown) {
            const errorMsg = `Error writing file '${path}': ${(e instanceof Error ? e.message : String(e))}`;
            console.error("LocalToolService: writeFile", errorMsg, e);
            new Notice(errorMsg);
            return { isError: true, content: [{ type: "text", text: errorMsg }] };
        }
    }

    private async searchNotes(query: string, max_results?: number): Promise<McpToolCallResult> {
        if (!query) return { isError: true, content: [{ type: "text", text: "Query is required for searchNotes." }] };
        const MAX_RESULTS_DEFAULT = 5;
        const limit = max_results || MAX_RESULTS_DEFAULT;

        try {
            const files = this.app.vault.getMarkdownFiles();
            const searchResults: {path: string, contentSnippet: string}[] = [];

            for (const file of files) {
                if (searchResults.length >= limit) break;

                const fileContent = await this.app.vault.cachedRead(file);
                if (fileContent.toLowerCase().includes(query.toLowerCase())) {
                    const queryIndex = fileContent.toLowerCase().indexOf(query.toLowerCase());
                    const snippetStart = Math.max(0, queryIndex - 50);
                    const snippetEnd = Math.min(fileContent.length, queryIndex + query.length + 150);
                    let snippet = fileContent.substring(snippetStart, snippetEnd);
                    if (snippetStart > 0) snippet = "..." + snippet;
                    if (snippetEnd < fileContent.length) snippet = snippet + "...";
                    
                    searchResults.push({ path: file.path, contentSnippet: snippet });
                }
            }
            return { content: [{ type: "text", text: JSON.stringify(searchResults) }] };
        } catch (e: unknown) {
            const errorMsg = `Error searching notes: ${(e instanceof Error ? e.message : String(e))}`;
            console.error("LocalToolService: searchNotes", errorMsg, e);
            new Notice(errorMsg);
            return { isError: true, content: [{ type: "text", text: errorMsg }] };
        }
    }
}
