<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { tick } from 'svelte';
	import { modalTransition } from '$lib/transitions';
	import { trapFocus } from '$lib/focusTrap';
	import { appState } from '$lib/state.svelte';
	import { sendExternalApplyMessage, stopExternalApply, resumeExternalApply } from '$lib/api';
	import { toastState } from '$lib/toast.svelte';
	import { renderChatMarkdown } from '$lib/chatMarkdown';
	import X from '@lucide/svelte/icons/x';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Square from '@lucide/svelte/icons/square';

	interface Props {
		jobId: number;
		onClose: () => void;
	}

	let { jobId, onClose }: Props = $props();

	const status = $derived(
		appState.externalApply.sessions.find((session) => session.jobId === jobId) ?? {
			active: false,
			jobId,
			title: 'External application',
			vncSessionId: null,
			phase: 'idle' as const,
			suspended: false,
			messages: []
		}
	);
	const messages = $derived(status.messages);

	let draft = $state('');
	let sending = $state(false);
	let stopping = $state(false);
	let resuming = $state(false);
	let resumeAttempted = $state(false);
	let scroller = $state<HTMLDivElement>();
	let composer = $state<HTMLTextAreaElement>();
	let stickToBottom = $state(true);
	let mobilePane = $state<'browser' | 'chat'>('browser');

	const needsAttention = $derived(status.phase === 'waiting' || status.phase === 'review');

	$effect(() => {
		if (needsAttention) mobilePane = 'chat';
	});

	const QUICK_REPLIES = ['Continue', 'Submit it', 'Looks good'];

	const phaseLabel = $derived(
		(
			{
				working: 'Working',
				waiting: 'Waiting',
				review: 'Review',
				submitted: 'Submitted',
				failed: 'Stopped',
				idle: 'Idle'
			} as const
		)[status.phase]
	);

	const phaseClass = $derived(
		(
			{
				working: 'bg-execution-bg text-execution-text',
				waiting: 'bg-status-input-bg text-status-input-text',
				review: 'bg-status-review-bg text-status-review-text',
				submitted: 'bg-status-submitted-bg text-status-submitted-text',
				failed: 'bg-status-failed-bg text-status-failed-text',
				idle: 'bg-surface-hover text-text-muted'
			} as const
		)[status.phase]
	);

	$effect(() => {
		void messages.length;
		void status.phase;
		void mobilePane;
		if (!stickToBottom) return;
		tick().then(() => {
			if (scroller) scroller.scrollTop = scroller.scrollHeight;
		});
	});

	function onScroll() {
		if (!scroller) return;
		stickToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
	}

	$effect(() => {
		void draft;
		tick().then(resizeComposer);
	});

	function resizeComposer() {
		if (!composer) return;
		composer.style.height = 'auto';
		composer.style.height = `${Math.min(composer.scrollHeight, 112)}px`;
	}

	async function send(text: string) {
		const value = text.trim();
		if (!value || sending) return;
		sending = true;
		try {
			await sendExternalApplyMessage(jobId, value);
			draft = '';
			await tick();
			resizeComposer();
			await appState.refreshExternalApply();
		} catch (e) {
			toastState.show(e instanceof Error ? e.message : String(e), 'error');
		} finally {
			sending = false;
		}
	}

	async function resume() {
		if (resuming) return;
		resuming = true;
		try {
			await resumeExternalApply(jobId);
			await appState.refreshExternalApply();
		} catch (e) {
			toastState.show(e instanceof Error ? e.message : String(e), 'error');
		} finally {
			resuming = false;
		}
	}

	$effect(() => {
		if (status.active && status.suspended && !resumeAttempted && !resuming) {
			resumeAttempted = true;
			void resume();
		}
	});

	async function stop() {
		stopping = true;
		try {
			await stopExternalApply(jobId);
			await appState.refreshExternalApply();
		} catch (e) {
			toastState.show(e instanceof Error ? e.message : String(e), 'error');
		} finally {
			stopping = false;
		}
	}

	function onInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send(draft);
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	function timeOf(ts: number): string {
		return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

</script>

<svelte:window onkeydown={onKeydown} />

<div class="z-modal fixed inset-0 flex items-stretch justify-center bg-black/70 p-0 sm:items-center sm:p-4">
	<button class="absolute inset-0 cursor-default" type="button" aria-label="Close" onclick={onClose}
	></button>

	<div
		class="external-apply-dialog relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden border border-border-default bg-surface-raised shadow-[var(--shadow-modal)] sm:h-[min(820px,92vh)] sm:w-[min(1240px,96vw)] sm:rounded-lg"
		role="dialog"
		aria-modal="true"
		aria-label="Agent application session"
		tabindex="-1"
		use:trapFocus={{ onEscape: onClose, initialFocus: 'container' }}
		transition:fly={modalTransition}
	>
		<!-- Header -->
		<header
			class="flex flex-shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3"
		>
			<div class="min-w-0 flex-1">
				<div class="flex min-w-0 items-center gap-2">
					<h2 class="min-w-0 truncate text-[13px] font-semibold text-text-primary">
						{status.title ?? 'External application'}
					</h2>
					<span
						class="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium {phaseClass}"
					>
						{phaseLabel}
					</span>
				</div>
				<p class="hidden text-[11px] text-text-muted sm:block">
					Watch the agent fill the form. Take over the browser any time, or steer it in chat.
				</p>
			</div>
			{#if status.active}
				<button
					type="button"
					class="flex h-7 items-center gap-1.5 rounded-md border border-danger-border bg-danger-bg px-2.5 text-xs font-medium text-danger-500 transition-colors hover:bg-surface-overlay disabled:opacity-50"
					onclick={stop}
					disabled={stopping}
				>
					<Square size={11} fill="currentColor" />
					Stop
				</button>
			{/if}
			<button
				type="button"
				class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-faint hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
				onclick={onClose}
				aria-label="Close"
			>
				<X size={14} />
			</button>
		</header>

		<div class="flex-shrink-0 border-b border-border-subtle bg-surface-raised px-3 py-2 md:hidden">
			<div
				class="flex gap-1 rounded-lg border border-border-subtle bg-surface-sidebar p-1"
				role="tablist"
				aria-label="Agent session panes"
			>
				<button
					type="button"
					role="tab"
					aria-selected={mobilePane === 'browser'}
					class="min-w-0 flex-1 cursor-pointer rounded-md px-3 py-2 text-center transition-colors duration-150 focus-visible:outline-none {mobilePane ===
					'browser'
						? 'bg-surface-hover text-text-primary shadow-[inset_0_0_0_1px_var(--color-border-default)]'
						: 'text-text-muted hover:bg-surface-overlay hover:text-text-secondary'}"
					onclick={() => {
						mobilePane = 'browser';
					}}
				>
					<span class="block truncate text-[12px] font-semibold">Browser</span>
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={mobilePane === 'chat'}
					class="min-w-0 flex-1 cursor-pointer rounded-md px-3 py-2 text-center transition-colors duration-150 focus-visible:outline-none {mobilePane ===
					'chat'
						? 'bg-surface-hover text-text-primary shadow-[inset_0_0_0_1px_var(--color-border-default)]'
						: 'text-text-muted hover:bg-surface-overlay hover:text-text-secondary'}"
					onclick={() => {
						mobilePane = 'chat';
					}}
				>
					<span class="flex items-center justify-center gap-1.5 truncate text-[12px] font-semibold">
						Chat
						{#if needsAttention}
							<span class="h-1.5 w-1.5 rounded-full bg-status-input-text" aria-hidden="true"></span>
						{/if}
					</span>
				</button>
			</div>
		</div>

		<!-- Body: browser + chat -->
		<div class="flex min-h-0 flex-1 flex-col md:flex-row">
			<!-- Live browser -->
			<div class="min-h-0 flex-1 bg-black md:border-r md:border-border-subtle {mobilePane === 'browser' ? 'block' : 'hidden'} md:block">
				{#if status.active && status.suspended}
					<div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
						<p class="text-[12px] text-text-faint">
							{resuming
								? 'Reopening the browser where it left off...'
								: 'Paused to save resources while waiting for you. The progress was saved.'}
						</p>
						{#if !resuming}
							<button
								type="button"
								class="rounded-md bg-accent-500 px-3 py-1.5 text-[12px] font-medium text-accent-text transition-colors hover:bg-accent-600"
								onclick={resume}
							>
								Resume browser
							</button>
						{/if}
					</div>
				{:else if status.active && status.vncSessionId}
					<iframe class="h-full w-full border-0" src={`/vnc?session=${encodeURIComponent(status.vncSessionId)}`} title="Agent browser"></iframe>
				{:else if status.active}
					<div class="flex h-full items-center justify-center px-6 text-center text-[12px] text-text-faint">
						Starting isolated browser session…
					</div>
				{:else}
					<div class="flex h-full items-center justify-center px-6 text-center text-[12px] text-text-faint">
						The browser session has ended. The conversation remains in the chat.
					</div>
				{/if}
			</div>

			<!-- Chat rail -->
			<aside
				class="min-h-0 flex-1 flex-col bg-surface-sidebar {mobilePane === 'chat' ? 'flex' : 'hidden'} md:flex md:h-auto md:w-[360px] md:flex-none"
			>
				<div bind:this={scroller} onscroll={onScroll} class="flex-1 space-y-3 overflow-y-auto px-3.5 py-4">
					{#if messages.length === 0}
						<p class="px-1 pt-6 text-center text-[12px] text-text-faint">
							The agent will report progress here.
						</p>
					{/if}
					{#each messages as m (m.id)}
						<div
							class="flex flex-col {m.role === 'user' ? 'items-end' : 'items-start'}"
							in:fly={{ y: 6, duration: 160 }}
						>
							<div
								class="chat-rich max-w-[88%] rounded-lg px-3 py-2 text-[12.5px] leading-relaxed break-words {m.role ===
								'user'
									? 'bg-surface-hover text-text-primary'
									: 'bg-surface-overlay text-text-secondary'}"
							>
								{@html renderChatMarkdown(m.text)}
							</div>
							<span class="mt-1 px-1 text-[10px] text-text-faint">
								{m.role === 'user' ? 'You' : 'Agent'} · {timeOf(m.ts)}
							</span>
						</div>
					{/each}
					{#if status.phase === 'working'}
						<div class="flex items-center gap-1.5 px-1 pt-1" in:fade={{ duration: 120 }}>
							<span class="activity-pulse-dot h-1.5 w-1.5 rounded-full bg-accent-500"></span>
							<span class="text-[11px] text-text-muted">Agent is working…</span>
						</div>
					{/if}
				</div>

				<!-- Composer -->
				<div class="flex-shrink-0 border-t border-border-subtle p-2.5">
					{#if status.active}
						<div class="mb-2 flex flex-wrap gap-1.5">
							{#each QUICK_REPLIES as reply (reply)}
								<button
									type="button"
									class="rounded-full border border-border-default bg-surface-overlay px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary disabled:opacity-40"
									onclick={() => send(reply)}
									disabled={sending}
								>
									{reply}
								</button>
							{/each}
						</div>
					{/if}
					<div
						class="flex items-end gap-2 rounded-md border border-border-default bg-surface-base px-2.5 py-1.5 focus-within:border-border-strong"
					>
						<textarea
							bind:this={composer}
							class="max-h-28 min-h-[24px] flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[12.5px] text-text-primary placeholder:text-text-placeholder focus:outline-none focus-visible:!outline-none"
							rows="1"
							placeholder={status.active ? 'Tell the agent how to proceed…' : 'No active session'}
							bind:value={draft}
							oninput={resizeComposer}
							onkeydown={onInputKeydown}
							disabled={!status.active || sending}
						></textarea>
						<button
							type="button"
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-500 text-accent-text transition-colors hover:bg-accent-600 disabled:opacity-40"
							onclick={() => send(draft)}
							disabled={!status.active || sending || !draft.trim()}
							aria-label="Send message"
						>
							<ArrowUp size={15} />
						</button>
					</div>
				</div>
			</aside>
		</div>
	</div>
</div>

<style>
	@media (max-width: 639px) {
		.external-apply-dialog {
			padding-top: env(safe-area-inset-top);
			padding-right: env(safe-area-inset-right);
			padding-bottom: env(safe-area-inset-bottom);
			padding-left: env(safe-area-inset-left);
		}
	}

	.chat-rich :global(p + p),
	.chat-rich :global(p + ul),
	.chat-rich :global(p + ol),
	.chat-rich :global(ul + p),
	.chat-rich :global(ol + p),
	.chat-rich :global(pre + p) {
		margin-top: 0.5rem;
	}

	.chat-rich :global(ul),
	.chat-rich :global(ol) {
		margin: 0.35rem 0 0;
		padding-left: 1rem;
	}

	.chat-rich :global(ul) {
		list-style: disc;
	}

	.chat-rich :global(ol) {
		list-style: decimal;
	}

	.chat-rich :global(li + li) {
		margin-top: 0.2rem;
	}

	.chat-rich :global(strong) {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.chat-rich :global(em) {
		color: var(--color-text-primary);
		font-style: italic;
	}

	.chat-rich :global(a) {
		color: var(--color-accent-500);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.chat-rich :global(code) {
		border-radius: 0.25rem;
		background: var(--color-surface-base);
		padding: 0.05rem 0.25rem;
		font-size: 0.92em;
		color: var(--color-text-primary);
	}

	.chat-rich :global(pre) {
		margin-top: 0.5rem;
		max-width: 100%;
		overflow-x: auto;
		border-radius: 0.375rem;
		background: var(--color-surface-base);
		padding: 0.5rem;
	}

	.chat-rich :global(pre code) {
		background: transparent;
		padding: 0;
	}

</style>
