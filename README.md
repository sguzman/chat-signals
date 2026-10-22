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
- [Detailed observability roadmap](docs/OBSERVABILITY.md): additional chat-state dimensions, evidence discipline, and Viewsource-backed research targets.
- [Architecture and QA](docs/ARCHITECTURE.md): strict separation of capture, inference, identity and presentation.
- [Development protocol](AGENTS.md): public-output protection, minimal regression fixes and browser safety.
- [Reference sources](docs/SOURCES.md): original project history, provenance, Viewsource methodology, Mozilla WebExtension references.

## Development installation

**Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select this repository's `manifest.json`. This lasts until Firefox restarts; permanent installation normally requires signing. No script touches an existing browser profile automatically.

**Chromium/Edge:** use the browser's extensions page, enable developer mode, and select **Load unpacked** on this repository directory. These are developer-only installation instructions; no published store release exists.

Disable the historical ChatGPT Tab Signal extension before trying Chat Signals in the same browser profile. Running both would create competing title and favicon writers. Already-open ChatGPT tabs are not automatically updated or reloaded after installing/reloading Chat Signals; open a new chat page for an unambiguous test.

The extension does not yet implement the historical notification chime or native completion notification. That parity work is downstream of reliable completion observation, not silently omitted from the roadmap.

Run `npm run check` for dependency-free unit/safety tests. CI tests the observer on synthetic Firefox and Chromium pages, and separately loads the **actual unpacked extension** with its Manifest V3 background worker in a disposable Chromium profile. Firefox add-on manifest lint also runs. These checks do **not** demonstrate installed-extension behavior in Firefox or authenticated live ChatGPT compatibility; those remain the purpose of spare-profile dogfooding.

## Status and limits

This repository starts with **independent MIT-licensed code**. The historical extension in [script-monkey](https://github.com/sguzman/script-monkey/tree/main/extensions/chatgpt-tab-signal) was adapted from an AGPL-3.0 upstream; its source has **not** been copied here. Past failure findings are technical, independently written descriptions.

No real ChatGPT profile, conversation text, cookies, authentication, screenshots or private captures are committed, logged, transmitted or used as fixtures. Synthetic tests are not a claim of live-site compatibility.

Develop directly on `main`. Do not bulk-inject into existing tabs or refresh them during upgrades. An ordinary install may require Firefox extension signing; unpacked/temporary testing is separate from a signed release.
