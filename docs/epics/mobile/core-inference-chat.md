---
epic: 1
title: Core Inference & Chat
status: "✅ Complete — tasks 1.1 through 1.6"
scope: mobile
---

# Epic: Core Inference & Chat

> `llama.rn`/GGUF engine, model manager, and a fully offline chat and writing
> assistant — the part of the app with no network code path at all.

The offline guarantee is now enforced rather than intended: see
[docs/network-audit.md](../../network-audit.md).

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
[research 0003](../../research/0003-model-verification-hashing.md).

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

**Found after this task closed, fixed in [1.6](#-16--remember-the-chosen-model).**
The checklist above was still true — switching worked, and nothing here
claimed the choice would survive a relaunch.

- **The chosen model was not remembered across launches.** The provider
  bootstrapped with `manager.list().find((m) => m.installed)` — the first
  *catalog* entry that happened to be installed, not the one the user picked.
  Switching deliberately to Llama 3.2 1B and relaunching put the app silently
  back on Qwen2.5 0.5B.

  That was more than an annoyance: task 1.4 measured Draft fabricating a price
  on 0.5B and not on 1B, so it quietly returned the user to the model they had
  moved away from, with the mode warning as the only thing catching it. Found
  by accident — a Fast Refresh remount re-ran the bootstrap mid-session, made
  Qwen active again with no visible change, and the next tap on that row
  deleted a 491 MB download instead of selecting it. The destructive tap was a
  development artefact; the missing persistence was not.

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

#### ✅ 1.4 — Writing-assist modes

**Goal:** The concrete scenario-1 use case — brainstorm, grammar-fix,
rewrite/draft an email.

**Deliverables:**

- A small set of prompt-engineered modes/personas (brainstorm, fix grammar,
  rewrite tone, draft from bullet points) surfaced as quick actions in chat.
- No connector involved — these are pure local-model tasks.

**Dependencies:** Task 1.3.

**Review checklist:**

- ✅ Each mode produces a materially different, appropriate transformation of
  the same input text. Measured on an Android emulator against both Qwen2.5
  0.5B and Llama 3.2 1B:
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

- ✅ Draft warns when the loaded model is below 1B, naming the model and the
  specific failure rather than offering a generic disclaimer about AI. Scoped
  to the one mode and the sizes where fabrication was observed: it is absent
  on Fix grammar, which returns the user's own words corrected, and absent at
  1B. Both directions verified on device. A warning shown everywhere becomes
  wallpaper, and the place it matters would be lost in it.

**Known rough edges, recorded rather than fixed.** Brainstorm on 0.5B restates
one idea in several wordings, against its own prompt; repetitive options waste
time but cannot mislead the way an invented figure can. Rewrite tone wraps its
output in quotation marks, against "return only the rewritten text". Draft on
1B drops a given fact (the 5 percent) — omission rather than invention.

- ✅ A mode receives its system prompt and the current message only. Sending
  conversation history defeated modes outright: with two grammar corrections
  in the transcript, Brainstorm returned a third grammar correction, because a
  0.5B model follows demonstrated behaviour over a system instruction. The
  same input in a fresh conversation returned ideas. Fixed and re-verified by
  reproducing the original two-turn sequence.

---

#### ✅ 1.5 — Zero-network enforcement and audit

**Goal:** Make the "fully offline" claim structurally true, not just true by
current code review.

Every other task in this epic delivers a feature. This one delivers *evidence*.
[Research 0001](../../research/0001-concept-and-connector-architecture.md#decisions)
states that "the chat/model/memory layers are 100% offline by design — no
network code path exists there at all", and CONCEPT.md sells that to users.
Today it is true because the people who wrote the code intended it. This task
is what makes it survive a contributor who did not read this document.

##### What the claim actually means

Precision first, because "offline app" is not what is being claimed and
promising it would be a lie — the app downloads model weights over HTTPS.

| Module | Network | Why |
| --- | --- | --- |
| `src/chat/` | **Never** | The claim. Conversations, prompts, and replies never leave the device. |
| `src/models/` | **User-initiated only** | *Acquiring* a model is a visible, deliberate download. *Using* one never touches the network. The deliberate exception in AGENTS.md rule 3, and why it is a sibling of `chat/` rather than living inside it. |
| `src/connectors/` | **Per-grant only** | Every outbound call, behind an explicit, separately revocable, per-connector permission. Currently an empty directory — the framework is epic 2. |
| `src/design-system/`, `src/shared/` | **Never** | Not part of the claim as stated, but `chat/` imports them, so they are inside the boundary by transitivity. |

The enforceable statement is therefore narrower and sharper than "the app is
offline": **no code path reachable from `src/chat/` can open a socket.**

##### Threat model

What actually breaks this, roughly in order of likelihood. An enforcement
mechanism that does not address each of these is theatre.

1. **A direct import.** Someone adds `import { fetch } from 'expo/fetch'` or
   an HTTP client to a file under `src/chat/`. The easy case, and the only one
   a naive lint rule catches.
2. **A global with no import at all.** `fetch`, `XMLHttpRequest`, `WebSocket`,
   and `EventSource` are ambient in React Native. A file can reach the network
   without importing anything, so import-based rules alone are insufficient.
   This is the most likely way the boundary silently breaks.
3. **A transitive import.** `src/chat/` imports something innocuous which, two
   or three hops down, reaches `src/models/download.ts` or a networked
   library. Lint sees one file at a time and cannot see this at all. Closing
   it needs a graph walk from `src/chat/**` across the resolved import tree.
   The `ChatSessionContext` inversion built in task 1.3 exists precisely to
   keep this edge from forming; the check is what proves it stays absent.
4. **A native module.** JavaScript-level analysis cannot see a socket opened
   in Swift or Kotlin. `llama.rn` ships prebuilt native artifacts. Measured
   during scoping and found clean — see *Resolved before implementation* — but
   the hole stays open for any native module added later.
5. **A dependency update.** A transitive npm package starts phoning home in a
   patch release. Not addressed by any check scoped to first-party source.

##### Enforcement layers to build

Each is listed with what it *cannot* catch, because a mechanism whose limits
are unstated will be trusted past them.

- **Lint: restricted imports** under `src/chat/**`, denying network-capable
  modules by path and pattern. Follows the existing `no-restricted-syntax`
  colour rule in `eslint.config.js` — the precedent for turning a review
  checklist item into a check. *Cannot catch:* threats 2–5.
- **Lint: restricted globals** under `src/chat/**` for `fetch`,
  `XMLHttpRequest`, `WebSocket`, `EventSource`, and `navigator.sendBeacon`.
  Closes threat 2, which is the one most likely to occur. *Cannot catch:* 3–5.
- **A module-graph check**, run in CI, that resolves imports from every file
  under `src/chat/**` and fails if the closure reaches a denylisted module or
  any file outside the permitted set. This is the layer with real teeth and
  the only answer to threat 3. It needs to run on the same resolution Metro
  uses, or it will disagree with the shipped bundle.
- **A runtime tripwire in development builds** that replaces the network
  globals with throwing stubs while a chat screen is mounted. `jest.setup.js`
  already does this for tests and points at this task by name; the value here
  is catching a path that only executes at runtime.
- **A written audit document** covering the above plus the native surface: the
  declared platform permissions, why `INTERNET` cannot be dropped, and what a
  third party should run to reproduce every claim.

##### What this task cannot close

Stating these plainly is part of the deliverable. An audit that overclaims is
worse than none, because it transfers unearned trust.

- **Native code.** No JavaScript check sees a socket opened inside `llama.rn`.
  Mitigation is auditing what that library links against and recording the
  finding — not asserting a guarantee the mechanism does not provide.
- **Platform permissions cannot express this.** `android.permission.INTERNET`
  is app-wide and genuinely required for model downloads, so it cannot be
  dropped to enforce the boundary. iOS has no per-module network entitlement
  either. This is why the enforcement is a module boundary rather than a
  platform control, and the audit should say so rather than leave a reader
  assuming the OS is enforcing something it is not.
- **Third-party runtime behaviour**, per threat 5.

##### Findings already in hand

Turned up while scoping this task, and part of its audit surface:

- **`AndroidManifest.xml` declares `SYSTEM_ALERT_WINDOW`** (draw over other
  apps), plus `VIBRATE` and legacy `READ`/`WRITE_EXTERNAL_STORAGE`. None are
  used by any first-party code; they are pulled in by dependencies and merged
  by the manifest merger. For an app whose pitch is restraint, shipping a
  draw-over-other-apps permission is a genuine audit smell — it is the kind of
  thing a reviewer finds and a user cannot explain away. The audit should
  enumerate every declared permission with a justification or a removal.
- **iOS ATS is `NSAllowsArbitraryLoads: false`** (good) with
  `NSAllowsLocalNetworking: true`. The latter is what a Metro dev server
  needs; whether it should survive into Release builds is an open question
  below.

**Dependencies:** Task 1.1.

**Deliverables:**

- Lint rules covering threats 1 and 2, scoped to `src/chat/**`.
- A CI module-graph check covering threat 3.
- A development-time runtime tripwire.
- `docs/network-audit.md`: the enforced boundary, each mechanism and its
  limits, every declared platform permission with a justification, and the
  exact commands a third party runs to reproduce the claims.
- Permission cleanup, or a recorded reason each one stays.

**Review checklist:**

- ✅ Attempting to add a network call inside the chat/inference module fails
  CI or the build, not just code review. Four mechanisms: restricted imports
  and restricted globals in `eslint.config.js`, a module-graph walk in
  `scripts/ci/check-offline-boundary.js` wired into CI as `pnpm check:offline`,
  and a development-only runtime tripwire armed from `App.tsx`.
- ✅ **Each mechanism was verified by deliberately breaking it.** Nine probes
  across the threat classes, each confirmed to fail for its stated reason and
  then reverted. The decisive one: an escape routed `chat/ → shared/helper →
  @/models` produced **zero ESLint errors** and was caught by the graph check,
  which printed the full three-step chain. That is the case lint provably
  cannot see, and the reason the graph check exists rather than being a
  belt-and-braces extra.
- ✅ A third party can reproduce every claim in
  [docs/network-audit.md](../../network-audit.md) from the commands it lists.
- ✅ Every Android permission is justified or removed. **A Release build
  declares exactly one: `INTERNET`.** `VIBRATE` and both legacy external
  storage permissions are removed via `android.blockedPermissions`;
  `SYSTEM_ALERT_WINDOW` turned out to be debug-only, added by React Native's
  dev overlay, and is absent from Release.

**Two things the verification changed.** The permission check had to move from
the source manifest to the merged one — the source still lists blocked
permissions carrying `tools:node="remove"`, so grepping it reports the
opposite of the truth, and the audit's original command would have misled a
reader. And the runtime tripwire was tested against a real model download to
confirm it does not break the one legitimate network path: `expo-file-system`
downloads through native code rather than JS `fetch`, so a 1.12 GB transfer
ran normally with the guard armed. That was an assumption until it was
measured.

##### Resolved before implementation

- **The graph check runs on source imports, not the bundle.** Walking
  first-party imports from `src/chat/**` runs on every PR, points at the file
  and line that broke the rule, and covers the realistic failure. Bundle
  analysis is the stronger claim — it is what actually ships — but it is slow,
  its errors name generated module ids rather than source, and it cannot run
  until a bundle is built. Recorded as a follow-up rather than dropped: the
  gap it leaves is a dependency that reaches the network without any
  first-party file importing it, which is threat 5 and is not closed here.
- **The runtime tripwire is development and test only.** The static checks are
  the production guarantee; a violation reaching a Release build means CI
  already failed, and turning that into a user-visible crash punishes the user
  for the project's mistake. Failing closed in Release was the tempting
  choice for a product sold on this claim, and it was rejected because the
  crash would land on a path never exercised in testing — precisely the path
  least likely to have been the one anyone reasoned about.
- **`NSAllowsLocalNetworking` stays, and the reason is not Metro.** Research
  0001 specifies the Sovereign Tasks connector calling "the user's self-hosted
  `sovereign` instance", and self-hosted instances commonly sit on a LAN.
  Stripping it would break a planned connector on exactly the deployment this
  product is built for. The audit records it as a connector requirement rather
  than a development leftover — the distinction matters, because a reader who
  sees it described as a dev artefact will reasonably ask why it shipped.
- **The dependency audit covers only what `chat/` actually reaches** — today
  `llama.rn`, `react`, `react-native`, and `react-native-safe-area-context`.
  That is the exact set the claim depends on, small enough to re-audit when it
  changes, and it does not rot into a list nobody rechecks. Everything else in
  `package.json` is out of scope and says so in the audit.
- **`llama.rn` links nothing network-capable.** Measured rather than assumed,
  since this overlaps the unresolved prebuilt-binary supply-chain question in
  [research 0002](../../research/0002-react-native-framework-choice.md). Both
  shipped artifacts — `ios/rnllama.xcframework` (arm64, 10,471,352 bytes) and
  `android/.../arm64-v8a/librnllama.so` (9,530,928 bytes) — have **zero
  undefined network symbols**: no `socket`, `connect`, `getaddrinfo`,
  `NSURLSession`, or `curl_*`. A library that opens a socket must import those
  from the system. The iOS/Android sources contain no `NSURLSession`,
  `HttpURLConnection`, `OkHttp`, or `java.net.*`, and the bundled C++ has no
  `sys/socket.h` or `curl` includes — upstream llama.cpp's optional
  `LLAMA_CURL` model downloader is not compiled in.

  The binaries do contain URL-shaped strings — GitHub PR links from source
  comments, and `https://huggingface.co/` from llama.cpp's model-spec
  parsing — which are inert without socket symbols to act on them.

  **Limits of this evidence**, which the audit must carry rather than round
  off to "verified safe": it covers arm64 artifacts via `nm` and `strings`,
  and a `dlsym`-based lookup would evade it. That would be extraordinary for
  an inference library, but "we checked the imports table" is the claim being
  made, not "we proved it cannot".

##### Deferred

- **Bundle-level analysis**, per the first decision above. Closes threat 5;
  needs its own task.
- **Threat 5 generally** — a transitive npm package that starts phoning home
  in a patch release is not addressed by anything scoped to first-party
  source.

#### ✅ 1.6 — Remember the chosen model

**Goal:** The model a user selects stays selected across app launches.

**Deliverables:**

- Persist the active model id alongside the model files.
- Read it back at startup, falling back to the current "first installed
  catalog entry" behaviour when the stored id is no longer installed.

**Dependencies:** Task 1.2.

**Review checklist:**

- ✅ Switch to a model that is not first in the catalog, force-quit, relaunch,
  and it is still the one loaded. Verified on an Android emulator: selected
  Llama 3.2 1B (second in the catalog, with Qwen2.5 0.5B also installed),
  confirmed `active-model.json` held its id, force-stopped the app, and the
  banner came back reading "On-device · Llama 3.2 1B Instruct". The first
  attempt at this check was worthless and had to be redone — Qwen was active,
  which is also what the old behaviour produces, so it distinguished nothing.

**How it works.** The id is stored beside the model files rather than in a
settings store, so deleting a model reclaims both together and no preference
is left pointing at nothing. `readActiveModelId` returns null once the file it
names is gone, meaning a model removed by an OS clean-up or absent after a
restore degrades to first-launch behaviour instead of failing to start.
`remove()` clears the stored id whenever it names the model being deleted,
including in a session that never loaded it — the stored choice outlives the
session that set it, so `activeId` alone is not enough to know.

**Why this is not cosmetic.** Task 1.4 measured Draft fabricating a price on
Qwen2.5 0.5B and not on Llama 3.2 1B. Without persistence, a user who moved
to the larger model for exactly that reason is returned to the smaller one on
next launch, with no announcement. The mode's fabrication warning is currently
the only thing standing between that and a draft they send.

---

## Related Docs

- [CONCEPT.md](../../../CONCEPT.md)
- [research 0001](../../research/0001-concept-and-connector-architecture.md)
