# Browser control reference

You drive a real Chromium browser by calling the `browser` tool. Each call takes `args`: an array of
arguments passed verbatim to a `playwright-cli` invocation. Examples below show the `args` array.

The browser is stateful across calls within this application: after `["open", url]` the page stays
open for the next call.

## Discovering elements
- `["snapshot"]` — capture the current page. The tool returns a tree of elements, each with a stable
  `ref` (e.g. `e15`) plus its role/name. You MUST take a snapshot to learn refs before acting, and a
  ref is only valid for the snapshot it came from. After the page changes (navigation, click that
  reveals new fields, dialog), take a fresh snapshot before acting again.

## Navigation
- `["open", "https://..."]` — open/navigate to a URL.
- `["goto", "https://..."]` — navigate the open page.
- `["go-back"]`, `["go-forward"]`, `["reload"]`.

## Acting on elements (always use a ref from the latest snapshot)
- `["click", "e15"]` — click an element.
- `["fill", "e7", "text to type"]` — fill a text input.
- `["select", "e9", "Option label"]` — choose a dropdown option.
- `["check", "e3"]` / `["uncheck", "e3"]` — checkbox / radio.
- `["hover", "e5"]`, `["press", "Enter"]`.
- `["upload", "/abs/path/to/file.pdf"]` — upload a file to the active file input. Trigger the file
  chooser first (e.g. click the upload control), then call upload with the absolute path you were given.

## Reading
- After any command the tool returns the resulting page state (URL, title) and, for `snapshot`, the
  element tree. Read it to decide the next action.

## Rules
- Prefer the exact refs from the most recent snapshot. Never invent a ref.
- If a command fails or the page looks unexpected, take a fresh `["snapshot"]` and reassess.
