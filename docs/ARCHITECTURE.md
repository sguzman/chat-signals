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

## Direct click activation (v0.3.5)

Firefox Wayland notification click activation is timing-sensitive. Do not queue the click handler behind notification storage writes or await `storage.session.get` before dispatching `tabs.update` and `windows.update`. The notification ID encodes only the existing originating numeric tab ID and is delivered by Firefox only to this extension. Call `tabs.get` immediately, reject missing tabs and any revealed non-ChatGPT URL, then dispatch tab activation and window focus in the same callback. Ask the compositor to focus; never use external executables, broad browser tab sweeps, or new windows. Test synchronous dispatch; the OS notification backend/Wayland compositor may still refuse focus.

## Loaded-page favicon observer (v0.3.6)

Title repair and favicon repair are independent presentation concerns. The earlier favicon drift check ran during response/title lifecycle reconciliation but could miss site favicon writes performed after title settled. The content script now has **one** `MutationObserver` on `document.head` (link-relevant attribute names `href`, `rel`, `type`, `sizes` and structural mutations). Its callback ignores changes that cannot involve an icon link. A relevant batch schedules one 100ms repair check. Only when a favicon candidate differs from the allocated PNG does it repaint. Extension-authored changes are harmless: the next check sees matching candidates and does nothing. Repair attempts are bounded to 12 per minute with one deferred retry across a cooldown, and observer/jobs are released on document disposal. No new privileges, new color assignment, head-wide text reads, response-state changes, notifications, sound, or tab navigation. This fixes **loaded** conversation pages, not pending Firefox session-restore tabs that have not been loaded.

## Composer icon observation (v0.3.7)

Chat Signals' state observer uses a known October 2026 ChatGPT UI shape for Stop in addition to the earlier labeled Stop buttons: a primary-action square SVG with an exact path inside the composer. This does not require page network interception, transcript text reads, or cross-tab injection. An attribute-filtered `MutationObserver` on the current `main` subtree checks `d`, `aria-label`, and `data-testid` changes only when originating under a composer control, so in-place Stop->Send changes trigger one coalesced existing lifecycle reconciliation. This solves a live-state observer gap independently of session persistence.

## Stable favicon identities (v0.3.10)

The 72-swatch OKLab palette remains deterministic and perceptually spaced. Registration is serialized and first-time allocations consider currently registered colors for perceptual distance. Once assigned, the hashed, scope-aware conversation identity maps to its swatch in Firefox's local extension storage (bounded to 2048 identities with oldest-insertion eviction), independent of session registration order. Active tab registrations and notification ledgers remain in session storage, not copied to the permanent ledger. No raw URLs, titles or message contents are saved. The content script no longer paints an optimistic hash swatch while waiting for registration because that swatch might disagree with the chosen color and cause a visible flash. The background result is authoritative for the page. A color hash fallback is used only when registration fails. Previously restored but not yet loaded tabs remain subject to Firefox's normal session-restore favicon caching. With finite colors and historical mappings, occasional color collisions remain possible when two previously assigned identities are open simultaneously; the allocator does not silently change an existing conversation's saved color to resolve those.

## Fast terminal-control observation (v0.3.12)

An active response's composer-control or assistant-footer mutation bypasses the standard 250ms timeout through one queued microtask, ensuring DOM-delivered terminal evidence is reconciled without relying on background timer scheduling. The fast path is limited to active response phases, current form controls and current assistant reply footer/control elements; it never reads message bodies or scans all tabs. Regular structural changes still use bounded scheduling, and streaming text nodes do not trigger the fast path. The content script's visibilitychange handler remains a fallback reconciliation trigger and is independently allowed to change unreadness to viewed. Browser page suspension/discarding remains beyond content-script control.

## Per-tab last-known state ledger (v0.3.13)

The extension uses `chrome.storage.local` under a separate versioned state ledger key. Each entry is indexed by tab ID and contains only a hashed conversation key, timestamp and bounded state tuple (phase, read/viewed, epoch). The background serializes writes and accepts them only from the currently registered tab/document identity. Registration returns the matching recent snapshot alongside the saved favicon color. No tab enumeration, cross-tab script injection, new permissions, raw URL/title persistence or transcript reads. The content script defers initial state painting until registration resolves (or local fallback), restores only the historical state supported by the page, then reconciles current controls. Restoration is silent; event notifications continue to require fresh evidence in a valid active epoch. This design targets extension reloads retaining browser tab IDs; browser-recreated tabs and unloaded documents are not guaranteed to restore.
