# Desktop network audit

**Version:** 0.1.5 · **Last updated:** 2026-08-09

[docs/network-audit.md](network-audit.md) documents mobile's "no code path
reachable from `src/chat/` can open a socket" claim and says desktop needs
"this same audit written against its own mechanisms" once it has its own
chat/model path — it has, since task 12.7. This is that document. It is
narrower on purpose: desktop's mechanisms are real, but they do not match
mobile's coverage, and this page says exactly where they fall short rather
than implying parity that doesn't exist.

## What is actually claimed

The same claim mobile makes, narrowed the same way: desktop is not
"offline". It downloads model weights over HTTPS, and grants a Tier 1
connector (Search, today) the ability to make network calls on your
behalf once you configure and grant it. The claim is: nothing else reaches
the network.

| Module                    | Network                 | Why                                                                          |
| -------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `engine/`, chat generation | **Never**                | Prompts, replies, and inference run entirely in-process against local weights. |
| `models/`                  | **User-initiated only**  | Downloading a model is a request you started; loading and running one never touches the network. |
| `connectors/`              | **Per-grant only**       | Tier 1 (Search) reaches the network only once configured and granted. Tier 3 (`device_info`) calls local OS APIs, not the network. |

## How it is enforced

Four mechanisms. Only one of them is close to mobile's own — the honest
gap this document exists to state, not hide.

### 1. Tier 1 origin allowlist

