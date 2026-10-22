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
