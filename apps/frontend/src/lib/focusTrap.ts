type TrapFocusOptions = {
	onEscape?: () => void;
	initialFocus?: 'first' | 'container';
};

const focusableSelector = [
	'a[href]',
	'button:not([disabled])',
	'textarea:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

function focusableElements(node: HTMLElement): HTMLElement[] {
	return Array.from(node.querySelectorAll<HTMLElement>(focusableSelector)).filter(
		(el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null
	);
}

export function trapFocus(node: HTMLElement, options: TrapFocusOptions = {}) {
	const previousFocus =
		document.activeElement instanceof HTMLElement ? document.activeElement : null;
	let currentOptions = options;

	queueMicrotask(() => {
		const target = options.initialFocus === 'container' ? node : (focusableElements(node)[0] ?? node);
		target.focus({ preventScroll: true });
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			currentOptions.onEscape?.();
			return;
		}

		if (event.key !== 'Tab') return;

		const focusable = focusableElements(node);
		if (focusable.length === 0) {
			event.preventDefault();
			node.focus({ preventScroll: true });
			return;
		}

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus({ preventScroll: true });
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus({ preventScroll: true });
		}
	}

	node.addEventListener('keydown', handleKeydown);

	return {
		update(nextOptions: TrapFocusOptions = {}) {
			currentOptions = nextOptions;
		},
		destroy() {
			node.removeEventListener('keydown', handleKeydown);
			if (previousFocus && document.contains(previousFocus)) {
				previousFocus.focus({ preventScroll: true });
			}
		}
	};
}
