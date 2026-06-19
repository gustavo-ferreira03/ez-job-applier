<script lang="ts">
	import KanbanColumn from './KanbanColumn.svelte';
	import RejectAllModal from '$lib/components/RejectAllModal.svelte';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import type {
		ApplicationStatus,
		JobSummary,
		KanbanColumn as KanbanColumnDef,
		KanbanTab
	} from '$lib/types';
	import SubmitAllModal from '$lib/components/SubmitAllModal.svelte';
	import AddJobModal from '$lib/components/AddJobModal.svelte';
	import { tagStyle } from '$lib/tags';

	interface Props {
		jobs: JobSummary[];
		onOpenJob: (job: JobSummary, tab: KanbanTab) => void;
	}

	let { jobs, onOpenJob }: Props = $props();

	const REJECTABLE_STATUSES: ApplicationStatus[] = [
		'FOUND',
		'NEEDS_INPUT',
		'READY_FOR_REVIEW',
		'FAILED'
	];

	const TAG_ORDER = ['LinkedIn', 'Easy Apply', 'External'];

	let selectedTags = $state<string[]>([]);

	const availableTags = $derived.by(() => {
		const present = new Set<string>();
		for (const job of jobs) for (const tag of job.tags) present.add(tag);
		const known = TAG_ORDER.filter((t) => present.has(t));
		const extra = [...present].filter((t) => !TAG_ORDER.includes(t)).sort();
		return [...known, ...extra];
	});

	function toggleTag(tag: string) {
		selectedTags = selectedTags.includes(tag)
			? selectedTags.filter((t) => t !== tag)
			: [...selectedTags, tag];
	}

	let rejectColumn = $state<KanbanColumnDef | null>(null);
	let rejecting = $state(false);
	let submitAllOpen = $state(false);
	let submittingAll = $state(false);
	let retryingAll = $state(false);
	let addOpen = $state(false);

	const columns: KanbanColumnDef[] = [
		{
			id: 'found',
			title: 'Found',
			statuses: ['FOUND'],
			defaultTab: 'info' as KanbanTab,
			headerClass: 'text-text-muted',
			canRejectAll: true,
			canAdd: true
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
			canRejectAll: true,
			canRetryAll: true
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

	const rejectableCount = $derived(rejectColumn ? rejectableJobs(rejectColumn).length : 0);

	function matchesTagFilter(job: JobSummary): boolean {
		if (selectedTags.length === 0) return true;
		return job.tags.some((tag) => selectedTags.includes(tag));
	}

	function jobsForColumn(col: KanbanColumnDef) {
		return jobs.filter((j) => col.statuses.includes(j.status) && matchesTagFilter(j));
	}

	function isRejectable(job: JobSummary): boolean {
		return !job.processing && REJECTABLE_STATUSES.includes(job.status);
	}

	function rejectableJobs(column: KanbanColumnDef): JobSummary[] {
		return jobs.filter(
			(job) => column.statuses.includes(job.status) && isRejectable(job) && matchesTagFilter(job)
		);
	}

	function submittableJobs(): JobSummary[] {
		return jobs.filter(
			(j) => j.status === 'READY_FOR_REVIEW' && !j.processing && matchesTagFilter(j)
		);
	}

	function retryableJobs(): JobSummary[] {
		return jobs.filter((j) => j.status === 'FAILED' && !j.processing && matchesTagFilter(j));
	}

	const submittableCount = $derived(submittableJobs().length);

	async function confirmSubmitAll() {
		if (submittingAll) return;
		submittingAll = true;
		try {
			const jobs = submittableJobs();
			const agentReview = new Set(
				appState.externalApply.sessions
					.filter((s) => s.active && s.phase === 'review')
					.map((s) => s.jobId)
			);
			const agentJobs = jobs.filter((j) => agentReview.has(j.id));
			const queueJobs = jobs.filter((j) => !agentReview.has(j.id));

			await Promise.all(agentJobs.map((j) => api.sendExternalApplyMessage(j.id, 'Submit it')));
			let queued = 0;
			if (queueJobs.length > 0) {
				const result = await api.approveJobs(queueJobs.map((j) => j.id));
				queued = result.approved;
			}

			const parts: string[] = [];
			if (agentJobs.length > 0)
				parts.push(`${agentJobs.length} ${agentJobs.length === 1 ? 'agent told' : 'agents told'} to submit`);
			if (queued > 0) parts.push(`${queued} ${queued === 1 ? 'job queued' : 'jobs queued'}`);
			toastState.show(parts.join(', ') || 'Nothing to submit', 'success');
			submitAllOpen = false;
			await appState.refreshJobs();
			await appState.refreshExternalApply();
		} catch {
			toastState.show('Failed to submit jobs', 'error');
		} finally {
			submittingAll = false;
		}
	}

	async function confirmRejectAll() {
		if (!rejectColumn || rejecting || rejectableCount === 0) return;
		rejecting = true;
		try {
			const result = await api.rejectJobs(rejectableJobs(rejectColumn).map((j) => j.id));
			toastState.show(
				`${result.rejected} ${result.rejected === 1 ? 'job rejected' : 'jobs rejected'}`,
				'success'
			);
			rejectColumn = null;
			await appState.refreshJobs();
		} catch {
			toastState.show('Failed to reject jobs', 'error');
		} finally {
			rejecting = false;
		}
	}

	async function retryAllFailed() {
		if (retryingAll) return;
		const retryable = retryableJobs();
		if (retryable.length === 0) return;
		retryingAll = true;
		try {
			await Promise.all(retryable.map((job) => api.retryJob(job.id)));
			toastState.show(
				`${retryable.length} ${retryable.length === 1 ? 'job queued' : 'jobs queued'} for retry`,
				'success'
			);
			await appState.refreshJobs();
		} catch {
			toastState.show('Failed to retry jobs', 'error');
		} finally {
			retryingAll = false;
		}
	}
</script>

<div class="flex h-full flex-col">
	{#if availableTags.length > 0}
		<div
			class="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5"
			aria-label="Filter by tag"
		>
			{#each availableTags as tag (tag)}
				{@const active = selectedTags.includes(tag)}
				<button
					type="button"
					class="flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors duration-100 focus-visible:outline-none {active
						? 'border-border-strong bg-surface-hover text-text-primary'
						: 'border-border-default text-text-muted hover:border-border-strong hover:text-text-secondary'}"
					aria-pressed={active}
					onclick={() => toggleTag(tag)}
				>
					<span class="h-1.5 w-1.5 rounded-full {tagStyle(tag).dot}"></span>
					{tag}
				</button>
			{/each}
			{#if selectedTags.length > 0}
				<button
					type="button"
					class="ml-auto cursor-pointer text-[11px] text-text-faint transition-colors duration-100 hover:text-text-muted focus-visible:outline-none"
					onclick={() => (selectedTags = [])}
				>
					Clear
				</button>
			{/if}
		</div>
	{/if}

	<section class="flex min-h-0 flex-1 gap-4 overflow-x-auto p-4" aria-label="Application pipeline">
		{#each columns as col (col.id)}
			<KanbanColumn
				column={col}
				jobs={jobsForColumn(col)}
				{onOpenJob}
				onRejectAll={(column) => {
					rejectColumn = column;
				}}
					onSubmitAll={() => {
						submitAllOpen = true;
					}}
					onRetryAll={retryAllFailed}
					onAdd={() => {
					addOpen = true;
				}}
			/>
		{/each}
	</section>
</div>

{#if addOpen}
	<AddJobModal
		onClose={() => {
			addOpen = false;
		}}
	/>
{/if}

{#if submitAllOpen}
	<SubmitAllModal
		{submittingAll}
		reviewCount={submittableCount}
		onConfirm={confirmSubmitAll}
		onClose={() => {
			submitAllOpen = false;
		}}
	/>
{/if}

{#if rejectColumn}
	<RejectAllModal
		column={rejectColumn}
		{rejectableCount}
		{rejecting}
		onConfirm={confirmRejectAll}
		onClose={() => {
			rejectColumn = null;
		}}
	/>
{/if}
