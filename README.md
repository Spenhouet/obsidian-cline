# Obsigent: Your Obsidian Agent

> [!IMPORTANT] 
> Obsigent is (yet) only a proof-of-concept and exploration of ideas. While the core chat functionality is in place, the advanced agentic features and deep command integration described herein are part of the future vision and might be developed. The plan is to have a fully truely open source solution. Contributions are welcome.

**Obsigent** is an Obsidian plugin that transforms your note-taking environment into an intelligent, agentic workspace. It acts as an AI copilot, deeply integrated with Obsidian, capable of understanding your notes, interacting with your vault, and leveraging Obsidian's command ecosystem to assist you in a variety of tasks. It is particularly well-suited as a professional tool for creating and maintaining complex documentation, such as Quality Manuals (QM) or Technical Documentation (TD).

## Vision

Obsigent aims to be more than just a chat interface. It's envisioned as a true "second brain" assistant that can:

*   **Understand Your Knowledge:** Seamlessly access and comprehend the content of your Obsidian vault.
*   **Automate Complex Tasks:** Execute sequences of Obsidian commands, including those from other plugins, to perform complex operations. This is central to its power, enabling it to act as a genuine assistant for tasks like drafting sections of a Quality Manual based on existing notes, or updating technical specifications across multiple documents.
*   **Augment Your Workflow:** Assist with content creation, summarization, research, and task management directly within Obsidian, streamlining the development of professional documentation.
*   **Be Extensible:** Utilize the Model Context Protocol (MCP) to connect with external tools and services, expanding its capabilities beyond Obsidian's native functions.

## Core Features

*   **Agentic AI Chat:** Engage in natural language conversations with an AI that can take actions within your Obsidian vault.
*   **Deep Obsidian Integration for Professional Documentation:**
    *   **Vault Awareness:** Reads and understands your notes to provide contextually relevant assistance for your documentation projects.
    *   **Note Interaction:** Creates, modifies, and organizes notes based on your requests, helping to structure and maintain QMs, TDs, and other complex documents.
    *   **Command Execution via MCP:** Leverages Obsidian's command palette, including commands from other plugins, to perform actions. This is a key feature, allowing Obsigent to, for example, refactor notes, run custom scripts for document generation, or interact with other plugin functionalities based on your instructions.
*   **Model Context Protocol (MCP) Support:**
    *   Connects to MCP-compliant tool servers, enabling the AI to use a wide array of external tools and data sources relevant to your professional work.
    *   Allows Obsigent to orchestrate complex workflows by combining Obsidian commands with external tool capabilities, crucial for managing large-scale documentation.
*   **Multi-Provider LLM Support:**
    *   Configure and switch between various Large Language Model (LLM) providers (e.g., OpenAI, Ollama, Anthropic).
    *   Tailor API keys, endpoints, and default models for each provider.
*   **Contextual Note Referencing:** Use `[[` link syntax to easily include the content of specific notes in your conversation with the AI.
*   **Streaming Responses:** Get real-time feedback from the AI.
*   **Local Tool Execution:** Supports predefined local tools for common Obsidian-specific tasks.

## How it Works: Leveraging Obsidian Commands via MCP for Documentation Workflows

A core design principle of Obsigent is its ability to act as an agent that can utilize any Obsidian command, making it exceptionally powerful for documentation-centric workflows. This is envisioned to work as follows:

1.  **Command Discovery:** Obsigent will have a mechanism to discover available Obsidian commands, including those registered by other community plugins.
2.  **MCP Tool Abstraction:** These discovered Obsidian commands will be exposed to the LLM as tools via the Model Context Protocol (MCP). This means the LLM can "see" and "understand" what actions are possible within Obsidian.
3.  **User Request & AI Planning (e.g., for a Quality Manual):** When you make a request (e.g., "Draft a new section for the QM on 'Risk Management' based on notes X, Y, and Z, and ensure it follows the standard QM template"), the LLM can plan a sequence of actions. This might involve:
    *   Identifying the relevant notes (X, Y, Z) and the QM template.
    *   Reading the content of these notes and the template structure.
    *   Invoking an Obsidian command (or a series of commands) to create a new note for the QM section.
    *   Synthesizing information from notes X, Y, and Z into the new section, adhering to the template.
    *   Invoking an Obsidian command to write the content to the new note and potentially link it appropriately within the QM structure.
4.  **Execution & Feedback:** Obsigent executes the planned commands and provides feedback or results, allowing for iterative refinement of the documentation.

This approach allows for powerful automation and integration, as Obsigent can dynamically leverage the ever-expanding functionality of the Obsidian ecosystem to support demanding professional documentation tasks.

## Getting Started

1.  **Installation:** Install Obsigent from the Obsidian community plugin browser (once available).
2.  **Configuration:**
    *   Open Obsigent settings in Obsidian.
    *   Select your preferred LLM provider and enter your API key and model preferences.
    *   (Optional) Configure any external MCP tool servers you wish to use.

### Using Obsigent for Documentation and More

*   **Chat Interface:** Open the Obsigent chat view (e.g., via a ribbon icon or command).
*   **Interact:** Type your requests or questions. Be specific about what you want Obsigent to do (e.g., "Update the 'Version History' section in 'TD-001' to reflect the latest changes," or "Find all notes related to 'ISO 9001 compliance' and summarize them").
*   **Reference Notes:** Use `[[` link syntax to include note content in your prompts.
*   **Observe Actions:** Obsigent will inform you about the tools or commands it intends to use.

## Development

This project is under active development.

1.  **Clone the Repository:** `git clone <repository-url>` (The URL will be updated once the repository is public)
2.  **Install Dependencies:** `bun install`
3.  **Build for Development:** `bun run dev` - This will watch for changes and rebuild.
4.  **Install in Obsidian:**
    *   Copy `main.js`, `styles.css`, and `manifest.json` to your Obsidian vault's `.obsidian/plugins/obsigent/` folder.
    *   Reload Obsidian or disable and re-enable the Obsigent plugin.

## Contributing

Contributions, ideas, and feedback are highly welcome, especially those focused on enhancing Obsigent's capabilities for professional documentation and agentic workflows. Please feel free to open an issue or submit a pull request. (Further details on contribution guidelines will be added).

## Future Vision

*   **Enhanced Agentic Capabilities for Documentation:** More sophisticated planning and execution of complex, multi-step documentation tasks (e.g., "Review all procedures in the QM for consistency with the new 'Change Management' policy and flag discrepancies").
*   **Proactive Assistance for Document Maintenance:** Suggestions for updates, reviews, or archiving based on your vault activity and document metadata.
*   **Visual Tool Building for Documentation Workflows:** A user interface for creating and managing custom toolchains that combine Obsidian commands and MCP tools, tailored for specific documentation processes.
*   **Community Tool Marketplace:** A way to share and discover Obsigent-compatible tools and workflows, including pre-built solutions for common documentation standards.

## License

Obsigent is released under the MIT License. See the [LICENSE](LICENSE) file for details.