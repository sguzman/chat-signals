# Conversation state model — initial contract

The primary product is an **evidence-aware observation** of a chat, independent of its favicon, title, and alert policy.

## Distinct dimensions

1. **Conversation identity:** normal, project or custom-GPT scoped chat. Unrecognized routes remain unidentified; never invent IDs from page text.
2. **Response activity:** `idle`, `submitted`, `generating`, `verifying`, `finished`, `interrupted`, `failed`, `limit`, `unknown`. This is an **inferred state**, not a server guarantee.
3. **Read status:** `unread` or `viewed` for a *verified finished event*, independent of activity.
4. **Evidence:** finite coded observations with timestamp, source family, current response epoch, and explanation of what remains unsupported.
5. **Confidence:** `observed` (direct UI fact), `inferred` (transition from facts), `unknown` (insufficient evidence); never present a speculative state as certain.

## Evidence to state transitions

| Evidence | Inference | What it cannot prove |
| --- | --- | --- |
| Explicit composer submission (Send, Retry, form submit or Enter) | Submitted; intent observed but unconfirmed | That ChatGPT accepted the request or started generating |
| New assistant turn becomes visible after Send/Retry | Generating, even if no Stop was observed | That the assistant has finished or the answer is correct |
| Stop response control visible in the current composer | Generating | That a network request succeeded or output will complete |
| Stop disappears after generation | Verifying | That a reply completed |
| Fresh assistant reply **and** its finished action controls, after current generation | Finished | Content correctness or remote persistence |
| Current, recognizable interruption notice | Interrupted | Permanent loss, error, or eventual recovery |
| Recognizable, current response failure notice | Failed | Failure of the entire conversation |
| Recognizable page-level failed conversation shell | Failed | Failure of an individual assistant message |
| Conversation-length limit notice | Limit | An unrelated network outage |
| HTTP success/failure without matching UI evidence | Unconfirmed | Response completion or conversation failure |
| Tab focus/visibility change | Read status only | Generation, failure, success, or conversation identity change |

Do not read user/assistant transcript text to classify content. Only narrow, short status controls and action affordances can be inspected, excluding conversation turns except locating their structural reply/footer elements. No conversation text is stored.

## State consistency rules

- Stop/manual cancellation must not be reclassified as a network failure.
- Incidental backend calls must not restart a verified reply; a fresh response epoch needs user interaction and/or actual generation evidence.
- New errors cannot be inferred from CSS color or stale banners. A preexisting banner must not block a later verified reply.
- A completed epoch cannot transition back to generating because of the previous epoch's delayed event.
- Foreground/background impacts unreadness, **not whether completion occurred**.
- Loss of observer contact, missing controls or site changes produce unknown/verifying with explicit reason codes, never invented success.
- New conversation identity resets the response epoch; old pending events never attach to the new identity.
- State publication is idempotent; repeated observations of unchanged evidence produce no updates.

## Initial implementation boundary

The first implementation can observe user submission intent, DOM-visible generations and final action controls. Submitted intent becomes unknown after nine seconds without further evidence; it is not proof of a network operation. State coverage gaps are documented, not silently filled with request success. A richer network/transport cross-check and source-level ChatGPT study are **subsequent research tasks**, not claims of implemented behavior.

The visible initial state of a recognized idle conversation is ⚪. Explicit assistant-turn markers may establish generation even without Stop evidence. Fresh completed reply actions are still required for ✅, and changes to an old assistant's toolbar alone are not completion evidence. New replies can resolve a previously unknown submission rather than leaving it permanently unconfirmed.

## Terminal controls in nested turns

A response's Copy control can be a sibling of the assistant's inner article within the same conversation-turn container. Completion observation must use the **current assistant turn container** as scope; checking only inside the article misses valid completion, while checking the entire document permits a stale prior turn to masquerade as a new result. A nested-toolbar fixture and stale-previous-toolbar counterexample enforce this distinction. No conversation text is read.

## Alerts: events are not every state mutation

Only an observed entry into `finished`, `interrupted`, `failed` or `limit` during a known active response epoch is alertable, with separate event types and independent once-per-epoch deduplication. Routine transitions and `finished/unread → finished/viewed` are never alertable. A warning may be followed by a success on recovery within the same response attempt, but repeated warnings in that attempt remain silent. A state observed upon opening an older conversation without a new response attempt does not make a desktop alert. Alert sounds do not participate in evidence inference.

## Preventing premature success (v0.3.2)

When a response appears after a slow or unconfirmed submission, the first observation of a new assistant turn establishes **generating**, not **finished**, even if some toolbar buttons already exist. Generic feedback/action buttons never count as terminal evidence; only an explicit Copy control is considered. Without a previously observed Stop/disappearance, a Copy control must appear **after** the new assistant turn was independently observed before completion can be inferred. Repeated observations of an already-present Copy button are not independent evidence. This favors an uncertain/generating indicator over a false success alert on fast or unusual render paths; a future richer page observer may provide more reliable completion evidence. This rule does not modify notification sounds or favicon allocation.

