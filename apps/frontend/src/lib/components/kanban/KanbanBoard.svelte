<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import KanbanColumn from './KanbanColumn.svelte';
	import RejectAllModal from '$lib/components/RejectAllModal.svelte';
	import { modalTransition, placeholderTransition } from '$lib/transitions';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import type { ApplicationStatus, JobSummary, KanbanColumn as KanbanColumnDef, KanbanTab } from '$lib/types';

	interface Props {
		jobs: JobSummary[];
		onOpenJob: (job: JobSummary, tab: KanbanTab) => void;
	}

	let { jobs, onOpenJob }: Props = $props();

	const REJECTABLE_STATUSES: ApplicationStatus[] = [
		'FOUND',
		'NEEDS_INPUT',
		'READY_FOR_REVIEW',
		'EXTERNAL',
		'FAILED'
	];

	let rejectColumn = $state<KanbanColumnDef | null>(null);
	let rejecting = $state(false);

	const columns: KanbanColumnDef[] = [
		{
			id: 'found',
			title: 'Encontradas',
			statuses: ['FOUND'],
			defaultTab: 'info' as KanbanTab,
			headerClass: 'text-text-muted',
			canRejectAll: true
		},
		{
			id: 'needs-input',
			title: 'Precisa Resposta',
			statuses: ['NEEDS_INPUT'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-status-input-text',
			canRejectAll: true
		},
		{
			id: 'review',
			title: 'Revisar',
			statuses: ['READY_FOR_REVIEW', 'APPROVED'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-status-review-text',
			canRejectAll: true
		},
		{
			id: 'external',
			title: 'Externa',
			statuses: ['EXTERNAL'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-status-external-text',
			canRejectAll: true
		},
		{
			id: 'submitted',
			title: 'Enviadas',
			statuses: ['SUBMITTED'],
			defaultTab: 'info' as KanbanTab,
			headerClass: 'text-status-submitted-text'
		},
		{
			id: 'failed',
			title: 'Falhas',
			statuses: ['FAILED'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-status-failed-text',
			canRejectAll: true
		},
		{
			id: 'rejected',
			title: 'Rejeitadas',
			statuses: ['REJECTED'],
			defaultTab: 'info' as KanbanTab,
			headerClass: 'text-text-faint',
			columnClass: 'opacity-60'
		}
	];

	const rejectableCount = $derived(
		rejectColumn ? countRejectableJobs(rejectColumn) : 0
	);

	function jobsForColumn(col: KanbanColumnDef) {
		return jobs.filter((j) => col.statuses.includes(j.status));
	}

	function isRejectable(job: JobSummary): boolean {
		return !job.processing && REJECTABLE_STATUSES.includes(job.status);
	}

	function countRejectableJobs(column: KanbanColumnDef): number {
		return jobs.filter((job) => column.statuses.includes(job.status) && isRejectable(job)).length;
	}

	async function confirmRejectAll() {
		if (!rejectColumn || rejecting || rejectableCount === 0) return;
		rejecting = true;
		try {
			const result = await api.rejectJobsByStatus(rejectColumn.statuses);
			toastState.show(`${result.rejected} ${result.rejected === 1 ? 'vaga rejeitada' : 'vagas rejeitadas'}`, 'success');
			rejectColumn = null;
			await appState.refreshJobs();
		} catch {
			toastState.show('Falha ao rejeitar vagas', 'error');
		} finally {
			rejecting = false;
		}
	}
</script>

<section
	class="flex h-full gap-4 overflow-x-auto p-4"
	aria-label="Pipeline de candidaturas"
>
	{#each columns as col (col.id)}
		<KanbanColumn
			column={col}
			jobs={jobsForColumn(col)}
			onOpenJob={onOpenJob}
			onRejectAll={(column) => { rejectColumn = column; }}
		/>
	{/each}
</section>

{#if rejectColumn}
	<RejectAllModal
		column={rejectColumn}
		{rejectableCount}
		{rejecting}
		onConfirm={confirmRejectAll}
		onClose={() => { rejectColumn = null; }}
	/>
{/if}
