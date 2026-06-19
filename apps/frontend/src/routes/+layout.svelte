<script lang="ts">
	import { onMount } from 'svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	onMount(() => {
		const period = 2000;
		let frame = 0;
		const sync = () => {
			document.documentElement.style.setProperty(
				'--activity-delay',
				`${-(performance.now() % period)}ms`
			);
			frame = requestAnimationFrame(sync);
		};
		sync();
		return () => cancelAnimationFrame(frame);
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
