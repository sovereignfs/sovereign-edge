---
epic: 16
title: Knowledge Base
status: "📋 Planned"
scope: mobile
---

# Epic: Knowledge Base

> An opt-in, on-device knowledge base the model can answer from: the user's
> own conversations, archived as they happen, plus content they add
> themselves. Fully offline — no connector, no network, nothing leaves the
> device.

## Overview

Decided in [research 0012](../../research/0012-knowledge-base-and-retrieval.md)
(option A), which is itself the continuation of
[research 0006](../../research/0006-files-document-summarization.md)'s parked
question about whether document input wanted retrieval or just a length cap.
0006 established the architectural point this epic depends on: a corpus that
lives on the device crosses no trust boundary, so this is a **chat feature,
not a connector**. Nothing here touches the network, and nothing here goes
through the Connector Framework.

A remote knowledge base — a self-hosted corpus reached over the network — is
explicitly a **second phase**, and when it happens it goes through the
connector layer under hard rule 2, per 0012's options B and C. It is not in
this epic.

Three things make this larger than "add retrieval":

1. **The conversation archive is a new store, not a feature flag on the old
   one.** `history.json` is destructively capped on write — `ChatScreen`
   calls `saveHistory(capMessages([...]))` every turn, so the oldest
   messages are deleted from disk as a conversation grows. That is correct
   for a working buffer sized to the next request's context, and it stays
   exactly as it is. The archive is separate: append-only and uncapped.
2. **Everything lives outside `src/chat/`.** That module may not import
   `expo-file-system` at all (its own ESLint entry, because that module
   carries `DownloadTask`), nor `@/models` or `@/connectors`. The archive,
   the index, and retrieval all live in the app shell and reach chat through
   the injected `ChatSessionContext`, the same inversion `chatHistoryStore`
   and the engine already use.
3. **Local retrieval costs a second resident model.** Embeddings need their
   own context — mobile's `embedding: boolean` context param and Rust's
   `EmbeddingsError::{NotEnabled, NonePoolType}` agree — and there is no
   embedding model in the catalog today. Whether a second resident context
   alongside a 1–4B chat model is viable on a mid-range Android device is
   the open question task 16.1 exists to answer, before anything is built on
   top of it.

The LFM2 1.2B RAG model already in both catalogs (added in `a0f766c`, tuned
to answer only from supplied text) is the intended generator. This epic is
what finally gives it something to answer from.

**Sequencing note.** This is prioritised ahead of the Sovereign Tasks
connector (epic 4, roadmap slots 0.2.4/0.2.5), on the developer's explicit
direction — the same way epics 10 and 11 were pulled ahead of it before, per
research 0005 and 0009. Epic 4 is not cancelled, just later.

## Tasks

#### 📋 16.1 — Embedding model spike and catalog entry

**Goal:** Decide which embedding model this epic runs on, by measuring it on
real hardware rather than comparing spec sheets — and establish whether a
second resident context is viable at all.

**Deliverables:**

- A measured comparison of two or three small embedding GGUFs
  (nomic-embed-text and MiniLM class are the obvious candidates), on a real
  device, covering: embedding dimension, file size, load time, peak RSS when
  resident *alongside* an already-loaded chat model, and embed throughput
  for a realistic batch.
- A go/no-go on the second resident context on a mid-range Android device.
  If it is not viable there, this epic's shape changes — say so loudly
  rather than proceeding and discovering it at 16.5.
- The chosen model added to `apps/mobile/src/models/catalog.ts` with a real
  `sha256` and `sizeBytes`, following every existing entry's shape. Desktop
  catalog parity is deferred to 16.9.
- Embedding surfaced on the engine wrapper in `src/chat/inference/` —
  `llama.rn`'s `embedding()` behind the existing adapter shape, with the
  dedicated `embedding: true` / `pooling_type` context, kept separate from
  the chat context.

**Dependencies:** None. This gates every other task in the epic.

**Review checklist:**

- Measurements come from a real physical device, not a simulator — this
  repo's own convention, and memory pressure is exactly the thing a
  simulator will not tell you honestly.
- Peak memory recorded with both models resident, not each alone.
- The chosen model downloads, verifies against its recorded hash, and
  produces a vector of the expected dimension on-device.
- No new network code outside `src/models/` (hard rule 3 covers acquiring a
  model; it does not license anything else).

---

#### 📋 16.2 — Conversation archive store

