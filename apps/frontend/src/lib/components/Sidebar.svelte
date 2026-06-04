<script lang="ts">
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import List from '@lucide/svelte/icons/list';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import type { Page, ExecutionStatus } from '$lib/types';

	interface Props {
		activePage: Page;
		execution: ExecutionStatus;
		onNavigate: (page: Page) => void;
		onStartExecution: () => void;
		onStopExecution: () => void;
		onPauseExecution: () => void;
		onResumeExecution: () => void;
		onOpenLogin: () => void;
	}

	let { activePage, execution, onNavigate, onStartExecution, onStopExecution, onPauseExecution, onResumeExecution, onOpenLogin }: Props = $props();

	function fmtCountdown(isoStr: string): string {
		const secs = Math.max(0, Math.round((new Date(isoStr).getTime() - Date.now()) / 1000));
		const m = Math.floor(secs / 60), s = secs % 60;
		return m > 0 ? `${m}m ${s}s` : `${s}s`;
	}

	const navItems: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
		{ page: 'pipeline',      label: 'Pipeline',      icon: LayoutDashboard },
		{ page: 'tabela',        label: 'Table',         icon: List },
		{ page: 'discoveries',   label: 'Searches',      icon: Search },
		{ page: 'configuracoes', label: 'Settings',      icon: Settings }
	];
</script>

<aside class="flex h-full w-56 flex-shrink-0 flex-col border-r border-border-subtle bg-surface-sidebar">
	<!-- Logo -->
	<div class="flex h-14 flex-shrink-0 items-center border-b border-border-subtle px-4">
		<span class="text-sm font-extrabold tracking-tight text-text-primary">
			<span class="text-accent-500">EZ</span>JobApplier
		</span>
	</div>

	<!-- Nav -->
	<nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Main navigation">
		{#each navItems as item (item.page)}
			<button
				type="button"
				class="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-100 focus-visible:outline-none
					{activePage === item.page
						? 'bg-surface-overlay text-text-primary'
						: 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'}"
				onclick={() => onNavigate(item.page)}
			>
				<item.icon size={15} strokeWidth={activePage === item.page ? 2.25 : 1.75} aria-hidden="true" />
				{item.label}
			</button>
		{/each}
	</nav>

	<!-- Execution -->
	<div class="flex flex-shrink-0 flex-col gap-1.5 border-t border-border-subtle p-2">
		{#if execution.active}
			{#if execution.actionNeeded}
				<button
					type="button"
					class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-status-input-bg px-2.5 py-2 text-[13px] font-semibold text-status-input-text transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none"
					onclick={onOpenLogin}
					title="Open login panel"
				>
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-status-input-text"></span>
					Login required
				</button>
			{:else if execution.running}
				<button
					type="button"
					class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-execution-bg px-2.5 py-2 text-[13px] font-semibold text-execution-text transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none"
					onclick={onPauseExecution}
					title="Pause"
				>
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-execution-text"></span>
					Running
				</button>
			{:else if execution.paused}
				<button
					type="button"
					class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-status-input-bg px-2.5 py-2 text-[13px] font-semibold text-status-input-text transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none"
					onclick={onResumeExecution}
					title="Resume"
				>
					<span class="h-1.5 w-1.5 rounded-full bg-status-input-text"></span>
					Paused
				</button>
			{:else if execution.nextRunAt}
				<button
					type="button"
					class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-surface-overlay px-2.5 py-2 text-[13px] font-medium text-text-muted transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-none"
					onclick={onStopExecution}
					title="Waiting for next cycle"
				>
					<span class="h-1.5 w-1.5 rounded-full bg-border-strong"></span>
					{fmtCountdown(execution.nextRunAt)}
				</button>
			{:else}
				<button
					type="button"
					class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-surface-overlay px-2.5 py-2 text-[13px] font-medium text-text-muted focus-visible:outline-none"
					disabled
				>
					<span class="h-1.5 w-1.5 rounded-full bg-border-strong"></span>
					Starting...
				</button>
			{/if}
			<button
				type="button"
				class="flex w-full cursor-pointer items-center justify-center rounded-md border border-danger-border bg-danger-bg px-2.5 py-1.5 text-xs font-medium text-danger-500 transition-colors duration-150 hover:bg-danger-500/10 focus-visible:outline-none"
				onclick={onStopExecution}
			>
				Stop execution
			</button>
		{:else}
			<button
				type="button"
				class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-accent-500 px-2.5 py-2 text-[13px] font-semibold text-accent-text transition-colors duration-150 hover:bg-accent-600 focus-visible:outline-none"
				onclick={onStartExecution}
			>
				<Search size={13} strokeWidth={2.25} aria-hidden="true" />
				Start execution
			</button>
		{/if}
	</div>
</aside>
