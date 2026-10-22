# Chat Signals

A Firefox-first, cross-browser WebExtension for observing the **state of a ChatGPT conversation** and representing its identity and state in the browser tab. This is a new implementation, not a relocation of the legacy extension.

**Current status:** initial bootstrap, not a proven live-site release. The first milestone is a conservative state observer, stable per-conversation OKLab-based color favicon, and an emoji title prefix. State understanding, confidence and evidence come before alerts or additional decoration.

## Scope

- **State:** distinguish idle (⚪), submitted (📤), generating (⏳), verifying (🔎), finished (✅), interrupted, length-limited, failed, and unknown (❔). A newly visible assistant turn can establish generation even when Stop is missed; completion still needs fresh reply actions. Preserve observed evidence and uncertainty; never infer response completion from HTTP success or an absent Stop control alone.
- **Identity:** derive a stable, scope-aware conversation key; use color-distance selection in OKLab among allocated open chats. Use a filled square for a normal chat and a circle for project chats. Colors represent identity, **not** response state.
- **Display:** a small state emoji prefix on the tab title. A narrowly bounded observer of the existing title element can restore an active emoji after ChatGPT overwrites the title; it never changes the observed response state.
- **Alerts:** confirmed response completion triggers a generic desktop notification and a short two-note local chime, irrespective of tab focus. The chime depends on browser Web Audio permission and might be blocked, especially in background tabs. No private chat text/title appears in notification content.
- **Later:** detailed state evidence and transitions, robust recovery, diagnostics export with strict privacy controls, and Viewsource-informed instrumentation.

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

Confirmed completions now request a **desktop notification** using Firefox/Chromium's `notifications` permission and a **short two-tone sound** using Web Audio. Both are attempted for foreground and background completions, only once per response. The notification says only "Response finished." and uses the same generated color icon as its conversation tab (with a bundled fallback); it contains no conversation text or title. Firefox's OS notification service and browser audio/autoplay policy determine whether you actually see or hear the cues. A scheduled sound is **not** proof of audible playback.

The chime is unlocked by the user's normal Send action where permitted. If the browser suspends or blocks Web Audio in a background tab, it may be silent; the notification is a separate channel. The current diagnostics expose non-sensitive `data-chat-signals-sound` (`scheduled` or `blocked`) and `data-chat-signals-notification` (`requested` or `unavailable`), but these do not prove OS delivery. There is no background keep-alive, auto-popup, or chat data logging.

**After updating the development extension**, Firefox may require accepting the new `notifications` permission, and a page reload may be needed for the new content script.

Run `npm run check` for dependency-free unit/safety tests. CI tests the observer on synthetic Firefox and Chromium pages, and separately loads the **actual unpacked extension** with its Manifest V3 background worker in a disposable Chromium profile. Firefox add-on manifest lint also runs. These checks do **not** demonstrate installed-extension behavior in Firefox or authenticated live ChatGPT compatibility; those remain the purpose of spare-profile dogfooding.

## Status and limits

This repository starts with **independent MIT-licensed code**. The historical extension in [script-monkey](https://github.com/sguzman/script-monkey/tree/main/extensions/chatgpt-tab-signal) was adapted from an AGPL-3.0 upstream; its source has **not** been copied here. Past failure findings are technical, independently written descriptions.

No real ChatGPT profile, conversation text, cookies, authentication, screenshots or private captures are committed, logged, transmitted or used as fixtures. Synthetic tests are not a claim of live-site compatibility.

Develop directly on `main`. Do not bulk-inject into existing tabs or refresh them during upgrades. An ordinary install may require Firefox extension signing; unpacked/temporary testing is separate from a signed release.
