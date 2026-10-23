# Chat Signals

A Firefox-first, cross-browser WebExtension for observing the **state of a ChatGPT conversation** and representing its identity and state in the browser tab. This is a new implementation, not a relocation of the legacy extension.

**Current status:** initial bootstrap, not a proven live-site release. The first milestone is a conservative state observer, stable per-conversation OKLab-based color favicon, and an emoji title prefix. State understanding, confidence and evidence come before alerts or additional decoration.

## Scope

- **State:** distinguish idle (⚪), submitted (📤), generating (⏳), verifying (🔎), finished (✅), interrupted, length-limited, failed, and unknown (❔). A newly visible assistant turn can establish generation even when Stop is missed; completion still needs fresh reply actions. Preserve observed evidence and uncertainty; never infer response completion from HTTP success or an absent Stop control alone.
- **Identity:** derive a stable, scope-aware conversation key; use color-distance selection in OKLab among allocated open chats. Use a filled square for a normal chat and a circle for project chats. Colors represent identity, **not** response state.
- **Display:** a small state emoji prefix on the tab title. A narrowly bounded observer of the existing title element can restore an active emoji after ChatGPT overwrites the title; it never changes the observed response state.
- **Event alerts:** confirmed completion, connection interruption, response/conversation failure, and conversation-length limit produce distinct short sounds and desktop notification categories. Routine states and 🔔 unread → ✅ viewed remain silent. Notifications never include chat text or titles. Browser audio may be blocked, especially in background tabs.
- **Later:** detailed state evidence and transitions, robust recovery, diagnostics export with strict privacy controls, and Viewsource-informed instrumentation.

## Documents

- [Historical failure autopsy](docs/AUTOPSY.md): symptoms, evidence, causes known or unknown, counterexamples and regression gates.
- [State and evidence model](docs/STATE-MODEL.md): observer boundaries, transition semantics, unresolved cases.
- [Detailed observability roadmap](docs/OBSERVABILITY.md): additional chat-state dimensions, evidence discipline, and Viewsource-backed research targets.
- [Architecture and QA](docs/ARCHITECTURE.md): strict separation of capture, inference, identity and presentation.
- [Development protocol](AGENTS.md): public-output protection, minimal regression fixes and browser safety.
- [Reference sources](docs/SOURCES.md): original project history, provenance, Viewsource methodology, Mozilla WebExtension references.

## Permanent Firefox installation (unlisted signing)

Firefox Release requires a Mozilla-signed add-on. No listing in the public add-on directory is required.

1. Update local checkout of `main`: `git pull --ff-only`.
2. From the repo root, package **only required extension files**, preserving directory paths:
   `bsdtar -a -cf chat-signals-0.3.2.zip manifest.json src icons`.
   Verify the entries with `bsdtar -tf chat-signals-0.3.2.zip`: `manifest.json` must be at the archive root and JavaScript entries must retain their `src/` prefixes (including `src/background.js` and `src/content.js`). Do **not** use `python3 -m zipfile -c` for this archive: it flattens paths and causes missing-script errors. `bsdtar` is supplied by Arch's `libarchive` package and retains the `src/` directory.
3. Sign into [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/) and submit a new add-on. Select **On your own** (unlisted / self-distribution), not **On this site**. Upload the generated ZIP and follow the validation/signing steps.
4. When signing is complete, download the **signed XPI** from the add-on's version page in the Developer Hub. **Do not** rename the unsigned ZIP to XPI and expect Firefox Release to accept it.
5. In the Firefox profile where Chat Signals will live, open `about:addons`, click the gear icon, select **Install Add-on From File**, select the signed XPI and accept permissions. Remove the temporary Chat Signals instance first if installing into the same spare profile.
6. Open a new ChatGPT tab and check the favicon, status, completion chime and desktop notification.

The add-on declares `data_collection_permissions.required=["none"]`: it does not transmit user data outside the local browser. It uses browser storage for temporary hashed chat identifiers and allocated colors; this is local-only, not telemetry.

