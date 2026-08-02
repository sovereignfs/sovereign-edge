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

  **This was verified against the pipeline, not the shipped UI, and for a
  while the distinction mattered.** The Models screen arrived later (tasks 8.1
  and 1.3) with no download control at all: `onPress` returned `undefined` for
  anything not already installed. A fresh install was therefore a dead end —
  chat said "open Models to add one" and Models offered nothing to press.
  Nothing caught it, because the checklist above had been signed off on a path
  no user could take, and both test devices already had model files left
  behind by the task 1.1 perf harness. It was found by running a fresh install
  on an emulator. The download UI now exists and the claim above is true of
  the shipped app: Qwen2.5 0.5B (491,400,032 bytes) downloaded, verified,
  auto-loaded, and answered a question, entirely from the UI.
- ✅ Confirmed on an iPhone 15 Pro as well, against a Release build reporting
  0.1.10 to the OS — which is only usable as evidence because the native
  version was regenerated first; before that it read 0.1.4 and could not
  distinguish one install from another. Note this device cannot reproduce the
  first-run case: it still holds model files from the task 1.1 perf harness,
  so the Android emulator remains the evidence for the fresh-install path.
- ✅ The Llama entry carries no MD5, so it was verified purely against the
  publisher's SHA-256: 807 MB in 1.0s (~790 MB/s) via the native module from
  task [0.5](infrastructure.md#-05--native-sha-256-hashing). The same
  check would have taken roughly ten minutes of JavaScript hashing before it.
- ✅ The RAM guidance is finally exercised near its boundary. Both physical
  devices have 8 GB, where every catalog entry rates `comfortable`; a 3.8 GB
  emulator renders all three tiers, including "Likely too large for this
  device" for Gemma 2 2B.

---

#### ✅ 1.3 — Offline chat UI

**Goal:** The core conversational interface.

**Deliverables:**

- Conversation view with streaming token rendering.
- Local-only chat history (no export/sync in this task — that's a future,
  explicit opt-in decision per research 0001-equivalent follow-up).
- Persistent visible indicator that the current conversation is fully
  offline (per CONCEPT.md's "always show which trust tier is active").

**Dependencies:** Task 1.1.

**Review checklist:**

- ✅ Chat is fully usable with the device offline. Verified on an iPhone 15
  Pro in airplane mode against a **Release** build — the distinction matters:
  a debug build fetches its JS from Metro over the LAN, so it cannot answer
  this question at all, and an early attempt against one had to be discarded.
  The Release binary embeds `main.jsbundle` (2.0 MB) and has no Metro path.
- ✅ The build was confirmed to be current code by reading the version off the
  Settings screen (0.1.10). That value is a JS constant compiled into the
  bundle, which is what makes it usable as evidence: the iOS `Info.plist`
  version is stale at 0.1.4, because `ios/` is CNG-generated and
  `expo run:ios` does not re-run prebuild, so the native version string
  cannot distinguish an old install from a new one.
- ✅ Verified on Android too, on an emulator, after the iOS run had already
  been signed off. Chat rendered, the model answered, and the composer
  behaved — but this is also where the fresh-install dead end recorded under
  task 1.2 turned up, because the emulator was the first device in the project
  without a model already sitting in its container. Single-platform
  verification would have missed it.

**Delivered:**

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

- ⚠️ Each mode produces a materially different, appropriate transformation of
  the same input text. **Materially different: yes. Appropriate: not yet, on
  Qwen2.5 0.5B.** Measured on an Android emulator:
  - ✅ **Fix grammar** — "we needs to tell customers there prices is going up"
    became "We need to tell customers that prices are going up." Four
    corrections, no commentary, nothing else touched. Two runs at temperature
    0.2 produced identical output.
  - ⚠️ **Brainstorm** — returns a list rather than prose, but restates one
    idea five ways ("pricing increase", "rising prices", "increasing prices"),
    which its own prompt forbids. Temperature 0.95 does not rescue it.
  - ❌ **Draft** — "Prices rise 5 percent from March, loyal customers get 3
    months notice" produced a nine-line essay opening "which implies that the
    prices have increased by **$100 per customer**". The figure is invented;
    the prompt says to invent no new facts, and to match length to input. A
    fabricated price in a draft the user may then send is the most damaging
    failure available to this feature, and it reads fluently enough to pass a
    skim.
  - ✅ **Rewrite tone** (Llama 3.2 1B) — "make this polite: prices are going
    up deal with it" became "I wanted to touch base with you regarding the
    pricing for our services…". Wraps its output in quotation marks, against
    "return only the rewritten text".

**Re-measured on Llama 3.2 1B, same input, same prompt, only the model
changed.** Draft returned "To accommodate our loyal customers, we will offer
them 3 months' notice before increasing prices…" — no invented figure, and a
short paragraph rather than an essay. It drops the 5 percent, so it omits a
given fact instead of inventing one; a lesser fault, but still against the
prompt.

So the prompts were not the problem and were deliberately left alone. Tuning
them against the smallest catalog entry would have contorted them around a
limitation that disappears one size up.

**What this leaves.** Draft is unsafe on Qwen2.5 0.5B specifically, and that
is the first catalog entry and the one a new user is most likely to install.
A fabricated price in text the user is about to send is the most damaging
output this feature can produce, and it reads fluently enough to survive a
skim. Recording it here is not a substitute for handling it in the product.

- ✅ A mode receives its system prompt and the current message only. Sending
  conversation history defeated modes outright: with two grammar corrections
  in the transcript, Brainstorm returned a third grammar correction, because a
  0.5B model follows demonstrated behaviour over a system instruction. The
  same input in a fresh conversation returned ideas. Fixed and re-verified by
  reproducing the original two-turn sequence.

**Open question before this can close.** Whether the prompts need tightening,
whether 0.5B is simply below the floor for Draft, or whether the catalog's
larger entries clear it. Draft should be re-run on Llama 3.2 1B before any
prompt is rewritten — tuning prompts against the smallest model risks
contorting them for a size the user may never run. If the fabrication survives
on larger models, this feature needs a visible caution in the UI rather than
better wording, since the output is meant to be sent.

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
