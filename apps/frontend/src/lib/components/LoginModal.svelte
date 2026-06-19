<script lang="ts">
	import { fly } from 'svelte/transition';
	import { modalTransition } from '$lib/transitions';
	import { trapFocus } from '$lib/focusTrap';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		vncSessionId: string;
		title?: string;
		description?: string;
		onClose: () => void;
	}

	let {
		vncSessionId,
		title = 'LinkedIn login required',
		description = 'Log in in the window below. The system will resume automatically.',
		onClose
	}: Props = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="z-modal fixed inset-0 flex items-center justify-center bg-black/70 p-4">
	<button class="absolute inset-0 cursor-default" type="button" aria-label="Close" onclick={onClose}
	></button>

	<div
		class="relative z-10 flex w-[min(900px,100%)] flex-col rounded-lg border border-border-default bg-surface-raised pb-1 shadow-[var(--shadow-modal)]"
		style="max-height: calc(100vh - 32px)"
		role="dialog"
		aria-modal="true"
		aria-label="LinkedIn login"
		tabindex="-1"
		use:trapFocus={{ onEscape: onClose }}
		transition:fly={modalTransition}
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<div
			class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-5 py-4"
		>
			<div>
				<h2 class="text-[13px] font-semibold text-text-primary">{title}</h2>
				<p class="text-[11px] text-text-muted">
					{description}
				</p>
			</div>
			<button
				type="button"
				class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-faint hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
				onclick={onClose}
				aria-label="Close"
			>
				<X size={14} />
			</button>
		</div>

		<div class="w-full overflow-hidden bg-black" style="aspect-ratio: 1280/800;">
			<iframe class="h-full w-full border-0" src={`/vnc?session=${encodeURIComponent(vncSessionId)}`} title="Server browser"></iframe>
		</div>
	</div>
</div>
