---
id: 12
title: "Knowledge base and retrieval: where the corpus lives, and what that decides"
status: "Decided — option A (on-device) first, remote deferred to a second phase"
date: "September 2026"
author: "Claude Code (session with the developer)"
scope: shared
summary: "Candidate capability — a knowledge base the model can answer from, and whether it is a chat feature, a connector, or both"
---

# Research 0012 — Knowledge base and retrieval: where the corpus lives, and what that decides

**Related:** [research 0006](0006-files-document-summarization.md) (decided
document input is a chat feature, and explicitly parked the chunking/
retrieval question this doc picks up),
[research 0001](0001-concept-and-connector-architecture.md) (the tier model
and the "all outbound network goes through a connector" rule),
[Sovereign Tasks Connector](../epics/mobile/sovereign-tasks-connector.md)
(the Tier 1 external-instance shape option B would copy),
[Connector Store & SDK](../epics/shared/connector-store-sdk.md) (task 5.6,
Tier 2, deliberately blocked on a real use case)

---

## Question

We want a knowledge base the model can answer from. Is that a chat feature,
a connector, or both — and what does the answer depend on?

## Findings

### The question forks on one fact: where the corpus lives

Everything else follows from this.

- **Corpus on the device.** No trust boundary is crossed. Research 0006
  already settled the identical question for single-document input and
  rejected the connector framing in as many words: "no trust boundary is
  crossed; would misuse the framework built for the opposite case." A local
  knowledge base is the same argument at corpus scale — it is a chat
  feature.
- **Corpus somewhere else** (self-hosted wiki, a `sovereign` instance, a
  third-party service). [AGENTS.md](../../AGENTS.md)'s hard rule 2 applies
  without exception: it goes through a permissioned, separately revocable
  connector.

This is not a stylistic choice. Getting it backwards either dilutes what
"connector" means in the product's trust story, or puts network code
somewhere the architecture guarantees there is none.

### Research 0006 parked exactly this question

0006's open questions include, verbatim: "Context-window scoping for long
documents: hard length cap for MVP, or is chunking/retrieval actually
wanted? Needs product input." It deferred retrieval as "a much bigger,
separate piece of work." A knowledge base *is* that work. This doc is the
continuation, not a new thread.

### The retrieval primitives already exist on both platforms

Neither app needs a new inference dependency for local retrieval.

- **Mobile** — `llama.rn@0.12.8` exposes, on `LlamaContext`:
  - `embedding(text, params?)` → `{ embedding: number[] }`
  - `rerank(query, documents, params?)` → `RerankResult[]` of
    `{ score, index }` — but see the caveat below; this one is not free
  - Context params `embedding?: boolean`, `pooling_type?: number`,
    `embd_normalize?: number`; `NativeLlamaContext.model.nEmbd` reports the
    embedding dimension.
- **Desktop** — `llama-cpp-2@0.1.154` exposes `LlamaContext::embeddings_ith`
  and `embeddings_seq_ith`, both returning `Result<&[f32], EmbeddingsError>`.

**Both platforms require a dedicated embedding context.** Mobile's
`embedding: boolean` context param and Rust's `EmbeddingsError::NotEnabled`
/ `NonePoolType` variants say the same thing from two directions: an
embedding-enabled context with a pooling type is a *different* context from
the chat context. You cannot serve both from one. On mobile that second
resident context is the real cost of local retrieval, and it is a memory
cost, not a CPU one.

**`rerank()` costs a third model, not a free quality win.** It is a method
on `LlamaContext`, so it reranks using whatever model that context holds —
which means a cross-encoder reranker model (bge-reranker class) in its own
context with rank pooling, not the chat model and not the embedding model.
Treat reranking as a later quality upgrade to be justified on measurement,
not part of a first cut: on mobile, three resident models is a very
different proposition from two. Cosine top-k alone is the MVP.

### Two concrete gaps

- **No embedding model in the catalog.** All seven entries in
  `apps/mobile/src/models/catalog.ts` (mirrored in
  `apps/desktop/src-tauri/src/models/catalog.rs`) are generative. Local
  retrieval needs a small embedding GGUF — nomic-embed-text or MiniLM class
  — added to both catalogs. Acquiring it is covered by existing hard rule 3
  (model acquisition is the one deliberate network exception), so this opens
  no new boundary; it is a catalog entry and a second resident context, not
  an architectural change.
