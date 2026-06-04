<script lang="ts">
	import { fade } from 'svelte/transition';
	import KanbanCard from './KanbanCard.svelte';
	import MoreHorizontal from '@lucide/svelte/icons/ellipsis';
	import { menuTransition } from '$lib/transitions';
	import type { JobSummary, KanbanColumn as KanbanColumnDef, KanbanTab } from '$lib/types';

	interface Props {
		column: KanbanColumnDef;
		jobs: JobSummary[];
		onOpenJob: (job: JobSummary, tab: KanbanTab) => void;
		onRejectAll?: (column: KanbanColumnDef) => void;
		onSubmitAll?: () => void;
	}

	let { column, jobs, onOpenJob, onRejectAll, onSubmitAll }: Props = $props();
	let menuOpen = $state(false);
	let menuClosing = $state(false);
	let menuRef = $state<HTMLElement | null>(null);
	let closeTimer: ReturnType<typeof setTimeout> | null = null;

	const CLOSE_MS = 130;

	function openMenu() {
		if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
		menuClosing = false;
		menuOpen = true;
	}

	function closeMenu() {
		if (!menuOpen) return;
		menuOpen = false;
		menuClosing = true;
		closeTimer = setTimeout(() => { menuClosing = false; }, CLOSE_MS);
	}

	function handleRejectAll() {
		closeMenu();
		onRejectAll?.(column);
	}

	function handleSubmitAll() {
		closeMenu();
		onSubmitAll?.();
	}

	function handleWindowClick(e: MouseEvent) {
		if ((menuOpen || menuClosing) && menuRef && !menuRef.contains(e.target as Node)) {
			closeMenu();
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div class="flex h-full min-h-0 w-65 flex-col shrink-0 rounded-lg border border-border-subtle bg-surface-overlay/30 {column.columnClass ?? ''}">
	<div class="flex items-center justify-between shrink-0 px-2 pb-2 pt-2">
		<span class="text-xs font-semibold uppercase tracking-wide {column.headerClass}">
			{column.title}
		</span>
		<div class="flex items-center gap-1.5">
			<span class="text-xs text-text-muted">{jobs.length}</span>
			{#if column.canRejectAll}
				<div class="relative" bind:this={menuRef}>
					<button
						type="button"
						class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-faint transition-colors duration-150 hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
						aria-label="Actions"
						onclick={() => { menuOpen ? closeMenu() : openMenu(); }}
					>
						<MoreHorizontal size={14} aria-hidden="true" />
					</button>
					<div
						class="t-dropdown absolute right-0 z-20 mt-1 w-40 rounded-md border border-border-default bg-surface-raised p-1 shadow-[var(--shadow-modal)]"
						class:is-open={menuOpen}
						class:is-closing={menuClosing}
					>
						{#if column.canSubmitAll}
							<button
								type="button"
								class="w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm text-text-muted transition-colors duration-150 hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none"
								onclick={handleSubmitAll}
							>
								Submit all
							</button>
						{/if}
						<button
							type="button"
							class="w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm text-text-muted transition-colors duration-150 hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none"
							onclick={handleRejectAll}
						>
							Reject all
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="flex flex-1 flex-col gap-2 overflow-y-auto px-1 pb-2">
		{#each jobs as job (job.id)}
			<KanbanCard {job} defaultTab={column.defaultTab} onOpen={onOpenJob} />
		{/each}
	</div>
</div>