Every Tier 1 request is built from a manifest's own declared
`NetworkPermissions.origins` (`connectors/manifest/validate.rs`,
`connectors/runtime/execute.rs`) — there is no code path that builds a
Tier 1 request against an arbitrary origin. Proven by unit tests
(`validate.rs`'s `rejects_a_request_origin_outside_the_allowlist` and
`execute.rs`'s own request-construction tests), plus a real local-server
round trip (`tests/connector_dispatch.rs`).

**Misses:** this is structural — it constrains what a *correctly written*
connector-runtime call can reach, but proves nothing about code outside
`connectors/runtime/` that might make its own request some other way.

### 2. Tauri capabilities ACL (default-deny)

Every command this app exposes needs its own named `allow-*` permission
in `capabilities/default.json`; nothing is reachable from the frontend by
default (task 12.5's own finding: Tauri v2's ACL only gates
*plugin*-provided commands unless `build.rs`'s `AppManifest::commands`
wires this app's own commands into it too).

**Misses:** this gates which commands the frontend can invoke, not what a
given command does once invoked — it is not a network boundary by itself,
only the front door to one.

### 3. `clippy::disallowed_methods` lint

`clippy.toml` bans `reqwest::Client::new`/`reqwest::Client::builder`
outside `net_guard.rs`; `lib.rs` turns the lint on
(`#![warn(clippy::disallowed_methods)]`). Every `reqwest::Client` in this
app must be built via `net_guard::guarded_client_builder()` instead, or
`cargo clippy --all-targets -- -D warnings` (already run every task)
fails the build.

**Misses:** a lint can always be silenced at the call site with
`#[allow(clippy::disallowed_methods)]` — this raises the bar for a
bypass to require a deliberate, visible annotation, not eliminate the
possibility of one. It also only covers this crate; `tests/` binaries are
separate crates and are covered too (confirmed — see *Every mechanism has
been watched failing* below), but a hypothetical future crate in this
workspace would need its own `clippy.toml`.

### 4. Runtime tripwire (debug builds only)

`net_guard.rs` — the actual runtime check this document exists to add.
Rust has no ambient global like `fetch` to intercept the way mobile's
`offlineTripwire.ts` does, so the interception point here is DNS
resolution instead: `guarded_client_builder()` attaches a custom resolver
that refuses to resolve any hostname unless the calling task is inside an
`allow_network(...)` scope — the two real egress points in this app
(`connectors::runtime::execute::client()`'s dispatch call, and
`models::download`'s `run_download`) are the only places that call it.
Armed only when `cfg!(debug_assertions)`, for the identical reason
mobile's own tripwire stays dev-only: failing closed in a shipped Release
build would turn a boundary violation into a crash in your hands, on a
path never exercised in testing.

**Misses, stated plainly, not glossed over:**

- **IP literals skip it entirely.** A request to `http://127.0.0.1:PORT`
  never calls the custom resolver — DNS resolution simply doesn't happen
  for a literal address. `connectors/tests/connector_dispatch.rs` and
  `models/download.rs`'s own cancellation tests both use `127.0.0.1` and
  pass regardless of whether they're inside `allow_network(...)` — that
  is this blind spot being real, not a testing shortcut. Anything that
  wanted to evade the guard could dial an IP directly.
- **It only protects opted-in clients.** Unlike a monkey-patched global,
  which catches every caller whether or not it knows the guard exists,
  this only protects `reqwest::Client`s built via
  `guarded_client_builder()`. Mechanism 3 narrows this gap but does not
  close it (a lint can be silenced).
- **It does not ship in Release builds**, by the same deliberate choice
  mobile made.

## Every mechanism has been watched failing

| Threat                                          | Probe                                                              | Result                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Stray `reqwest::Client::new()` anywhere in the crate | Added a throwaway function calling it, ran `cargo clippy --all-targets -- -D warnings` | Clippy error naming the disallowed method and the call site |
| Unguarded request to a real hostname              | `guarded_client_builder()` client, `.send()` outside `allow_network(...)` | Request failed; error chain contains the tripwire's own message (`net_guard::tests::a_request_outside_allow_network_is_blocked_with_the_tripwire_s_own_error`) |
| Guard re-arming after a legitimate call            | A request inside `allow_network`, then another on the same client outside it | Second request blocked again — not a one-way latch (`net_guard::tests::the_guard_re_arms_once_an_allow_network_scope_ends`) |
| **IP-literal bypass**                              | A request to a `127.0.0.1` literal, no `allow_network` wrapping needed | **Passes** — this is mechanism 4's own documented blind spot, reproduced, not hypothetical |

The last row is the one that matters most: it is the case this mechanism
provably cannot see, confirmed by watching it not fire.

## Known gaps

1. **IP-literal requests bypass the runtime tripwire entirely** (mechanism
   4's own limitation, restated here because it's the most important one).
2. **The tripwire only protects code that opts into
   `guarded_client_builder()`** — there is no ambient interception the
   way mobile's global monkey-patch provides. Mechanism 3 (the clippy
   lint) is the closest thing to closing this, and it can be silenced.
3. **Release builds carry no runtime guard**, by the same deliberate
   choice mobile made, for the same reason.
4. **Dependencies are not audited here.** Unlike
   `docs/network-audit.md`'s own `llama.rn` binary-symbol check, no
   equivalent pass has been done against `llama-cpp-2`'s vendored
   `llama.cpp` or any other native dependency in this crate. Tracked as
   follow-up work, not claimed as done.
5. **This is a source/test audit, not a traffic capture.** The strongest
   check available to you is independent of everything above: put the
   machine on an isolated network and use the app. Chat works. That is
   the claim.

## Reproducing everything

```bash
cd apps/desktop/src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings   # mechanisms 2 and 3 (ACL wiring, disallowed-methods lint)
cargo test --lib net_guard                  # mechanism 4, proven against a real local server
cargo test --test connector_dispatch        # mechanism 1, real request/response round trip
```

No step needs network access beyond the crate registry, and none
downloads model weights.

## Related

- [network-audit.md](network-audit.md) — mobile's own audit, the template
  this document follows and the reason it exists
- [epics/desktop/core-port.md](epics/desktop/core-port.md), task 12.9 —
  where `net_guard.rs` was added and why
- [AGENTS.md](../AGENTS.md) — the shared hard architectural rules this
  enforces; [apps/desktop/AGENTS.md](../apps/desktop/AGENTS.md) for this
  app's concrete enforcement mechanisms