- **LFM2 1.2B RAG is currently unfed.** Added to both catalogs in `a0f766c`,
  it is tuned to answer only from text supplied in the prompt — its own
  catalog comment says "not a general chat model." Nothing in either app
  supplies it with retrieved text today. Whichever option below is chosen,
  it is the thing that makes that model make sense; until then it is a
  capability with no path to it.

### Where a local index may live — a hard structural constraint

`src/chat/` may not import `expo-file-system` **at all**. This is not the
network rule leaking; it is its own entry in `apps/mobile/eslint.config.js`,
justified there because that module "carries `DownloadTask`." `src/chat/`
also may not import `@/models` or `@/connectors`.

So no part of a local index — extraction, chunk storage, vectors, retrieval
— can live in `src/chat/`. The established answer is the inversion
`chatHistoryStore.ts` already uses: the store lives in the app shell,
`ModelSessionProvider` owns it, and `src/chat/` reaches it only through an
injected `ChatSessionContext` method. That file's own header comment
documents the pattern and the reason. Retrieval would be a third consumer of
an inversion already carrying the engine and the history store, which makes
this considerably less speculative than it sounds.

### Storage has no vector story yet

Persistence today is plain JSON via `expo-file-system` — chat history,
connector grants, installed connectors all use the same `Paths.document`
pattern. There is no vector store, and at personal-corpus scale there may
not need to be one: brute-force cosine over a few thousand chunks in JS is
adequate. Reaching for sqlite-vec, faiss, or similar before measuring would
repeat the mistake research 0003 exists to record, where a measured
benchmark overturned a design that looked obviously correct on paper.

## Options considered

**A. Local document knowledge base — a chat feature, no connector.**
Pick files → extract text → chunk → embed → persist vectors → at query time
embed the query, cosine top-k, fold the passages into the existing offline
pipeline (reranking deferred — it is a third resident model, see Findings).
Fully offline; no new trust surface. Inherits 0006's unresolved
PDF-extraction spike (iOS has PDFKit; Android has no
first-party text API), but 0006's own staging answer applies — plain text
and markdown ship without waiting on it. Costs a second resident context and
a catalog addition.

**B. Remote knowledge base — Tier 1 connector.** A manifest with a
`kb.search` tool against a self-hosted endpoint, token in secure storage.
Structurally identical to the Sovereign Tasks connector (4.1/4.2) already
specced and next in the Phase 2 queue — the same shape with a different
verb, on rails that are already laid. Retrieval happens server-side: no
embedding model, no second context, no PDF problem, no vector storage
question. The cost is that every query leaves the device. The connector
framework makes that legible, permissioned, and revocable, which is exactly
what it is for — but legible egress is not the same claim as offline, and
this option should not be described as if it were.

**C. Hybrid — sync over a connector, index and retrieve locally.** A
connector pulls documents in a discrete, user-initiated sync; chunking,
embedding, retrieval, and generation all stay on-device. The best fit for
the product's central claim: the network touch becomes an occasional visible
event rather than a per-query one. Also the most work — all of A, plus a
connector, plus sync scheduling and staleness handling.

**D. Neither yet — cap context and defer.** 0006's own MVP fallback: a hard
length cap or "first N pages," no retrieval at all. Worth stating as the
honest baseline, since it is what the app effectively does today. Rejected
as a destination, but it is the correct thing to keep shipping while A or C
is built.

## Recommendation

Split by corpus location, because the fork is genuine and no single answer
covers both:

- **Corpus on-device → A, staged per 0006's option C.** Ship plain-text and
  markdown attachment first; add PDF text-layer extraction as a fast-follow.
  Choose the embedding model before anything else — its dimension and memory
  footprint constrain every downstream decision, including whether a second
  resident context is viable on mid-range phones at all.
- **Corpus remote → C as the destination, B as the first step.** B is
  roughly one task on existing rails; C is an epic. Shipping B first proves
  the corpus is the right shape before investing in local indexing, and its
  manifest is reusable as C's sync mechanism rather than thrown away.

In both cases the LFM2 1.2B RAG model already in the catalog is the intended
generator, and the work is what finally makes it usable.

## Decisions

**Option A — the on-device knowledge base — is the direction, with a remote
knowledge base deferred to a second phase (options B/C, unchanged above).**
Decided by the developer, September 2026. Scope added at the same time, and
detailed in [epic 16](../epics/mobile/knowledge-base.md):

- The knowledge base is **opt-in**, off by default.
- When on, it **archives the user's conversations** so they can be retrieved
  later — see "Conversations are a corpus the app currently destroys" below,
  which is why this is not a small addition.
