<script lang="ts">
	import { fly } from 'svelte/transition';
	import { modalTransition } from '$lib/transitions';
	import type { KanbanColumn } from '$lib/types';

	interface Props {
		column: KanbanColumn;
		rejectableCount: number;
		rejecting: boolean;
		onConfirm: () => void;
		onClose: () => void;
	}

	let { column, rejectableCount, rejecting, onConfirm, onClose }: Props = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="fixed inset-0 z-modal flex items-center justify-center bg-black/70 p-4">
	<button
		class="absolute inset-0 cursor-default"
		type="button"
		aria-label="Cancel"
		onclick={onClose}
	></button>

	<div
		class="relative z-10 w-[min(420px,100%)] rounded-lg border border-border-default bg-surface-raised p-4 shadow-[var(--shadow-modal)]"
		role="dialog"
		aria-modal="true"
		aria-label="Reject jobs"
		tabindex="-1"
		transition:fly={modalTransition}
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<h2 class="text-base font-semibold text-text-primary">Reject all</h2>
		<p class="mt-2 text-sm text-text-muted">
			You are about to reject {rejectableCount} {rejectableCount === 1 ? 'job' : 'jobs'} in {column.title}.
		</p>
		{#if rejectableCount === 0}
			<p class="mt-2 text-[13px] text-text-faint">There are no rejectable jobs in this column right now.</p>
		{/if}
		<div class="mt-4 flex justify-end gap-2">
			<button
				type="button"
				class="h-8 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-3 text-sm font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none"
				onclick={onClose}
			>
				Cancel
			</button>
			<button
				type="button"
				class="h-8 cursor-pointer rounded-md bg-[#b91c1c] px-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#991b1b] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
				disabled={rejecting || rejectableCount === 0}
				onclick={onConfirm}
			>
				{rejecting ? 'Rejecting...' : `Reject ${rejectableCount} ${rejectableCount === 1 ? 'job' : 'jobs'}`}
			</button>
		</div>
	</div>
</div>
