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
		EXTERNAL: 'Externa',
		SUBMITTED: 'Enviada',
		SKIPPED: 'Ignorada',
		FAILED: 'Falhou'
	};

	const styles: Record<ApplicationStatus, string> = {
		FOUND:            'bg-[#1c1c20] text-[#71717a]',
		NEEDS_INPUT:      'bg-[#2d2508] text-[#ca8a04]',
		READY_FOR_REVIEW: 'bg-[#1e3a5f] text-[#3b82f6]',
		EXTERNAL:         'bg-[#2e1065] text-[#a855f7]',
		SUBMITTED:        'bg-[#052e16] text-[#22c55e]',
		SKIPPED:          'bg-[#1c1c20] text-[#52525b]',
		FAILED:           'bg-[#1c0a0a] text-[#ef4444]'
	};

	const padding = $derived(size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]');
</script>

<span class="inline-block rounded-sm font-medium {padding} {styles[status]}">
	{labels[status]}
</span>