## Transient connection interruption (v0.3.3)

A visible, exact connection-interrupted waiting banner is **interrupted** (🔌), not generic unknown (❔), even after the submission-unconfirmed timeout. The banner may be an ordinary element without an alert role. A bounded fallback checks only short, visible, leaf-like status candidates outside user/assistant transcript bodies. While visible, the interruption overrides any terminal Copy action. When the banner disappears, the state becomes **verifying** (🔎) unless direct evidence shows the response resumed generation; it does not become finished just because the banner cleared. A repeated interruption for the same response epoch has no second warning sound or notification. A newly loaded conversation without a known in-progress response can show the banner but emits no speculative notification.

## Observed composer Stop glyph on already-running pages (v0.3.7)

The current ChatGPT UI has an unlabeled, composer-scoped square Stop glyph (captured October 2026) as an alternative to labeled/test-ID Stop controls. A freshly attached observer on a page that is already generating must detect either form in its **first** observation, even when no local Send intent was observed. This is direct `stop-visible` evidence, not speculative restore of in-memory state. Require the exact captured SVG path inside the proper composer button; do not match arbitrary square icons, generic spinners, or old message bodies. The `main` observer additionally checks narrow `d`, `aria-label`, and `data-testid` attribute changes on composer controls, because Stop can become Send without replacing any DOM nodes. `stop-visible` still outranks idle, but disappearance alone yields `verifying`, never a success notification. The browser cannot truthfully reconstruct work that is ongoing only on the server but has no corresponding UI evidence.

## Input-stream failure (v0.3.8)

The exact visible status `Error in input stream` is direct negative UI evidence for a response attempt, even when the error container has no alert role or test ID. A bounded leaf-element scan excludes assistant/user transcript bodies. When a fresh banner appears, `failed` overrides Copy-derived `finished` and clears unreadness; it may arrive after a premature completion inference. A banner present at the subsequent Retry baseline is stale and cannot fail that new attempt. Reloading a page with an explicit banner can display `failed` with response epoch zero, but cannot generate a new notification. Never classify an assistant quotation of these words as a live error, or infer errors from red styling.

## Persistent interruption alert grace (v0.3.9)

A direct UI observation of the exact connection-interruption banner still immediately enters `interrupted` and displays 🔌. The notification and chime are separate: they are deferred for five seconds, then delivered only when the same conversation and epoch still show an interruption and the visible notice remains present. If it recovers, completes or navigates elsewhere before confirmation, no warning is emitted and no warning deduplication slot is consumed; a subsequent persistent interruption in the same response epoch may warn once. Errors and limits remain immediate. This is a UX alert policy, not a claim that a short interruption did not actually happen.

## Rich response terminal scope (v0.3.11)

The observer still uses only the latest assistant turn's explicit Copy control to confirm completion and never reads message bodies. For a turn with thousands of nested elements, a short reverse walk might encounter the footer but never reach the assistant marker. When a traversed element is inside a conversation-turn wrapper, the observer now checks that wrapper for the assistant marker and treats the wrapper as the terminal-control scope. User-only wrappers are skipped. Without a matching, current reply Copy control, Stop disappearance still produces `verifying` rather than speculative `finished`. Keep stale earlier Copy controls and incomplete active turns as negative counterexamples.

## Background terminal observation (v0.3.12)

Visiting a tab may acknowledge a finished unread response (🔔 to ✅), but must not be required to detect finished response activity. During an active response, narrowly relevant composer Stop/Send changes and assistant footer/Copy-control mutations trigger a coalesced microtask sample, rather than waiting for a hidden-tab setTimeout to fire. Removal checks the surviving composer parent because a detached Stop button cannot match selectors requiring a form ancestor. Inspect action controls structurally in the newest assistant turn, even when the Copy button has no layout box until hover. This still requires a fresh current-response terminal action and absence of a Stop and blocking notice; a historical reply's Copy control or a generic feedback button cannot certify completion. Streaming message text updates do not trigger the fast path. A genuinely browser-suspended document cannot emit DOM events; there is no remote completion claim in that case.

## Restored state is historical evidence (v0.3.13)

An extension update can restart or reinject a content script without any new response event. The prior in-memory tracker did not persist, which caused a visible false ⚪ idle reset. The background stores the last-known phase, read flag and epoch with an opaque hashed conversation identity and browser tab ID; storage has a 14-day age limit and a 512-entry cap. Initialization waits for this data before writing a new title. The restored state is observational history, not proof of current remote activity: finished, failed, limit and verifying histories may be displayed; submitted/generating/interrupted without fresh evidence are shown as verifying. Current visible Stop and explicit error banners override historical evidence. Restore does not emit a new completion/error notification, and an old mounted Copy button is baseline evidence rather than proof of a new completion. New submission intent always supersedes the snapshot. A background unread completion remains unread until the actual tab is visited. The ledger is not a transcript store and is removed on tab closure when observed.
