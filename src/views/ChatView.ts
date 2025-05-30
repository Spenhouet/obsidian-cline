// src/views/ChatView.ts
import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer, TextComponent } from 'obsidian'; // Added MarkdownRenderer, TextComponent
import ObsigentPluginCore from '../main'; // Adjusted import path

export const CHAT_VIEW_TYPE = 'obsigent-chat-view';

export class ChatView extends ItemView {
  private plugin: ObsigentPluginCore;
  private messagesContainer!: HTMLDivElement;
  private inputForm!: HTMLFormElement;
  private chatLogContainerEl!: HTMLDivElement; // Renamed from chatMessagesEl for clarity
  private promptInputEl!: HTMLTextAreaElement;
  private sendButtonEl!: HTMLButtonElement; // Re-added for explicit send button
  // Elements for the new input area structure
  private inputAreaContainerEl!: HTMLDivElement;
  private textInputWrapperEl!: HTMLDivElement;
  private controlsAndInputWrapperEl!: HTMLDivElement;
  private actionButtonsEl!: HTMLDivElement; // Container for send button

  private isComposing: boolean = false; // Track composition state
  private isGenerating: boolean = false; // Track if AI is currently generating
  private currentAbortController: AbortController | null = null; // For stopping generation

  constructor(leaf: WorkspaceLeaf, plugin: ObsigentPluginCore) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Obsigent Chat';
  }

  getIcon(): string {
    return 'bot'; // Obsidian icon name
  }

  async onOpen() {
    const viewContainer = this.containerEl.children[1]; // Content element
    viewContainer.empty();
    viewContainer.addClass('obsigent-chat-view-container'); // Overall container class

    // Chat Log Area - This will be scrollable like Virtuoso
    this.chatLogContainerEl = viewContainer.createDiv({ cls: 'obsigent-chat-log-scroll-container' });
    // Example initial message - will be replaced by actual message rendering
    // this.displayMessage('Welcome to Obsigent AI!', 'system');

    // Controls and Input Wrapper (at the bottom)
    this.controlsAndInputWrapperEl = viewContainer.createDiv({ cls: 'obsigent-controls-input-wrapper' });

    // Input Area Container (Textarea + Action Buttons)
    this.inputAreaContainerEl = this.controlsAndInputWrapperEl.createDiv({ cls: 'obsigent-input-area-container' });
    
    // Wrapper for Text Area (to allow for potential elements alongside it, like context mentions highlight layer)
    this.textInputWrapperEl = this.inputAreaContainerEl.createDiv({ cls: 'obsigent-text-input-wrapper' });
    
    this.promptInputEl = this.textInputWrapperEl.createEl('textarea', {
      cls: 'obsigent-prompt-input',
      attr: { placeholder: 'Ask Obsigent anything...', rows: 1 },
    });

    // Action Buttons (Send)
    this.actionButtonsEl = this.inputAreaContainerEl.createDiv({ cls: 'obsigent-action-buttons' });

    this.sendButtonEl = this.actionButtonsEl.createEl('button', { cls: 'obsigent-send-button obsigent-action-button' });
    setIcon(this.sendButtonEl, 'send');
    this.sendButtonEl.setAttribute('aria-label', 'Send message');
    this.sendButtonEl.addEventListener('click', () => this.handleSubmit());

    this.promptInputEl.addEventListener('keypress', async (event: KeyboardEvent) => {
      this.isComposing = event.isComposing;
      if (event.key === 'Enter' && !event.shiftKey && !this.isComposing) {
        event.preventDefault();
        this.handleSubmit();
      }
    });

    this.promptInputEl.addEventListener('compositionstart', () => {
      this.isComposing = true;
    });
    this.promptInputEl.addEventListener('compositionend', () => {
      this.isComposing = false;
    });

    this.promptInputEl.addEventListener('input', () => {
        this.adjustInputHeight();
    });
    this.adjustInputHeight(); // Initial adjustment

    // Focus the input field when the view is opened
    this.promptInputEl.focus();
  }

  private adjustInputHeight(): void {
    if (!this.promptInputEl) return;
    this.promptInputEl.style.height = 'auto'; // Reset height
    const scrollHeight = this.promptInputEl.scrollHeight;
    const maxHeight = 150; // Max height in pixels, e.g., 150px (adjust as needed)
    this.promptInputEl.style.height = Math.min(scrollHeight, maxHeight) + 'px';

    // Adjust the overall input area container if needed, or the scrollable chat log
    // This might be more complex depending on how the layout behaves with dynamic textarea height
  }

  private handleSubmit(): void {
    // If currently generating, stop the generation
    if (this.isGenerating) {
      this.stopGeneration();
      return;
    }

    // Otherwise, handle normal message submission
    const messageText = this.promptInputEl.value.trim();
    if (messageText) {
      this.displayMessage(messageText, 'user');
      
      // Set generating state and create abort controller
      this.setGeneratingState(true);
      this.currentAbortController = new AbortController();
      
      this.plugin.handleUserMessage(messageText, this, this.currentAbortController);
      this.promptInputEl.value = '';
      this.adjustInputHeight();
      this.promptInputEl.focus(); // Keep focus after sending
    }
  }

  // Method to set generation state and update UI accordingly
  private setGeneratingState(generating: boolean): void {
    this.isGenerating = generating;
    this.updateSendButtonState();
    this.setInputEnabled(!generating);
    
    // Ensure the send button (now stop button) is always enabled during generation
    if (generating) {
      this.sendButtonEl.disabled = false;
    }
  }

  // Method to update send button icon and tooltip based on generation state
  private updateSendButtonState(): void {
    if (this.isGenerating) {
      setIcon(this.sendButtonEl, 'square'); // Stop icon
      this.sendButtonEl.setAttribute('aria-label', 'Stop generation');
      this.sendButtonEl.addClass('obsigent-stop-button');
      this.sendButtonEl.removeClass('obsigent-send-button');
    } else {
      setIcon(this.sendButtonEl, 'send'); // Send icon
      this.sendButtonEl.setAttribute('aria-label', 'Send message');
      this.sendButtonEl.removeClass('obsigent-stop-button');
      this.sendButtonEl.addClass('obsigent-send-button');
    }
  }

  // Method to stop current generation
  private stopGeneration(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.setGeneratingState(false);
  }

  // Public method to be called when generation finishes (from main.ts)
  public onGenerationFinished(): void {
    this.setGeneratingState(false);
    this.currentAbortController = null;
  }

  // displayMessage needs significant rework to match Obsigent's ChatRow.tsx structure and styling
  public async displayMessage(
    initialTextOrMarkdown: string, 
    sender: 'user' | 'ai' | 'system' | 'error' | 'tool' | 'api_req_started', // Added more sender types
    options?: { 
        isPartial?: boolean; 
        toolDetails?: any; // For tool messages
        apiReqInfo?: any; // For API request messages
        images?: string[];
        files?: string[];
    }
  ): Promise<HTMLDivElement | null> { 
    if (!this.chatLogContainerEl) return null;

    // Create the main row container (equivalent to ChatRowContainer in Obsigent)
    const chatRowContainer = this.chatLogContainerEl.createDiv({ cls: 'obsigent-chat-row-container' });

    let messageContentEl: HTMLDivElement;

    if (sender === 'user') {
        // User messages are styled differently, often like a badge on the right
        const userMessageWrapper = chatRowContainer.createDiv({ cls: 'obsigent-user-message-wrapper' });
        messageContentEl = userMessageWrapper.createDiv({ cls: 'obsigent-user-message' });
        // User messages in Obsigent can be editable, have thumbnails. Simplified for now.
        messageContentEl.setText(initialTextOrMarkdown); // For now, just text. Markdown rendering can be added.
        if (options?.images || options?.files) {
            this.renderThumbnails(messageContentEl, options.images, options.files);
        }

    } else {
        // For AI, system, error, tool messages (typically on the left)
        const assistantMessageWrapper = chatRowContainer.createDiv({ cls: 'obsigent-assistant-message-wrapper' });
        
        // Only create header for non-AI messages
        let messageHeaderEl: HTMLDivElement | null = null;
        if (sender !== 'ai') {
            messageHeaderEl = assistantMessageWrapper.createDiv({ cls: 'obsigent-message-header' });
            
            let iconName = '';
            let senderName = '';
            let headerColor = 'var(--vscode-foreground)'; // Default color

            switch(sender) {
                case 'system': 
                    iconName = 'info'; 
                    senderName = 'System'; 
                    break;
                case 'error': 
                    iconName = 'alert-triangle'; 
                    senderName = 'Error'; 
                    headerColor = 'var(--vscode-errorForeground)';
                    break;
                case 'tool':
                    iconName = 'tool'; // Placeholder, specific tool icons would be better
                    senderName = 'Tool Action'; // Or tool name
                    // Tool messages in Obsigent have detailed accordions (CodeAccordian)
                    // This will be simplified here
                    break;
                case 'api_req_started':
                    iconName = 'sync'; // Or a progress indicator
                    senderName = 'API Request';
                    // API requests in Obsigent show cost, can be expanded
                    // Simplified here
                    break;
            }
            
            if (iconName) {
                const iconSpan = messageHeaderEl.createSpan({cls: 'obsidian-icon obsigent-message-icon'});
                setIcon(iconSpan, iconName);
                iconSpan.style.color = headerColor;
            }
            messageHeaderEl.createSpan({text: senderName, cls: 'obsigent-message-sender-name'}).style.color = headerColor;
        }

        messageContentEl = assistantMessageWrapper.createDiv({ cls: 'obsigent-message-content' });

        if (sender === 'ai' && options?.isPartial) {
            messageContentEl.setText(initialTextOrMarkdown); // Update text directly for streaming
        } else if (sender === 'ai' || sender === 'system') {
            await MarkdownRenderer.renderMarkdown(initialTextOrMarkdown, messageContentEl, this.app.vault.getRoot().path, this);
        } else if (sender === 'error') {
            messageContentEl.setText(initialTextOrMarkdown);
            messageContentEl.style.color = 'var(--vscode-errorForeground)';
        } else if (sender === 'tool' && options?.toolDetails) {
            // Simplified tool display
            messageContentEl.createEl('strong', { text: `Tool: ${options.toolDetails.name || 'Unknown Tool'}` });
            if (options.toolDetails.content) {
                const codeBlock = messageContentEl.createEl('pre');
                codeBlock.createEl('code', { text: options.toolDetails.content });
            }
            // Add more details as needed
        } else if (sender === 'api_req_started') {
            // Simplified API request display
            messageContentEl.setText(options?.apiReqInfo?.request || initialTextOrMarkdown || 'Processing API request...');
            if (options?.apiReqInfo?.cost) {
                messageContentEl.createDiv({text: `Cost: $${options.apiReqInfo.cost.toFixed(4)}`, cls: 'obsigent-api-cost'});
            }
        } else {
            messageContentEl.setText(initialTextOrMarkdown);
        }
    }

    // Auto-scroll to the bottom
    this.chatLogContainerEl.scrollTop = this.chatLogContainerEl.scrollHeight;
    
    return messageContentEl; // Return the element that holds the main content for potential updates
  }

  private renderThumbnails(container: HTMLElement, images?: string[], files?: string[]): void {
    if ((images && images.length > 0) || (files && files.length > 0)) {
        const thumbnailsContainer = container.createDiv({ cls: 'obsigent-thumbnails-container' });
        
        // Render image thumbnails
        images?.forEach(imgDataUrl => {
            const imgWrapper = thumbnailsContainer.createDiv({ cls: 'obsigent-thumbnail-wrapper' });
            const imgEl = imgWrapper.createEl('img', { cls: 'obsigent-thumbnail-image' });
            imgEl.src = imgDataUrl;
            imgEl.alt = 'Attached image';
            
            // Add click handler to view full image
            imgEl.addEventListener('click', () => {
                // In a full implementation, this would open the image in a modal or new tab
                window.open(imgDataUrl, '_blank');
            });
        });
        
        // Render file thumbnails
        files?.forEach(fileName => {
            const fileWrapper = thumbnailsContainer.createDiv({ cls: 'obsigent-thumbnail-wrapper' });
            const fileEl = fileWrapper.createDiv({ cls: 'obsigent-thumbnail-file' });
            
            const iconSpan = fileEl.createSpan({ cls: 'obsigent-file-icon' });
            setIcon(iconSpan, 'document');
            
            fileEl.createSpan({ text: fileName, cls: 'obsigent-file-name' });
        });
    }
  }

  public async updateAIMessageContent(contentEl: HTMLDivElement, newContent: string, isFinal: boolean): Promise<void> {
    contentEl.empty(); // Clear previous content
    
    // In Obsigent, Markdown rendering is more sophisticated, potentially using MarkdownBlock component
    // For Obsidian, we re-render with MarkdownRenderer
    await MarkdownRenderer.renderMarkdown(newContent, contentEl, this.app.vault.getRoot().path, this);
    
    if (isFinal) {
      // Add any final processing when streaming is complete
      // Could add copy button, expand/collapse functionality, etc.
    }
    
    // Auto-scroll to bottom after content update
    this.chatLogContainerEl.scrollTop = this.chatLogContainerEl.scrollHeight;
  }

  // Method to handle message expansion/collapse (for tool messages, API requests, etc.)
  public toggleMessageExpansion(messageElement: HTMLElement, isExpanded: boolean): void {
    if (isExpanded) {
      messageElement.addClass('obsigent-message-expanded');
    } else {
      messageElement.removeClass('obsigent-message-expanded');
    }
  }

  // Method to clear all messages (for new task)
  public clearMessages(): void {
    if (this.chatLogContainerEl) {
      this.chatLogContainerEl.empty();
    }
  }

  // Method to scroll to a specific message (for navigation)
  public scrollToMessage(messageElement: HTMLElement): void {
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Method to enable/disable input (for when AI is processing)
  public setInputEnabled(enabled: boolean): void {
    this.promptInputEl.disabled = !enabled;
    // Don't disable the send button when generating - it becomes the stop button and should remain clickable
    if (!this.isGenerating) {
      this.sendButtonEl.disabled = !enabled;
    }
    
    if (enabled) {
      this.promptInputEl.focus();
    }
  }

  // Method to set placeholder text dynamically
  public setPlaceholderText(text: string): void {
    this.promptInputEl.placeholder = text;
  }

  // Method to get current input value (useful for external access)
  public getInputValue(): string {
    return this.promptInputEl.value;
  }

  // Method to set input value programmatically
  public setInputValue(value: string): void {
    this.promptInputEl.value = value;
    this.adjustInputHeight();
  }

  // Method to add a quote/context to the input (like Obsigent's quote feature)
  public addQuoteToInput(quotedText: string): void {
    const currentValue = this.promptInputEl.value;
    const prefix = '[context]\n> ';
    const suffix = '\n[/context]\n\n';
    const newValue = currentValue ? `${prefix}${quotedText}${suffix}${currentValue}` : `${prefix}${quotedText}${suffix}`;
    
    this.setInputValue(newValue);
    this.promptInputEl.focus();
    // Position cursor at the end
    this.promptInputEl.setSelectionRange(newValue.length, newValue.length);
  }

  // Method to handle streaming AI responses
  public async startStreamingResponse(): Promise<HTMLDivElement | null> {
    return await this.displayMessage('', 'ai', { isPartial: true });
  }

  // Method to update streaming response content
  public async updateStreamingResponse(contentEl: HTMLDivElement, newContent: string): Promise<void> {
    await this.updateAIMessageContent(contentEl, newContent, false);
  }

  // Method to finalize streaming response
  public async finalizeStreamingResponse(contentEl: HTMLDivElement, finalContent: string): Promise<void> {
    await this.updateAIMessageContent(contentEl, finalContent, true);
  }

  // Method to show typing indicator
  public showTypingIndicator(): HTMLDivElement | null {
    const typingContainer = this.chatLogContainerEl.createDiv({ cls: 'obsigent-typing-indicator' });
    typingContainer.innerHTML = `
      <div class="obsigent-typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    this.chatLogContainerEl.scrollTop = this.chatLogContainerEl.scrollHeight;
    return typingContainer;
  }

  // Method to hide typing indicator
  public hideTypingIndicator(): void {
    const typingIndicators = this.chatLogContainerEl.querySelectorAll('.obsigent-typing-indicator');
    typingIndicators.forEach(indicator => indicator.remove());
  }

  async onClose() {
    // Clean up any event listeners or resources
    // Remove any pending timers or observers
    this.hideTypingIndicator();
  }
}
