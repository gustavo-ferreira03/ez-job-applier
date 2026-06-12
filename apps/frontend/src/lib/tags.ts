interface TagStyle {
	chip: string;
	dot: string;
}

const TAG_STYLES: Record<string, TagStyle> = {
	LinkedIn: { chip: 'bg-tag-linkedin-bg text-tag-linkedin-text', dot: 'bg-tag-linkedin-text' },
	External: { chip: 'bg-tag-external-bg text-tag-external-text', dot: 'bg-tag-external-text' }
};

const FALLBACK: TagStyle = { chip: 'bg-surface-hover text-text-muted', dot: 'bg-text-muted' };

export function tagStyle(tag: string): TagStyle {
	return TAG_STYLES[tag] ?? FALLBACK;
}
