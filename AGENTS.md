# AGENTS.md — sovereignfs/sovereign-edge

Canonical, agent-agnostic guidance for this repository. `CLAUDE.md` points
here and carries no content of its own, so there is only one file to keep
true.

## What this is

**Sovereign Edge** — a privacy-first, fully offline on-device AI companion for
iOS and Android. A local GGUF model runs on the user's device with **no
network code in the chat path at all**; anything reaching outside the device
goes through an explicitly permissioned **connector**.

Fully standalone: no runtime dependency on `sovereign`, and it works with zero
knowledge that `sovereign` exists.

## State of play

Accurate as of version 0.1.14. **[ROADMAP.md](ROADMAP.md) is canonical** — if
this section disagrees with it, this section is stale.

**Done.** The offline core is complete (epic 1, tasks 1.1–1.6): on-device
inference, model catalog with download/verify/switch, streaming chat UI,
writing-assist modes, model-choice persistence, and zero-network enforcement.
Design system (7.1–7.2) and app shell (8.1) are done. The connector framework
has its manifest schema and permission model (2.1–2.2).

**Next**, in order: 2.3 tool-routing, 2.4 connector runtime host, 3.1 the
Search connector — the first thing that actually uses the connector framework
end to end.

**Blocked.** 0.1.3 (native build tooling) and 8.2 (store release) both need an
Apple team ID and a Play upload key that do not exist yet. Do not attempt to
create accounts, handle signing keys, or enter credentials — those are the
developer's to do.

**Groundwork already done for 2.3**, from
[research 0004](docs/research/0004-connector-manifest-schema.md): `llama.rn`
converts JSON Schema to a decoding grammar (`json_schema` on `completion`), so
constrained tool-call output comes free from a manifest's `tool.parameters`.
And `chatTemplates.jinja.defaultCaps.tools` reports per-model whether the
loaded model can call tools at all — which is what 2.3's required fallback
message must be honest about, because it is a fact about the *model*, not the
connector.

### Environment quirks worth knowing before you burn time on them

- **The Android emulator does not survive an agent session.** Launched with
  `nohup … &` it still dies when background tasks are torn down. Resolve its
  serial **by AVD name**, never assume `emulator-5554` — another project's AVD
  has taken that serial mid-session and screenshots came back showing the
  wrong app.
- **Fast Refresh remounts providers.** `ModelSessionProvider` re-runs its
  bootstrap, which silently changed the active model mid-session and made the
  next tap on a Models row delete a 491 MB download instead of selecting it.
  Re-read the screen state after editing provider code.
- **Adding a native dependency changes the Android permission list** without
  touching your code. `expo-secure-store` added `USE_BIOMETRIC` and
  `USE_FINGERPRINT`. Always re-check the **merged Release** manifest, per
  [docs/network-audit.md](docs/network-audit.md) — the source manifest lists
  blocked permissions with `tools:node="remove"` and reports the opposite of
  the truth.
- **A debug build cannot answer "does this work offline"**, because it loads
  its JS from Metro over the LAN. Offline claims need a Release build.

## Source of truth

Read the relevant document before implementing — these are authoritative over
assumptions:

- [CONCEPT.md](CONCEPT.md) — vision, architecture, tiered connector model,
  phasing.
- [ROADMAP.md](ROADMAP.md) — chronological task index and **canonical task
  status**. One row per task.
- [docs/epics/](docs/epics/) — full task detail by stable epic task ID: goal,
  deliverables, review checklist.
- [docs/research/](docs/research/) — decision records: findings, options
  considered, and what was decided. Read the relevant one before revisiting a
  settled question.
- [docs/development-workflow.md](docs/development-workflow.md) — task
  lifecycle and how the documents above fit together.
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, branching, commits, PRs, CI.

**Research precedes implementation for open questions.** For an open-ended
architectural or strategic question with no concrete design yet, write a
research doc in `docs/research/` — findings, options, a recommendation — before
building on a guess. Research 0003 exists because a measured benchmark
overturned a design that looked obviously correct on paper.

