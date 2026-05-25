<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import KanbanBoard from '$lib/components/KanbanBoard.svelte';
	import { mockJobs } from '$lib/mockJobs';
	import type { KanbanTab } from '$lib/types';

	let selectedJob = $state<{ jobId: string; defaultTab: KanbanTab } | null>(null);
	const processingIds = new Set<number>([1003]);

	function openMockJob(jobId: string, defaultTab: KanbanTab) {
		selectedJob = { jobId, defaultTab };
	}

	function closeModal() {
		selectedJob = null;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') closeModal();
	}
</script>

<svelte:head>
	<title>EZJobApplier Kanban</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main class="page-shell">
	<KanbanBoard jobs={mockJobs} {processingIds} onOpenJob={openMockJob} />

	{#if selectedJob}
		<div class="modal-overlay">
			<button class="modal-backdrop" type="button" aria-label="Close modal" onclick={closeModal}></button>
			<div class="modal" role="dialog" aria-modal="true" aria-label="Job actions" tabindex="-1">
				<button class="modal-close" type="button" aria-label="Close modal" onclick={closeModal}>
					<X size={18} strokeWidth={2.25} aria-hidden="true" />
				</button>
			</div>
		</div>
	{/if}
</main>

<style>
	.page-shell {
		min-height: 100vh;
		background: #0c1120;
		color: #f1f5f9;
		font-family:
			Instrument Sans,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		background: rgb(0 0 0 / 0.68);
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
		border: 1px solid #334155;
		background: #111827;
		box-shadow: 0 18px 45px rgb(0 0 0 / 0.45);
	}

	.modal-close {
		position: absolute;
		top: 16px;
		right: 16px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		min-width: 44px;
		cursor: pointer;
		border: 1px solid #334155;
		background: #1e293b;
		color: #bae6fd;
		padding: 0;
	}

	.modal-close:hover,
	.modal-close:focus-visible {
		border-color: #38bdf8;
		outline: 0;
	}
</style>
