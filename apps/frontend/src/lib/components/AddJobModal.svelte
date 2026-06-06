<script lang="ts">
	import { fly } from 'svelte/transition';
	import { modalTransition } from '$lib/transitions';
	import { trapFocus } from '$lib/focusTrap';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let url = $state('');
	let busy = $state(false);
	let error = $state('');

	const SUCCESS_MESSAGES: Record<string, string> = {
		scraping: 'Fetching job details…',
		reactivated: 'Job moved back to Found'
	};

	async function submit() {
		if (busy || !url.trim()) return;
		busy = true;
		error = '';
		try {
			const { status } = await api.addManualJob(url.trim());
			if (status === 'exists') {
				toastState.show('That job is already in your pipeline', 'default');
			} else {
				toastState.show(SUCCESS_MESSAGES[status], 'success');
			}
			await appState.refreshJobs();
			onClose();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add job';
		} finally {
			busy = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="z-modal fixed inset-0 flex items-center justify-center bg-black/70 p-4">
	<button
		class="absolute inset-0 cursor-default"
		type="button"
		aria-label="Cancel"
		onclick={onClose}
	></button>

	<div
		class="relative z-10 w-[min(440px,100%)] rounded-lg border border-border-default bg-surface-raised p-4 shadow-[var(--shadow-modal)]"
		role="dialog"
		aria-modal="true"
		aria-label="Add job by link"
		tabindex="-1"
		use:trapFocus={{ onEscape: onClose }}
		transition:fly={modalTransition}
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<h2 class="text-base font-semibold text-text-primary">Add a job</h2>
		<p class="mt-1 text-sm text-text-muted">Paste a LinkedIn job link.</p>

		<form
			class="mt-3"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<input
				type="url"
				bind:value={url}
				placeholder="https://www.linkedin.com/jobs/view/…"
				autocomplete="off"
				spellcheck="false"
				class="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-faint focus-visible:border-border-strong focus-visible:outline-none"
				disabled={busy}
			/>

			{#if error}
				<p class="mt-2 text-sm text-status-failed-text">{error}</p>
			{/if}

			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="h-8 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-3 text-sm font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none"
					onclick={onClose}
				>
					Cancel
				</button>
				<button
					type="submit"
					class="h-8 cursor-pointer rounded-md bg-accent-500 px-3 text-sm font-medium text-accent-text transition-colors duration-150 hover:bg-accent-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
					disabled={busy || !url.trim()}
				>
					{busy ? 'Adding…' : 'Add'}
				</button>
			</div>
		</form>
	</div>
</div>