## Working conventions

- **One task at a time.** Implement a single task, verify its review
  checklist, then stop for human review. Do not start a task on an unmerged
  PR.
- **Tasks are sequenced.** Each generally depends on the previous — don't skip
  ahead without saying so.
- **Branch per task**, always cut from an up-to-date `main`
  (`git switch main && git pull` first):
  - `feat/<slug>` — features
  - `fix/<slug>` — bug fixes
  - `docs/<slug>` — documentation
  - `chore/<slug>` — tooling, scaffolding, deps, maintenance
- **Epic task IDs (`<epic>.<seq>`, e.g. `0.4`, `2.1`) are permanent** and may
  be cited in commits, PRs, and cross-references. **Roadmap slot versions
  (e.g. `0.1.4`) are volatile** — they reflect current ordering and shift when
  work is reprioritised. Look the live slot up in `ROADMAP.md` rather than
  hard-coding it, and keep slots out of branch names and commit subjects.
- **Verify before claiming done.** Run the task's review-checklist commands
  and show the output. "Tests pass" is not the same claim as "the feature
  works" — see _Verification_ below.
- **When a task completes, mark it ✅ in both `ROADMAP.md` and the matching
  `docs/epics/<file>.md` heading, in the same PR.** Those two places are the
  only status record; do not accumulate completion history in this file.
- **Never merge a PR automatically.** Wait for explicit instruction. Open
  agent-created PRs as drafts (`gh pr create --draft`).
- **Bump the version when a task completes**, to the roadmap slot just
  finished, and run `pnpm prebuild` so the native projects pick it up — see
  _Native project rules_. `package.json`, `app.json`,
  `src/shared/app-info.ts`, and `ROADMAP.md`'s header must agree.
- **Direct commits to `main` happen only on explicit, per-change
  instruction.** Branch-and-PR is the default; permission for one task does
  not carry to the next. Everything else — checks, version bump, status
  marks — is unchanged either way.
- **Docs are part of the change.** A change to the connector manifest schema,
  the model descriptor shape, or a documented command means updating the
  matching doc in the same PR.

## Hard architectural rules

Violating any of these breaks a promise the product makes to its users, not
just a style preference.

