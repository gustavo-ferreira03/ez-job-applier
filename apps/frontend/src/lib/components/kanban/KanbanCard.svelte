<script lang="ts">
	import type { JobSummary } from '$lib/types';

	interface Props {
		job: JobSummary;
		onOpen: () => void;
	}

	let { job, onOpen }: Props = $props();

	const cls = $derived(
		[
			'flex w-full cursor-pointer flex-col rounded-[var(--radius-card)] border border-l-[3px] border-border-default border-l-transparent bg-surface-overlay px-[14px] pt-[14px] pb-3 text-left text-text-primary shadow-sm transition-[background,box-shadow] duration-100 hover:border-border-strong hover:border-l-transparent hover:bg-surface-hover hover:shadow-md focus-visible:border-border-strong focus-visible:border-l-transparent focus-visible:bg-surface-hover focus-visible:shadow-md focus-visible:ring-1 focus-visible:ring-brand-500 focus-visible:ring-inset focus-visible:outline-0',
			job.status === 'NEEDS_INPUT'
				? 'border-l-warn-500 hover:border-l-warn-500 focus-visible:border-l-warn-500'
				: job.status === 'READY_FOR_REVIEW'
					? 'border-l-brand-500 hover:border-l-brand-500 focus-visible:border-l-brand-500'
					: job.status === 'EXTERNAL'
						? 'border-l-purple-500 hover:border-l-purple-500 focus-visible:border-l-purple-500'
						: job.status === 'FAILED'
							? 'border-l-danger-500 hover:border-l-danger-500 focus-visible:border-l-danger-500'
							: ''
		]
			.filter(Boolean)
			.join(' ')
	);

	const hint = $derived(
		job.status === 'NEEDS_INPUT' && job.unansweredCount > 0
			? `${job.unansweredCount} unanswered`
			: job.status === 'FAILED' && job.errorMessage
				? job.errorMessage
				: ''
	);

	const hintCls = $derived(
		[
			'max-w-[136px] overflow-hidden text-[11px] font-bold text-ellipsis whitespace-nowrap',
			job.status === 'FAILED' ? 'text-danger-500' : job.status === 'NEEDS_INPUT' ? 'text-warn-500' : ''
		]
			.filter(Boolean)
			.join(' ')
	);

	const time = $derived(
		(() => {
			if (!job.updatedAt) return '';
			return new Date(job.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		})()
	);
</script>

<button type="button" class={cls} onclick={onOpen} aria-label={`Open ${job.title}`}>
	<span class="line-clamp-2 [display:-webkit-box] overflow-hidden text-[13px] leading-[1.4] font-bold text-[#e2eefa] [-webkit-box-orient:vertical]">
		{job.title}
	</span>
	<span class="mt-[6px] block overflow-hidden text-xs leading-[1.4] text-ellipsis whitespace-nowrap">
		<span class="text-text-secondary">{job.company}</span>
		{#if job.location}
			<span class="text-text-muted"> · {job.location}</span>
		{/if}
	</span>
	<span class="mt-3 flex items-center justify-between gap-2 border-t border-border-subtle pt-[10px]">
		<span class="text-[11px] text-text-faint tabular-nums">{time}</span>
		{#if hint}
			<span class={hintCls} title={hint}>{hint}</span>
		{/if}
	</span>
</button>
