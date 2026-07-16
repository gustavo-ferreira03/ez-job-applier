<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import PanelLeft from '@lucide/svelte/icons/panel-left';
	import FileText from '@lucide/svelte/icons/file-text';
	import Download from '@lucide/svelte/icons/download';
	import { renderChatMarkdown } from '$lib/chatMarkdown';
	import { toastState } from '$lib/toast.svelte';
	import {
		listChatThreads,
		createChatThread,
		getChatThread,
		sendChatMessage,
		deleteChatThread,
		chatAttachmentUrl
	} from '$lib/api';
	import type { ChatThreadSummary, ChatMessage } from '$lib/types';

	let threads = $state<ChatThreadSummary[]>([]);
	let activeId = $state<string | null>(null);
	let messages = $state<ChatMessage[]>([]);
	let busy = $state(false);
	let draft = $state('');
	let sending = $state(false);
	let loading = $state(true);
	let confirmingDelete = $state<string | null>(null);
	let railOpen = $state(false);

	const activeThread = $derived(threads.find((t) => t.id === activeId) ?? null);
	let scroller = $state<HTMLDivElement>();
	let composer = $state<HTMLTextAreaElement>();
	let stickToBottom = $state(true);
	let poll: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		void messages;
		void busy;
		if (!stickToBottom) return;
		tick().then(() => {
			if (scroller) scroller.scrollTop = scroller.scrollHeight;
		});
	});

	$effect(() => {
		void draft;
		tick().then(resizeComposer);
	});

	function onScroll() {
		if (!scroller) return;
		stickToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
	}

	function resizeComposer() {
		if (!composer) return;
		composer.style.height = 'auto';
		composer.style.height = `${Math.min(composer.scrollHeight, 160)}px`;
	}

	function timeOf(iso: string): string {
		return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	async function refreshThreads() {
		try {
			threads = (await listChatThreads()).threads;
			if (!activeId && threads.length > 0) await openThread(threads[0].id);
		} catch (e) {
			toastState.show(e instanceof Error ? e.message : String(e), 'error');
		}
	}

	async function openThread(id: string) {
		activeId = id;
		confirmingDelete = null;
		railOpen = false;
		stickToBottom = true;
		await refreshActive();
	}

	async function refreshActive() {
		if (!activeId) return;
		try {
			const detail = await getChatThread(activeId);
			messages = detail.messages;
			busy = detail.busy;
		} catch {
			// transient poll failure; the next tick retries
		}
	}

	function startNewChat() {
		activeId = null;
		messages = [];
		busy = false;
		confirmingDelete = null;
		railOpen = false;
		stickToBottom = true;
	}

	async function createThreadForMessage(firstMessage: string): Promise<string | null> {
		try {
			const { thread } = await createChatThread();
			const title = firstMessage.slice(0, 60).trim() || 'New chat';
			threads = [{ ...thread, title }, ...threads];
			activeId = thread.id;
			messages = [];
			railOpen = false;
			stickToBottom = true;
			return thread.id;
		} catch (e) {
			toastState.show(e instanceof Error ? e.message : String(e), 'error');
			return null;
		}
	}

	async function removeThread(id: string) {
		if (confirmingDelete !== id) {
			confirmingDelete = id;
			return;
		}
		confirmingDelete = null;
		try {
			await deleteChatThread(id);
			threads = threads.filter((t) => t.id !== id);
			if (activeId === id) {
				activeId = null;
				messages = [];
				if (threads.length > 0) await openThread(threads[0].id);
			}
		} catch (e) {
			toastState.show(e instanceof Error ? e.message : String(e), 'error');
		}
	}

	async function send() {
		const text = draft.trim();
		if (!text || sending || busy) return;
		const id = activeId ?? (await createThreadForMessage(text));
		if (!id) return;
		sending = true;
		draft = '';
		stickToBottom = true;
		messages = [
			...messages,
			{
				id: crypto.randomUUID(),
				threadId: id,
				role: 'user',
				content: text,
				attachments: [],
				createdAt: new Date().toISOString()
			}
		];
		busy = true;
		try {
			await sendChatMessage(id, text);
			const latest = (await listChatThreads()).threads;
			threads = latest.map((t) =>
				t.id === id && t.title === 'New chat' ? { ...t, title: text.slice(0, 60).trim() || 'New chat' } : t
			);
		} catch (e) {
			busy = false;
			draft = text;
			messages = messages.slice(0, -1);
			toastState.show(e instanceof Error ? e.message : String(e), 'error');
		} finally {
			sending = false;
		}
	}

	function onInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	}

	onMount(() => {
		refreshThreads().finally(() => {
			loading = false;
		});
		poll = setInterval(() => {
			if (activeId) void refreshActive();
		}, 1500);
	});

	onDestroy(() => {
		if (poll) clearInterval(poll);
	});
