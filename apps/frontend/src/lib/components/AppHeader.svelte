<script lang="ts">
	import Play from '@lucide/svelte/icons/play';
	import Settings from '@lucide/svelte/icons/settings';
	import Square from '@lucide/svelte/icons/square';
	import { cancelRun } from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';

	interface Props {
		onOpenSettings: () => void;
	}

	let { onOpenSettings }: Props = $props();

	async function handleStop() {
		try {
			await cancelRun();
			appState.run.running = false;
		} catch {
			toastState.show('Failed to stop run');
		}
	}
</script>

<header
	class="flex min-h-16 items-center justify-between gap-4 border-b border-border-subtle bg-surface-raised px-5 max-[640px]:min-h-auto max-[640px]:flex-col max-[640px]:items-start max-[640px]:py-4"
>
	<div class="flex items-center gap-3">
		<div
			class="inline-flex items-baseline text-base leading-none font-extrabold tracking-[-0.02em] whitespace-nowrap"
			aria-label="EZJobApplier"
		>
			<span class="text-text-primary">EZ</span><span class="text-brand-500">JobApplier</span>
		</div>

		{#if appState.run.running}
			<span class="inline-flex items-center gap-1.5 text-xs font-bold text-warn-500">
				<span class="inline-block size-1.5 animate-pulse bg-warn-500"></span>
				Running
			</span>
		{/if}
	</div>

	<div class="flex items-center gap-2 max-[640px]:w-full">
		{#if appState.run.running}
			<button
				class="inline-flex min-h-9 cursor-pointer items-center justify-center gap-[6px] rounded-[var(--radius-card)] border border-border-default bg-surface-overlay px-4 text-[13px] font-bold tracking-[0.01em] text-text-secondary transition-[filter] duration-100 hover:border-border-strong hover:text-text-primary focus-visible:outline-0 max-[640px]:flex-1"
				type="button"
				onclick={handleStop}
			>
				<Square size={13} strokeWidth={2.5} aria-hidden="true" />
				<span>Stop</span>
			</button>
		{:else}
			<button
				class="inline-flex min-h-9 cursor-pointer items-center justify-center gap-[6px] rounded-[var(--radius-card)] border border-transparent bg-brand-500 px-4 text-[13px] font-bold tracking-[0.01em] text-brand-on transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-0 focus-visible:brightness-110 max-[640px]:flex-1"
				type="button"
				onclick={onOpenSettings}
			>
				<Play size={14} strokeWidth={2.5} aria-hidden="true" />
				<span>Start</span>
			</button>
		{/if}

		<button
			class="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-[var(--radius-card)] border border-border-default bg-surface-overlay p-0 text-[13px] font-bold text-[#4a6a88] transition-[filter] duration-100 hover:border-border-strong hover:text-[#7aaac8] focus-visible:border-border-strong focus-visible:text-[#7aaac8] focus-visible:outline-0"
			type="button"
			aria-label="Settings"
			onclick={onOpenSettings}
		>
			<Settings size={16} strokeWidth={2.25} aria-hidden="true" />
		</button>
	</div>
</header>
