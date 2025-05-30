// src/services/LocalToolService.ts
import { App, Notice, TFile } from 'obsidian';
import { McpTool, McpToolSchema } from '../types/mcp';

export class LocalToolService {
    private app: App;
    private localTools: McpTool[] = [];

    constructor(app: App) {
        this.app = app;
        this.registerLocalTools();
    }

    private registerLocalTools(): void {
        this.localTools.push({
            name: 'obsidian_readFile',
            description: 'Reads the content of a specified file in the Obsidian vault. Provide the full path to the file.',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        name: 'path', // Added name
                        type: 'string',
                        description: 'The full path to the file within the Obsidian vault (e.g., "folder/note.md").',
                    },
                },
                required: ['path'],
            },
        });

        this.localTools.push({
            name: 'obsidian_writeFile',
            description: 'Writes or overwrites content to a specified file in the Obsidian vault. Provide the full path and content. If the file does not exist, it will be created.',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        name: 'path', // Added name
                        type: 'string',
                        description: 'The full path to the file within the Obsidian vault (e.g., "folder/note.md").',
                    },
                    content: {
                        name: 'content', // Added name
                        type: 'string',
                        description: 'The content to write to the file.',
                    },
                },
                required: ['path', 'content'],
            },
        });
        this.localTools.push({
            name: 'obsidian_searchNotes',
            description: 'Searches the content of all notes in the Obsidian vault for a given query string. Returns a list of matching file paths and a brief snippet from each.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        name: 'query',
                        type: 'string',
                        description: 'The search query string.',
                    },
                    max_results: {
                        name: 'max_results',
                        type: 'number',
                        description: 'Optional. The maximum number of search results to return. Defaults to 5.',
                    }
                },
                required: ['query'],
            },
        });
        // Add more local tools here (e.g., list files, etc.)
    }

    public getLocalTools(): McpTool[] {
        return this.localTools;
    }

    public async executeTool(
        toolName: string,
        args: any
    ): Promise<{ result?: any; error?: string }> {
        switch (toolName) {
            case 'obsidian_readFile':
                return this.readFile(args.path);
            case 'obsidian_writeFile':
                return this.writeFile(args.path, args.content);
            case 'obsidian_searchNotes':
                return this.searchNotes(args.query, args.max_results);
            // Add cases for other local tools
            default:
                const errorMsg = `Local tool '${toolName}' not found.`;
                console.error("LocalToolService:", errorMsg);
                return { error: errorMsg };
        }
    }

    private async readFile(path: string): Promise<{ result?: string; error?: string }> {
        if (!path) return { error: "Path is required for readFile." };
        
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file) {
            return { error: `File not found at path: ${path}` };
        }
        if (!(file instanceof TFile)) {
            return { error: `Path does not point to a file: ${path}` };
        }

        try {
            const content = await this.app.vault.read(file);
            return { result: content };
        } catch (e: any) {
            console.error(`Error reading file ${path}:`, e);
            return { error: `Error reading file: ${e.message}` };
        }
    }

    private async writeFile(path: string, content: string): Promise<{ result?: string; error?: string }> {
        if (path === undefined) return { error: "Path is required for writeFile." };
        if (content === undefined) return { error: "Content is required for writeFile." };

        try {
            let file = this.app.vault.getAbstractFileByPath(path);
            if (file && !(file instanceof TFile)) {
                 return { error: `Path exists but is not a file: ${path}` };
            }
            
            if (!file) {
                // Ensure directory exists if path includes folders
                const parentDir = path.substring(0, path.lastIndexOf('/'));
                if (parentDir && !this.app.vault.getAbstractFileByPath(parentDir)) {
                    await this.app.vault.createFolder(parentDir).catch(e => {
                        // console.warn(`Could not create folder ${parentDir}, may already exist or be part of file creation process. Error: ${e.message}`);
                        // It's fine if folder creation fails if it already exists.
                    });
                }
                file = await this.app.vault.create(path, content);
                return { result: `File created and content written to ${path}` };
            } else {
                // File exists and is a TFile, so modify it
                await this.app.vault.modify(file as TFile, content);
                return { result: `Content written to existing file ${path}` };
            }
        } catch (e: any) {
            console.error(`Error writing file ${path}:`, e);
            return { error: `Error writing file: ${e.message}` };
        }
    }

    private async searchNotes(query: string, max_results: number = 5): Promise<{ result?: any[]; error?: string }> {
        if (!query) return { error: "Query is required for searchNotes." };

        const lowerCaseQuery = query.toLowerCase();
        const markdownFiles = this.app.vault.getMarkdownFiles();
        const results: any[] = [];

        for (const file of markdownFiles) {
            try {
                const content = await this.app.vault.cachedRead(file);
                const lowerCaseContent = content.toLowerCase();
                
                if (lowerCaseContent.includes(lowerCaseQuery)) {
                    let snippet = "";
                    const matchIndex = lowerCaseContent.indexOf(lowerCaseQuery);
                    const snippetStart = Math.max(0, matchIndex - 50);
                    const snippetEnd = Math.min(lowerCaseContent.length, matchIndex + query.length + 50);
                    snippet = content.substring(snippetStart, snippetEnd);
                    if (snippetStart > 0) snippet = "..." + snippet;
                    if (snippetEnd < content.length) snippet = snippet + "...";

                    results.push({
                        path: file.path,
                        snippet: snippet,
                    });

                    if (results.length >= max_results) {
                        break; 
                    }
                }
            } catch (e: any) {
                console.warn(`Could not read or process file ${file.path} for search: ${e.message}`);
                // Continue to next file
            }
        }
        if (results.length === 0) {
            return { result: [{ message: "No notes found matching your query." }] };
        }
        return { result: results };
    }
}
