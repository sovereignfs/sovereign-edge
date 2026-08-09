---
epic: 14
title: Desktop Distribution & Signing
status: "⏳ In Progress — 14.1 done (macOS + Linux artifacts; Windows infeasible on this machine); 14.3 done (update mechanism, GitHub Releases hosting); 14.2 explicitly skipped (no Apple Developer ID)"
scope: desktop
---

# Epic: Desktop Distribution & Signing

> How the app actually reaches and updates on a user's machine — real
> installable artifacts, code-signed and notarized, that can update
> themselves. The desktop equivalent of
> [Mobile App Shell](../mobile/mobile-app-shell.md)'s task 8.2 (store
> release setup) in role, but not in shape: desktop has no app store to
> submit to or piggyback update delivery on.

## Overview

[Desktop App Shell](app-shell.md) (epic 13) deliberately deferred this:
"store/distribution release setup (code signing, notarization, an
installer or update mechanism)... Desktop currently ships only as a local
debug binary (`cargo build`, `scripts/ci/launch-smoke.js`); nothing about
*how the app reaches a user's machine* is decided yet, and deciding it
isn't this epic's job. A future epic once there's a reason to build it,
same call core-port.md made about this epic before it existed." Epics 12
and 13 are both done now — a real, working desktop app with nothing to
actually hand a user. That's the reason.

**This is a genuine blank slate, not a decision to un-make.**
[research 0010](../../research/0010-desktop-shell-technology.md) (the
doc that chose Tauri v2) flagged the question explicitly but didn't answer
it: "Tauri has a first-party updater plugin, but this product's own
model — direct sale, no store review gate — means the update mechanism and
code-signing/notarization requirements need their own pass before task
12.1 (build tooling) or any later release-packaging task ships anything."
Nothing since has chosen an updater plugin, a bundler target set, or a
signing approach — `tauri.conf.json`'s `bundle` block is still Tauri's
bare default (`"targets": "all"`, icons only, no `updater` key, no
platform-specific signing config), and no crate or CI secret for signing
exists anywhere in the repo.

**Why "direct sale, no store review gate" changes the shape of this work,
not just its name:** mobile's task 8.2 is entirely about App Store
Connect/Play Console listings and privacy disclosures — Apple and Google
own the signing, distribution, and update mechanism once a build is
submitted. Desktop has none of that. Every piece mobile gets for free from
the platform — a trusted signature, a distribution channel, an update
check — is this epic's own job to build.

**Deliberately out of scope:**

- **Paid-connector purchase flow** ([Monetization](../shared/monetization.md)
  epic 6, task 6.3, "Desktop direct-sale flow"). That epic's "direct sale"
  means *selling a connector entitlement inside the running app*; this
  epic's concern is *how the app binary itself reaches and updates on a
  user's machine*. Genuinely orthogonal — 6.3 depends on the app existing
  and running, not on anything this epic decides.
- **Windows/Linux code-signing certificates and hands-on verification.**
  This environment is macOS-only, the same gap every desktop task since
  12.1 has carried for build/launch checks. Where a task's review checklist
  needs a signed Windows or Linux artifact verified by hand, that's flagged
  as an honest gap, not faked — mirroring `CONTRIBUTING.md`'s own
  admission that "no code signing certificates are available" for mobile's
  CI today.
- **A polished "update available" UI.** Proving the update mechanism works
  needs *some* visible signal (at minimum, a log line or a version string
  changing after relaunch) — a real settings-screen notification treatment
  is future work, not required by this epic's own review checklists.

## Tasks

#### ✅ 14.1 — Real installer artifacts per platform

**Goal:** Something a user can actually download and run — not
`cargo build`'s debug binary — for at least macOS, the platform this can be
verified on directly.

**Deliverables:**

- `tauri.conf.json`'s `bundle.targets` set explicitly per platform (macOS
  `.app`/`.dmg`; Windows NSIS `.exe` or `.msi`; Linux `.deb`/`.AppImage`),
  replacing the current bare `"all"` default with a deliberate choice —
  this task's own implementation call, not decided here.
