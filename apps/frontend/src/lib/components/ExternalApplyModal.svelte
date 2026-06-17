<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { tick } from 'svelte';
	import { modalTransition } from '$lib/transitions';
	import { trapFocus } from '$lib/focusTrap';
	import { appState } from '$lib/state.svelte';
	import { sendExternalApplyMessage, stopExternalApply } from '$lib/api';
	import { toastState } from '$lib/toast.svelte';
	import X from '@lucide/svelte/icons/x';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Square from '@lucide/svelte/icons/square';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	const status = $derived(appState.externalApply);
	const messages = $derived(status.messages);

	let draft = $state('');
	let sending = $state(false);
	let stopping = $state(false);
	let scroller = $state<HTMLDivElement>();
	let composer = $state<HTMLTextAreaElement>();

	const QUICK_REPLIES = ['Continue', 'Submit it', 'Looks good'];

	const phaseLabel = $derived(
		(
			{
				working: 'Working',
				waiting: 'Waiting for you',
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
				submitted: 'bg-status-submitted-bg text-status-submitted-text',
				failed: 'bg-danger-bg text-danger-500',
				idle: 'bg-surface-hover text-text-muted'
			} as const
		)[status.phase]
	);

	$effect(() => {
		void messages.length;
		void status.phase;
		tick().then(() => {
			if (scroller) scroller.scrollTop = scroller.scrollHeight;
		});
	});

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
			await sendExternalApplyMessage(value);
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

	async function stop() {
		stopping = true;
		try {
			await stopExternalApply();
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

<div class="z-modal fixed inset-0 flex items-center justify-center bg-black/70 p-4">
	<button class="absolute inset-0 cursor-default" type="button" aria-label="Close" onclick={onClose}
	></button>

	<div
		class="relative z-10 flex max-h-[92vh] w-[min(1640px,96vw)] flex-col overflow-hidden rounded-lg border border-border-default bg-surface-raised shadow-[var(--shadow-modal)]"
		role="dialog"
		aria-modal="true"
		aria-label="Agent application session"
		tabindex="-1"
		use:trapFocus={{ onEscape: onClose }}
		transition:fly={modalTransition}
	>
		<!-- Header -->
		<header
			class="flex flex-shrink-0 items-center gap-3 border-b border-border-subtle px-4 py-3"
		>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h2 class="truncate text-[13px] font-semibold text-text-primary">
						{status.title ?? 'External application'}
					</h2>
					<span class="shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium {phaseClass}">
						{phaseLabel}
					</span>
				</div>
				<p class="text-[11px] text-text-muted">
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

		<!-- Body: browser + chat -->
		<div class="grid min-h-0 overflow-hidden md:grid-cols-[minmax(0,1280px)_360px]">
			<!-- Live browser -->
			<div class="aspect-[1280/800] min-h-0 w-full overflow-hidden bg-black md:border-r md:border-border-subtle">
				{#if status.active}
					<iframe class="h-full w-full border-0" src="/vnc" title="Agent browser"></iframe>
				{:else}
					<div class="flex h-full items-center justify-center px-6 text-center text-[12px] text-text-faint">
						The browser session has ended. The conversation is shown on the right.
					</div>
				{/if}
			</div>

			<!-- Chat rail -->
			<aside
				class="flex h-72 min-h-0 shrink-0 flex-col bg-surface-sidebar md:h-auto md:max-h-[calc(92vh-57px)] md:w-[360px]"
			>
				<div bind:this={scroller} class="flex-1 space-y-3 overflow-y-auto px-3.5 py-4">
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
								class="max-w-[88%] rounded-lg px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words {m.role ===
								'user'
									? 'bg-surface-hover text-text-primary'
									: 'bg-surface-overlay text-text-secondary'}"
							>
								{m.text}
							</div>
							<span class="mt-1 px-1 text-[10px] text-text-faint">
								{m.role === 'user' ? 'You' : 'Agent'} · {timeOf(m.ts)}
							</span>
						</div>
					{/each}
					{#if status.phase === 'working'}
						<div class="flex items-center gap-1.5 px-1 pt-1" in:fade={{ duration: 120 }}>
							<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-500"></span>
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
							class="max-h-28 min-h-[24px] flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[12.5px] text-text-primary placeholder:text-text-placeholder focus:outline-none"
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