Unlisted/sideloaded releases **do not automatically update** from this GitHub repo. Unless a supported signed update URL is configured later, new releases must be signed and installed manually. Do not commit AMO account credentials or signing keys to this repository.

## Development installation

**Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select this repository's `manifest.json`. This lasts until Firefox restarts; permanent installation normally requires signing. No script touches an existing browser profile automatically.

**Chromium/Edge:** use the browser's extensions page, enable developer mode, and select **Load unpacked** on this repository directory. These are developer-only installation instructions; no published store release exists.

Disable the historical ChatGPT Tab Signal extension before trying Chat Signals in the same browser profile. Running both would create competing title and favicon writers. Already-open ChatGPT tabs are not automatically updated or reloaded after installing/reloading Chat Signals; open a new chat page for an unambiguous test.

Chat Signals requests desktop notifications using Firefox/Chromium's `notifications` permission and plays short Web Audio cues on confirmed events, in foreground and background tabs. A notification uses the **same color identity icon as its conversation** (or a bundled fallback), but never includes chat titles or message text.

| Event | Category | Sound | Message |
| --- | --- | --- | --- |
| ✅ or 🔔 response finished | Success | Two ascending notes | Response finished. |
| 🔌 connection interrupted | Warning | Two descending notes | Connection interrupted. |
| ⚠️ response/conversation failure | Error | Two simultaneous, mildly dissonant notes | A response or conversation failed. |
| 🛑 conversation length limit | Warning | Three descending notes | Conversation length limit reached. |
| ⚪ idle, 📤 submitted, ⏳ generating, 🔎 verifying, ❔ unknown | Neutral | Silent | None |
| 🔔 unread → ✅ viewed | Neutral (read acknowledgment) | Silent | None |
| Interrupted → generating/verifying (recovery) | Neutral | Silent by default | None |

Each **event kind is emitted once per response epoch**, even if the UI re-renders the same error. A later distinct response may generate a new event. A confirmed completion after an earlier interruption can produce a single success cue. Errors and limits detected on an already-open page without an active response attempt do not trigger alerts.

The categories live in Chat Signals; Firefox/Chromium basic notifications do not provide reliable OS-wide severity coloring. The chime volume and motifs are currently fixed; preferences can be added after the events prove reliable in live use. Firefox's OS notification service and browser audio/autoplay policy determine whether you actually see or hear the cues. A scheduled sound is **not** proof of audible playback.

The chimes are synthesized inside the extension; no external sound files or changes to `config-store` are required. Web Audio is unlocked by the user's normal Send action where permitted. If the browser suspends or blocks Web Audio in a background tab, it may be silent; the notification is a separate channel. The current diagnostics expose non-sensitive `data-chat-signals-sound` (`scheduled` or `blocked`) and `data-chat-signals-notification` (`requested` or `unavailable`), but these do not prove OS delivery. There is no background keep-alive, auto-popup, or chat data logging.

**After updating the development extension**, Firefox may require accepting the new `notifications` permission, and a page reload may be needed for the new content script.

Run `npm run check` for dependency-free unit/safety tests. CI tests the observer on synthetic Firefox and Chromium pages, and separately loads the **actual unpacked extension** with its Manifest V3 background worker in a disposable Chromium profile. Firefox add-on manifest lint also runs. These checks do **not** demonstrate installed-extension behavior in Firefox or authenticated live ChatGPT compatibility; those remain the purpose of spare-profile dogfooding.

## Status and limits

This repository starts with **independent MIT-licensed code**. The historical extension in [script-monkey](https://github.com/sguzman/script-monkey/tree/main/extensions/chatgpt-tab-signal) was adapted from an AGPL-3.0 upstream; its source has **not** been copied here. Past failure findings are technical, independently written descriptions.

No real ChatGPT profile, conversation text, cookies, authentication, screenshots or private captures are committed, logged, transmitted or used as fixtures. Synthetic tests are not a claim of live-site compatibility.

Develop directly on `main`. Do not bulk-inject into existing tabs or refresh them during upgrades. An ordinary install may require Firefox extension signing; unpacked/temporary testing is separate from a signed release.
