<script lang="ts">
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import logo from '$lib/assets/favicon.svg';
	import type { Page, ExecutionStatus } from '$lib/types';

	interface Props {
		activePage: Page;
		execution: ExecutionStatus;
	onNavigate: (page: Page) => void;
	onStartExecution: () => void;
	onStopExecution: () => void;
	onResumeExecution: () => void;
	onOpenLogin: () => void;
	onOpenBrowser: () => void;
}

	let {
		activePage,
		execution,
	onNavigate,
	onStartExecution,
	onStopExecution,
	onResumeExecution,
	onOpenLogin,
	onOpenBrowser
}: Props = $props();

	function fmtCountdown(isoStr: string): string {
		const secs = Math.max(0, Math.round((new Date(isoStr).getTime() - Date.now()) / 1000));
		const m = Math.floor(secs / 60),
			s = secs % 60;
		return m > 0 ? `${m}m ${s}s` : `${s}s`;
	}

	const navItems: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
		{ page: 'pipeline', label: 'Pipeline', icon: LayoutDashboard },
		{ page: 'configuracoes', label: 'Settings', icon: Settings }
	];
</script>

<aside
	class="flex w-full flex-shrink-0 flex-col border-b border-border-subtle bg-surface-sidebar md:h-full md:w-56 md:border-r md:border-b-0"
>
	<!-- Logo -->
	<div
		class="flex h-12 flex-shrink-0 items-center gap-1 border-b border-border-subtle px-3.5 select-none md:h-14"
	>
		<img src={logo} alt="" class="h-5 w-5 shrink-0" aria-hidden="true" />
		<span class="text-sm font-bold tracking-tight text-text-primary">
			JobApplier
		</span>
	</div>

	<!-- Nav -->
	<nav
		class="flex gap-1 overflow-x-auto p-2 md:flex-1 md:flex-col md:gap-0.5 md:overflow-y-auto"
		aria-label="Main navigation"
	>
		{#each navItems as item (item.page)}
			<button
				type="button"
				class="flex min-w-max cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-100 focus-visible:outline-none md:w-full
					{activePage === item.page
					? 'bg-surface-overlay text-text-primary'
					: 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'}"
				onclick={() => onNavigate(item.page)}
			>
				<item.icon
					size={15}
					strokeWidth={activePage === item.page ? 2.25 : 1.75}
					aria-hidden="true"
				/>
				{item.label}
			</button>
		{/each}
	</nav>

	<!-- Execution -->
	<div class="flex flex-shrink-0 gap-1.5 border-t border-border-subtle p-2 md:flex-col">
		{#if execution.active}
			{#if execution.actionNeeded}
				<button
					type="button"
					class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-status-input-bg px-2.5 py-2 text-[13px] font-semibold text-status-input-text transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none md:w-full"
					onclick={onOpenLogin}
					title="Open login panel"
				>
					<span class="activity-pulse-dot h-1.5 w-1.5 rounded-full bg-status-input-text"></span>
					Login required
				</button>
			{:else if execution.running}
				<button
					type="button"
					class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-execution-bg px-2.5 py-2 text-[13px] font-semibold text-execution-text transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none disabled:cursor-default disabled:hover:opacity-100 md:w-full"
					onclick={execution.vncSessionId ? onOpenBrowser : undefined}
					disabled={!execution.vncSessionId}
					title={execution.vncSessionId ? 'Open LinkedIn browser' : 'Running headless'}
				>
					<span class="activity-pulse-dot h-1.5 w-1.5 rounded-full bg-execution-text"></span>
					Running
				</button>
			{:else if execution.paused}
				<button
					type="button"
					class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-status-input-bg px-2.5 py-2 text-[13px] font-semibold text-status-input-text transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none md:w-full"
					onclick={onResumeExecution}
					title="Resume"
				>
					<span class="h-1.5 w-1.5 rounded-full bg-status-input-text"></span>
					Paused
				</button>
			{:else if execution.nextRunAt}
				<button
					type="button"
					class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-surface-overlay px-2.5 py-2 text-[13px] font-medium text-text-muted transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-none md:w-full"
					onclick={onStopExecution}
					title="Waiting for next cycle"
				>
					<span class="h-1.5 w-1.5 rounded-full bg-border-strong"></span>
					{fmtCountdown(execution.nextRunAt)}
				</button>
			{:else}
				<button
					type="button"
					class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-surface-overlay px-2.5 py-2 text-[13px] font-medium text-text-muted focus-visible:outline-none md:w-full"
					disabled
				>
					<span class="h-1.5 w-1.5 rounded-full bg-border-strong"></span>
					Starting...
				</button>
			{/if}
			<button
				type="button"
				class="flex flex-1 cursor-pointer items-center justify-center rounded-md border border-danger-border bg-danger-bg px-2.5 py-1.5 text-xs font-medium text-danger-500 transition-colors duration-150 hover:bg-danger-500/10 focus-visible:outline-none md:w-full"
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
