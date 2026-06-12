<script lang="ts">
	import { fade } from 'svelte/transition';
	import { SvelteSet } from 'svelte/reactivity';
	import Inbox from '@lucide/svelte/icons/inbox';
	import StatusBadge from './StatusBadge.svelte';
	import { contentTransition } from '$lib/transitions';
	import type { ApplicationStatus, JobSummary, KanbanTab } from '$lib/types';

	interface Props {
		jobs: JobSummary[];
		onOpenJob: (job: JobSummary, tab: KanbanTab) => void;
	}

	let { jobs, onOpenJob }: Props = $props();

	let statusFilter = $state<ApplicationStatus | ''>('');
	let search = $state('');
	let selected = new SvelteSet<number>();

	const statusLabels: Record<ApplicationStatus, string> = {
		FOUND: 'Found',
		NEEDS_INPUT: 'Needs Answer',
		READY_FOR_REVIEW: 'Review',
		APPROVED: 'Queued',
		SUBMITTED: 'Submitted',
		REJECTED: 'Rejected',
		FAILED: 'Failed'
	};

	const filtered = $derived(
		jobs.filter((j) => {
			if (statusFilter && j.status !== statusFilter) return false;
			if (search.trim()) {
				const q = search.toLowerCase();
				return (
					j.title.toLowerCase().includes(q) ||
					j.company.toLowerCase().includes(q) ||
					j.skills.some((s) => s.toLowerCase().includes(q))
				);
			}
			return true;
		})
	);

	function toggleSelect(id: number) {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}

	function toggleAll() {
		if (selected.size === filtered.length) {
			selected.clear();
			return;
		}

		selected.clear();
		for (const job of filtered) selected.add(job.id);
	}

	function relativeDate(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const days = Math.floor(diff / 86_400_000);
		if (days === 0) return 'today';
		if (days === 1) return '1d';
		return `${days}d`;
	}

	const allStatuses: ApplicationStatus[] = [
		'FOUND',
		'NEEDS_INPUT',
		'READY_FOR_REVIEW',
		'APPROVED',
		'SUBMITTED',
		'FAILED',
		'REJECTED'
	];

	const allSelected = $derived(filtered.length > 0 && selected.size === filtered.length);
</script>

<div class="flex h-full flex-col">
	<!-- Toolbar -->
	<div
		class="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-3"
	>
		<select
			class="h-8 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-secondary focus:border-border-strong focus:outline-none"
			bind:value={statusFilter}
			aria-label="Filter jobs by status"
		>
			<option value="">All statuses</option>
			{#each allStatuses as s (s)}
				<option value={s}>{statusLabels[s]}</option>
			{/each}
		</select>

		<input
			type="text"
			placeholder="Search title, company, or skill"
			class="h-8 min-w-48 flex-1 rounded-md border border-border-subtle bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-default focus:outline-none"
			bind:value={search}
			aria-label="Search jobs"
		/>

		<span class="text-[11px] text-text-faint">{filtered.length} jobs</span>
	</div>

	<!-- Table -->
	<div class="flex-1 overflow-auto">
		<table class="w-full border-collapse text-[12px]">
			<thead class="sticky top-0 bg-surface-base">
				<tr class="border-b border-border-subtle">
					<th class="w-9 px-3 py-2.5 text-left">
						<button
							type="button"
							class="flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-sm border border-border-default {allSelected
								? 'border-accent-500 bg-accent-500'
								: 'bg-transparent'} focus-visible:outline-none"
							onclick={toggleAll}
							aria-label="Select all"
						>
							{#if allSelected}
								<span class="text-[8px] text-white">✓</span>
							{/if}
						</button>
					</th>
					<th
						class="px-3 py-2.5 text-left text-[10px] font-semibold tracking-wide text-text-faint uppercase"
						>Job</th
					>
					<th
						class="px-3 py-2.5 text-left text-[10px] font-semibold tracking-wide text-text-faint uppercase"
						>Company</th
					>
					<th
						class="px-3 py-2.5 text-left text-[10px] font-semibold tracking-wide text-text-faint uppercase"
						>Location</th
					>
					<th
						class="px-3 py-2.5 text-left text-[10px] font-semibold tracking-wide text-text-faint uppercase"
						>Status</th
					>
					<th
						class="px-3 py-2.5 text-left text-[10px] font-semibold tracking-wide text-text-faint uppercase"
						>Date</th
					>
				</tr>
			</thead>
			<tbody>
				{#each filtered as job (job.id)}
					<tr
						class="cursor-pointer border-b border-border-subtle/40 transition-colors duration-100 hover:bg-surface-raised"
						onclick={() => onOpenJob(job, 'info')}
						in:fade={contentTransition}
					>
						<td
							class="px-3 py-2.5"
							onclick={(e) => {
								e.stopPropagation();
								toggleSelect(job.id);
							}}
							onkeydown={(e) => e.stopPropagation()}
						>
							<button
								type="button"
								class="flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-sm border border-border-default {selected.has(
									job.id
								)
									? 'border-accent-500 bg-accent-500'
									: 'bg-transparent'} focus-visible:outline-none"
								aria-label="Select job"
							>
								{#if selected.has(job.id)}
									<span class="text-[8px] text-white">✓</span>
								{/if}
							</button>
						</td>
						<td class="px-3 py-2.5">
							<button
								type="button"
								class="max-w-full cursor-pointer truncate text-left font-medium text-text-primary transition-colors duration-100 hover:text-accent-500 focus-visible:outline-none"
								aria-label={`Open ${job.title} at ${job.company}`}
								onclick={(e) => {
									e.stopPropagation();
									onOpenJob(job, 'info');
								}}
							>
								{job.title}
							</button>
							{#if job.skills.length > 0}
								<div class="mt-0.5 flex flex-wrap gap-1">
									{#each job.skills.slice(0, 4) as skill (skill)}
										<span
											class="rounded-sm bg-surface-hover px-1 py-0.5 text-[10px] text-text-faint"
											>{skill}</span
										>
									{/each}
									{#if job.skills.length > 4}
										<span class="text-[10px] text-text-faint">+{job.skills.length - 4}</span>
									{/if}
								</div>
							{/if}
						</td>
						<td class="px-3 py-2.5 text-text-muted">{job.company}</td>
						<td class="px-3 py-2.5 text-text-muted">{job.location || 'Not listed'}</td>
						<td class="px-3 py-2.5"><StatusBadge status={job.status} size="sm" /></td>
						<td class="px-3 py-2.5 text-text-faint">{relativeDate(job.createdAt)}</td>
					</tr>
				{/each}

				{#if filtered.length === 0}
					<tr>
						<td colspan="6" class="py-10 text-center">
							<div
								class="t-empty-state mx-auto inline-flex items-center gap-2 text-text-faint"
								aria-label="No jobs match the current filters"
							>
								<Inbox size={18} aria-hidden="true" />
								<span class="text-[12px] font-medium whitespace-nowrap">No matches</span>
							</div>
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