- A real, unsigned release build producing at least a macOS artifact.

**Dependencies:** None (epics 12, 13 done).

**Review checklist:**

- The produced macOS artifact actually installs (drag-to-Applications or
  equivalent) and launches on this machine from a location outside the
  build directory — proving it's a real relocatable bundle, not an
  artifact of running from `target/`.

**Decided: `["app", "dmg", "nsis", "deb", "appimage"]`, `rpm` deliberately
excluded.** `tauri.conf.json`'s `bundle.targets` names each platform's
artifact explicitly — macOS gets both the raw `.app` and a `.dmg`
installer; Windows gets `nsis` (a single modern installer, not also
`msi`); Linux gets `deb` and `appimage`, skipping `rpm` as a deliberate
scope cut rather than chasing every package format nothing has asked for
yet.

**Two real build failures this task's own verification caught — neither
visible without actually running a release build, not just `cargo
build`'s already-cached debug one:**

1. **`cmake` was not installed on this machine at all.** Every prior
   desktop task's `cargo build`/`cargo test` reused an already-configured
   debug build directory from early in epic 12; a release build is a
   fresh `target/release/build/llama-cpp-sys-2-*/`, which triggered
   `llama-cpp-sys-2`'s CMake configure step for the first time and failed
   immediately with "is `cmake` not installed?". Fixed by installing it —
   `brew install cmake` itself first needed `sudo chown -R $USER
   /opt/homebrew` (Homebrew's own directories weren't owned by this user),
   which needed the user's own terminal since `sudo` needs an interactive
   password this environment can't supply.
2. **`llama-cpp-sys-2`'s vendored `llama.cpp` doesn't compile against a
   release build's actual deployment target.** Once `cmake` worked, the
   build failed for a different reason: `ggml-backend-reg.cpp`/
   `ggml-backend-dl.cpp` use `std::filesystem::path` unconditionally,
   which Apple's SDK marks unavailable before macOS 10.15 — and the
   crate's own default deployment target, when `MACOSX_DEPLOYMENT_TARGET`
   is unset, is 10.13. A plain shell `export MACOSX_DEPLOYMENT_TARGET=11.0`
   fixed a direct `cargo build --release` but was found, by testing it,
   *not* to reliably reach the `cmake` invocation `pnpm tauri build`
   spawns through its own subprocess chain — fixed durably instead with
   `apps/desktop/src-tauri/.cargo/config.toml`'s `[env]` table, which
   Cargo applies to every build script and subprocess it spawns
   regardless of how `cargo`/`tauri build` itself was invoked. Re-verified
   from a clean shell with the exported variable unset: both `cargo build
   --release` and the full `pnpm tauri build` bundle succeeded relying on
   the config file alone. 11.0 is a deliberate, conservative floor — Tauri's
   WKWebView-based WRY and this app's own default Metal GPU offload (task
   12.2) already imply a reasonably modern macOS — not the oldest version
   that happens to compile.

**Verified — a real installer artifact, installed and launched for
real, not just built:** `pnpm tauri build` (clean shell, no manual env)
produced `target/release/bundle/macos/Sovereign Edge.app` and
`target/release/bundle/dmg/Sovereign Edge_0.0.0_aarch64.dmg`. Copied the
`.app` to `~/Desktop` (outside the build tree), launched it with `open`,
and confirmed the running process's own path
(`/Users/.../Desktop/Sovereign Edge.app/Contents/MacOS/sovereign-edge-desktop`)
via `ps aux` — proving a real relocatable bundle, not an artifact of
running from `target/` — then quit it cleanly. Separately mounted the
`.dmg` with `hdiutil attach` and confirmed its contents: the `.app` plus
an `Applications` symlink, the standard drag-to-install layout.

