<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { Button } from "$lib/components/ui/button";
	import { Textarea } from "$lib/components/ui/textarea";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { setIcon } from "obsidian";
	import type ObsigentPlugin from "../../main";
	import { MarkdownRenderer } from "obsidian";

	// Use $props() for Svelte 5 runes mode - access props object first
	const { plugin, view } = $props<{ plugin: ObsigentPlugin; view: any }>();

	// --- Use $state for reactive UI updates ---
	let messages: Array<MessageType> = $state([]);
	let currentInput: string = $state("");
	let isGenerating: boolean = $state(false);
	let isComposing: boolean = $state(false);
	let typingIndicatorMessageId: string | null = $state(null);
	let currentAbortController: AbortController | null = $state(null);

	// --- DOM Element References ---
	let chatLogContainerEl: any = $state(null);
	let promptTextareaElement: any = $state(null);

	type MessageSender =
		| "user"
		| "ai"
		| "system"
		| "error"
		| "tool"
		| "api_req_started";
	
	type MessageType = {
		id: string;
		sender: MessageSender;
		text: string;
		html?: string;
		isPartial?: boolean;
		toolDetails?: any;
		apiReqInfo?: any;
		images?: string[];
		files?: string[];
		timestamp: Date;
	};

	// --- Function Declarations ---
	function adjustInputHeight() {
		if (!promptTextareaElement) return;
		const textareaEl = promptTextareaElement.querySelector?.('textarea') || promptTextareaElement;
		if (textareaEl && textareaEl.style) {
			textareaEl.style.height = "auto";
			const scrollHeight = textareaEl.scrollHeight;
			const maxHeight = 150;
			textareaEl.style.height = Math.min(scrollHeight, maxHeight) + "px";
		}
	}

	function setGeneratingState(generating: boolean) {
		isGenerating = generating;
	}

	function stopGeneration() {
		if (currentAbortController) {
			currentAbortController.abort();
			currentAbortController = null;
		}
		setGeneratingState(false);
	}

	async function displayMessage(
		initialTextOrMarkdown: string,
		sender: MessageSender,
		options?: {
			isPartial?: boolean;
			toolDetails?: any;
			apiReqInfo?: any;
			images?: string[];
			files?: string[];
		},
	): Promise<string> {
		const newMessageId = Date.now().toString() + Math.random().toString(36).substring(2);
		const messageData: MessageType = {
			id: newMessageId,
			sender,
			text: initialTextOrMarkdown,
			isPartial: options?.isPartial,
			toolDetails: options?.toolDetails,
			apiReqInfo: options?.apiReqInfo,
			images: options?.images,
			files: options?.files,
			timestamp: new Date(),
		};

		if (sender === "ai" || sender === "system") {
			const tempDiv = document.createElement("div");
			if (plugin && plugin.app && view) {
			await MarkdownRenderer.renderMarkdown(
				initialTextOrMarkdown,
				tempDiv,
				plugin.app.vault.getRoot().path,
				view,
			);
			messageData.html = tempDiv.innerHTML;
			} else {
				// Fallback if plugin/view not available
				messageData.html = initialTextOrMarkdown;
			}
		}

		messages = [...messages, messageData];
		scrollToBottom();
		return newMessageId;
	}

	async function updateAIMessageContent(
		messageId: string,
		newContent: string,
		isFinal: boolean,
	): Promise<void> {
		messages = messages.map((msg) => {
			if (msg.id === messageId && msg.sender === "ai") {
				const tempDiv = document.createElement("div");
				if (plugin && plugin.app && view) {
				MarkdownRenderer.renderMarkdown(
					newContent,
					tempDiv,
					plugin.app.vault.getRoot().path,
					view,
				);
				} else {
					tempDiv.innerHTML = newContent;
				}
				return {
					...msg,
					text: newContent,
					html: tempDiv.innerHTML,
					isPartial: !isFinal,
				};
			}
			return msg;
		});
		if (isFinal) {
			// Potentially add copy buttons or other final elements here programmatically if needed
		}
		scrollToBottom();
	}

	function onGenerationFinished(): void {
		setGeneratingState(false);
		currentAbortController = null;
		messages = messages.map((msg) => (msg.isPartial ? { ...msg, isPartial: false } : msg));
	}

	function clearMessages(): void {
		messages = [];
	}

	function setInputEnabled(enabled: boolean): void {
		if (promptTextareaElement) promptTextareaElement.disabled = !enabled;
		if (enabled && promptTextareaElement) {
			promptTextareaElement.focus();
		}
	}

	function setPlaceholderText(text: string): void {
		if (promptTextareaElement) promptTextareaElement.placeholder = text;
	}

	function getInputValue(): string {
		return currentInput;
	}

	function setInputValue(value: string): void {
		currentInput = value;
		if (promptTextareaElement) {
			promptTextareaElement.value = value;
			adjustInputHeight();
		}
	}

	function addQuoteToInput(quotedText: string): void {
		const prefix = "[context]\n> ";
		const suffix = "\n[/context]\n\n";
		const PADDING = "\n";
		const currentVal = currentInput;
		const newValue = currentVal
			? `${currentVal}${PADDING}${prefix}${quotedText}${suffix}`
			: `${prefix}${quotedText}${suffix}`;
		setInputValue(newValue);
		if (promptTextareaElement) {
			promptTextareaElement.focus();
			promptTextareaElement.setSelectionRange(newValue.length, newValue.length);
		}
	}

	async function startStreamingResponse(): Promise<string> {
		return await displayMessage("", "ai", { isPartial: true });
	}

	async function updateStreamingResponse(
		messageId: string,
		newContent: string,
	): Promise<void> {
		await updateAIMessageContent(messageId, newContent, false);
	}

	async function finalizeStreamingResponse(
		messageId: string,
		finalContent: string,
	): Promise<void> {
		await updateAIMessageContent(messageId, finalContent, true);
	}

	function showTypingIndicator(): void {
		const id = Date.now().toString() + "-typing";
		messages = [
			...messages,
			{
				id,
				sender: "system",
				text: "TYPING_INDICATOR_PLACEHOLDER",
				timestamp: new Date(),
			},
		];
		typingIndicatorMessageId = id;
		scrollToBottom();
	}

	function hideTypingIndicator(): void {
		const idToHide = typingIndicatorMessageId;
		if (idToHide) {
			messages = messages.filter((msg) => msg.id !== idToHide);
			typingIndicatorMessageId = null;
		}
	}

	function scrollToBottom(behavior: "auto" | "smooth" = "auto") {
		if (chatLogContainerEl) {
			const viewport = chatLogContainerEl.querySelector?.("[data-radix-scroll-area-viewport]") || 
							chatLogContainerEl.querySelector?.(".scroll-area-viewport") || 
							chatLogContainerEl;
			if (viewport && viewport.scrollTo) {
			viewport.scrollTo({ top: viewport.scrollHeight, behavior });
			}
		}
	}

	function getIconElement(iconName: string): HTMLElement {
		const span = document.createElement("span");
		setIcon(span, iconName);
		return span;
	}

	function getSendButtonIcon(): string {
		return isGenerating ? "square" : "send";
	}
	
	function getSendButtonLabel(): string {
		return isGenerating ? "Stop generation" : "Send message";
	}

	// --- Event Handlers ---
	function handleInput(event: Event) {
		adjustInputHeight();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === "Enter" && !event.shiftKey && !isComposing) {
			event.preventDefault();
			handleSubmit();
		}
	}

	function handleSubmit() {
		if (isGenerating) {
			stopGeneration();
			return;
		}
		const messageText = currentInput.trim();
		if (messageText && plugin && view) {
			displayMessage(messageText, "user");
			isGenerating = true;
			currentAbortController = new AbortController();
			plugin.handleUserMessage(messageText, view, currentAbortController);
			currentInput = "";
			adjustInputHeight();
			const textareaEl = promptTextareaElement?.querySelector?.('textarea') || promptTextareaElement;
			if (textareaEl && textareaEl.focus) textareaEl.focus();
		} else if (!plugin || !view) {
			console.error('ChatView: plugin or view not available for message submission');
		}
	}

	// Set up the component API object (but don't call setSvelteComponent yet)
	const componentApi = {
		displayMessage,
		updateAIMessageContent,
		onGenerationFinished,
		clearMessages,
		setInputEnabled,
		setPlaceholderText,
		getInputValue,
		setInputValue,
		addQuoteToInput,
		startStreamingResponse,
		updateStreamingResponse,
		finalizeStreamingResponse,
		showTypingIndicator,
		hideTypingIndicator,
	};

	// --- Lifecycle Hooks ---
	onMount(() => {
		// Set the component API on the view after mounting to avoid timing issues
		if (view && typeof view.setSvelteComponent === 'function') {
			try {
				view.setSvelteComponent(componentApi);
			} catch (error) {
				console.error('Failed to set Svelte component API:', error);
			}
		} else {
			console.warn('ChatView: view or setSvelteComponent method not available');
		}

		const textareaEl = promptTextareaElement?.querySelector?.('textarea') || promptTextareaElement;
		if (textareaEl && textareaEl.focus) {
			textareaEl.focus();
		}
	});

	onDestroy(() => {
		stopGeneration();
	});
