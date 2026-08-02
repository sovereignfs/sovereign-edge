# Sovereign Edge — Development Workflow

How tasks are planned, started, implemented, and closed out. Designed for
agentic execution with human oversight.

Adapted from `sovereign`'s `docs/development-workflow.md`. The shape is the
same so that moving between ecosystem repos does not mean relearning it; the
parts that presuppose a monorepo, an SRS, or `sovereign`'s `/sv-*` skills are
deliberately not carried over — see [Not adopted](#not-adopted-yet).

---

## Three-layer information architecture

```
AGENTS.md / CLAUDE.md      ← conventions and hard rules; no task pointer
    │
    └─▶ ROADMAP.md         ← chronological index; one row per task; canonical status
            │
            └─▶ docs/epics/<epic>.md   ← full task detail: Goal, Deliverables,
                                          Dependencies, Review checklist
```

Each layer has one job:

| File                     | Job                            | Read it for                                       |
| ------------------------ | ------------------------------ | ------------------------------------------------- |
| `AGENTS.md`              | Conventions and hard rules     | How to work here; what must never be violated     |
| `CLAUDE.md`              | Claude Code adapter            | Nothing — it points at `AGENTS.md`                |
| `ROADMAP.md`             | Version-ordered task index     | Which tasks exist, their status, which epic file  |
| `docs/epics/<file>.md`   | Full task spec                 | Goal, deliverables, review checklist              |
| `docs/research/<n>-*.md` | Decision record                | Why a settled question was settled that way       |

There is no "next task" pointer in any of these. **The developer assigns the
next task at session start.** A pointer in a doc goes stale the moment
priorities shift, and two agents reading it would collide.

---

## Epic structure

Work is organised into domain epics, indexed in
[`docs/epics/README.md`](epics/README.md). Each task carries a **stable epic
task ID** (`<epic>.<seq>`).

### Stable IDs vs volatile slots

**Epic task IDs are permanent.** Once `0.4` is assigned it never changes. Use
epic task IDs in commit subjects, PR titles, doc cross-references, and
dependency lists.

**Roadmap slot versions are volatile.** A slot like `0.1.4` reflects current
priority ordering and shifts when work is reprioritised. Look the live slot up
in `ROADMAP.md` rather than copying it into another document, and keep slots
out of branch names and commit subjects — a stale slot reference is worse than
none, because it looks authoritative.

---

## Task lifecycle

### Starting a task

1. The developer names the task (epic task ID or description).
2. Confirm `main` is clean and up to date: `git switch main && git pull`.
3. Look up the epic file via [`docs/epics/README.md`](epics/README.md) and
   read the full task block — goal, deliverables, dependencies, review
   checklist.
4. Read any research doc the task references. If the task turns on an
   unanswered architectural question, **write the research doc first.**
5. Cut the branch: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, or
   `chore/<slug>`.

### During implementation

- **One task at a time.** Do not start a task on an unmerged PR.
- Commit as you go, with messages that explain *why*.
- When something you assumed turns out to be wrong, say so in the same turn
  rather than quietly correcting course — the correction is usually the most
  useful information in the update.

### Completing a task

1. **Verify.** Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
   `pnpm test` — and then actually exercise the change (see below).
2. **Update status.** Mark the task ✅ in `ROADMAP.md` *and* the matching
   `docs/epics/<file>.md` heading, in the same PR.
3. **Bump the version** to the roadmap slot just completed, then run
   `pnpm prebuild` so the native projects pick it up. Four files must agree —
   `package.json`, `app.json`, `src/shared/app-info.ts`, and `ROADMAP.md`'s
   header. See [CONTRIBUTING.md](../CONTRIBUTING.md#pull-requests) for why the
   prebuild step is not optional.
4. **Record decisions.** If the task settled an open question, write or update
   the research doc and add it to `docs/research/README.md`.
5. **Open a draft PR** with `gh pr create --draft`. Mark it ready for review
   only on explicit instruction, and **never merge automatically.** When the
   developer has instead asked for a direct commit to `main`, steps 1–4 are
   unchanged; only this step differs.

---

## Verification

Running the checks is necessary but not sufficient. The review checklist in
each epic describes an observable behaviour, and that is the thing to
demonstrate.

Two failures in this repo passed a fully green suite:

- **A stall watchdog reported the wrong error code.** Calling `pauseAsync()`
  makes the in-flight `downloadAsync()` resolve `null`, which won a
  `Promise.race` and surfaced as `code: 'network'` instead of `'stalled'` —
  hiding both the true cause and the fact that the transfer was resumable. The
  unit test mocked the download as never-resolving, so the race could not
  occur there.
- **`expo prebuild` exits 0 when its internal `pod install` fails.** The
  missing `.xcworkspace` only surfaces later as a confusing `xcodebuild`
  error.

The lesson both times: **check the artefact, not the exit code**, and drive
the real path. App launch is verified by the `Native build` workflow on a
simulator and emulator; the model pipeline was verified against a local HTTP
origin supporting Range requests, throttling, and a deliberate stall.

---

## Status tracking

Status lives in exactly two places:

| Location                     | Tracks                                       |
| ---------------------------- | -------------------------------------------- |
| `ROADMAP.md` row Status cell | ✅ / ⏳ / 📋 per task — the canonical record |
| Open PRs                     | Which tasks are currently in flight          |

Epic file headings (`#### ✅ X.Y — …`) are updated when a task completes.
Close a task by marking **both** the roadmap row and the epic heading in the
same PR.

Do not accumulate completion history in `AGENTS.md` or `CLAUDE.md`. Git log
already records what happened, and a hand-maintained changelog inside a
conventions file drifts — `sovereign/CLAUDE.md` is the cautionary example.

---

## Research docs

A research doc captures an open-ended question that has no committed design
yet: findings, options considered, and a recommendation. Lighter than a design
doc, and kept after the decision lands — it is the working record of *why*.

- Write one **before** building on an unverified assumption.
- "Rejected" and "not now" are valid, useful outcomes.
- Add a row to [`docs/research/README.md`](research/README.md) when you add a
  doc.
- When a later measurement overturns a recorded decision, **update the doc**
  rather than leaving a contradiction between the docs and the code.

This repo has no RFC stage. If one is ever added, the connector manifest
schema is the first thing that should be formalised that way.

---

## Not adopted (yet)

`sovereign`'s workflow includes machinery this repo does not need at its
current size. Recorded here so the divergence is deliberate rather than an
oversight:

| Not adopted                   | Why                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `CURRENT_TASK.md`             | A transient task-scratch file written and deleted by `/sv-*` skills that do not exist here            |
| `/sv-task-start` etc.         | `sovereign`-specific skills bound to its monorepo layout                                              |
| Workstreams and legs          | A batching unit for multi-task features; this roadmap is still one task at a time                     |
| SRS references                | There is no SRS. Research docs and epic files carry the requirement detail                            |
| Per-package version bumps     | Single app, single `package.json`. Version tracks the roadmap slot of the last completed task         |
| `docs-parity` test            | Enforces doc coverage of a manifest/SDK surface that does not exist yet — revisit at epic 5 (SDK)     |

Revisit these when the repo outgrows the simpler model, not before.

---

## Quick reference

| I need to know…                      | Read…                                                    |
| ------------------------------------ | -------------------------------------------------------- |
| What task is next                    | Ask the developer; `ROADMAP.md` lists what is pending    |
| Full spec for a task by epic ID      | `docs/epics/<file>.md` — grep for `^#### .*<id>`         |
| All tasks in a domain                | `docs/epics/<file>.md`                                   |
| Which epic a roadmap task belongs to | `ROADMAP.md` → Epic task column                          |
| Epic file for a given epic ID        | `docs/epics/README.md`                                   |
| Why a decision was made              | `docs/research/` — index at `docs/research/README.md`    |
| Project conventions and hard rules   | `AGENTS.md`                                              |
| Setup, branching, commits, PRs, CI   | `CONTRIBUTING.md`                                        |
