# Research 0006 — Files/document summarization: connector or chat feature?

**Status:** Decided (architecture) — technical spike still needed before an
epic\
**Date:** August 2026\
**Author:** Claude Code (session with the developer)\
**Scope:** Candidate capability — "summarize this PDF" and similar
document-input requests\
**Related:** [research 0001](0001-concept-and-connector-architecture.md)
(the "no network code path in `chat/`" rule this doc leans on),
[Connector Framework](../epics/connector-framework.md) (the machinery this
capability turns out *not* to need)

---

## Question

Should "summarize this PDF" be built as a Tier 1 connector under the
Connector Framework (epic 2), the same way Search and Sovereign Tasks are, or
is it a different kind of thing?

## Findings

- Search and Sovereign Tasks connectors share a shape: the model reaches
  **outside the device** with the user's explicit, revocable, per-connector
  permission. That is exactly what epic 2's manifest/permission machinery
  exists to gate, and it is the mechanism behind
  [AGENTS.md](../../AGENTS.md)'s hard rule that all outbound network access
  goes through `src/connectors/`.
- Reading a file the user has just picked from their own device crosses no
  such boundary — nothing leaves the device. Modeling it as a connector would
  misuse the permission-grant machinery for an action that was already
  fully user-initiated and local, and would dilute what "connector" means in
  the product's own trust story (epic 2.2 exists specifically to make network
  access legible and revocable; this isn't that).
- Concretely, this is closer to a new **chat input modality**: pick a file
  (`expo-document-picker`) → extract text → fold it into the existing
  message/context the offline inference pipeline (tasks 1.1–1.3) already
  handles. No new outbound surface — if anything, this is easier to keep
  inside `src/chat/`'s "no network code path" rule than a connector would be,
  since nothing here needs to leave that module at all.
- The real gap is **PDF text extraction**, which neither `expo-file-system`
  nor `expo-document-picker` do — they only hand back the raw file.
  - iOS has a first-party answer: PDFKit's `PDFDocument.string(forPage:)`
    extracts text natively, no extra dependency.
  - Android has no first-party PDF *text* API.
    `android.graphics.pdf.PdfRenderer` only rasterizes pages to images; real
    text extraction needs a third-party library (e.g. PdfBox-Android) or a
    from-scratch parser.
  - Scanned/image-only PDFs need OCR regardless of platform. Apple's Vision
    framework (`VNRecognizeTextRequest`) does mature on-device OCR; Android's
    equivalent is ML Kit Text Recognition (also on-device-capable). Building
    for "any PDF" roughly doubles the native surface versus text-layer PDFs
    only.
  - A pure-JS PDF parser (e.g. pdf.js) is the other option, but it's built
    for a browser DOM/canvas environment and is a heavy, awkward fit inside
    Hermes/RN — worth ruling out rather than assuming it's the easy path.
- Context-length limits are a second real gap: a long document's extracted
  text may not fit the model's context window. MVP likely wants a hard
  length cap (or "summarize the first N pages") rather than a chunking/
  retrieval design, which is a much bigger, separate piece of work.

## Options considered

**A. Tier 1 connector with its own permission grant.** Rejected — no trust
boundary is crossed; would misuse the framework built for the opposite case.

**B. New local chat input modality — file attach, extract text, feed the
existing offline pipeline. No connector/permission involvement.** Recommended.

**C. Stage the hard part: ship plain-text/markdown attachment first (near-
zero new native surface), add PDF text-layer extraction as a fast-follow
once the Android extraction library is chosen.** Compatible with B, not an
alternative to it.

## Recommendation

Option B, staged per C. Ship plain-text attachment first; add PDF (text-layer
only, OCR explicitly out of scope) once a native extraction path exists on
both platforms.

## Decisions

- This is a chat-screen feature, not a new connector — no new entry under
  the Connector Framework epic.
- OCR / scanned-PDF support is out of scope until there's a specific reason
  to double the native surface for it.

## Open questions

- Which Android PDF-text library (PdfBox-Android or otherwise) — needs an
  actual spike, not just this doc's survey of what exists.
- Context-window scoping for long documents: hard length cap for MVP, or is
  chunking/retrieval actually wanted? Needs product input.
- Does file attachment belong on the existing Chat screen (task 8.1) or want
  its own flow?

## Next steps

Spike the Android PDF-text-extraction library choice before committing to an
epic. Plain-text/markdown attachment can ship without waiting on that spike.
