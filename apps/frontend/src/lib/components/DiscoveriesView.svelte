<script lang="ts">
	import { appState } from '$lib/state.svelte';
	import type { Execution } from '$lib/types';

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatDuration(start: string, end: string | null): string {
		if (!end) return '';
		const ms = new Date(end).getTime() - new Date(start).getTime();
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
	}

	const experienceMap: Record<string, string> = {
		entry: 'Entry-level',
		senior: 'Senior',
		manager: 'Manager',
		director: 'Director',
		executive: 'Executive'
	};

	const jobTypeMap: Record<string, string> = {
		part_time: 'Part-time',
		contract: 'Contract',
		internship: 'Internship',
		full_time: 'Full-time',
		volunteer: 'Volunteer'
	};

	function configSummary(e: Execution): string {
		const parts: string[] = [];
		const cfg = e.config;
		if (cfg.keywords) parts.push(cfg.keywords.split('\n').join(', '));
		if (cfg.location) parts.push(cfg.location);
		if (cfg.workType) {
			const map: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
			parts.push(map[cfg.workType] ?? cfg.workType);
		}
		if (cfg.experienceLevel?.length)
			parts.push(cfg.experienceLevel.map((level) => experienceMap[level] ?? level).join(', '));
		if (cfg.jobType?.length)
			parts.push(cfg.jobType.map((type) => jobTypeMap[type] ?? type).join(', '));
		if (cfg.options?.easyApply) parts.push('Easy Apply');
		if (cfg.options?.under10Applicants) parts.push('< 10 applicants');
		if (cfg.options?.inMyNetwork) parts.push('In my network');
		return parts.join(' · ') || 'LinkedIn';
	}

	const statusLabel: Record<Execution['status'], string> = {
		running: 'Running',
		waiting: 'Waiting',
		paused: 'Paused',
		done: 'Done',
		failed: 'Failed',
		cancelled: 'Cancelled'
	};

	const statusClass: Record<Execution['status'], string> = {
		running: 'bg-execution-bg text-execution-text',
		waiting: 'bg-surface-overlay text-text-muted',
		paused: 'bg-status-input-bg text-status-input-text',
		done: 'bg-status-submitted-bg text-status-submitted-text',
		failed: 'bg-danger-bg text-danger-500',
		cancelled: 'bg-surface-overlay text-text-faint'
	};
</script>

<div class="flex h-full flex-col">
	<div
		class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-4 py-4 md:px-5"
	>
		<div>
			<h2 class="text-base leading-tight font-semibold text-text-primary">Execution history</h2>
			<p class="mt-0.5 text-[12px] text-text-faint">
				Review past runs, filters, duration, and outcomes.
			</p>
		</div>
		<span
			class="rounded-full border border-border-default px-2.5 py-1 text-[11px] font-medium text-text-secondary"
		>
			{appState.executions.length} executions
		</span>
	</div>

	<div class="flex-1 overflow-y-auto p-4 md:p-5">
		{#if appState.executions.length === 0}
			<div
				class="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border-default bg-surface-raised/40 px-6 text-center"
			>
				<p class="text-[13px] font-medium text-text-secondary">No executions yet</p>
				<p class="mt-1 max-w-sm text-[12px] leading-snug text-text-faint">
					Start execution from the sidebar after setting keywords and a default resume.
				</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each appState.executions as ex (ex.id)}
					<div
						class="rounded-md border border-border-subtle bg-surface-raised p-3 transition-colors duration-150 hover:border-border-default"
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<p class="truncate text-[13px] font-medium text-text-primary">
									{configSummary(ex)}
								</p>
								<p class="mt-0.5 text-xs text-text-muted">
									{formatDate(ex.startedAt)}
									{#if ex.finishedAt}
										· {formatDuration(ex.startedAt, ex.finishedAt)}{/if}
									· {ex.discovered} jobs
								</p>
								{#if ex.errorMessage}
									<p class="mt-1 text-xs text-danger-500">{ex.errorMessage}</p>
								{/if}
							</div>
							<span
								class="shrink-0 rounded-sm px-2 py-0.5 text-xs font-medium {statusClass[ex.status]}"
							>
								{statusLabel[ex.status]}
							</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
