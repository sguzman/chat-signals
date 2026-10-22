# Research sources and provenance

This work records a technical postmortem, not personal conversation history.

| Source | Role | Limitation |
| --- | --- | --- |
| [Legacy extension](https://github.com/sguzman/script-monkey/tree/main/extensions/chatgpt-tab-signal) | Historic implementation and tests, public README and commit history | Source was derived from AGPL-3.0 upstream; do **not** import it into this MIT repository |
| [Legacy provenance](https://github.com/sguzman/script-monkey/blob/main/extensions/chatgpt-tab-signal/UPSTREAM.md) | Records original upstream and reused AGPL code | Factual attribution, not a permission to relicense derived code |
| [Viewsource research protocol](https://github.com/sguzman/viewsource/blob/main/docs/RESEARCH.md) | Evidence classes, versioned observations, unknowns | Website specimen research does not establish live app behavior |
| [Viewsource source-limited ChatGPT research](https://github.com/sguzman/viewsource/tree/main/specimens/chatgpt-com/v0002) | Structural and source-capture methodology, hints for future selectors | Snapshot evidence is not live request or state evidence; private raw captures are not part of this repo |
| [Mozilla: background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) | Firefox MV3 event page / Chromium service worker compatibility | Support changes with browser versions |
| [OKLab](https://bottosson.github.io/posts/oklab/) | Perceptual color distance and conversion | Perceptual distances are approximate, not a proof of universal visibility |
| [Legacy crash-response commit](https://github.com/sguzman/script-monkey/commit/f30161c015bd67a8d1396c4f705ef698c9f8fc51) | Removed bulk update-time injection following reported Edge crash | Mitigation does not establish cause |
| [Legacy completion UI correction](https://github.com/sguzman/script-monkey/commit/f48fc778141be77db3fbd241177dbf38969a8003) | Required current completed assistant UI | Historic fix; not independent live validation |
| [Legacy incidental network correction](https://github.com/sguzman/script-monkey/commit/98ebd250ffce6ef26f9526e1b4c9dfb2b5972fd9) | Prevented false generation restart after completed chat | Historic regression evidence |

## Evidence labels

- **Reported behavior:** contemporaneous real-browser symptom, not necessarily reproduced in automation.
- **Static-code observation:** behavior or risk suggested by legacy code or commit diff, not proof of runtime causality.
- **Reproduced in fixture:** synthetic browser/runtime reproduction with no personal data.
- **Inference/hypothesis:** plausible explanation requiring verification.
- **Unknown:** evidence not available; leave unresolved.

No raw captured ChatGPT source, conversation transcripts, account identifiers, private crash traces, browser profiles or unique local paths are published in this project.