**Goal:** An append-only, uncapped record of conversations, written as they
happen, separate from `history.json`.

**Deliverables:**

- A new store in the app shell alongside `chatHistoryStore.ts`, using the
  same `Paths.document` JSON pattern as chat history, connector grants, and
  installed connectors. Append-only; never capped.
- Wired through `ModelSessionProvider`'s existing `saveHistory`
  implementation rather than a new `ChatSessionContext` method — chat
  already calls it on every turn, and adding the archive there means
  `src/chat/` needs no new surface at all.
- **Idempotent by message id.** `ChatScreen` calls `saveHistory` twice per
  turn — once optimistically when the user sends, once when the reply
  settles — so a naive append double-writes every message and writes the
  assistant's reply once empty and once full.
- Every entry tagged with its role, so retrieval can distinguish the user's
  own words from the model's (research 0012's "indexing the model's own
  output" risk).
- Gated on the opt-in setting from 16.3: when off, nothing is written.

**Dependencies:** 16.3 (for the setting it reads). Independent of 16.1.

**Review checklist:**

- A conversation long enough to trigger `capMessages` still has its dropped
  messages present in the archive — the specific thing this task exists for.
- Sending a message and letting the reply finish produces exactly one
  archive entry per message, with the assistant's final content, not its
  empty placeholder.
- With the setting off, no archive file is created at all.
- `history.json`'s own behaviour is byte-for-byte unchanged.

---

#### 📋 16.3 — Settings: opt-in, status, and purge

**Goal:** The control surface. Off by default, honest about what is stored,
and able to delete all of it.

**Deliverables:**

- A knowledge-base section in Settings: a single opt-in toggle, defaulting
  **off**, with copy stating plainly what gets stored when it is on.
- Status: how many conversations/documents are archived, and how much disk
  they use.
- A purge action that deletes the archive and the index, with a
  confirmation step.
- Copy stating that opting in is **not retroactive** — everything
  `capMessages` already dropped is gone, and the archive starts now.

**Dependencies:** None (16.2 depends on this, not the reverse).

**Review checklist:**

- Default state on a fresh install is off, and nothing is archived until it
  is explicitly turned on.
- Purge removes the files from disk, not just the in-memory state — verified
  by inspecting `Paths.document`, per hard rule 4's "user-visible,
  user-deletable storage."
- Turning the setting off stops archiving without destroying what is already
  archived (off ≠ purge — they are separate actions with separate copy).

---

#### 📋 16.4 — Chunking and the index

**Goal:** Turn archived text into retrievable, embedded chunks.

**Deliverables:**

- A chunker over archived conversations and user content. Fixed-size windows
  with overlap is the default; structure-aware splitting on markdown
  headings where the source has structure.
- Vectors persisted alongside the chunks, as JSON in the same
  `Paths.document` pattern. **No vector database** — brute-force cosine over
  a personal-scale corpus is adequate until measured otherwise, and research
  0003 is this repo's own precedent for not designing around an unmeasured
  assumption.
- **Batch indexing, not per-turn.** Indexing runs on an explicit trigger
  (opening the knowledge-base screen, or an "index now" action), so the
  embedding context is loaded for a bounded window rather than resident for
  the whole session. 0012's open question, resolved this way unless 16.1's
  measurements say otherwise.
- Incremental: re-indexing only embeds what is new.

**Dependencies:** 16.1 (the model), 16.2 (something to index).

**Review checklist:**

- Indexing twice in a row does no work the second time and produces no
  duplicate chunks.
- The embedding context is released after a batch, confirmed by memory
  returning to its pre-index level.
- Chunk count and vector dimension match what 16.1 measured.

---

#### 📋 16.5 — Retrieval and context injection

**Goal:** Actually answer from the knowledge base.

**Deliverables:**

- Query-time retrieval: embed the query, cosine top-k over stored vectors,
  fold the winning passages into the request the existing offline pipeline
  already builds.
- Reached from `src/chat/` only through an injected `ChatSessionContext`
  method, implemented by `ModelSessionProvider` — the same inversion as
  `loadHistory`/`saveHistory` and `generate`.
- A character budget for injected passages, sitting alongside the existing
  `MESSAGE_HISTORY_CHAR_BUDGET` rather than eating into it, so retrieval
  cannot silently starve the conversation of context.
- User-authored chunks preferred over assistant-authored ones at equal
  similarity, per 16.2's role tags.
