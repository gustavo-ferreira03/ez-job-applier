<script lang="ts">
	import { PUBLIC_API_URL } from '$env/static/public';
	import { onMount } from 'svelte';
	import RFB from '@novnc/novnc';

	let screen: HTMLDivElement;

	const base = PUBLIC_API_URL;
	const wsUrl = base.replace(/^http/, 'ws') + '/vnc-ws';

	onMount(() => {
		const rfb = new RFB(screen, wsUrl);
		rfb.scaleViewport = true;
		rfb.addEventListener('credentialsrequired', () => rfb.sendCredentials({ password: '' }));
	});
</script>

<svelte:head><title>Login — EZJobApplier</title></svelte:head>
<div bind:this={screen} style="width:100%;height:100vh;background:#000;display:block;"></div>
