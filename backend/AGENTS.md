# AGENTS.md

## LinkedIn Automation

- Investigate LinkedIn with `cloakbrowser` using `src/browser.ts` settings; do not open `chrome-profile/` directly with `playwright-cli`.
- After sensitive actions, check for `/login`, `checkpoint`, or signed-out pages; report auth loss explicitly.
- Never submit Easy Apply during investigation unless explicitly requested.
- Prefer stable selectors: `li[data-occludable-job-id]`, `button[data-live-test-job-apply-button][data-job-id]`, `[role="dialog"]`, native `element.labels`.
