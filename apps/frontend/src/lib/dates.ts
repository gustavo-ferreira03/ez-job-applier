const timeFormatter = new Intl.DateTimeFormat('en-US', {
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
});

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric'
});

const shortDateWithYearFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric'
});

const exactDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
});

function startOfLocalDay(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function parseDate(iso: string): Date | null {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function formatFoundAt(iso: string): string {
	const date = parseDate(iso);
	if (!date) return 'Unknown';

	const now = new Date();
	const dayDiff = Math.round((startOfLocalDay(now) - startOfLocalDay(date)) / 86_400_000);
	const time = timeFormatter.format(date);

	if (dayDiff === 0) return `Today ${time}`;
	if (dayDiff === 1) return `Yesterday ${time}`;
	if (date.getFullYear() === now.getFullYear()) return shortDateFormatter.format(date);
	return shortDateWithYearFormatter.format(date);
}

export function formatExactDateTime(iso: string): string {
	const date = parseDate(iso);
	return date ? exactDateTimeFormatter.format(date) : 'Unknown date';
}
