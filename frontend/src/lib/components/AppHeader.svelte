<script lang="ts">
	import Play from '@lucide/svelte/icons/play';
	import Settings from '@lucide/svelte/icons/settings';
</script>

<header class="app-header">
	<div class="brand" aria-label="EZJobApplier">
		<span class="brand-main">EZ</span><span class="brand-accent">JobApplier</span>
	</div>

	<div class="header-actions">
		<button class="primary-action" type="button">
			<Play size={14} strokeWidth={2.5} aria-hidden="true" />
			<span>Start</span>
		</button>
		<button class="icon-action" type="button" aria-label="Settings">
			<Settings size={16} strokeWidth={2.25} aria-hidden="true" />
		</button>
	</div>
</header>

<style>
	.app-header {
		display: flex;
		min-height: 64px;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		border-bottom: 1px solid #172c46;
		background: #0b1829;
		padding: 0 20px;
	}

	.brand {
		display: inline-flex;
		align-items: baseline;
		font-size: 16px;
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1;
		white-space: nowrap;
	}

	.brand-main {
		color: #dce8f5;
	}

	.brand-accent {
		color: #38bdf8;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.primary-action,
	.icon-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 36px;
		cursor: pointer;
		border: 1px solid transparent;
		font: inherit;
		font-size: 13px;
		font-weight: 700;
		transition: filter 0.1s;
	}

	.primary-action {
		gap: 6px;
		background: #38bdf8;
		color: #03111e;
		padding: 0 16px;
		letter-spacing: 0.01em;
	}

	.icon-action {
		min-width: 36px;
		background: #0f1e34;
		border-color: #1a2e48;
		color: #4a6a88;
		padding: 0;
	}

	.primary-action:hover,
	.primary-action:focus-visible {
		filter: brightness(1.1);
		outline: 0;
	}

	.icon-action:hover,
	.icon-action:focus-visible {
		border-color: #26405f;
		color: #7aaac8;
		outline: 0;
	}

	@media (max-width: 640px) {
		.app-header {
			align-items: flex-start;
			flex-direction: column;
			min-height: auto;
			padding: 16px 20px;
		}

		.header-actions {
			width: 100%;
		}

		.primary-action {
			flex: 1;
		}
	}
</style>
