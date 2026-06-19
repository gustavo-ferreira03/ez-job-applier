<script lang="ts">
	import { fly } from 'svelte/transition';
	import { modalTransition } from '$lib/transitions';
	import { trapFocus } from '$lib/focusTrap';

	interface Props {
		reviewCount: number;
		submittingAll: boolean;
		onConfirm: () => void;
		onClose: () => void;
	}

	let { reviewCount, submittingAll, onConfirm, onClose }: Props = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="z-modal fixed inset-0 flex items-center justify-center bg-black/70 p-4">
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
		aria-label="Submit all jobs"
		tabindex="-1"
		use:trapFocus={{ onEscape: onClose }}
		transition:fly={modalTransition}
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<h2 class="text-base font-semibold text-text-primary">Submit all</h2>
		<p class="mt-2 text-sm text-text-muted">
			{#if reviewCount > 0}
				{reviewCount}
				{reviewCount === 1 ? 'job' : 'jobs'} ready for review will be submitted. Agent sessions submit
				right away; the rest are queued for the next execution cycle.
			{:else}
				There are no ready-for-review jobs to submit right now.
			{/if}
		</p>
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
				class="h-8 cursor-pointer rounded-md bg-accent-500 px-3 text-sm font-medium text-accent-text transition-colors duration-150 hover:bg-accent-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
				disabled={submittingAll || reviewCount === 0}
				onclick={onConfirm}
			>
				{submittingAll
					? 'Queueing...'
					: `Submit ${reviewCount} ${reviewCount === 1 ? 'job' : 'jobs'}`}
			</button>
		</div>
	</div>
</div>
