# Chat Signals development instructions

- Work directly in this repository's existing `main` by default. Keep the historical `sguzman/script-monkey` extension unchanged.
- The product is **accurate chat-state capture first**, followed by visible color identity and emoji state. Do not conflate color, status, unreadness, transport, focus or generation.
- Read `docs/AUTOPSY.md`, `docs/STATE-MODEL.md`, `docs/ARCHITECTURE.md` and `docs/SOURCES.md` before altering detection behavior. Treat the historical project as a failure specimen, not implementation authority.
- Fix defects narrowly: state the symptom, the evidence, the scoped change, the counterexamples and what was not changed. Never compensate for a false positive by suppressing an entire class of legitimate signals, or compensate for a missed detection by broadly scanning/retrying everything.
- Never copy the old AGPL-derived implementation into this MIT repository. Independent original implementation, with attribution for factual reference and cross-project technical concepts.
- **Public privacy boundary:** do not commit, print or paraphrase private chats, user language, internal account/session identifiers, tokens, cookies, credentials, local browser paths, diagnostic dumps, or private browsing captures. Commit messages, tests, issue descriptions and logs count as publication. Only synthetic conversation IDs and neutral failure descriptions.
- No network telemetry, chat transcript capture, persistent raw message storage, background tab enumeration or bulk injection. Only request the minimal host/API permissions needed for demonstrated behaviors.
- Avoid observing `document.head`/title/favicon mutations to repair our own writes. No unbounded observers or timers, repeated full-transcript selectors, or UI rewrite loops. Dispose on navigation/unload and avoid cross-tab effects.
- A browser/tab crash associated in time with the old extension is **not** a proven root cause. Record reported symptoms, code-risk factors, experiments and unknowns separately.
- Before publishing: inspect all changed files and the commit message for sensitive content, run Node tests and synthetic disposable-browser tests when available; distinguish passing fixtures from actual live usage.
- Follow Viewsource's approach to evidence: directly observed, static implementation evidence, inference, external documentation, unknown. A processed specimen is not automatically understood; leave open questions open.
