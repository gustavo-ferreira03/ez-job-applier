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

<div class="modal-overlay">
	<button class="modal-backdrop" type="button" aria-label="Close modal" onclick={onClose}></button>
	<div class="modal" role="dialog" aria-modal="true" aria-label="Job actions" tabindex="-1">
		<button class="modal-close" type="button" aria-label="Close modal" onclick={onClose}>
			<X size={16} strokeWidth={2.25} aria-hidden="true" />
		</button>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		background: rgb(0 0 0 / 0.72);
		padding: 16px;
		z-index: 100;
	}

	.modal-backdrop {
		position: absolute;
		inset: 0;
		cursor: default;
		border: 0;
		background: transparent;
	}

	.modal {
		position: relative;
		margin-top: 48px;
		min-height: min(520px, calc(100vh - 96px));
		width: min(760px, 100%);
		border: 1px solid #1a2e48;
		background: #0b1829;
		box-shadow: 0 24px 56px rgb(0 0 0 / 0.55);
	}

	.modal-close {
		position: absolute;
		top: 14px;
		right: 14px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 36px;
		min-width: 36px;
		cursor: pointer;
		border: 1px solid #1a2e48;
		background: #0f1e34;
		color: #4a6a88;
		padding: 0;
	}

	.modal-close:hover,
	.modal-close:focus-visible {
		border-color: #26405f;
		color: #7aaac8;
		outline: 0;
	}
</style>
