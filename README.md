# Chat Signals

A Firefox-first, cross-browser WebExtension for observing the **state of a ChatGPT conversation** and representing its identity and state in the browser tab. This is a new implementation, not a relocation of the legacy extension.

**Current status:** initial bootstrap, not a proven live-site release. The first milestone is a conservative state observer, stable per-conversation OKLab-based color favicon, and an emoji title prefix. State understanding, confidence and evidence come before alerts or additional decoration.

## Scope

- **State:** distinguish idle, generating, verifying, finished, interrupted, length-limited, failed, and unknown. Preserve observed evidence and uncertainty; never infer response completion from HTTP success or an absent Stop control alone.
- **Identity:** derive a stable, scope-aware conversation key; use color-distance selection in OKLab among allocated open chats. Use a filled square for a normal chat and a circle for project chats. Colors represent identity, **not** response state.
- **Display:** a small state emoji prefix on the tab title. Presentation consumes observation; it never feeds signals back to observation.
- **Later:** detailed state evidence and transitions, robust recovery, response alerts and audio, diagnostics export with strict privacy controls, and Viewsource-informed instrumentation.

## Documents

- [Historical failure autopsy](docs/AUTOPSY.md): symptoms, evidence, causes known or unknown, counterexamples and regression gates.
- [State and evidence model](docs/STATE-MODEL.md): observer boundaries, transition semantics, unresolved cases.
- [Architecture and QA](docs/ARCHITECTURE.md): strict separation of capture, inference, identity and presentation.
- [Development protocol](AGENTS.md): public-output protection, minimal regression fixes and browser safety.
- [Reference sources](docs/SOURCES.md): original project history, provenance, Viewsource methodology, Mozilla WebExtension references.

## Status and limits

This repository starts with **independent MIT-licensed code**. The historical extension in [script-monkey](https://github.com/sguzman/script-monkey/tree/main/extensions/chatgpt-tab-signal) was adapted from an AGPL-3.0 upstream; its source has **not** been copied here. Past failure findings are technical, independently written descriptions.

No real ChatGPT profile, conversation text, cookies, authentication, screenshots or private captures are committed, logged, transmitted or used as fixtures. Synthetic tests are not a claim of live-site compatibility.

Develop directly on `main`. Do not bulk-inject into existing tabs or refresh them during upgrades. An ordinary install may require Firefox extension signing; unpacked/temporary testing is separate from a signed release.
