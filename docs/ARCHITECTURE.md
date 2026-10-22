# Architecture and safety decisions

## Four independent concerns

**Observation** reads a narrow, bounded set of ChatGPT composer controls, latest assistant reply structure and short status notices; outputs coded evidence. No favicon/title writes here.

**Interpretation** is a deterministic response-epoch state machine, keeping unknown, interrupted, verifying, failed and finished distinguishable. Old and incidental events must not overwrite newer outcomes.

**Identity** maps scoped conversation URLs to a stable hashed key and selects a color from a defined OKLab candidate set, excluding currently allocated swatches when available. This dimension never depends on response state. A normal chat uses a square PNG favicon, a project chat a circular PNG. Color distance is approximate; extreme tab counts may exhaust the finite palette.

**Presentation** updates only this tab's icon and title on meaningful state/route changes. Emoji prefixes represent state; current title text is otherwise preserved. ChatGPT can independently overwrite the title after a response-state transition. Only while a state emoji is active, a narrowly targeted observer on the existing `<title>` element can repair its prefix: an equality check prevents self-triggering updates, and at most 12 title repairs per minute are allowed. The observer does **not** watch `document.head` or favicon changes and disconnects in idle/disposal. Focus can mark a verified completion viewed, not change response phase.

## Lifecycle boundaries

Use a Manifest V3 extension with both `background.scripts` (Firefox event page) and `background.service_worker` (Chromium worker) pointed at the same background file. No install/reload-time fan-out; manifest content scripts activate on page load. Already-open tabs are not forcibly navigated, scanned or hot injected after an extension update.

Only one tab that registers a conversation can request identity allocation. The background component manages per-session active allocations; tab removal releases its assignment. Store **hashed identity**, not raw URL or conversation content. No network access or telemetry.

DOM observation is restricted to a bounded `main` subtree, ignores character data and does not watch head/title/favicon. Reconcile at most once per short scheduling window. No per-token page-wide CSS queries, no bulk tab work. Handlers/timers disconnect on page unload and route change.

## QA gates

- Color test vectors and pairwise distance checks; stability for the same conversation and multiple open chats.
- State transition fixtures: generation, completion, cancellation, stale error, real interruption, length limit, background completion, new send after completion, incidental requests, route change.
- Mutation loop test: thousands of harmless head changes trigger no state observations; repeated title rewrites never trigger more than 12 title repairs per minute, do not change state, and cannot self-loop.
- Synthetic multi-tab isolated Firefox/Chromium tests with no personal profiles.
- Compare expected side effects: no tab reloads, no page navigation, no network telemetry, no repeated favicon writes or duplicate notifications.
- On any defect, add the failed scenario **and a counterexample for the opposite extreme**, before changing inference thresholds.

Browser simulation is evidence of code mechanics only; a live ChatGPT interface may change selectors and streams. No test suite can prove the absence of a native-browser crash.
