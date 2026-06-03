export type ToastType = 'default' | 'success' | 'error';

interface Toast {
	id: number;
	message: string;
	type: ToastType;
}

class ToastState {
	toasts = $state<Toast[]>([]);
	private nextId = 0;

	show(message: string, type: ToastType = 'default') {
		const id = ++this.nextId;
		this.toasts = [...this.toasts, { id, message, type }];
		setTimeout(() => this.dismiss(id), 3500);
	}

	dismiss(id: number) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}
}

export const toastState = new ToastState();
