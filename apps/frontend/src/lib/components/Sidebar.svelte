<script lang="ts">
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import List from '@lucide/svelte/icons/list';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import Bot from '@lucide/svelte/icons/bot';
	import type { AutoApplyStatus, Page } from '$lib/types';

	interface Props {
		activePage: Page;
		autoApply: AutoApplyStatus;
		isDiscovering: boolean;
		discoveredCount: number;
		onNavigate: (page: Page) => void;
		onStartDiscovery: () => void;
		onToggleAutoApply: () => void;
		onStopDiscovery: () => void;
	}

	let {
		activePage,
		autoApply,
		isDiscovering,
		discoveredCount,
		onNavigate,
		onStartDiscovery,
		onToggleAutoApply,
		onStopDiscovery
	}: Props = $props();

	const navItems: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
		{ page: 'pipeline',       label: 'Pipeline',       icon: LayoutDashboard },
		{ page: 'tabela',         label: 'Tabela',         icon: List },
		{ page: 'discoveries',    label: 'Buscas',         icon: Search },
		{ page: 'configuracoes',  label: 'Configurações',  icon: Settings }
	];
</script>

<aside class="flex h-full w-[196px] flex-shrink-0 flex-col border-r border-border-subtle bg-surface-sidebar">
	<!-- Logo -->
	<div class="flex h-14 flex-shrink-0 items-center border-b border-border-subtle px-4">
		<span class="text-sm font-extrabold tracking-tight text-text-primary">
			EZ<span class="text-accent-500">Job</span>Applier
		</span>
	</div>

	<!-- Nav -->
	<nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Navegação principal">
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

	<!-- Ações -->
	<div class="flex flex-shrink-0 flex-col gap-1.5 border-t border-border-subtle p-2">
		<!-- Auto-apply -->
		{#if autoApply.running}
			<button
				type="button"
				class="flex w-full cursor-pointer items-center gap-2 rounded-md bg-autoapply-bg px-2.5 py-2 text-[13px] font-semibold text-autoapply-text transition-opacity hover:opacity-80 focus-visible:outline-none"
				title="Clique para parar"
				onclick={onToggleAutoApply}
			>
				<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-autoapply-text"></span>
				Auto-apply ativo
				{#if autoApply.applied > 0}
					<span class="ml-auto text-[11px] opacity-70">{autoApply.applied}</span>
				{/if}
			</button>
		{:else}
			<button
				type="button"
				class="flex w-full cursor-pointer items-center gap-2 rounded-md bg-surface-overlay px-2.5 py-2 text-[13px] font-medium text-text-muted hover:bg-surface-hover hover:text-text-secondary focus-visible:outline-none"
				onclick={onToggleAutoApply}
			>
				<Bot size={14} strokeWidth={1.75} aria-hidden="true" />
				Auto-apply
			</button>
		{/if}

		<!-- Discover -->
		{#if isDiscovering}
			<button
				type="button"
				class="flex w-full cursor-pointer items-center gap-2 rounded-md bg-[#2a2208] px-2.5 py-2 text-[12px] font-semibold text-[#ca8a04] hover:opacity-80 focus-visible:outline-none"
				title="Clique para cancelar"
				onclick={onStopDiscovery}
			>
				<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ca8a04]"></span>
				Descobrindo...
				<span class="ml-auto text-[11px] opacity-70">{discoveredCount}</span>
			</button>
		{:else}
			<button
				type="button"
				class="flex w-full cursor-pointer items-center gap-2 rounded-md bg-accent-500 px-2.5 py-2 text-[13px] font-semibold text-white hover:bg-accent-600 focus-visible:outline-none"
				onclick={onStartDiscovery}
			>
				<Search size={13} strokeWidth={2.25} aria-hidden="true" />
				Nova descoberta
			</button>
		{/if}
	</div>
</aside>
