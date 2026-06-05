<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import KanbanColumn from './KanbanColumn.svelte';
	import RejectAllModal from '$lib/components/RejectAllModal.svelte';
	import { modalTransition, placeholderTransition } from '$lib/transitions';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import type { ApplicationStatus, JobSummary, KanbanColumn as KanbanColumnDef, KanbanTab } from '$lib/types';
	import SubmitAllModal from '$lib/components/SubmitAllModal.svelte';

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
	let submitAllOpen = $state(false);
	let submittingAll = $state(false);

	const columns: KanbanColumnDef[] = [
		{
			id: 'found',
			title: 'Found',
			statuses: ['FOUND'],
			defaultTab: 'info' as KanbanTab,
			headerClass: 'text-text-muted',
			canRejectAll: true
		},
		{
			id: 'needs-input',
			title: 'Needs Input',
			statuses: ['NEEDS_INPUT'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-status-input-text',
			canRejectAll: true
		},
		{
			id: 'review',
			title: 'Review',
			statuses: ['READY_FOR_REVIEW', 'APPROVED'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-status-review-text',
			canRejectAll: true,
			canSubmitAll: true
		},
		{
			id: 'external',
			title: 'External',
			statuses: ['EXTERNAL'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-status-external-text',
			canRejectAll: true
		},
		{
			id: 'submitted',
			title: 'Submitted',
			statuses: ['SUBMITTED'],
			defaultTab: 'info' as KanbanTab,
			headerClass: 'text-status-submitted-text'
		},
		{
			id: 'failed',
			title: 'Failed',
			statuses: ['FAILED'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-status-failed-text',
			canRejectAll: true
		},
		{
			id: 'rejected',
			title: 'Rejected',
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

	async function confirmSubmitAll() {
		if (submittingAll) return;
		submittingAll = true;
		try {
			const result = await api.approveAllReadyForReview();
			toastState.show(`${result.approved} ${result.approved === 1 ? 'job queued' : 'jobs queued'} for submission`, 'success');
			submitAllOpen = false;
			await appState.refreshJobs();
		} catch {
			toastState.show('Failed to queue jobs', 'error');
		} finally {
			submittingAll = false;
		}
	}

	async function confirmRejectAll() {
		if (!rejectColumn || rejecting || rejectableCount === 0) return;
		rejecting = true;
		try {
			const result = await api.rejectJobsByStatus(rejectColumn.statuses);
			toastState.show(`${result.rejected} ${result.rejected === 1 ? 'job rejected' : 'jobs rejected'}`, 'success');
			rejectColumn = null;
			await appState.refreshJobs();
		} catch {
			toastState.show('Failed to reject jobs', 'error');
		} finally {
			rejecting = false;
		}
	}
</script>

<section
	class="flex h-full gap-4 overflow-x-auto p-4"
	aria-label="Application pipeline"
>
	{#each columns as col (col.id)}
		<KanbanColumn
			column={col}
			jobs={jobsForColumn(col)}
			onOpenJob={onOpenJob}
			onRejectAll={(column) => { rejectColumn = column; }}
			onSubmitAll={() => { submitAllOpen = true; }}
		/>
	{/each}
</section>

{#if submitAllOpen}
	<SubmitAllModal
		{submittingAll}
		reviewCount={jobs.filter((j) => j.status === 'READY_FOR_REVIEW' && !j.processing).length}
		onConfirm={confirmSubmitAll}
		onClose={() => { submitAllOpen = false; }}
	/>
{/if}

{#if rejectColumn}
	<RejectAllModal
		column={rejectColumn}
		{rejectableCount}
		{rejecting}
		onConfirm={confirmRejectAll}
		onClose={() => { rejectColumn = null; }}
	/>
{/if}
