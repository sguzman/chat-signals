# Architecture and safety decisions

## Four independent concerns

**Observation** reads a narrow, bounded set of ChatGPT composer controls, explicit user submission events, latest assistant reply structure and short status notices; outputs coded evidence. No favicon/title writes here.

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

## Submission evidence (initial)

The script listens for an explicit Send/Retry button, a composer form submission, or unmodified Enter in the composer. Submission is represented as `submitted` with 📤, not as proven generation. The actual Stop control advances it to `generating`. A fresh completed assistant action may confirm a fast response without an observed Stop. If nine seconds pass with no confirming evidence, submitted becomes unknown; no repeated probing or network hooks are introduced. Ordinary Shift+Enter or Enter outside the composer never starts a response epoch. This detector does not access or save prompt content.

## Observation of a new assistant response without Stop

Submission alone is intent, not proof of response generation. The appearance of a newly identified assistant turn after the submission baseline is direct structural evidence that generation began. Do not infer finished from the reply shell: only the new reply's completed action controls can finish the attempt. A DOM re-render of the previous assistant's existing turn or controls is a negative counterexample. These facts remain in-memory only; no message bodies or raw chat identifiers are recorded.

## Completion alerts and audio

A completed **response epoch** is the sole trigger for an alert. In the observing tab, the transition to `finished` with a fresh response action schedules one local two-note Web Audio chime. The same transition sends a minimal message containing only the already-hashed conversation key, a random per-document nonce, and the monotonic response epoch to the background component. No transcript, title, prompt, raw URL, DOM fragment or chat-specific notification text crosses that boundary. Audio attempts occur in both foreground and background tabs, after trying to unlock the context in a preceding explicit Send gesture. Browser autoplay restrictions may block or delay audio; delayed playback is deliberately suppressed.

The background verifies the message originated from `chatgpt.com` and is for the currently registered tab/document. It records the delivered epoch in `storage.session` before invoking `notifications.create`, so event-page suspension and duplicate transitions cannot produce repeated notifications. OS notification delivery is not guaranteed by the browser API callback. The notification icon reuses the content script's generated PNG favicon, validated as a bounded base64 PNG data URL; a bundled static icon is the fallback. One generic notification ID is reused per tab to avoid accumulating notifications for every response. No tab focus changes or background injections are performed.

Regression tests include foreground completion, old-toolbar re-render, duplicate epochs, new documents/identities, origin validation, audio blocked, and a true installed-extension background-worker path. The original favicon colors and response evidence classifier do not depend on audio/notification success.

## Event alert taxonomy (v0.3.0)

The pure `src/alerts.js` module maps **phase transitions** to four event kinds: completion/success, interruption/warning, failure/error and length-limit/warning. Intermediate phases and recovery remain silent. It checks the response epoch and remembers the last alerted epoch *per kind*. `finished/unread → finished/viewed` is a read-status transition, not an event; **it can never trigger a second notification or chime**. Repeated interruption/recovery cycles in one epoch also do not replay the warning. The event store resets on a changed conversation identity, not a visibility event.

The background accepts a strict finite event vocabulary from a registered ChatGPT tab and stores an independent `deliveredEvents` ledger for each document. It renders canned category/messages only; a page cannot supply notification text or change the type/severity. The notification icon still uses the validated generated favicon. A compatibility handler for the earlier `chat-signals-complete` message remains in place during the transition. Web Audio synthesizes short ascending/descending/dissonant/three-note motifs, with no external files or service dependency. Recovery sounds/notifications are deliberately silent by default to avoid a new source of interruption noise. No message bodies or titles are examined.

For failed and limited attempts, repeated visibility of the old Stop control must not create a new response epoch. A fresh Send/Retry can start the next epoch. New alert assertions include negative cases for stale prior errors, duplicate UI observations, unread→viewed, unrecognized event type, foreground/background completion and same-document background restart.

## Bounded favicon reconciliation

The response alert's PNG is generated from the independently allocated conversation color; its presence in an OS notification does **not** prove that Firefox still displays that favicon in the tab. ChatGPT may rewrite or append its own favicon declarations after initial page hydration. During existing response-state reconciliation and existing single-title-element updates, Chat Signals checks whether visible favicon candidate links still match the allocated PNG, reasserting it only on detected drift (maximum 12 repairs per minute). There is **no observer on document.head**, no favicon polling timer, no keep-alive request, no color reallocation, and no state/notification transition created by the repair. Tests explicitly simulate late site favicon overwrite and insertion while the extension is installed, followed by safe restoration on disposal.

## Notification click activation and Developer Edition

Desktop notifications now have an onClicked handler in the background component: parse the extension-generated tab ID, check that it still has a registered Chat Signals session, call `tabs.get`, activate only that tab with `tabs.update({active:true})`, then focus that tab's existing window with `windows.update({focused:true})`. Do not open new tabs, copy private content into notifications, navigate URLs, or query all tabs. Synthetic tests reject unknown/stale notification IDs and verify the tab-then-window ordering. Window-manager focus prevention is separate: eosbox's Hyprland `focus_on_activate` rule now recognizes the Firefox Developer Edition class as well as the regular Firefox class.

The interruption detector also supports the exact unlabelled ChatGPT connection banner with a bounded search of short status-like leaves outside message bodies. Removal of an unlabelled banner prompts reconciliation so 🔌 can clear to 🔎. This is visible UI evidence only: it does not mean the server stopped, and disappearing alone does not mean the response finished.

## Notification severity emblems (v0.3.4)

Firefox/Chromium's basic notification API does not offer native success/warning/error urgency metadata. The content script passes a separate, encoded PNG icon for the notification event using the already selected OKLab chat identity color and shape, overlaid with a high-contrast badge: checkmark for completion, exclamation for interruption or conversation limit, cross for failure. The existing `drawIcon(hex, kind)` call without an event argument remains the only favicon source, so changing alert severity cannot change the tab favicon. Background notification creation still validates the data-URL format and still has a packaged fallback; never store chat content or change the notification ledger to render an emblem.
