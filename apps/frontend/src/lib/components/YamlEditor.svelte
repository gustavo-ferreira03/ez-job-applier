<script lang="ts">
	interface Props {
		value: string;
		placeholder?: string;
		class?: string;
		oninput?: () => void;
	}

	let { value = $bindable(''), placeholder = '', class: klass = '', oninput }: Props = $props();

	let pre = $state<HTMLPreElement>();

	function escapeHtml(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function highlightValue(v: string): string {
		if (v === '') return '';
		const trimmed = v.trim();
		if (/^(true|false|null|~)$/i.test(trimmed)) return `<span class="tok-bool">${escapeHtml(v)}</span>`;
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) return `<span class="tok-num">${escapeHtml(v)}</span>`;
		if (/^(["']).*\1$/.test(trimmed)) return `<span class="tok-str">${escapeHtml(v)}</span>`;
		return escapeHtml(v);
	}

	function highlightLine(line: string): string {
		const comment = line.match(/^(\s*)(#.*)$/);
		if (comment) {
			return escapeHtml(comment[1]) + `<span class="tok-comment">${escapeHtml(comment[2])}</span>`;
		}
		const m = line.match(/^(\s*)(- )?(.*)$/);
		const indent = m?.[1] ?? '';
		const dash = m?.[2] ?? '';
		const rest = m?.[3] ?? '';
		let out = escapeHtml(indent);
		if (dash) out += `<span class="tok-punc">- </span>`;
		const kv = rest.match(/^([^:#]+)(:)(\s*)(.*)$/);
		if (kv) {
			out +=
				`<span class="tok-key">${escapeHtml(kv[1])}</span>` +
				`<span class="tok-punc">:</span>` +
				escapeHtml(kv[3]) +
				highlightValue(kv[4]);
		} else {
			out += highlightValue(rest);
		}
		return out;
	}

	let html = $derived(value.split('\n').map(highlightLine).join('\n') + '\n');

	function syncScroll(e: Event) {
		const ta = e.currentTarget as HTMLTextAreaElement;
		if (pre) {
			pre.scrollTop = ta.scrollTop;
			pre.scrollLeft = ta.scrollLeft;
		}
	}
</script>

<div class="yaml-editor {klass}">
	<pre bind:this={pre} class="ye-layer ye-pre" aria-hidden="true">{@html html}</pre>
	<textarea
		class="ye-layer ye-ta"
		spellcheck="false"
		autocapitalize="off"
		{placeholder}
		bind:value
		oninput={() => oninput?.()}
		onscroll={syncScroll}
	></textarea>
</div>

<style>
	.yaml-editor {
		position: relative;
		overflow: hidden;
		border-radius: 6px;
		border: 1px solid var(--color-border-default);
		background: var(--color-surface-overlay);
	}
	.yaml-editor:focus-within {
		border-color: var(--color-border-strong);
	}

	.ye-layer {
		margin: 0;
		width: 100%;
		height: 100%;
		padding: 8px 12px;
		box-sizing: border-box;
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 12px;
		line-height: 1.6;
		tab-size: 2;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		word-break: break-word;
	}

	.ye-pre {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		color: var(--color-text-primary);
	}

	.ye-ta {
		position: relative;
		display: block;
		resize: none;
		border: 0;
		outline: none;
		background: transparent;
		color: transparent;
		caret-color: var(--color-text-primary);
		overflow: auto;
	}
	.ye-ta::placeholder {
		color: var(--color-text-placeholder, #6b7280);
	}

	.ye-pre :global(.tok-key) {
		color: var(--color-syntax-key);
	}
	.ye-pre :global(.tok-str) {
		color: var(--color-syntax-string);
	}
	.ye-pre :global(.tok-num),
	.ye-pre :global(.tok-bool) {
		color: var(--color-syntax-number);
	}
	.ye-pre :global(.tok-comment) {
		color: var(--color-syntax-comment);
		font-style: italic;
	}
	.ye-pre :global(.tok-punc) {
		color: var(--color-syntax-punct);
	}
</style>
