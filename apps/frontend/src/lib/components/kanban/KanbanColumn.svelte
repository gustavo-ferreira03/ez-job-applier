<script lang="ts">
	import KanbanCard from './KanbanCard.svelte';
	import Inbox from '@lucide/svelte/icons/inbox';
	import MoreHorizontal from '@lucide/svelte/icons/ellipsis';
	import Plus from '@lucide/svelte/icons/plus';
	import type { JobSummary, KanbanColumn as KanbanColumnDef, KanbanTab } from '$lib/types';

	interface Props {
		column: KanbanColumnDef;
		jobs: JobSummary[];
		onOpenJob: (job: JobSummary, tab: KanbanTab) => void;
		onRejectAll?: (column: KanbanColumnDef) => void;
		onSubmitAll?: () => void;
		onRetryAll?: () => void;
		onAdd?: () => void;
	}

	let { column, jobs, onOpenJob, onRejectAll, onSubmitAll, onRetryAll, onAdd }: Props = $props();
	let menuOpen = $state(false);
	let menuClosing = $state(false);
	let menuStyle = $state('');
	let menuButtonRef = $state<HTMLButtonElement | null>(null);
	let menuRef = $state<HTMLElement | null>(null);
	let closeTimer: ReturnType<typeof setTimeout> | null = null;

	const CLOSE_MS = 130;

	function positionMenu() {
		if (!menuButtonRef) return;
		const rect = menuButtonRef.getBoundingClientRect();
		const right = Math.max(8, window.innerWidth - rect.right);
		const top = Math.min(rect.bottom + 4, window.innerHeight - 96);
		menuStyle = `top: ${top}px; right: ${right}px;`;
	}

	function openMenu() {
		if (closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}
		positionMenu();
		menuClosing = false;
		menuOpen = true;
	}

	function closeMenu() {
		if (!menuOpen) return;
		menuOpen = false;
		menuClosing = true;
		closeTimer = setTimeout(() => {
			menuClosing = false;
		}, CLOSE_MS);
	}

	function handleRejectAll() {
		closeMenu();
		onRejectAll?.(column);
	}

	function handleSubmitAll() {
		closeMenu();
		onSubmitAll?.();
	}

	function handleRetryAll() {
		closeMenu();
		onRetryAll?.();
	}

	function handleWindowClick(e: MouseEvent) {
		if ((menuOpen || menuClosing) && menuRef && !menuRef.contains(e.target as Node)) {
			closeMenu();
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div
	class="flex h-full min-h-0 w-[calc(100vw-2rem)] shrink-0 flex-col rounded-lg border border-border-subtle bg-surface-overlay/30 sm:w-65 {column.columnClass ??
		''}"
>
	<div class="flex shrink-0 items-center justify-between px-2 pt-2 pb-2">
		<span class="text-xs font-semibold tracking-wide uppercase {column.headerClass}">
			{column.title}
		</span>
		<div class="flex min-h-6 items-center gap-1.5">
			<span class="text-xs text-text-muted">{jobs.length}</span>
			{#if column.canAdd}
				<button
					type="button"
					class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-faint transition-colors duration-150 hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
					aria-label="Add job by link"
					onclick={() => onAdd?.()}
				>
					<Plus size={14} aria-hidden="true" />
				</button>
			{/if}
			{#if column.canRejectAll || column.canRetryAll || column.canSubmitAll}
				<div class="relative" bind:this={menuRef}>
					<button
						bind:this={menuButtonRef}
						type="button"
						class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-faint transition-colors duration-150 hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
						aria-label="Actions"
						onclick={() => {
							if (menuOpen) closeMenu();
							else openMenu();
						}}
					>
						<MoreHorizontal size={14} aria-hidden="true" />
					</button>
					<div
						class="t-dropdown z-modal fixed w-40 rounded-md border border-border-default bg-surface-raised p-1 shadow-[var(--shadow-modal)]"
						style={menuStyle}
						class:is-open={menuOpen}
						class:is-closing={menuClosing}
					>
						{#if column.canRetryAll}
							<button
								type="button"
								class="w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm text-text-muted transition-colors duration-150 hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none"
								onclick={handleRetryAll}
							>
								Retry all
							</button>
						{/if}
						{#if column.canSubmitAll}
							<button
								type="button"
								class="w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm text-text-muted transition-colors duration-150 hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none"
								onclick={handleSubmitAll}
							>
								Submit all
							</button>
						{/if}
						{#if column.canRejectAll}
							<button
								type="button"
								class="w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm text-text-muted transition-colors duration-150 hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none"
								onclick={handleRejectAll}
							>
								Reject all
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="flex flex-1 flex-col gap-2 overflow-y-auto px-1 pb-2">
		{#each jobs as job (job.id)}
			<KanbanCard {job} defaultTab={column.defaultTab} onOpen={onOpenJob} />
		{/each}

		{#if jobs.length === 0}
			<div
				class="t-empty-state mt-4 flex min-h-16 flex-col items-center justify-center gap-2 px-3 text-text-faint/80 select-none"
				aria-label={`${column.title} has no jobs`}
			>
				<Inbox size={16} aria-hidden="true" />
				<span class="text-[12px] font-medium whitespace-nowrap">No jobs found</span>
			</div>
		{/if}
	</div>
</div>