- The user can **add and update their own content**, per 0006's staging:
  plain text and markdown first, PDF text-layer as a fast-follow.

Also settled, and not to be relitigated:

- A device-local corpus is a chat feature, not a connector (research 0006's
  reasoning, applied at corpus scale).
- Any remote corpus goes through the connector layer, separately revocable
  (hard rule 2). This still governs the second phase.
- No part of a local index lives in `src/chat/`; it follows
  `chatHistoryStore`'s inversion through `ChatSessionContext`.

## Conversations are a corpus the app currently destroys

Recorded after the decision above, because it changes the shape of the work
and was not anticipated when the options were drafted.

The app persists exactly **one** conversation thread — `history.json`, via
`apps/mobile/src/settings/chatHistoryStore.ts`, whose own header calls it
"the one persisted conversation thread." There is no multi-conversation
concept anywhere in either app.

More importantly, that thread is **destructively capped on write**, not just
on read. `ChatScreen.tsx` calls `session.saveHistory(capMessages([...]))` on
every turn, and `capMessages` slices messages off the front once the
character budget is exceeded. The oldest messages are therefore deleted from
disk as a conversation grows. This is correct for what the file is — a
working buffer sized to the next request's context window — and its own
comment says so: capped on write "so the list this turn's own request is
built from never grows unbounded."

Two consequences:

1. **The archive must be a second, separate store.** Append-only, uncapped,
   and distinct from `history.json`, which keeps its current behaviour
   untouched. The two have genuinely different jobs — one feeds the next
   request, the other feeds retrieval — and merging them would either
   blow out the request context or keep destroying the archive.
2. **Opting in cannot recover the past.** Everything `capMessages` has
   already dropped is gone. The archive starts at the moment of opt-in, and
   the UI should say so rather than implying a retroactive history.

**Desktop persists no chat at all** — nothing in `apps/desktop/src/chat/`
writes history, so conversations there vanish on quit. Desktop is therefore
a larger lift than a port of the mobile work, and is sequenced after it.

### Indexing the model's own output

If assistant replies are archived and later retrieved, the model's mistakes
become retrievable "knowledge" and can be recycled into future answers. This
is a real failure mode, not a hypothetical, and it argues for: tagging every
chunk with its role at archive time, keeping user-authored content
preferred at retrieval, and showing retrieval provenance in-chat the way
task 2.5 already does for connectors. Whether assistant-authored content
should be retrievable *at all* by default is left open below.

## Open questions

- **Which embedding model** — dimension, quantization, and whether a second
  resident context alongside a 1–4B chat model is viable on a mid-range
  Android device. Needs measurement, not a spec-sheet comparison; research
  0003 is the precedent for why.
- **Vector storage shape** — brute-force cosine over JSON until proven
  inadequate, or a real index from the start? Prefer the former until a
  measured corpus size says otherwise.
- **Chunking strategy** — fixed-size windows with overlap, or structure-aware
  splitting on headings? Interacts with whether the corpus is markdown
  (structured) or PDF-extracted (flat).
- **Does a remote KB connector need Tier 2?** Task 5.6 is deliberately
  blocked on a real Tier 2 use case existing. Reshaping arbitrary third-party
  KB API responses could be the first genuine one — worth watching for, not
  worth forcing.
- **Android PDF text extraction** — still 0006's open spike, still
  unanswered, and still a prerequisite for option A's second stage only (not
  its first).
- **Should assistant-authored content be retrievable by default?** Archiving
  both roles is necessary — half a conversation is not a conversation — but
  retrieving the model's own past output risks recycling its mistakes. Role
  tagging is the mechanism; the default is a product call.
- **When does embedding happen?** Embedding each turn as it arrives means an
  embedding context resident for the whole session, on top of the chat
  model. Batching instead (on opening the knowledge-base screen, or an
  explicit "index now") keeps archive writes cheap and confines the second
  context to a bounded window. Prefer batching until measurement says
  otherwise; this interacts directly with the model-choice spike above.

## Next steps

Superseded by [epic 16](../epics/mobile/knowledge-base.md), which carries the
task breakdown. The gating item is unchanged and is that epic's first task:
**spike the embedding model on real hardware before building anything on top
of it.** Its dimension and memory footprint decide whether a second resident
context is viable at all on a mid-range Android device, and every later task
assumes an answer. On-device measurement is the gate, per this repo's own
verification convention and research 0003's precedent.
