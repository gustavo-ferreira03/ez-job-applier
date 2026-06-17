<script lang="ts">
	import { fly } from 'svelte/transition';
	import { modalTransition } from '$lib/transitions';
	import { trapFocus } from '$lib/focusTrap';
	import { appState } from '$lib/state.svelte';
	import { decideExternalApply } from '$lib/api';
	import { toastState } from '$lib/toast.svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let submitting = $state(false);

	const status = $derived(appState.externalApply);

	async function decide(decision: 'approve' | 'reject') {
		submitting = true;
		try {
			await decideExternalApply(decision);
			await appState.refreshExternalApply();
		} catch (e) {
			toastState.show(e instanceof Error ? e.message : String(e), 'error');
		} finally {
			submitting = false;
		}
	}
</script>

<div class="z-modal fixed inset-0 flex items-start justify-center bg-black/70 p-4">
	<button class="absolute inset-0 cursor-default" type="button" aria-label="Close" onclick={onClose}
	></button>

	<div
		class="relative z-10 mt-8 flex w-[min(900px,100%)] flex-col rounded-lg border border-border-default bg-surface-raised pb-1 shadow-[var(--shadow-modal)]"
		style="max-height: calc(100vh - 80px)"
		role="dialog"
		aria-modal="true"
		aria-label="External application review"
		tabindex="-1"
		use:trapFocus={{ onEscape: onClose }}
		transition:fly={modalTransition}
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<div class="flex flex-shrink-0 items-start justify-between border-b border-border-subtle px-5 py-4">
			<div>
				<h2 class="text-[13px] font-semibold text-text-primary">
					Approval needed{status.title ? ` — ${status.title}` : ''}
				</h2>
				<p class="text-[11px] text-text-muted">
					Review the browser below. You can take over to fix anything, then approve or reject.
				</p>
			</div>
		</div>

		{#if status.summary}
			<div class="flex-shrink-0 border-b border-border-subtle px-5 py-3">
				<p class="text-[12px] leading-relaxed text-text-secondary">{status.summary}</p>
			</div>
		{/if}

		<div class="w-full overflow-hidden bg-black" style="aspect-ratio: 1280/800;">
			<iframe class="h-full w-full border-0" src="/vnc" title="Server browser"></iframe>
		</div>

		<div class="flex flex-shrink-0 items-center justify-end gap-2 px-5 py-3">
			<button
				type="button"
				class="cursor-pointer rounded-md border border-danger-border bg-danger-bg px-3 py-1.5 text-[12px] font-medium text-danger-500 hover:bg-surface-overlay disabled:opacity-50"
				onclick={() => decide('reject')}
				disabled={submitting || !status.awaitingApproval}
			>
				Reject
			</button>
			<button
				type="button"
				class="cursor-pointer rounded-md bg-accent-500 px-3 py-1.5 text-[12px] font-medium text-accent-text hover:bg-accent-600 disabled:opacity-50"
				onclick={() => decide('approve')}
				disabled={submitting || !status.awaitingApproval}
			>
				Approve and continue
			</button>
		</div>
	</div>
</div>