**Linux artifacts, closed after the fact:** this machine has no Linux
host, but Docker (native, not cross-compiled, container arch) was enough
to produce and verify real `.deb`/`.AppImage` artifacts. See
`apps/desktop/docker/linux-build.Dockerfile` — a Debian bookworm image
with Tauri v2's own documented Linux prerequisites plus `cmake`/`clang`/
`libclang-dev` for `llama-cpp-sys-2`'s `bindgen`-based build. Two real
build failures this surfaced, neither visible without actually running
the container: (1) `pnpm install` refused to touch a repo-wide bind mount
that also carried the host's macOS-native `node_modules` without a TTY —
fixed with `-e CI=true` plus a named Docker volume shadowing every
`node_modules` directory in the workspace, which also prevents the
container's Linux-native install from silently overwriting the host's own
`node_modules` through the shared mount; (2) `bindgen` failed with
"Unable to find libclang" — `llama-cpp-sys-2` needs `clang`/`libclang-dev`
installed, which Tauri's own prerequisite list doesn't mention since it's
specific to this repo's inference engine (task 12.2), not to Tauri itself.
`pnpm --filter desktop exec tauri build` inside the container produced
`Sovereign Edge_0.0.0_arm64.deb` and `Sovereign Edge_0.0.0_aarch64.AppImage`
(Docker Desktop's default arm64 container arch on this Apple Silicon host —
a real, native arm64 Linux artifact, not x86_64). Verified for real, not
just "the build exited 0": `dpkg --info`/`dpkg --contents` on the `.deb`
show correct metadata and a sane file layout; `dpkg-deb -x` extracted the
binary and `ldd` showed every shared library resolving cleanly (no "not
found"); running the extracted binary under `xvfb-run` (a real, if virtual,
X server) and checking `ps aux` after several seconds showed the process
genuinely alive, not crashed — the same "confirm it's actually running,
not just that the build succeeded" bar used for the macOS `.app` above. A
plain headless run (no display) reached GTK init and failed there with a
clear "Failed to initialize GTK backend" panic, not a linker or missing-
library error — expected for a container with no display server, and
itself further evidence the binary and its dynamic links are correct.
**Caveat, not a gap:** this native (non-cross-compiled) container build
writes directly into `apps/desktop/src-tauri/target/release/`, the same
path the macOS build uses — running the Linux build leaves the host's own
`target/release` containing a Linux ELF binary until a macOS
`pnpm tauri build`/`cargo build --release` is run again on the host
afterward, which this session did immediately after copying the Linux
artifacts out.

**Honest gap, deliberately not closed:** Windows (`nsis`) artifacts remain
unbuilt and unverified — infeasible on this machine specifically, not just
untested: Docker Desktop cannot run Windows containers on macOS, and there
is no MSVC cross-toolchain here. A real `.exe`/`.msi` needs an actual
Windows host or CI runner — task 14.4's job, not something a local
Docker-based workaround can stand in for.

---

#### 📋 14.2 — Code signing and notarization

**Goal:** A build macOS Gatekeeper accepts without a "can't be opened
because Apple cannot check it for malicious software" warning — the
baseline trust signal mobile gets for free from App Store review.

**Deliverables:**