</script>

<div class="flex h-full min-h-0">
	{#if railOpen}
		<button
			type="button"
			class="fixed inset-0 z-drawer bg-black/60 md:hidden"
			aria-label="Close chat list"
			onclick={() => (railOpen = false)}
			transition:fade={{ duration: 160 }}
		></button>
	{/if}

	<!-- Thread rail -->
	<aside
		class="{railOpen
			? 'translate-x-0 opacity-100'
			: 'pointer-events-none -translate-x-full opacity-0'} fixed inset-y-0 left-0 z-drawer flex w-64 flex-shrink-0 flex-col border-r border-border-subtle bg-surface-sidebar shadow-drawer transition-[transform,opacity] duration-200 ease-out md:pointer-events-auto md:static md:z-auto md:flex md:w-56 md:translate-x-0 md:opacity-100 md:shadow-none"
	>
		<div class="flex-shrink-0 p-2">
			<button
				type="button"
				class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-default bg-surface-overlay px-2.5 py-1.5 text-[12px] font-medium text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-text-primary focus-visible:outline-none"
				onclick={startNewChat}
			>
				<Plus size={13} strokeWidth={2} aria-hidden="true" />
				New chat
			</button>
		</div>

		<div class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
			{#each threads as t (t.id)}
				<div
					class="group flex items-center gap-1 rounded-md pr-1 transition-colors duration-150 {activeId ===
					t.id
						? 'bg-surface-overlay'
						: 'hover:bg-surface-hover'}"
				>
					<button
						type="button"
						class="min-w-0 flex-1 cursor-pointer truncate px-2 py-1.5 text-left text-[12.5px] focus-visible:outline-none {activeId ===
						t.id
							? 'text-text-primary'
							: 'text-text-muted group-hover:text-text-secondary'}"
						onclick={() => openThread(t.id)}
						title={t.title}
					>
						{t.title}
					</button>
					<button
						type="button"
						class="flex-shrink-0 cursor-pointer rounded p-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none {confirmingDelete ===
						t.id
							? 'text-danger-500 opacity-100'
							: 'text-text-faint hover:text-text-secondary'}"
						onclick={() => removeThread(t.id)}
						onblur={() => (confirmingDelete = confirmingDelete === t.id ? null : confirmingDelete)}
						aria-label={confirmingDelete === t.id
							? `Confirm deleting “${t.title}”`
							: `Delete “${t.title}”`}
						title={confirmingDelete === t.id ? 'Click again to delete' : 'Delete chat'}
					>
						<Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />
					</button>
				</div>
			{/each}
		</div>
	</aside>

	<!-- Conversation -->
	<section class="flex min-w-0 flex-1 flex-col bg-surface-base">
		<div class="flex flex-shrink-0 items-center gap-2 border-b border-border-subtle px-2 py-1.5 md:hidden">
			<button
				type="button"
				class="flex cursor-pointer items-center justify-center rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none"
				onclick={() => (railOpen = true)}
				aria-label="Show chats"
			>
				<PanelLeft size={16} strokeWidth={1.75} aria-hidden="true" />
			</button>
			<span class="min-w-0 flex-1 truncate text-[13px] text-text-secondary">
				{activeThread?.title ?? 'New chat'}
			</span>
			<button
				type="button"
				class="flex cursor-pointer items-center justify-center rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none"
			onclick={startNewChat}
				aria-label="New chat"
			>
				<Plus size={16} strokeWidth={2} aria-hidden="true" />
			</button>
		</div>

		<div bind:this={scroller} onscroll={onScroll} class="min-h-0 flex-1 overflow-y-auto">
			<div
				class="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-7 px-4 py-8 md:px-6 lg:px-8 {messages.length === 0
					? 'justify-center'
					: ''}"
			>
				{#if loading}
					<p class="text-center text-[13px] text-text-faint">Loading…</p>
				{:else if messages.length === 0}
					<div class="t-empty-state text-center">
						<p class="text-[19px] font-semibold text-text-primary">
							Ask about your pipeline, or paste a job link
						</p>
						<p class="mx-auto mt-2.5 max-w-md text-[14px] leading-relaxed text-text-muted">
							Paste a LinkedIn or careers-page URL to add it to the pipeline. I can also tailor your
							résumé or apply, and I'll confirm with you before applying.
						</p>
					</div>
				{/if}

				{#each messages as m (m.id)}
					<div class="flex flex-col {m.role === 'user' ? 'items-end' : 'items-start'}" in:fly={{ y: 6, duration: 160 }}>
						<span class="sr-only">{m.role === 'user' ? 'You' : 'Assistant'} at {timeOf(m.createdAt)}</span>
						{#if m.role === 'user'}
							<div
								class="max-w-[85%] rounded-2xl bg-surface-overlay px-4 py-2.5 text-[15px] leading-[1.7] whitespace-pre-wrap text-text-primary break-words"
							>
								{m.content}
							</div>
						{:else}
							<div class="w-full text-[15px] leading-[1.7] text-text-secondary break-words">
								{@html renderChatMarkdown(m.content)}
							</div>
						{/if}

						{#if m.attachments?.length}
							<div class="mt-2.5 flex w-full flex-col gap-1.5">
								{#each m.attachments as att (att.id)}
									<a
										href={chatAttachmentUrl(att.id)}
										target="_blank"
										rel="noreferrer"
										download={att.filename}
										class="group/att flex max-w-sm items-center gap-2.5 rounded-lg border border-border-default bg-surface-raised px-3 py-2.5 transition-colors duration-150 hover:border-border-strong hover:bg-surface-overlay focus-visible:outline-none"
									>
										<FileText size={16} strokeWidth={1.75} class="flex-shrink-0 text-text-muted" aria-hidden="true" />
										<span class="min-w-0 flex-1">
											<span class="block truncate text-[13px] text-text-primary">{att.filename}</span>
											<span class="block text-[11px] text-text-faint">{formatSize(att.size)}</span>
										</span>
										<Download
											size={14}
											strokeWidth={1.75}
											class="flex-shrink-0 text-text-faint transition-colors group-hover/att:text-text-secondary"
											aria-hidden="true"
										/>
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{/each}

				{#if busy}
					<div class="flex items-center gap-2" in:fade={{ duration: 120 }}>
						<span class="activity-pulse-dot h-2 w-2 rounded-full bg-accent-500"></span>
						<span class="text-[13px] text-text-muted">Assistant is working…</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Composer -->
		<div class="flex-shrink-0 px-4 pt-2 pb-5 md:px-6 lg:px-8">
			<div class="mx-auto w-full max-w-4xl">
				<div
					class="flex items-end gap-2 rounded-2xl border border-border-default bg-surface-raised px-3.5 py-2.5 transition-colors duration-150 focus-within:border-border-strong"
				>
					<textarea
						bind:this={composer}
						bind:value={draft}
						onkeydown={onInputKeydown}
						rows="1"
						placeholder="Ask anything, or paste a job link…"
						aria-label="Message the assistant"
						class="max-h-40 min-h-[28px] flex-1 resize-none overflow-y-auto bg-transparent py-0.5 text-[15px] leading-[1.6] text-text-primary placeholder:text-text-placeholder focus:outline-none focus-visible:!outline-none"
					></textarea>
					<button
						type="button"
						class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent-500 text-accent-text transition-colors duration-150 hover:bg-accent-600 disabled:cursor-default disabled:opacity-40"
						onclick={send}
						disabled={sending || busy || !draft.trim()}
						aria-label="Send message"
					>
						<ArrowUp size={16} strokeWidth={2.25} aria-hidden="true" />
					</button>
				</div>
				<p class="mt-2 text-center text-[11px] text-text-faint">
					Enter to send, Shift+Enter for a new line. The assistant confirms before applying.
				</p>
			</div>
		</div>
	</section>
</div>
