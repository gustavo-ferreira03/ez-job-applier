<script lang="ts">
	import { PUBLIC_API_URL } from '$env/static/public';
	import { onMount } from 'svelte';
	import RFB from '@novnc/novnc';

	let screen: HTMLDivElement;

	const base = PUBLIC_API_URL;

	onMount(() => {
		const session = new URLSearchParams(window.location.search).get('session');
		if (!session) return;
		const wsUrl = `${base.replace(/^http/, 'ws')}/vnc-ws/${encodeURIComponent(session)}`;
		const rfb = new RFB(screen, wsUrl);
		rfb.scaleViewport = true;
		rfb.addEventListener('credentialsrequired', () => rfb.sendCredentials({ password: '' }));
		return () => rfb.disconnect();
	});
</script>

<svelte:head><title>Login — EZJobApplier</title></svelte:head>
<div bind:this={screen} style="width:100%;height:100vh;background:#000;display:block;"></div>