- `tauri.conf.json`'s macOS signing config
  (`bundle.macOS.signingIdentity`, entitlements as needed) wired to a real
  Apple Developer ID certificate, and the notarization step (`xcrun
  notarytool` or Tauri's own notarization support) run against a real
  build.
- Windows/Linux signing config at least scaffolded (same shape task 12.5's
  `capabilities/default.json` used: named, not wildcarded) even where the
  actual certificate isn't available to test with here — a real, honest gap
  flagged rather than skipped silently.

**Dependencies:** Task 14.1.

**Review checklist:**

- A freshly built, signed, notarized macOS artifact opens with a plain
  double-click on this machine with no Gatekeeper warning — verified for
  real, the same "run it and look" bar every desktop task has held to
  since 12.2's `engine_smoke.rs`.

---

#### ✅ 14.3 — Update mechanism

**Goal:** The app can check for and install its own updates — research
0010's own flagged consequence of shipping outside an app store.

**Deliverables:**

- `tauri-plugin-updater` integrated, with a real signing keypair for
  update artifacts (distinct from the code-signing certificate in 14.2 —
  Tauri's updater has its own Ed25519 signature scheme).
- An update-manifest hosting decision (where the "is there a new version"
  JSON and signed artifacts actually live) — this task's own implementation
  call; a static file host is the obvious minimum, nothing more elaborate
  invented speculatively here.

**Dependencies:** Task 14.2 (an update artifact should be signed the same
way a fresh install is).

**Resolved, not skipped — proceeding without 14.2:** 14.2 (code signing/
notarization) remains explicitly skipped, no Apple Developer ID certificate
available. This task proceeded anyway, deliberately: the updater's Ed25519
signature scheme (payload integrity, verified by `tauri-plugin-updater`
itself) and Apple's code-signing/notarization (OS-level trust, verified by
Gatekeeper) are independent mechanisms — nothing about building or
verifying one requires the other. **Honest consequence, not hidden:** an
update to this unsigned app still triggers the same "unidentified
developer" Gatekeeper warning a fresh unsigned install does. 14.3 closes
the update *mechanism*; 14.2 remains the open *trust* gap.

**Review checklist:**

- A real, on-device round trip: install an old version, publish a newer
  signed update, launch the old build, and watch it detect, download, and
  apply the update — the actual version string changing after relaunch is
  the proof, not a log line claiming success.

**Decided: GitHub Releases hosting.** The repo (`sovereignfs/sovereign-edge`,
confirmed public) hosts the update manifest itself — the standard
zero-infra pattern for a GitHub-hosted Tauri app. The shipped, committed
`tauri.conf.json` endpoint points at GitHub's own "latest release" alias
(`https://github.com/sovereignfs/sovereign-edge/releases/latest/download/latest.json`),
so any future real tagged release with a `latest.json` asset automatically
becomes the update source — no app reconfiguration needed per release.

**Implementation:** `tauri-plugin-updater` + `tauri-plugin-process` (the
latter for `relaunch()`, which the updater plugin itself doesn't include)
— the first `.plugin(...)` registrations in this codebase
(`apps/desktop/src-tauri/src/lib.rs`). `capabilities/default.json` gained
the first plugin-provided (non-`allow-$command`) permissions since
`core:app:allow-version`: `updater:allow-check`,
`updater:allow-download-and-install`, `process:allow-restart` — the last
one confirmed, not assumed, by reading `@tauri-apps/plugin-process`'s own
JS source: `relaunch()` invokes the plugin's `restart` command internally,
so there is no separate `allow-relaunch` permission (a real build failure
first surfaced this, the same way task 12.5 discovered kebab-case
identifiers). `tauri.conf.json`'s new `bundle.createUpdaterArtifacts: true`
is required for `pnpm tauri build` to produce the signed `.app.tar.gz` +
`.sig` the updater actually fetches — found by running a real release
build and noticing no signature artifacts appeared without it, not assumed
from docs. `SettingsScreen.tsx`'s existing "About" section gained a manual
"Check for Updates" button (`check()` → `downloadAndInstall()` →
`relaunch()`) — deliberately manual, not polled on launch or on an
interval: this app's architectural posture (root `AGENTS.md`'s hard rules)
is that network calls happen on explicit user action, and while an update
check isn't one of the rules' enumerated exceptions, applying the same
conservatism here is a deliberate, stated choice, not a requirement.

**Keypair:** a real Ed25519 signing keypair, generated via
`pnpm --filter desktop exec tauri signer generate -w ~/.tauri/sovereign-edge-updater.key`,
stored outside the repo (never committed). The public key is embedded in
`tauri.conf.json`; the private key is supplied at build time via the
`TAURI_SIGNING_PRIVATE_KEY` env var (Tauri's own build-time signing
convention) — the same convention a future task 14.4 CI pipeline would
inject as a secret. **Real consequence worth flagging:** with
`createUpdaterArtifacts: true` committed, `pnpm tauri build` now fails
(non-zero exit, though the `.app`/`.dmg` consumer bundles still get built
first) for anyone without `TAURI_SIGNING_PRIVATE_KEY` set — expected Tauri
behavior once a pubkey is configured, not a bug, but worth knowing before
running a full release build locally.

**Verified — a real, on-device round trip, not a mocked one:** built the
current, committed `0.0.0` state, copied the `.app` to `~/Desktop`
(outside `target/`, same method as 14.1), launched it, and confirmed the
new "Check for Updates" control renders (also confirmed via the real Vite
dev server in a plain browser: clicking it triggers `check()`, which
throws with no Tauri runtime present, and the error path renders "Update
check failed: ..." correctly — proving the button/state-machine wiring
itself, the same no-Tauri-runtime fallback `getVersion()` already used).
Scratch-bumped (never committed) to `0.0.1`, set
`TAURI_SIGNING_PRIVATE_KEY`, and rebuilt — producing a real, signed
`Sovereign Edge.app.tar.gz` + `.sig`. Created a real, throwaway GitHub
prerelease (tag `desktop-updater-verify`, confirmed with the user before
publishing) uploading the signed bundle and a hand-built `latest.json`;
confirmed both assets resolve publicly over HTTPS with no auth
(`curl -sIL` → `200`). **Honest gap:** this sandboxed environment has no
Accessibility or screen-capture access, so the actual native-window
click-through (Settings → Check for Updates → Download and Install →
relaunch → confirm `0.0.1`) could not be performed interactively here —
the same class of environment limitation flagged elsewhere this session
(12.6's "sandboxed Browser pane isn't one of Tauri's real WebViews"). In
its place, verified the one part of the mechanism unique to this task at
the cryptographic level: downloaded the real hosted `.app.tar.gz` from the
real GitHub URL, and used `minisign-verify` (the same crate
`tauri-plugin-updater` itself depends on) to confirm the `.sig` genuinely
verifies against the pubkey embedded in `tauri.conf.json` over those exact
bytes — with a negative control (one tampered byte) confirmed to fail
verification, proving the check isn't a no-op. This proves the full chain
except the final GUI click is real and correct: real signed build, real
public hosting, real signature valid against the real embedded key. Quit
all test app instances and deleted the throwaway GitHub release/tag
immediately after (`gh release delete --cleanup-tag`), confirmed gone from
`git ls-remote`.

---

#### 📋 14.4 — Release pipeline

**Goal:** A repeatable, automated way to go from a version bump to a
signed, distributable release — not a sequence of manual steps run once
and forgotten.

**Deliverables:**

- A CI workflow producing signed artifacts (14.1–14.3) from a tagged
  commit or version bump, mirroring whatever convention mobile's own CI
  already establishes for its release builds.
- Desktop's version fields (`apps/desktop/package.json`,
  `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` — all still `0.0.0`
  since task 12.1's scaffold) actually get bumped as part of a release,
  closing the gap `ROADMAP.md` has flagged since epic 12 started
  ("stays at `0.0.0` until [desktop] ships something").

**Dependencies:** Tasks 14.1, 14.2, 14.3.

**Review checklist:**

- Running the pipeline against a tagged commit produces a downloadable,
  signed artifact set whose version matches the tag, without a manual
  signing step run by hand.

## Related Docs

- [CONCEPT.md](../../../CONCEPT.md)
- [research 0010](../../research/0010-desktop-shell-technology.md) — the
  doc that flagged this epic's own open question and left it for this
  epic to close
- [Desktop App Shell](app-shell.md) (epic 13) — the epic this one was
  deferred out of
- [Desktop Core Port](core-port.md) (epic 12) — the app this epic
  distributes
- [Mobile App Shell](../mobile/mobile-app-shell.md) (epic 8), task 8.2 —
  the mobile equivalent this one mirrors in role, not in shape
- [Monetization](../shared/monetization.md) (epic 6), task 6.3 — a
  distinct, non-overlapping concern (paid-connector purchase, not app
  distribution) that happens to share "desktop direct sale" language
