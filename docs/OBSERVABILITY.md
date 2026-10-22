# Toward detailed, evidence-aware ChatGPT state capture

This is a **research agenda**, not a list of capabilities already implemented. Chat Signals starts with DOM-observed response state. Subsequent work must refine observation without sacrificing browser stability, privacy or accuracy.

## Working definition

A chat state is not one Boolean such as "generating" or "finished". It is the conjunction of independently observed and inferred dimensions:

| Dimension | Questions to answer | Initial coverage |
| --- | --- | --- |
| Identity | Normal chat, project chat or GPT chat? Same identity across tabs? SPA promotion? | URL-derived scope with per-session color registration |
| Document | Active document loaded? Chat route mounted? Page failed? DOM replaced? | Best-effort UI lifecycle; not exhaustive |
| Composer | Draft present? Attachments queued? Submit enabled? Send initiated? | Not yet modeled |
| Response | Attempt started? Receiving output? Paused? Stopped? Verifying? Finished? | DOM Stop + fresh assistant action only |
| Transport | Request pending? Aborted? Reconnected? Successful protocol exchange? | Not yet observed; HTTP success must not certify completion |
| Render | Streaming text? Tool call running? Terminal action controls present? | Fresh terminal reply control only |
| Interruption | Pending retry? Recovered? User action required? | Short visible interruption notices |
| Failure | Per-response error, conversation shell error, network error? | Limited recognized UI notices |
| Exhaustion | Conversation-length limit or another scoped usage limit? | Limited conversation-length notice |
| Attention | Finished in focused/background tab? Seen after return? | Viewed/unread on verified finish |
| Reliability | Which evidence supports the inference? Is it stale, missing or contradictory? | Reason code, confidence label, epoch |

Do not collapse these dimensions into a single expanding enum. Derive the display emoji from a clearly defined projection; retaining detailed evidence is more important than inventing more emojis.

## Proposed observation record (not implemented)

A future private in-memory observation can contain: monotonic time, document/route epoch, response attempt epoch, source family (DOM/network/browser), a bounded signal code, evidence freshness, applicability scope, confidence, inferred transition and a contradiction flag. Do **not** include chat text, prompt text, raw URLs, request bodies, cookies or private identifiers in public diagnostics.

Classify every inference as observed, inferred, candidate, unknown or contradicted. An absent signal cannot prove its opposite. Separate missing observation from a valid negative observation (for example a positively observed Stop disappearance after an earlier Stop).

## Explicit adverse cases

- Old completed assistant footer persists while new reply begins: this is not fresh completion.
- An unrelated network POST fails after successful generation: this is not new conversation failure.
- A current response interrupts: no automatic success or terminal failure.
- A tab becomes focused: this can mark unread complete response viewed, not change generation.
- A message is regenerated using an existing assistant turn: final action identity may be reused; remain verifying until stronger evidence exists.
- A long chat exceeds the bounded DOM traversal: record an observation gap, not "idle" or "finished".
- Background page suspends or timers throttle: stale data is stale; the presentation should not silently assert recency.
- Extension update leaves existing documents running their previous script version: do not claim upgrade coverage.
- ChatGPT UI changes selectors: unknown must remain expressible.

Each future detector needs *both* a positive fixture and a nearby negative counterexample. This is how we avoid historical swings between too-eager and too-conservative recognition.

## Viewsource as a research partner

The public [Viewsource chat-interaction candidate graph](https://github.com/sguzman/viewsource/blob/main/specimens/chatgpt-com/v0002/chat-interaction.graph.json) provides an abstract candidate model of conversation, message, branch, draft and response. It is explicitly **candidate**, with limited observed HTML surfaces; it is not a discovered production ChatGPT state API.

Viewsource's [system research](https://github.com/sguzman/viewsource/blob/main/specimens/chatgpt-com/v0002/phase5_system_analysis.json) reports syntax-level indicators for fetch, stream readers, abort controllers, workers and DOM observers, but does not establish which module owns live conversation state.

Use those publications to generate **hypotheses and test plans**, not selectors or private data migrations. Review candidate state transitions against authorized, isolated live-browser tests before implementing new detectors.

## Milestones

1. **M0 — independent bootstrap:** domain-limited extension, baseline state machine, finite OKLab favicon palette, isolated tests and sanitized historical autopsy.
2. **M1 — visibility correctness:** validate selectors across normal/project/GPT chats, reloads, long chats and SPA navigation without real-profile automation. Fix only demonstrated mismatches.
3. **M2 — response operations:** classify fresh Send/Retry, canceled responses, tool activity, interruptions and terminal evidence; add richer structured in-memory evidence.
4. **M3 — transport corroboration:** consider minimal request-lifecycle permissions only if they demonstrably disambiguate DOM cases. Never conflate completed transport with completed answer.
5. **M4 — alerts:** add completion chime/notification only after trusted completion signals, with independent delivery-state confirmation and foreground/background parity.
6. **M5 — extensive diagnostics:** privacy-filtered local state inspector, explanations of inference, uncertainty and contradiction, deliberate export only if explicitly approved.

Progress is evidence-dependent, not a schedule or excuse to invent functionality. Each milestone lists what is actually verified and what remains unknown.