</script>

<div
	class="obsigent-chat-view-container svelte-chat-view flex flex-col h-full bg-background text-foreground"
>
	<ScrollArea
		class="flex-grow p-4 space-y-4"
		bind:this={chatLogContainerEl}
	>
		{#each messages as message (message.id)}
			<div
				class="obsigent-chat-row-container flex mb-3"
				class:flex-row-reverse={message.sender === "user"}
			>
				<div
					class:obsigent-user-message-wrapper={message.sender === "user"}
					class:obsigent-assistant-message-wrapper={message.sender !== "user"}
				>
					{#if message.sender !== "user" && message.sender !== "ai" && message.text !== "TYPING_INDICATOR_PLACEHOLDER"}
						<div
							class="obsigent-message-header text-xs mb-1 flex items-center"
							style="color: {message.sender === 'error'
								? 'var(--text-destructive)'
								: 'var(--text-muted-foreground)'};"
						>
							{#if message.sender === "system"}
								{@html getIconElement("info").outerHTML}
								<span class="ml-1 font-medium">System</span>
							{:else if message.sender === "error"}
								{@html getIconElement("alert-triangle").outerHTML}
								<span class="ml-1 font-medium">Error</span>
							{:else if message.sender === "tool"}
								{@html getIconElement("tool").outerHTML}
								<span class="ml-1 font-medium">Tool Action</span>
							{:else if message.sender === "api_req_started"}
								{@html getIconElement("sync").outerHTML}
								<span class="ml-1 font-medium">API Request</span>
							{/if}
						</div>
					{/if}

					{#if message.text === "TYPING_INDICATOR_PLACEHOLDER"}
						<div class="obsigent-typing-indicator p-2 rounded-lg bg-muted">
							<div class="obsigent-typing-dots flex space-x-1">
								<span class="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-0"></span>
								<span class="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-150"></span>
								<span class="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-300"></span>
							</div>
						</div>
					{:else}
						<div
							class="obsigent-message-content p-2 rounded-lg"
							class:bg-primary={message.sender === "user"}
							class:text-primary-foreground={message.sender === "user"}
							class:bg-muted={message.sender !== "user"}
						>
							{#if message.sender === "user" || message.sender === "error" || (message.sender === "ai" && !message.html)}
								<p class="whitespace-pre-wrap">{message.text}</p>
							{:else if message.html}
								{@html message.html}
							{:else if message.sender === "tool" && message.toolDetails}
								<strong>Tool: {message.toolDetails.name || "Unknown Tool"}</strong>
								{#if message.toolDetails.content}
									<pre class="bg-background/50 p-2 rounded-md mt-1 text-xs overflow-x-auto"><code>{message.toolDetails.content}</code></pre>
								{/if}
							{:else if message.sender === "api_req_started"}
								<p class="whitespace-pre-wrap">
									{message.apiReqInfo?.request || message.text || "Processing API request..."}
								</p>
								{#if message.apiReqInfo?.cost}
									<div class="text-xs text-muted-foreground mt-1">
										Cost: ${message.apiReqInfo.cost.toFixed(4)}
									</div>
								{/if}
							{/if}

							<!-- Thumbnails -->
							{#if (message.images && message.images.length > 0) || (message.files && message.files.length > 0)}
								<div class="obsigent-thumbnails-container mt-2 flex flex-wrap gap-2">
									{#each message.images || [] as imgDataUrl}
										<div
											class="obsigent-thumbnail-wrapper w-20 h-20 border border-border rounded overflow-hidden cursor-pointer"
											role="button"
											tabindex="0"
											onclick={() => window.open(imgDataUrl, "_blank")}
											onkeydown={(e) => {
												if (e.key === "Enter" || e.key === " ")
													window.open(imgDataUrl, "_blank");
											}}
										>
											<img src={imgDataUrl} alt="" class="w-full h-full object-cover" />
										</div>
									{/each}
									{#each message.files || [] as fileName}
										<div class="obsigent-thumbnail-wrapper p-2 border border-border rounded flex items-center gap-2 bg-background/50">
											{@html getIconElement("document").outerHTML}
											<span class="text-xs truncate">{fileName}</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</ScrollArea>

	<div class="obsigent-controls-input-wrapper p-2 border-t border-border">
		<div class="obsigent-input-area-container flex items-end gap-2">
			<Textarea
				bind:this={promptTextareaElement}
				bind:value={currentInput}
				class="flex-grow resize-none bg-transparent border border-input rounded-md p-2 focus-visible:ring-ring focus-visible:ring-1"
				placeholder={isGenerating ? "Generating..." : "Ask Obsigent anything..."}
				rows={1}
				oninput={handleInput}
				onkeydown={handleKeydown}
				oncompositionstart={() => (isComposing = true)}
				oncompositionend={() => (isComposing = false)}
				disabled={isGenerating}
			/>
			<Button
				class="obsigent-action-button"
				onclick={handleSubmit}
				disabled={currentInput.trim() === "" && !isGenerating}
			>
				{@html getIconElement(getSendButtonIcon()).outerHTML}
			</Button>
		</div>
	</div>
</div>

<style>
	.obsigent-user-message-wrapper {
		display: flex;
		justify-content: flex-end;
		width: 100%;
	}
	
	.obsigent-assistant-message-wrapper {
		max-width: 75%;
	}
	
	.obsigent-typing-indicator .obsigent-typing-dots span {
		animation-duration: 1s;
		animation-iteration-count: infinite;
	}
	
	.obsigent-typing-indicator .obsigent-typing-dots span:nth-child(1) {
		animation-name: bounce;
		animation-delay: 0s;
	}
	
	.obsigent-typing-indicator .obsigent-typing-dots span:nth-child(2) {
		animation-name: bounce;
		animation-delay: 0.15s;
	}
	
	.obsigent-typing-indicator .obsigent-typing-dots span:nth-child(3) {
		animation-name: bounce;
		animation-delay: 0.3s;
	}

	@keyframes bounce {
		0%, 80%, 100% {
			transform: scale(0);
		}
		40% {
			transform: scale(1);
		}
	}
</style>
