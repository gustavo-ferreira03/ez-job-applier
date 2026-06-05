<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toastTransition } from '$lib/transitions';
	import { toastState } from '$lib/toast.svelte';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import X from '@lucide/svelte/icons/x';
</script>

<div class="z-toast fixed top-4 right-4 flex flex-col gap-2" aria-live="polite">
	{#each toastState.toasts as toast (toast.id)}
		{@const isSuccess = toast.type === 'success'}
		{@const isError = toast.type === 'error'}
		<div
			class="flex max-w-sm min-w-64 items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg
				{isSuccess
				? 'border-status-submitted-border bg-status-submitted-bg text-status-submitted-text'
				: ''}
				{isError ? 'border-danger-border bg-danger-bg text-danger-500' : ''}
				{!isSuccess && !isError ? 'border-border-strong bg-surface-raised text-text-primary' : ''}"
			transition:fly={toastTransition}
		>
			{#if isSuccess}
				<CircleCheck size={16} class="mt-px shrink-0" aria-hidden="true" />
			{:else if isError}
				<CircleX size={16} class="mt-px shrink-0" aria-hidden="true" />
			{/if}
			<span class="flex-1 leading-snug">{toast.message}</span>
			<button
				type="button"
				class="shrink-0 cursor-pointer opacity-60 transition-opacity duration-100 hover:opacity-100 focus-visible:outline-none"
				aria-label="Fechar"
				onclick={() => toastState.dismiss(toast.id)}
			>
				<X size={14} aria-hidden="true" />
			</button>
		</div>
	{/each}
</div>
