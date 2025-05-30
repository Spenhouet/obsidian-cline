// src/views/ChatView.ts
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type ObsigentPlugin from '../main';
import ChatViewSvelteComponent from "$lib/components/ChatView.svelte";
import type { SvelteComponent, ComponentType } from 'svelte';

export const CHAT_VIEW_TYPE = "obsigent-chat-view";

type MessageSender =
  | "user"
  | "ai"
  | "system"
  | "error"
  | "tool"
  | "api_req_started";

interface ToolDetails {
  name?: string;
  content?: string;
  [key: string]: unknown;
}

interface ApiReqInfo {
  request?: string;
  cost?: number;
  [key: string]: unknown;
}

interface DisplayMessageOptions {
  isPartial?: boolean;
  toolDetails?: ToolDetails;
  apiReqInfo?: ApiReqInfo;
  images?: string[];
  files?: string[];
}

interface IChatViewSvelteApi {
  displayMessage(initialTextOrMarkdown: string, sender: MessageSender, options?: DisplayMessageOptions): Promise<string>;
  updateAIMessageContent(messageId: string, newContent: string, isFinal: boolean): Promise<void>;
  onGenerationFinished(): void;
  clearMessages(): void;
  setInputEnabled(enabled: boolean): void;
  setPlaceholderText(text: string): void;
  getInputValue(): string;
  setInputValue(value: string): void;
  addQuoteToInput(quotedText: string): void;
  startStreamingResponse(): Promise<string>;
  updateStreamingResponse(messageId: string, newContent: string): Promise<void>;
  finalizeStreamingResponse(messageId: string, finalContent: string): Promise<void>;
  showTypingIndicator(): void;
  hideTypingIndicator(): void;
}

export class ChatView extends ItemView {
  private plugin: ObsigentPlugin;
  private svelteComponent: SvelteComponent | null = null;
  private svelteApi: IChatViewSvelteApi | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ObsigentPlugin) {
    super(leaf);
    console.log('ChatView constructor called with plugin:', plugin);
    if (!plugin) {
      console.error('ChatView: Plugin is undefined in constructor!');
      throw new Error('ChatView requires a valid plugin instance');
    }
    this.plugin = plugin;
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Obsigent Chat";
  }

  getIcon(): string {
    return "bot";
  }

  setSvelteComponent(api: IChatViewSvelteApi) {
    this.svelteApi = api;
  }

  async onOpen() {
    this.containerEl.empty();
    this.containerEl.addClass("obsigent-chat-view-root");

    const SvelteConstructor = ChatViewSvelteComponent as unknown as ComponentType;

    this.svelteComponent = new SvelteConstructor({
      target: this.containerEl,
      props: {
        plugin: this.plugin,
        view: this,
      },
    });
  }

  async onClose() {
    if (this.svelteComponent) {
      this.svelteComponent.$destroy?.();
      this.svelteComponent = null;
    }
  }

  public async displayMessage(
    initialTextOrMarkdown: string,
    sender: MessageSender,
    options?: DisplayMessageOptions
  ): Promise<string | null> {
    if (this.svelteApi && this.svelteApi.displayMessage) {
      return this.svelteApi.displayMessage(initialTextOrMarkdown, sender, options);
    }
    console.warn("Svelte ChatView component or displayMessage not ready");
    return null;
  }

  public async updateAIMessageContent(messageId: string, newContent: string, isFinal: boolean): Promise<void> {
    if (this.svelteApi && this.svelteApi.updateAIMessageContent) {
      this.svelteApi.updateAIMessageContent(messageId, newContent, isFinal);
    } else {
      console.warn("Svelte ChatView component or updateAIMessageContent not ready");
    }
  }
  
  public onGenerationFinished(): void {
    if (this.svelteApi && this.svelteApi.onGenerationFinished) {
      this.svelteApi.onGenerationFinished();
    } else {
      console.warn("Svelte ChatView component or onGenerationFinished not ready");
    }
  }

  public clearMessages(): void {
    if (this.svelteApi && this.svelteApi.clearMessages) {
      this.svelteApi.clearMessages();
    } else {
      console.warn("Svelte ChatView component or clearMessages not ready");
    }
  }

  public setInputEnabled(enabled: boolean): void {
    if (this.svelteApi && this.svelteApi.setInputEnabled) {
      this.svelteApi.setInputEnabled(enabled);
    } else {
      console.warn("Svelte ChatView component or setInputEnabled not ready");
    }
  }

  public setPlaceholderText(text: string): void {
    if (this.svelteApi && this.svelteApi.setPlaceholderText) {
      this.svelteApi.setPlaceholderText(text);
    } else {
      console.warn("Svelte ChatView component or setPlaceholderText not ready");
    }
  }

  public getInputValue(): string {
    if (this.svelteApi && this.svelteApi.getInputValue) {
      return this.svelteApi.getInputValue();
    }
    console.warn("Svelte ChatView component or getInputValue not ready");
    return "";
  }

  public setInputValue(value: string): void {
    if (this.svelteApi && this.svelteApi.setInputValue) {
      this.svelteApi.setInputValue(value);
    } else {
      console.warn("Svelte ChatView component or setInputValue not ready");
    }
  }

  public addQuoteToInput(quotedText: string): void {
    if (this.svelteApi && this.svelteApi.addQuoteToInput) {
      this.svelteApi.addQuoteToInput(quotedText);
    } else {
      console.warn("Svelte ChatView component or addQuoteToInput not ready");
    }
  }

  public async startStreamingResponse(): Promise<string | null> {
    if (this.svelteApi && this.svelteApi.startStreamingResponse) {
      return this.svelteApi.startStreamingResponse();
    }
    console.warn("Svelte ChatView component or startStreamingResponse not ready");
    return null;
  }

  public async updateStreamingResponse(messageId: string, newContent: string): Promise<void> {
    if (this.svelteApi && this.svelteApi.updateStreamingResponse) {
      this.svelteApi.updateStreamingResponse(messageId, newContent);
    } else {
      console.warn("Svelte ChatView component or updateStreamingResponse not ready");
    }
  }

  public async finalizeStreamingResponse(messageId: string, finalContent: string): Promise<void> {
    if (this.svelteApi && this.svelteApi.finalizeStreamingResponse) {
      this.svelteApi.finalizeStreamingResponse(messageId, finalContent);
    } else {
      console.warn("Svelte ChatView component or finalizeStreamingResponse not ready");
    }
  }

  public showTypingIndicator(): void {
    if (this.svelteApi && this.svelteApi.showTypingIndicator) {
      this.svelteApi.showTypingIndicator();
    } else {
      console.warn("Svelte ChatView component or showTypingIndicator not ready");
    }
  }

  public hideTypingIndicator(): void {
    if (this.svelteApi && this.svelteApi.hideTypingIndicator) {
      this.svelteApi.hideTypingIndicator();
    } else {
      console.warn("Svelte ChatView component or hideTypingIndicator not ready");
    }
  }
}
