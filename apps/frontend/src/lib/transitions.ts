import { browser } from '$app/environment';
import { cubicOut } from 'svelte/easing';
import type { FlyParams, FadeParams } from 'svelte/transition';

const reducedMotion = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const flyParams = (params: FlyParams): FlyParams => (reducedMotion ? { duration: 0 } : params);
const fadeParams = (params: FadeParams): FadeParams => (reducedMotion ? { duration: 0 } : params);

export const modalTransition: FlyParams = flyParams({
	y: -12,
	duration: 150,
	easing: cubicOut
});

export const toastTransition: FlyParams = flyParams({
	y: -8,
	duration: 150,
	easing: cubicOut
});

export const cardTransition: FlyParams = flyParams({
	y: 4,
	duration: 150,
	easing: cubicOut
});

export const menuTransition: FadeParams = fadeParams({
	duration: 100
});

export const contentTransition: FadeParams = fadeParams({
	duration: 150
});

export const placeholderTransition: FlyParams = flyParams({
	y: 4,
	duration: 150,
	easing: cubicOut
});