1. **`src/chat/` must not import anything that opens a socket.** The
   chat/model/memory layers are offline by design — per
   [research 0001](docs/research/0001-concept-and-connector-architecture.md#decisions),
   "no network code path exists there at all". This is the product's central
   claim.

   Enforced rather than intended (task 1.5): ESLint restricts both imports and
   the ambient network globals under `src/chat/`, and `pnpm check:offline`
   walks the import graph in CI to catch a transitive route that lint cannot
   see. [docs/network-audit.md](docs/network-audit.md) records what each
   mechanism does **and does not** cover — read it before assuming a check
   guarantees more than it does.
2. **All outbound network access goes through `src/connectors/`**, behind an
   explicit, per-connector, separately revocable permission grant. Granting
   one connector network access never grants another.
3. **`src/models/` is the one deliberate exception** and is why it is a
   separate top-level module rather than living under `chat/`. *Acquiring* a
   model is a visible, user-initiated network action; *using* one never
   touches the network.
4. **No `expo-updates`, ever.** Over-the-air JavaScript delivery would mean
   the running code is not the audited, store-reviewed binary — which
   contradicts the verifiability the product is built on. See
   [research 0002](docs/research/0002-react-native-framework-choice.md).
5. **No EAS Build.** Builds run locally or in GitHub Actions; the project
   holds its own signing keys.
6. **No model weights in the repo or the app binary.** Weights are fetched at
   runtime to user-visible, user-deletable storage.
7. **CI never downloads model weights.** `jest.setup.js` makes `fetch` throw,
   so an accidental network call fails the run rather than passing silently.

## Native project rules

- **`ios/` and `android/` are generated, not committed.** `app.json` plus Expo
  config plugins are the source of truth; `expo prebuild` regenerates the
  native projects. Hand-edits inside `ios/` or `android/` are lost on the next
  prebuild — native configuration belongs in `app.json` or a config plugin.
- **Adding a native module requires a rebuild**, not just a Metro reload. A
  JS-only reload will appear to work until the native module is called.
- **Bumping the version requires `pnpm prebuild`.** `expo run:ios` and
  `run:android` do _not_ re-run prebuild when the native directory already
  exists, so a version bump in `app.json` never reaches `Info.plist` or
  `build.gradle` on its own. This has already bitten once: with the native
  version stale, an old install and a new one were indistinguishable on a test
  device, and the only trustworthy evidence was `APP_VERSION` on the Settings
  screen, which is compiled into the JS bundle. `src/shared/app-info.test.ts`
  locks the three JS-side copies together, but it cannot see the generated
  files.
- **Expo Go is not a supported workflow.** `llama.rn` is a native module, so a
  development build is the only path.

## Verification

Tests and typecheck are necessary, not sufficient. Two failures in this repo's
history were invisible to a green test suite:

- A stall watchdog reported `code: 'network'` instead of `code: 'stalled'`,
  because `pauseAsync()` makes the in-flight `downloadAsync()` resolve `null`
  and win the race. The unit test mocked the download as never-resolving, so
  the race could not occur there.
- `expo prebuild` exits 0 when its internal `pod install` fails, and the
  missing `.xcworkspace` only surfaces one step later as a confusing
  `xcodebuild` error.
- The Models screen shipped with no way to download a model, making a fresh
  install a dead end. Every test device already had model files left behind by
  an earlier task, so the state a new user actually starts in was never once
  observed. **Verify on a device with no prior app state**, and prefer both
  platforms — this surfaced on the first Android emulator run, after iOS had
  been signed off.

So: **exercise the behaviour, and check the artefact rather than the exit
code.** For anything with a runtime surface, drive it on a simulator or
emulator. The `Native build` workflow does this for app launch; the model
pipeline was verified against a local HTTP origin with Range support.

## Layout

```
src/
├── chat/           # inference engine, chat UI              (epic 1)
├── models/         # download, verify, on-device storage    (epic 0.4)
├── connectors/     # manifest, permissions, routing, host   (epic 2)
├── design-system/  # theme tokens, core components          (epic 7)
├── settings/       # navigation, settings, app shell        (epic 8)
└── shared/         # cross-module utilities
```

One directory per epic, so code structure and planning structure stay aligned.
See [src/README.md](src/README.md). Imports resolve through the `@/` alias.

## Commands

| Command            | Does                                            |
| ------------------ | ----------------------------------------------- |
| `pnpm start`       | Metro bundler for an installed dev build        |
| `pnpm ios`         | Build and launch on an iOS simulator            |
| `pnpm android`     | Build and launch on an Android emulator         |
| `pnpm prebuild`    | Regenerate `ios/` and `android/`                |
| `pnpm test`        | Jest                                            |
| `pnpm typecheck`   | `tsc --noEmit`                                  |
| `pnpm lint`        | ESLint                                          |
| `pnpm check:offline` | Import-graph walk from `src/chat/` (task 1.5) |
| `pnpm format:check`| Prettier check (code only — Markdown excluded)  |

## Tech stack

Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript 6 · pnpm 11 ·
Node 24 · Jest via `jest-expo` · `llama.cpp`/GGUF via `llama.rn`.

Jest rather than the ecosystem's Vitest is a deliberate exception, recorded in
[research 0002](docs/research/0002-react-native-framework-choice.md).

## Relationship to the wider ecosystem

This repo owns its own docs, epics, and research. The ecosystem workbench
(`sovereignfs/sovereignfs`) owns cross-repo concerns and the public docs site;
`sovereign` owns the workspace runtime. Conventions here are adapted from
`sovereign`'s `docs/development-workflow.md` and `CONTRIBUTING.md`, minus the
parts that presuppose a monorepo, an SRS, or its `/sv-*` skills.
