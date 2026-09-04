# AGENTS.md — sovereignfs/sovereign-edge

Canonical, agent-agnostic guidance for this repository. `CLAUDE.md` points
here and carries no content of its own, so there is only one file to keep
true at this level.

This file covers **workspace-wide** conventions and rules — the ones that
apply no matter which app or package you're touching. For anything specific
to one app, read that app's own `AGENTS.md`:

| Read this for...                                      | File                                        |
| ------------------------------------------------------- | -------------------------------------------- |
| Commands, native build mechanics, environment quirks, current implementation state — **mobile** | [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) |
| Same, for **desktop** — epics 12 (Desktop Core Port) and 13 (App Shell) done | [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md) |

## What this is

**Sovereign Edge** — a privacy-first, fully offline on-device AI companion. A
local GGUF model runs on the user's device with **no network code in the chat
path at all**; anything reaching outside the device goes through an
explicitly permissioned **connector**. Fully standalone: no runtime
dependency on `sovereign`, and it works with zero knowledge that `sovereign`
exists.

This is a pnpm workspace of two apps sharing internal packages:

```
sovereign-edge/
├── docs/                 canonical concept, epics, research (this file's own doc set)
├── apps/
│   ├── mobile/            the shipping product — iOS + Android, Expo/React Native
│   └── desktop/           epics 12 (Core Port), 13 (App Shell), 15 (Design
│                            System) done; v0.1.5 published
└── packages/               internal, unpublished — no code here is meant for
    ├── core/                external consumers, except connector-sdk
    ├── design-tokens/
    ├── mobile-ui/
    ├── desktop-ui/
    └── connector-sdk/
```

`packages/*` are a mix — check the one you're touching rather than assuming:

- **Real, with code**: `design-tokens` (the shared token source of truth,
  task 7.3), `desktop-ui` (epic 12.6's component set, grown since), and
  `connector-sdk` — the one deliberate exception to "unpublished", versioned
  and packaged for third-party connector authors (task 5.1), though not
  actually pushed to npm yet.
- **Still empty scaffolds**: `core` and `mobile-ui` — see each one's own
  `README.md` for what it's waiting for. Nothing has been extracted out of
  `apps/mobile` into them yet; that's a deliberate, separate step from
  standing up the workspace shape itself.

## Source of truth

Read the relevant document before implementing — these are authoritative over
assumptions:

- [CONCEPT.md](CONCEPT.md) — vision, architecture, tiered connector model,
  phasing.
- [ROADMAP.md](ROADMAP.md) — chronological task index and **canonical task
  status**. One row per task.
- [docs/epics/](docs/epics/) — full task detail by stable epic task ID: goal,
  deliverables, review checklist. Split into `mobile/`, `desktop/`, and
  `shared/` subdirectories matching each epic's `scope:` frontmatter — the
  directory a file lives in is the scope, not a separate tag to keep in sync.
  See [docs/epics/README.md](docs/epics/README.md).
- [docs/research/](docs/research/) — decision records: findings, options
  considered, and what was decided, each with `scope:`/`status:`/`summary:`
  frontmatter (platform scope here is mostly permanent — it describes what
  the question concerns, not where code currently lives, unlike epics). Read
  the relevant one before revisiting a settled question.
- [docs/development-workflow.md](docs/development-workflow.md) — task
  lifecycle and how the documents above fit together.
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, branching, commits, PRs, CI.

**Research precedes implementation for open questions.** For an open-ended
architectural or strategic question with no concrete design yet, write a
research doc in `docs/research/` — findings, options, a recommendation —
before building on a guess. Research 0003 exists because a measured benchmark
overturned a design that looked obviously correct on paper.

## State of play

`ROADMAP.md` is canonical for task-level status. At a glance:

- **Mobile** is the original shipping app — Phase 1 (offline chat + Search
  connector) is functionally complete with one item still open (store release
  setup, 0.1.20); Phase 2's Tier 3 connectors (Calendar, Device) are done and
  the Sovereign Tasks connector (4.1/4.2) is next; Phase 3's connector SDK,
  registry, and in-app Connector Store are done, with the Tier 2 sandboxed
  runtime (5.6) still open. Full detail:
  [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md).
- **Desktop**: epic 9 (Desktop Shell — `docs/epics/desktop/shell.md`) is
  resolved, Tauri v2, see
  [research 0010](docs/research/0010-desktop-shell-technology.md). Epic 12
  (Desktop Core Port, tasks 12.1–12.7 plus 12.7a, 12.8–12.10) is done — real
  on-device inference, connector framework (Tier 1 + Tier 3), writing-assist
  modes, and a chat UI exercising all of it. Epic 13 (Desktop App Shell —
  `docs/epics/desktop/app-shell.md`) is also done: real navigation, a model
  manager screen, a connectors/permissions screen, and general settings,
  extracted from what task 12.7's chat screen used to do inline. Epic 15
  (Desktop Design System — `docs/epics/desktop/design-system.md`) is done as
  well: the warm cream/clay palette, icon system, and per-screen passes
  mirroring mobile's epic 7. Epic 14
  (Distribution & Signing) is in progress — real installer artifacts and an
  update mechanism are done (`v0.1.5` published), code signing (14.2) is
  still open pending an Apple Developer ID. Neither 12/13/15 nor 14 is scheduled
  into a numbered `ROADMAP.md` phase; see `ROADMAP.md`'s own "Desktop"
  section for the authoritative task-by-task status.

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
  - `chore/<slug>` — tooling, scaffolding, dependencies, maintenance
- **Epic task IDs (`<epic>.<seq>`, e.g. `0.4`, `2.1`) are permanent** and may
  be cited in doc cross-references and dependency lists (`ROADMAP.md`'s Epic
  task column, review checklists, other epics' Dependencies). **Roadmap slot
  versions (e.g. `0.1.4`) are volatile** — they shift when work is
  reprioritised. Look the live slot up in `ROADMAP.md` rather than
  hard-coding it. **Neither belongs in a commit message, PR title, PR
  description, or branch name** — describe the work by what it changes,
  matching `sovereign`'s own convention. See
  [CONTRIBUTING.md](CONTRIBUTING.md#branching-and-commits).
- **Verify before claiming done.** Run the task's review-checklist commands
  and show the output. "Tests pass" is not the same claim as "the feature
  works" — exercise the behaviour and check the artefact, not the exit code.
  Each app's own `AGENTS.md` records the specific historical bugs that
  motivate this.
- **When a task completes, mark it ✅ in both `ROADMAP.md` and the matching
  `docs/epics/<file>.md` heading, in the same PR.** Those two places are the
  only status record; do not accumulate completion history in this file.
- **Update every other doc that restates that status, in the same PR.**
  `README.md`'s "Current status" table and this file's "State of play"
  section both summarize task status for orientation — they are not generated
  from `ROADMAP.md` and go stale silently if left alone. Before marking a
  task done, `grep` the task's epic name/number (e.g. `grep -rn "epic 13"
  README.md AGENTS.md apps/*/AGENTS.md apps/*/package.json`) and fix every
  hit that describes the old state, including scaffold/placeholder language
  in `package.json` `description` fields. If a summary doc's status can't be
  kept current without becoming a second source of truth, cut the
  duplication instead: point at `ROADMAP.md` rather than repeating specifics
  that will drift.
- **Never merge a PR automatically.** Wait for explicit instruction. Open
  agent-created PRs as drafts (`gh pr create --draft`).
- **Bump the version when a task completes**, following `sovereign`'s
  per-package convention: root `package.json` (and `ROADMAP.md`'s `Version:`
  header) tracks the roadmap slot just finished; each app under `apps/*`
  carries its own release version, bumped independently in that app's own
  `package.json` when the app itself ships something. Today the two move in
  lockstep because every shipped task is still a mobile task — see
  [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) for its app-specific
  four-file agreement and required `pnpm prebuild` step. Release tags follow
  `sovereign`'s `<slug>-vX.Y.Z` pattern (`mobile-vX.Y.Z`, eventually
  `desktop-vX.Y.Z`).
- **Direct commits to `main` happen only on explicit, per-change
  instruction.** Branch-and-PR is the default; permission for one task does
  not carry to the next. Everything else — checks, version bump, status
  marks — is unchanged either way.
- **Docs are part of the change.** A change to the connector manifest schema,
  the model descriptor shape, or a documented command means updating the
  matching doc in the same PR.

## Hard architectural rules

Violating any of these breaks a promise the product makes to its users, not
just a style preference. They apply to **any** app or package that implements
chat, model, or connector logic — today that's only `apps/mobile`, but the
rule travels with the code if it's ever extracted into `packages/core` or
implemented again in `apps/desktop`.

1. **Chat/model code must not import anything that opens a socket.** Per
   [research 0001](docs/research/0001-concept-and-connector-architecture.md#decisions),
   "no network code path exists there at all" — this is the product's central
   claim, enforced rather than merely intended. Today's concrete location is
   `apps/mobile/src/chat/`; see that app's own `AGENTS.md` for exactly how
   it's enforced (ESLint rule + a CI import-graph walk) and what those
   mechanisms do and don't cover.
2. **All outbound network access goes through a connector layer**, behind an
   explicit, per-connector, separately revocable permission grant. Granting
   one connector network access never grants another.
3. **Model acquisition is the one deliberate exception.** *Acquiring* a model
   is a visible, user-initiated network action; *using* one never touches the
   network. Today this is `apps/mobile/src/models/`, kept as a sibling to
   `chat/` rather than inside it for exactly this reason.
4. **No model weights in the repo or any app's binary.** Weights are fetched
   at runtime to user-visible, user-deletable storage.
5. **CI never downloads model weights.** A test suite reaching the network by
   accident must fail loudly, not silently pass.

Mechanism-specific rules that follow from these (no OTA JS updates, no cloud
build service, exactly how the offline boundary is checked) are documented in
each app's own `AGENTS.md`, since the mechanism is necessarily tied to that
app's tech stack.

## Relationship to the wider ecosystem

This repo owns its own docs, epics, and research. The ecosystem workbench
(`sovereignfs/sovereignfs`) owns cross-repo concerns and the public docs site;
`sovereign` owns the workspace runtime; `sovereign-desktop` and
`sovereign-mobile` are unrelated thin shells around a self-hosted `sovereign`
instance — not this repo's `apps/desktop` or a mobile competitor to it.
Conventions here are adapted from `sovereign`'s
`docs/development-workflow.md` and `CONTRIBUTING.md`, minus the parts that
presuppose an SRS or its `/sv-*` skills.