- No reranking. `rerank()` needs a third resident model (a cross-encoder in
  its own context) and is a later, measured upgrade — not part of a first
  cut.

**Dependencies:** 16.4.

**Review checklist:**

- A question whose answer appears only in an archived past conversation is
  answered correctly, and answered *wrongly* with the setting off — the
  paired check that proves retrieval is actually doing the work.
- The offline boundary check (`pnpm check:offline`) still passes;
  `src/chat/` imports nothing new.
- Injected passages plus history stay within budget on a long conversation.

---

#### 📋 16.6 — In-chat retrieval provenance

**Goal:** Make it visible when an answer came from the knowledge base, and
what it came from.

**Deliverables:**

- A receipt in the chat thread when retrieval contributed to a reply,
  reusing task 2.5's existing connector-provenance pattern and its visual
  language rather than inventing a second one.
- The receipt distinguishes source kinds — the user's own document, their
  own past message, or a past assistant reply — because the trust weight of
  those three differs, and the third is the one research 0012 flags as
  capable of recycling the model's own mistakes.

**Dependencies:** 16.5.

**Review checklist:**

- A retrieval-backed reply shows a receipt; a reply with no retrieval shows
  none.
- Source kind is correct for each of the three cases.

---

#### 📋 16.7 — User content: plain text and markdown

**Goal:** Let the user add their own content, starting with the formats that
need no new native surface.

**Deliverables:**

- Import via `expo-document-picker` for `.txt` and `.md`, into the same
  archive/index the conversations use.
- A list of imported documents with the ability to remove one (removing its
  chunks and vectors with it).
- Re-importing a changed file updates it rather than duplicating it.

**Dependencies:** 16.4. Independent of 16.5/16.6.

**Review checklist:**

- An imported markdown file is retrievable in chat after indexing.
- Removing a document removes its chunks — verified by the same question no
  longer being answerable.
- This is research 0006's option C stage one, and ships without waiting on
  16.8.

---

#### 📋 16.8 — PDF text-layer extraction

**Goal:** Extend import to PDFs with a real text layer.

**Deliverables:**

- iOS: PDFKit's `PDFDocument.string(forPage:)`, no third-party dependency.
- Android: resolves research 0006's still-open library spike
  (PdfBox-Android or an alternative) — the choice is part of this task, not
  a prerequisite to it.
- OCR and scanned/image-only PDFs remain **out of scope**, per 0006's
  standing decision; a PDF with no text layer fails with an honest message
  rather than silently importing nothing.

**Dependencies:** 16.7.

**Review checklist:**

- A text-layer PDF imports and is retrievable on both platforms.
- A scanned PDF fails with a clear explanation, not an empty document.

---

#### 📋 16.9 — Desktop port

**Goal:** The same knowledge base on desktop.

**Deliverables:**

- The embedding model added to `apps/desktop/src-tauri/src/models/catalog.rs`,
  matching 16.1's mobile entry.
- Embedding in the Rust engine via `llama-cpp-2`'s `embeddings_ith` /
  `embeddings_seq_ith`, with its own embeddings-enabled context and pooling
  type.
- Archive, index, retrieval, provenance, and import — the desktop
  equivalents of 16.2–16.7.

**Dependencies:** 16.1–16.7.

**Review checklist:**

- **Desktop persists no chat history at all today** — nothing in
  `apps/desktop/src/chat/` writes it, so conversations vanish on quit. This
  task therefore builds the archive from nothing rather than porting a
  working store, and is scoped accordingly. Confirm this is still true
  before starting; it may have changed.
- Feature parity with mobile, verified by exercising the app, not only by
  the test suite.

---

## Related Docs

- [research 0012](../../research/0012-knowledge-base-and-retrieval.md) — the
  decision record behind this epic, including the remote knowledge base
  (options B and C) deferred to a second phase
- [research 0006](../../research/0006-files-document-summarization.md) — why
  document input is a chat feature and not a connector, and the PDF
  extraction staging 16.7/16.8 follow
- [research 0003](../../research/0003-model-verification-hashing.md) — the
  precedent for measuring before designing, cited by 16.1 and 16.4
- [Core Inference & Chat](core-inference-chat.md) — the offline pipeline
  retrieval feeds into
- [Connector Framework](connector-framework.md) — task 2.5's provenance
  pattern, reused by 16.6; and the layer the *second* phase will use
