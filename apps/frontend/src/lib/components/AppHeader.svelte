<script lang="ts">
	import Bot from '@lucide/svelte/icons/bot';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import { cancelDiscovery, startAutoApply, stopAutoApply } from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';

	interface Props {
		onOpenDiscover: () => void;
		onOpenSettings: () => void;
	}

	let { onOpenDiscover, onOpenSettings }: Props = $props();

	const isDiscovering = $derived(appState.discovery?.status === 'running');
	const isAutoApplying = $derived(appState.autoApply.running);

	async function handleStopDiscovery() {
		if (!appState.discovery) return;
		try {
			await cancelDiscovery(appState.discovery.id);
			appState.stopPolling();
			appState.discovery = { ...appState.discovery, status: 'cancelled' };
		} catch {
			toastState.show('Failed to stop discovery');
		}
	}

	async function handleToggleAutoApply() {
		if (isAutoApplying) {
			try {
				await stopAutoApply();
				appState.autoApply = { ...appState.autoApply, running: false };
				appState.stopAutoApplyPolling();
				toastState.show('Auto-apply stopped');
			} catch {
				toastState.show('Failed to stop auto-apply');
			}
		} else {
			try {
				await startAutoApply();
				appState.autoApply = { running: true, applied: 0, failed: 0 };
				appState.startAutoApplyPolling();
				toastState.show('Auto-apply started');
			} catch {
				toastState.show('Failed to start auto-apply');
			}
		}
	}
</script>

<header
	class="flex min-h-14 items-center justify-between gap-4 border-b border-border-subtle bg-surface-raised px-5 max-[640px]:min-h-auto max-[640px]:flex-wrap max-[640px]:py-3"
>
	<!-- Logo -->
	<div
		class="inline-flex items-baseline text-base leading-none font-extrabold tracking-[-0.02em] whitespace-nowrap"
		aria-label="EZJobApplier"
	>
		<span class="text-text-primary">EZ</span><span class="text-brand-500">JobApplier</span>
	</div>

	<!-- Controls -->
	<div class="flex items-center gap-2 max-[640px]:w-full">
		<!-- Auto-apply -->
		{#if isAutoApplying}
			<button
				class="inline-flex min-h-9 cursor-pointer items-center gap-2 border border-success-500/40 bg-success-500/10 px-3 text-[13px] font-bold text-success-400 transition-colors duration-100 hover:bg-success-500/20 focus-visible:outline-0 max-[640px]:flex-1 max-[640px]:justify-center"
				type="button"
				title="Click to stop auto-apply"
				onclick={handleToggleAutoApply}
			>
				<span class="inline-block size-1.5 animate-pulse bg-success-400"></span>
				Auto-applying
				{#if appState.autoApply.applied > 0}
					<span class="text-success-500/70">· {appState.autoApply.applied} done</span>
				{/if}
			</button>
		{:else}
			<button
				class="inline-flex min-h-9 cursor-pointer items-center gap-[6px] border border-border-default bg-surface-overlay px-3 text-[13px] font-bold text-text-secondary transition-colors duration-100 hover:border-border-strong hover:text-text-primary focus-visible:outline-0 max-[640px]:flex-1 max-[640px]:justify-center"
				type="button"
				title="Automatically apply to ready jobs"
				onclick={handleToggleAutoApply}
			>
				<Bot size={14} strokeWidth={2.25} aria-hidden="true" />
				Auto-apply
			</button>
		{/if}

		<!-- Discover / discovering -->
		{#if isDiscovering}
			<button
				class="inline-flex min-h-9 cursor-pointer items-center gap-2 border border-warn-500/40 bg-warn-500/10 px-3 text-[13px] font-bold text-warn-400 transition-colors duration-100 hover:bg-warn-500/20 focus-visible:outline-0 max-[640px]:flex-1 max-[640px]:justify-center"
				type="button"
				title="Click to stop discovery"
				onclick={handleStopDiscovery}
			>
				<span class="inline-block size-1.5 animate-pulse bg-warn-400"></span>
				Discovering
				<span class="text-warn-500/70">· {appState.discovery?.discovered ?? 0} found</span>
			</button>
		{:else}
			<button
				class="inline-flex min-h-9 cursor-pointer items-center gap-[6px] border border-transparent bg-brand-500 px-4 text-[13px] font-bold text-brand-on transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-0 max-[640px]:flex-1 max-[640px]:justify-center"
				type="button"
				onclick={onOpenDiscover}
			>
				<Search size={14} strokeWidth={2.5} aria-hidden="true" />
				Discover
			</button>
		{/if}

		<!-- Settings -->
		<button
			class="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center border border-border-default bg-surface-overlay p-0 text-[#4a6a88] transition-colors duration-100 hover:border-border-strong hover:text-[#7aaac8] focus-visible:outline-0"
			type="button"
			aria-label="Resumes"
			title="Manage resumes"
			onclick={onOpenSettings}
		>
			<Settings size={16} strokeWidth={2.25} aria-hidden="true" />
		</button>
	</div>
</header>
