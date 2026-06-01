<script lang="ts">
	import type { ApplicationStatus } from '$lib/types';

	interface Props {
		status: ApplicationStatus;
		size?: 'sm' | 'md';
	}

	let { status, size = 'md' }: Props = $props();

	const labels: Record<ApplicationStatus, string> = {
		FOUND: 'Encontrada',
		NEEDS_INPUT: 'Precisa Resposta',
		READY_FOR_REVIEW: 'Revisar',
		APPROVED: 'Na fila',
		EXTERNAL: 'Externa',
		SUBMITTED: 'Enviada',
		SKIPPED: 'Ignorada',
		FAILED: 'Falhou'
	};

	const styles: Record<ApplicationStatus, string> = {
		FOUND:            'bg-status-found-bg text-status-found-text',
		NEEDS_INPUT:      'bg-status-input-bg text-status-input-text',
		READY_FOR_REVIEW: 'bg-status-review-bg text-status-review-text',
		APPROVED:         'bg-execution-bg text-execution-text',
		EXTERNAL:         'bg-status-external-bg text-status-external-text',
		SUBMITTED:        'bg-status-submitted-bg text-status-submitted-text',
		SKIPPED:          'bg-status-found-bg text-text-faint',
		FAILED:           'bg-status-failed-bg text-status-failed-text'
	};

	const padding = $derived(size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]');
</script>

<span class="inline-block rounded-sm font-medium {padding} {styles[status]}">
	{labels[status]}
</span>
