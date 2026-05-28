interface Toast {
	id: number;
	message: string;
}

class ToastState {
	toasts = $state<Toast[]>([]);
	private nextId = 0;

	show(message: string) {
		const id = ++this.nextId;
		this.toasts = [...this.toasts, { id, message }];
		setTimeout(() => {
			this.toasts = this.toasts.filter((t) => t.id !== id);
		}, 3200);
	}
}

export const toastState = new ToastState();
