# Epic: Core Inference & Chat

> `llama.rn`/GGUF engine, model manager, and a fully offline chat and writing
> assistant — the part of the app with no network code path at all.

## Status

⏳ In Progress

## Overview

The foundation the entire privacy claim rests on. Everything in this epic
must work with the device in airplane mode. This is scenario 1 from the
original brainstorm: open the app, brainstorm something, fix grammar,
draft/rewrite an email — all fully local.

## Tasks

#### ✅ 1.1 — `llama.rn` integration and inference engine wrapper

**Goal:** Get a GGUF model running on-device via `llama.rn`, wrapped in a
clean internal API the chat UI and connector framework both call.

**Deliverables:**

- `llama.rn` integrated for both iOS and Android.
- An internal inference wrapper (load model, stream tokens, unload model)
  independent of any specific model file.
- Basic perf validation on a real low/mid-range device, not just a
  simulator/emulator.

**Dependencies:** Task 0.1 (repo scaffold), Task 0.4 (model asset pipeline).

**Review checklist:**

- Chat streams tokens from a locally-downloaded GGUF model with the device's
  network interfaces disabled.

- ✅ Verified on an iPhone 15 Pro (A17 Pro, 7.50 GB), Release build. Metal is
  active — `GPU=true`, where every earlier figure came from an emulator
  reporting `gpu=false` and running CPU-only. Generation reached 86–91 tok/s
  against ~43 on the emulator, with time-to-first-token 233 ms cold and 17 ms
  warm against 1123 ms.

**Two findings worth carrying forward.** Model load took **8.7 s** on device
against 1.8 s on the emulator — GPU acceleration is *why*, since Metal must
upload weights to GPU memory where the CPU-only path simply memory-mapped
them. So the ~2x generation win costs roughly seven seconds up front, which
task 1.3's chat UI has to show honestly rather than hide behind a spinner.
Verification also revealed a redundant digest pass; see
[research 0003](../research/0003-model-verification-hashing.md).

**Not established:** both available test devices have 8 GB, so every model
rates `comfortable` and the memory heuristic remains unexercised near its
boundary.
---

#### ✅ 1.2 — Model manager

**Goal:** Let a user pick, download, and manage which small model is
installed.

**Deliverables:**

- Curated model catalog (small GGUF models — Gemma/Qwen/Phi-class; final list
  is an open question, see research 0001).
- RAM-aware guidance/warnings per model, given the phone's available memory.
- Delete/switch-model flow.

**Dependencies:** Task 1.1, Task 0.4.

**Review checklist:**

- ✅ A user can download one model, chat, delete it, and download a different
  one without restarting the app. Verified end to end on an Android emulator:
  Qwen2.5 0.5B downloaded and verified (57s), loaded in 1.3s, replied "Hello!
  How may I assist you?", was deleted; then Llama 3.2 1B downloaded, loaded in
  2.8s, replied, and was deleted — all in one app session.
- ✅ The Llama entry carries no MD5, so it was verified purely against the
  publisher's SHA-256: 807 MB in 1.0s (~790 MB/s) via the native module from
  task [0.5](infrastructure.md#-05--native-sha-256-hashing). The same
  check would have taken roughly ten minutes of JavaScript hashing before it.

---

#### 📋 1.3 — Offline chat UI

**Goal:** The core conversational interface.

**Deliverables:**

- Conversation view with streaming token rendering.
- Local-only chat history (no export/sync in this task — that's a future,
  explicit opt-in decision per research 0001-equivalent follow-up).
- Persistent visible indicator that the current conversation is fully
  offline (per CONCEPT.md's "always show which trust tier is active").

**Dependencies:** Task 1.1.

**Review checklist:**

- Chat is fully usable with the device offline. **Not yet verified on device** —
  the code is written and covered by tests, but the checklist asks about a
  real phone and the last build on the iPhone 15 Pro is the task 1.1 perf
  harness, not the app. This stays 📋 until that rebuild happens.

**Built so far:**

- `ChatScreen` renders streaming tokens into the reply as they arrive, keeps
  history in memory only, and offers Stop while a reply is generating — the
  engine supports aborting, and without it a user waits out a reply they no
  longer want.
- A persistent banner names the trust tier and the loaded model, and carries
  the load-time explanation that finding above calls for: the 8.7 s wait is
  stated in words rather than hidden behind a spinner.
- `ChatSessionContext` (in `src/chat/session/`) is a narrow contract — status,
  model name, detail, `generate` — implemented by `ModelSessionProvider` in
  the app shell. This is what keeps `src/chat/` from importing `ModelManager`
  and, through it, the downloader, which research 0001 forbids.
- One engine app-wide, in that same provider. A second concurrent context is
  the fastest route to an out-of-memory kill on a phone, and sharing one is
  also what lets the manager release a model before deleting it.

---

#### 📋 1.4 — Writing-assist modes

**Goal:** The concrete scenario-1 use case — brainstorm, grammar-fix,
rewrite/draft an email.

**Deliverables:**

- A small set of prompt-engineered modes/personas (brainstorm, fix grammar,
  rewrite tone, draft from bullet points) surfaced as quick actions in chat.
- No connector involved — these are pure local-model tasks.

**Dependencies:** Task 1.3.

**Review checklist:**

- Each mode produces a materially different, appropriate transformation of
  the same input text.

---

#### 📋 1.5 — Zero-network enforcement and audit

**Goal:** Make the "fully offline" claim structurally true, not just true by
current code review.

**Deliverables:**

- A build-time or lint-time check (or platform network-permission
  configuration) that fails if any code path reachable from the chat/
  inference module can make a network call.
- Document the enforcement mechanism so it's auditable by a third party, not
  just asserted in prose.

**Dependencies:** Task 1.1.

**Review checklist:**

- Attempting to add a network call inside the chat/inference module fails
  CI or the build, not just code review.

## Related Docs

- [CONCEPT.md](../../CONCEPT.md)
- [research 0001](../research/0001-concept-and-connector-architecture.md)
