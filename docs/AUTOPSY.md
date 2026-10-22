# ChatGPT Tab Signal — technical autopsy of the prior extension

This document describes **reported technical failures** of the historical Microsoft Edge/Chromium extension and relevant public source history. It does not reproduce conversations, diagnostics, session data or other non-public material. The historic code was derived from an AGPL-3.0 project; this new MIT repository uses an independent implementation.

## Evidence rules and causation

**Reported** = encountered in actual browser use. **Code-supported** = a public legacy commit, README or implementation demonstrates a relevant behavior or mitigation. **Hypothesis** = plausible but unproved causal explanation. **Unknown** = evidence insufficient. A historical commit titled "fix" establishes that a change was made, not that live failure was completely eliminated. Passing synthetic CI is not equivalent to real-site QA.

The key pattern was **alternating overcorrection**: one missed signal prompted eager detection, which caused false positives; one false positive prompted blanket suppression, which caused missed signals. Recovery safeguards sometimes disabled ordinary behavior rather than addressing the precise failure.

## Failure catalog

| ID | Reported failure or failure mode | Evidence classification | Regression gate for a new implementation |
| --- | --- | --- | --- |
| F-01 | Multiple existing ChatGPT tabs were disrupted and the Edge process crashed/restarted while the extension was under development | Reported; cause **unknown** | Never bulk-reinject, reload or enumerate-and-mutate tabs after install/update |
| F-02 | A head/title observer could react to its own title/favicon writes, producing repeated work and possible feedback | Static-code risk / hypothesis; not proven crash cause | Observe no head subtree; verify repeated unrelated head changes cause zero state checks |
| F-03 | An extension-update path attempted broad active-tab injection/color updates, increasing browser-session blast radius | Code-supported by legacy disable-bulk commit | Install/update should not mutate existing tab documents |
| F-04 | Already-open tabs kept old content-script callbacks after extension reload; indicators stuck or competing scripts wrote titles | Reported; legacy ownership/handoff fixes documented | Explicit lifecycle ownership and disposal, with no forced reload and no duplicate owner on new loads |
| F-05 | Chat completed while ⏳ persisted | Reported | A fresh completed reply plus terminal actions transitions out of generating |
| F-06 | ✅ appeared while output was still generating | Reported | Never equate successful POST, Stop disappearance or generic copy control with completed current reply |
| F-07 | ✅ reverted to ⏳ without a fresh user response | Reported; [legacy mitigation](https://github.com/sguzman/script-monkey/commit/98ebd250ffce6ef26f9526e1b4c9dfb2b5972fd9) | Incidental backend calls do not start a new response epoch |
| F-08 | Legitimate new Send/Retry was ignored after stricter incidental-request blocking | Code-supported by [request-time correlation change](https://github.com/sguzman/script-monkey/commit/10793dc81ffedd8b29f037b87d5cfb98cdda780b) | Explicit new prompt can transition to generating immediately despite previous finished state |
| F-09 | Harmless red UI was interpreted as ⚠️, suppressing successful notification/audio | Reported; legacy fix documented | CSS colors and generic red text are never error evidence |
| F-10 | Preexisting error banner vetoed a later healthy response | Reported; legacy error-scoping updates | Require current-epoch error evidence, not stale banners |
| F-11 | Actual failed responses were sometimes not recognized after conservative error rules | Reported / legacy commit progression | Test targeted current explicit error notices alongside benign warning controls |
| F-12 | Connection interruption was treated as terminal failure or completion when outcome was indeterminate | Reported; legacy added distinct state | Interruption maps to indeterminate waiting, not verified success/failure |
| F-13 | Individual response-load errors and full conversation-load failures were conflated | Legacy explicit status expansion | Distinguish failed response from failed conversation shell |
| F-14 | Conversation length exhaustion was missed or labeled as generic network failure | Reported / legacy limit handling | Length-limit indicator takes precedence when positively observed |
| F-15 | A manual Stop was misinterpreted as network failure in request lifecycle handling | Legacy cancellation safeguards | Cancellation never triggers a failure notification without independent evidence |
| F-16 | Background completion was not detected because delayed checks could be throttled | Reported; legacy background fallback added | Hidden-tab tests; verify without relying exclusively on content-script timers |
| F-17 | Alerts/chime absent after a confirmed response | Reported | Separate accurate completion classification from delivery result; test foreground and background |
| F-18 | Audio command was scheduled, but audible playback not actually verified; OS notification sound had been suppressed | Reported and legacy implementation | No claim of audible sound from a successfully scheduled callback alone |
| F-19 | Moving focus among tabs changed emoji or favicon state unexpectedly | Reported; legacy [focus stabilization](https://github.com/sguzman/script-monkey/commit/613a7abc7f062f66a3722b496b28aa2f8085bfc0) | Focus may mark unread as viewed; it cannot change response phase or identity color |
| F-20 | Color/favicon blinked, differed between notification and tab, or was reassigned on unrelated events | Reported / legacy stable-allocation changes | Identity color stable within its documented lifetime and independent of state |
| F-21 | Title emoji prefixes duplicated or fought ChatGPT's own title writes | Reported / legacy title repair debounce | Idempotent prefix removal; no head observer feedback loop |
| F-22 | Unrelated toolbar identity/status UI was modified even though favicon/title were the requested surfaces | Reported | Presentation surface whitelist; never change toolbar icon without explicit scope |
| F-23 | Completion selector relied on old reply controls and missed newer rendered response toolbars | [Legacy completion UI repair](https://github.com/sguzman/script-monkey/commit/2996a47dd2f9bd445a8a36531d3efa82820a5f39) | Use current assistant-footer evidence; missing selector => unknown, not permanent generating or false success |
| F-24 | Heavy full-transcript relational selectors and repeated UI scans threatened responsiveness on long chats | Code-supported by [bounded tail change](https://github.com/sguzman/script-monkey/commit/9fd49c66f228fd6927865d5657803e77369effcc) | Bound observed subtree and query budget; stress long conversations |
| F-25 | Synthetic tests passed while live Edge still showed regressions/crash reports | Reported | Label environment and evidence; do not claim live verification from synthetic fixtures |
| F-26 | Attempted hot-upgrade fixes expanded injection/lifecycle complexity, then emergency restrictions left open tabs stale | Public history: [hot-upgrade](https://github.com/sguzman/script-monkey/commit/6bc4032b36ecce6daff3c916594461dbb776c0f3), [disable-bulk](https://github.com/sguzman/script-monkey/commit/f30161c015bd67a8d1396c4f705ef698c9f8fc51) | New loads use current code; upgrades do not refresh tabs or silently report old tabs upgraded |

## Important unresolved causal questions

- The Edge crash happened contemporaneously with extension development, but no controlled reproduction established that this extension alone caused the native process failure. A possible observer feedback loop and broad injection were **risk factors**, not established root causes.
- Separate native Edge crash reports with a shared signature were observed later; those reports do not establish that the extension caused them either.
- Old notifications and chimes relied on multiple APIs with different failure modes; no one fix explains every missed alert.
- Historical selectors and backend routes are not a stable product contract. Viewsource's static saved-site evidence can suggest targets but cannot independently validate live state transitions.
- No private telemetry, crash dump, chat transcript or original captured page source is published here.

## Overcorrection chains to avoid

1. **Completion:** HTTP response success marked finished too early -> require stronger UI proof -> miss valid completion after site toolbar changes. Remedy: explicit `verifying`/unknown, evidence-bound criteria and paired counterexamples.
2. **Errors:** broad warning heuristics caught more possible errors -> benign red UI suppressed healthy completion -> strict suppression hid real errors. Remedy: current, bounded, recognizable error notices with epoch scope.
3. **Incidental requests:** any POST restarted generation -> block requests after completion -> genuine Retry ignored. Remedy: distinguish user intent, transport and UI activity as independent evidence.
4. **Update safety:** old scripts lingered -> broad hot injection across tabs -> crash-risk response disabled all update-time injections. Remedy: no forced tab changes; documented reload semantics, versioning, and narrowly scoped owner lifecycle.
5. **Title stability:** page overwrote prefixes -> head observer rewrote them -> possible feedback/extra work. Remedy: idempotent state-driven title updates, never observe own presentation surface.

## Prior mitigations are not automatically design requirements

Legacy versions ended with multiple timeouts, observer budgets, request maps, ownership leases, fallback probes and injection gates. Some reduced particular risks; others compensated for preceding architecture. Do not import this entire machinery. Each new state rule must specify the observable stimulus, provenance, expected transition, ambiguous counterexample and non-regression assertions.

## First-milestone acceptance

- Accurate generation/finished/unknown distinction with no false positive on old assistant controls.
- Independent OKLab color favicon; stable identity and title state emoji without head feedback loops.
- No bulk tab injections, page navigation, telemetry, transcript reading/storage or existing-profile QA.
- Synthetic fixtures for every implemented transition and a counterexample for every introduced heuristic.
- Explicit gap list for events that cannot be reliably inferred; unresolved states are product behavior, not failures to hide.
