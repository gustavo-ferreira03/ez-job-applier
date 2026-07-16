const BLOCK = 'mt-2 first:mt-0';
const CLS = {
	p: BLOCK,
	ul: `${BLOCK} list-disc pl-4`,
	ol: `${BLOCK} list-decimal pl-4`,
	li: 'mt-[0.2rem] first:mt-0',
	strong: 'font-semibold text-text-primary',
	em: 'text-text-primary italic',
	a: 'text-accent-500 underline underline-offset-2',
	code: 'rounded border border-border-default bg-surface-hover px-1 py-[0.05rem] text-[0.92em] text-text-primary',
	pre: `${BLOCK} max-w-full overflow-x-auto rounded-md border border-border-default bg-surface-hover p-2`,
	preCode: 'border-0 bg-transparent p-0 text-[0.92em] text-text-primary'
};

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
	return escapeHtml(value).replaceAll('`', '&#96;');
}

function isSafeHref(value: string): boolean {
	return /^(https?:\/\/|mailto:)/i.test(value);
}

function renderInline(input: string): string {
	const code: string[] = [];
	let html = escapeHtml(input);

	html = html.replace(/`([^`]+)`/g, (_match, content: string) => {
		const token = `@@CODE_${code.length}@@`;
		code.push(`<code class="${CLS.code}">${content}</code>`);
		return token;
	});

	html = html.replace(/\[([^\]]+)]\(([^\s)]+)\)/g, (match, label: string, href: string) => {
		const unescapedHref = href.replaceAll('&amp;', '&');
		if (!isSafeHref(unescapedHref)) return match;
		return `<a class="${CLS.a}" href="${escapeAttribute(unescapedHref)}" target="_blank" rel="noreferrer">${label}</a>`;
	});

	html = html.replace(/\*\*([^*]+)\*\*/g, `<strong class="${CLS.strong}">$1</strong>`);
	html = html.replace(/__([^_]+)__/g, `<strong class="${CLS.strong}">$1</strong>`);
	html = html.replace(/(^|\s)\*([^*\n]+)\*/g, `$1<em class="${CLS.em}">$2</em>`);
	html = html.replace(/(^|\s)_([^_\n]+)_/g, `$1<em class="${CLS.em}">$2</em>`);

	for (const [index, value] of code.entries()) {
		html = html.replaceAll(`@@CODE_${index}@@`, value);
	}

	return html;
}

function flushParagraph(output: string[], paragraph: string[]): void {
	if (paragraph.length === 0) return;
	output.push(`<p class="${CLS.p}">${renderInline(paragraph.join(' '))}</p>`);
	paragraph.length = 0;
}

function flushList(output: string[], list: string[], ordered: boolean): void {
	if (list.length === 0) return;
	const tag = ordered ? 'ol' : 'ul';
	const cls = ordered ? CLS.ol : CLS.ul;
	output.push(
		`<${tag} class="${cls}">${list.map((item) => `<li class="${CLS.li}">${renderInline(item)}</li>`).join('')}</${tag}>`
	);
	list.length = 0;
}

export function renderChatMarkdown(input: string): string {
	const lines = input.replace(/\r\n?/g, '\n').split('\n');
	const output: string[] = [];
	const paragraph: string[] = [];
	const list: string[] = [];
	let orderedList = false;
	let inCodeBlock = false;
	let codeBlock: string[] = [];

	for (const line of lines) {
		if (line.trim().startsWith('```')) {
			if (inCodeBlock) {
				output.push(
			`<pre class="${CLS.pre}"><code class="${CLS.preCode}">${escapeHtml(codeBlock.join('\n'))}</code></pre>`
		);
				codeBlock = [];
				inCodeBlock = false;
			} else {
				flushParagraph(output, paragraph);
				flushList(output, list, orderedList);
				inCodeBlock = true;
			}
			continue;
		}

		if (inCodeBlock) {
			codeBlock.push(line);
			continue;
		}

		const trimmed = line.trim();
		if (!trimmed) {
			flushParagraph(output, paragraph);
			flushList(output, list, orderedList);
			continue;
		}

		const bullet = trimmed.match(/^[-*]\s+(.+)$/);
		const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
		if (bullet || numbered) {
			flushParagraph(output, paragraph);
			const nextOrdered = Boolean(numbered);
			if (list.length > 0 && orderedList !== nextOrdered) flushList(output, list, orderedList);
			orderedList = nextOrdered;
			list.push((bullet?.[1] ?? numbered?.[1] ?? '').trim());
			continue;
		}

		flushList(output, list, orderedList);
		paragraph.push(trimmed);
	}

	if (inCodeBlock) output.push(
			`<pre class="${CLS.pre}"><code class="${CLS.preCode}">${escapeHtml(codeBlock.join('\n'))}</code></pre>`
		);
	flushParagraph(output, paragraph);
	flushList(output, list, orderedList);

	return output.join('');
}
