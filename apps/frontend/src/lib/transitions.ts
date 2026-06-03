import { cubicOut } from 'svelte/easing';
import type { FlyParams, FadeParams } from 'svelte/transition';

export const modalTransition: FlyParams = {
	y: -12,
	duration: 150,
	easing: cubicOut
};

export const toastTransition: FlyParams = {
	y: -8,
	duration: 150,
	easing: cubicOut
};

export const cardTransition: FlyParams = {
	y: 4,
	duration: 150,
	easing: cubicOut
};

export const menuTransition: FadeParams = {
	duration: 100
};

export const contentTransition: FadeParams = {
	duration: 150
};

export const placeholderTransition: FlyParams = {
	y: 4,
	duration: 150,
	easing: cubicOut
};
