---
name: browser-automation
description: Use this skill before doing any browser work (navigating sites, filling forms, scraping, multi-step web flows) once the browser toolset is active. It contains the batching contract, action categories, and worked examples for efficient browser control.
---

# Browser Automation Guide

You control a real Chrome browser through focused tools. Use this guide to reduce unnecessary LLM round trips while staying safe against stale page state.

## Batching Contract

- Default to `browser_batch` for browser work. Use individual `browser_*` calls only when the next action genuinely depends on observing the previous result.
- Chain up to 5 same-goal actions per batch.
- Put any page-changing operation last. Actions after a page change are automatically skipped and you receive fresh state.
- If a batch stops because the page changed, continue from the snapshot in the batch result. Do not call `browser_snapshot` again unless the page may still be changing or the result did not include enough state.
- Do not try multiple different paths in one batch. Each batch needs one clear goal.

## Action Categories

- Page-changing (place last): `navigate`, `search`, `go_back`, `go_forward`, `tab_new`, `tab_focus`, `evaluate`.
- Potentially page-changing (monitored at runtime): `click`, `press`.
- Safe to chain: `type`, `hover`, `select`, `get_dropdown_options`, `select_dropdown`, `scroll`, `wait`, `search_page`, `find_elements`, `extract`, screenshots, dialog checks.

## Recommended Batches

- `type` + `type` + `type` + `click` -> fill multiple form fields, then submit.
- `type` + `type` -> fill multiple fields without submitting.
- `scroll` + `scroll` + `extract` -> move further down the page, then collect content.
- `search_page` + `find_elements` + `extract` -> locate visible text, identify targets, then extract relevant data.
- `click` + `click` -> perform a multi-click flow only when both clicks are known not to navigate.
- `navigate` alone, or safe setup actions + `navigate` last.

Do not chain across an unknown page transition. If the next action depends on what appears after a click, put the click last and observe the updated state next.

## Tool Usage Contract

1. Start browser work with `browser_snapshot` before interactions.
2. Use refs from the latest snapshot only.
3. After page-changing actions, use the updated snapshot returned by the tool result.
4. Prefer deterministic refs/selectors over guesswork.
5. Use `browser_interact` `evaluate` only as a last resort.

## Primary Workflow

1. `browser_snapshot` to get URL, tabs, page stats, and element refs.
2. `browser_batch` for short same-goal chains.
3. `browser_interact` for a single action when batching is not safe.
4. `browser_wait` only when stability is required by selector or explicit timing.
5. Call `browser_snapshot` again only when the previous result did not include an updated snapshot or the page may still be changing.

## Tool Responsibilities

- `browser_snapshot`: Capture current page state, refs, and viewport/new element markers.
- `browser_navigate`: Navigate/search/history/tab operations.
- `browser_interact`: Element, dropdown, keyboard, and mouse interactions.
- `browser_wait`: Wait for selector or timed delay.
- `browser_screenshot`: Viewport, full-page, or element screenshots.
- `browser_dialog`: Inspect/handle open dialogs.
- `browser_content`: Extract page content, search visible text, find elements by selector.
- `browser_batch`: Execute a short sequence of browser actions in one call.

## Reliability Rules

- If an interaction fails with stale/missing ref, run `browser_snapshot` and retry once.
- If blocked by a dialog, beforeunload prompt, or popup request, use `browser_dialog` before retrying actions.
- After navigation-capable actions (`browser_navigate`, `click`, `press`), verify current page using the updated snapshot in the result.
- Navigation actions already wait for readiness and short quiet periods; use `browser_wait` only for specific selectors, timers, or ongoing app updates.
- Do not loop retries on CAPTCHA, rate limits, or auth blocks.

## Interaction Guidance

- For autocomplete fields: type, use the returned snapshot if you submitted, otherwise snapshot before choosing a suggestion.
- For dropdowns: use `get_dropdown_options` before guessing, then `select_dropdown` by visible option text.
- For data tasks: use `browser_content` `extract` with `includeLinks`, `includeImages`, or `outputSchema` when structured output is more efficient than full page text.
- Dismiss overlays/cookie banners before main actions.
- If target content is not visible, scroll and snapshot again.
- Prefer targets marked `viewport`; use `new` markers to notice elements that appeared since the previous snapshot.
- Use `browser_content` for fast text/DOM checks when full snapshots are unnecessary.

## Asking The User For Help

- Use the `question` tool when user intervention is needed in the browser.
- Common scenarios: logging in, completing CAPTCHA/MFA challenges, filling out forms with personal data, or confirming irreversible actions.
- When asking, describe what the user needs to do and provide a clear option to signal completion.
- After the user confirms they've completed the action, take a fresh `browser_snapshot` to verify the new page state before continuing.

## Verification Before Completion

- Re-check the original request.
- Confirm outcomes with snapshot/content checks.
- Never fabricate data or claims.

## Response Style

- Provide concise, factual results.
- Include key URLs and what was verified.
