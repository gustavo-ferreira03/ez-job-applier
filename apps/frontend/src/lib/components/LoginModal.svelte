<script lang="ts">
	import { fly } from 'svelte/transition';
	import { modalTransition } from '$lib/transitions';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="fixed inset-0 z-modal flex items-start justify-center bg-black/70 p-4">
	<button class="absolute inset-0 cursor-default" type="button" aria-label="Fechar" onclick={onClose}></button>

	<div
		class="relative z-10 mt-8 flex w-[min(900px,100%)] flex-col rounded-lg border border-border-default bg-surface-raised shadow-[var(--shadow-modal)] pb-1"
		style="max-height: calc(100vh - 80px)"
		role="dialog"
		aria-modal="true"
		aria-label="Login no LinkedIn"
		tabindex="-1"
		transition:fly={modalTransition}
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<div class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-5 py-4">
			<div>
				<h2 class="text-[13px] font-semibold text-text-primary">Login no LinkedIn necessário</h2>
				<p class="text-[11px] text-text-muted">Faça login na janela abaixo. O sistema retomará automaticamente.</p>
			</div>
			<button
				type="button"
				class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-faint hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
				onclick={onClose}
				aria-label="Fechar"
			>
				<X size={14} />
			</button>
		</div>

		<div class="w-full overflow-hidden bg-black" style="aspect-ratio: 1280/800;">
			<iframe
				class="h-full w-full border-0"
				src="/vnc"
				title="Navegador do servidor"
			></iframe>
		</div>
	</div>
</div>
