<script lang="ts">
	import { toastState } from '$lib/toast.svelte';
</script>

{#if toastState.toasts.length > 0}
	<div class="z-toast fixed bottom-4 right-4 flex flex-col gap-2" aria-live="polite">
		{#each toastState.toasts as toast (toast.id)}
			<div
				class="border border-border-strong bg-surface-raised px-4 py-3 text-sm text-text-primary shadow-md"
			>
				{toast.message}
			</div>
		{/each}
	</div>
{/if}
