<script lang="ts">
	import X from '@lucide/svelte/icons/x';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="z-modal fixed inset-0 flex items-start justify-center bg-black/72 p-4">
	<button
		class="absolute inset-0 cursor-default border-0 bg-transparent"
		type="button"
		aria-label="Close modal"
		onclick={onClose}
	></button>
	<div
		class="relative mt-12 min-h-[min(520px,calc(100vh-96px))] w-[min(760px,100%)] border border-border-default bg-surface-raised shadow-lg"
		role="dialog"
		aria-modal="true"
		aria-label="Job actions"
		tabindex="-1"
	>
		<button
			class="absolute top-[14px] right-[14px] inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center border border-border-default bg-surface-overlay p-0 text-[#4a6a88] hover:border-border-strong hover:text-[#7aaac8] focus-visible:border-border-strong focus-visible:text-[#7aaac8] focus-visible:outline-0"
			type="button"
			aria-label="Close modal"
			onclick={onClose}
		>
			<X size={16} strokeWidth={2.25} aria-hidden="true" />
		</button>
	</div>
</div>
