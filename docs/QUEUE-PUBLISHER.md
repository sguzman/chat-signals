# Optional Chat Queue publisher integration

**Status:** Implemented in source and checked with synthetic unit tests. An independently pinned, two-extension Firefox Developer Edition browser acceptance test is maintained in `sguzman/chat-queue`. Do not claim real authenticated ChatGPT delivery until its separate gates pass.

Chat Signals is the **only** source of response-state inference. Chat Queue never derives Send authorization from page-root attributes, emoji, titles, Copy buttons, HTTP responses or timers. The publisher does not grant Queue a generic transcript or composer API.

## Trust boundaries

- `src/content.js` samples only Chat Signals' existing finite-state tracker. `src/queue-publisher.js` maps a snapshot to a fixed version-1 phase, response epoch, strictly increasing per-document sequence, document token, exact pathname, source attribution and confidence. It excludes titles, prompts, transcript data, query strings and user text.
- Firefox content-script origin and document identity are checked in this add-on's background. The background looks up the **browser-owned** tab ID and current URL, checks the existing registered hashed conversation key and document token, and forwards only to `chat-queue@sguzman.github`.
- The receiving Queue background independently authenticates `sender.id === chat-signals@sguzman.github`, its own registered tab route and document, and strictly increasing epoch/sequence. An unknown, stale, mismatched, missing or replayed event never authorizes Send.
- The only additional Firefox host grant is `https://chatgpt.com/*`; it permits reading the tab's exact current URL before forwarding. No broad tabs permission, bulk tab enumeration or transport interception is added.

## Historical state

An initial snapshot restored from the extension's existing local state ledger is never treated as fresh response completion. The publisher marks **the complete restored response epoch** `origin: restored`, including later visibility changes within that epoch. A genuinely newer response epoch can be fresh. Unclear confidence is transmitted as `unknown` and cannot provide ready or completed Send authority.

## Startup and independence

The Queue may register after this add-on emitted its initial idle state. Its background therefore makes a **one-shot** request to Chat Signals, authenticated by Firefox's extension principal. Chat Signals verifies the live tab pathname and asks its own content script to resample; that script publishes the current state with a new sequence if it is still the correct document. No persistent poll, periodic network request or transcript replay is involved.

A missing Queue, unsupported transport, extension suspension or rejected delivery is nonfatal to Chat Signals' colors, notifications and state tracker. No Queue source code is imported into Chat Signals, and neither add-on can act as the other's general-purpose page-control service.

## Acceptance boundaries

Pure mapping tests and provider-background tests verify malformed messages, forged routes, stale registrations, wrong caller, missing Queue and restored/fresh epochs. The disposable Firefox integration test in Chat Queue is an independent and stricter gate for browser-owned sender identity, actual two-addon transport, serial synthetic Send and safe provider removal. It does **not** by itself prove authenticated production ChatGPT React/ProseMirror compatibility, reliable network recovery or long-lived browser sessions.
