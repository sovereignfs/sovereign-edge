# Research 0007 — Text-to-speech: chat feature, not a connector

**Status:** Decided\
**Date:** August 2026\
**Author:** Claude Code (session with the developer)\
**Scope:** Candidate capability — read assistant chat responses aloud,
fully offline\
**Related:** [Core Inference & Chat epic](../epics/core-inference-chat.md),
[research 0006](0006-files-document-summarization.md) (the same
connector-vs-feature question, same conclusion)

---

## Question

Should "read chat responses aloud" be built as a Tier 1 connector (per the
proposal's original "Device connector" framing), and what does the offline
TTS pipeline actually require?

## Findings

- Same trust-boundary reasoning as [0006](0006-files-document-summarization.md),
  more clearly so: TTS never leaves the device and never touches anything
  the user hasn't already put on their own screen. There is no permission
  boundary for epic 2's connector machinery to gate here at all.
- `expo-speech` (`Speech.speak()`) drives each OS's built-in on-device engine
  — `AVSpeechSynthesizer` on iOS, Android's `TextToSpeech` service. Fully
  offline on both platforms, using whatever system voices are already
  installed. This is meaningfully different from LLM-driven speech synthesis:
  voice quality and selection are whatever the OS ships, not something this
  app generates or controls beyond rate/pitch/voice choice.
- No new runtime permission is needed for basic playback on either platform.
  (Speech *recognition* — microphone input, turning voice into text — is an
  unrelated, separate capability this doc does not cover.)
- Scope is genuinely small: a speak/stop control on assistant message
  bubbles, calling `Speech.speak(message.text)`. The real decisions are
  product/UX, not technical:
  - What happens if a new message arrives while one is being read aloud —
    queue, interrupt, or ignore?
  - Does playback continue if the app is backgrounded? iOS requires a
    background-audio capability/entitlement to keep playing after
    backgrounding — a real scope decision (and a capability addition to the
    Xcode project), not just a code change.
  - Voice/rate/pitch: exposed as a setting, or OS defaults only for MVP?

## Options considered

**A. Route through the Connector Framework as a "Device connector"
capability.** Rejected — no trust boundary is crossed; would misuse the
permission-grant machinery for something that needs none.

**B. Plain chat-screen feature: a speak/stop control per message, using
`expo-speech` directly.** Recommended.

## Recommendation

Option B. This is the cheapest, least architecturally entangled item across
the whole capability survey — no new epic under Connector Framework, just a
small addition to the existing Chat screen (task 8.1) or Core Inference &
Chat epic.

## Decisions

- Not a connector. No manifest entry, no permission grant, no in-chat
  provenance UI — none of epic 2's machinery applies.
- Foreground-only playback for MVP; background-continuing audio is a
  separate, explicit scope decision (and an iOS capability addition) to make
  later if wanted.

## Open questions

- Voice/rate/pitch: settings-exposed or OS defaults only for MVP?
- Behavior when a new message arrives mid-speech.

## Next steps

Small task under whichever epic ends up owning it (Core Inference & Chat or
Mobile App Shell) — no new epic file needed, and no research blocker before
scheduling it.
