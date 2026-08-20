# Desktop network audit

**Version:** 0.1.5 · **Last updated:** 2026-08-20

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
`offlineTripwire.ts` does, so the interception point here is reqwest's
connector instead: `guarded_client_builder()` wraps it with a
`tower::Layer` (`NetGuardLayer`) that refuses to open a connection unless
the calling task is inside an `allow_network(...)` scope — the two real
egress points in this app (`connectors::runtime::execute::client()`'s
dispatch call, and `models::download`'s `run_download`) are the only
places that call it. Armed only when `cfg!(debug_assertions)`, for the
identical reason mobile's own tripwire stays dev-only: failing closed in
a shipped Release build would turn a boundary violation into a crash in
your hands, on a path never exercised in testing.

An earlier version of this mechanism intercepted DNS resolution instead
(a custom `reqwest::dns::Resolve`), which had a real blind spot: a
request to a literal IP address skips resolution entirely, so the
resolver-based guard never saw it. `NetGuardLayer` wraps the connector
*service*, the step every request reaches on its way to a real socket
regardless of whether its host needed a lookup first — closing that gap
rather than working around it. See *Every mechanism has been watched
failing* below for the reproduced before/after.

**Misses, stated plainly, not glossed over:**

- **It only protects opted-in clients.** Unlike a monkey-patched global,
  which catches every caller whether or not it knows the guard exists,
  this only protects `reqwest::Client`s built via
  `guarded_client_builder()`. Mechanism 3 narrows this gap but does not
  close it (a lint can be silenced) — see that mechanism's own note on
  what else it now covers beyond `reqwest::Client` construction.
- **It does not ship in Release builds**, by the same deliberate choice
  mobile made.

## Every mechanism has been watched failing

| Threat                                          | Probe                                                              | Result                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Stray `reqwest::Client::new()` anywhere in the crate | Added a throwaway function calling it, ran `cargo clippy --all-targets -- -D warnings` | Clippy error naming the disallowed method and the call site |
| Unguarded request to a real hostname              | `guarded_client_builder()` client, `.send()` outside `allow_network(...)` | Request failed; error chain contains the tripwire's own message (`net_guard::tests::a_request_outside_allow_network_is_blocked_with_the_tripwire_s_own_error`) |
| Guard re-arming after a legitimate call            | A request inside `allow_network`, then another on the same client outside it | Second request blocked again — not a one-way latch (`net_guard::tests::the_guard_re_arms_once_an_allow_network_scope_ends`) |
| **IP-literal bypass** (with the old resolver-based guard) | A request to a `127.0.0.1` literal, no `allow_network` wrapping needed | **Passed** — reproduced against the old `GuardedResolver` mechanism before it was replaced, confirming the blind spot was real, not hypothetical |
| **IP-literal bypass** (with `NetGuardLayer`, current) | Same probe, against the connector-layer guard | **Blocked** — error chain contains the tripwire's own message (`net_guard::tests::an_ip_literal_request_outside_allow_network_is_blocked_too`); the paired `..._inside_allow_network_reaches_the_real_server` test confirms a legitimately-scoped IP-literal request still succeeds |

The IP-literal rows are the ones that matter most: they are the case the
first version of this mechanism provably could not see, and the reason it
was replaced rather than patched around.

## Known gaps

1. **The tripwire only protects code that opts into
   `guarded_client_builder()`** — there is no ambient interception the
   way mobile's global monkey-patch provides. Mechanism 3 (the clippy
   lint) narrows this — it now also bans other raw socket-opening
   constructors (`TcpStream::connect`, `TcpSocket::connect`,
   `UdpSocket::bind`, in addition to `reqwest::Client::new`/`::builder`),
   not just this one — but does not close it: a lint can always be
   silenced at the call site.
2. **Release builds carry no runtime guard**, by the same deliberate
   choice mobile made, for the same reason.
3. **Dependencies are audited, with limits stated.** `llama-cpp-2`'s
   vendored `llama.cpp` static library has been checked for
   network-capable undefined symbols, mirroring `docs/network-audit.md`'s
   own `llama.rn` check — see *Dependencies* below for the command and
   result. No equivalent pass has been done against any other native
   dependency in this crate, and this only covers what a symbol-table scan
   can see (dynamic symbol resolution would evade it, same limit mobile's
   own audit names).
4. **This is a source/test audit, not a traffic capture.** The strongest
   check available to you is independent of everything above: put the
   machine on an isolated network and use the app. Chat works. That is
   the claim.

## Dependencies

Audited: exactly what the chat/inference path reaches natively —
`llama-cpp-2`'s vendored `llama.cpp`, the only dependency in that path with
prebuilt/compiled native code. Mirrors `docs/network-audit.md`'s own
`llama.rn` check, same method — and it turned up something that check
didn't have an equivalent of, stated here rather than smoothed over.

### `llama-cpp-2` / vendored `llama.cpp`

The libraries this crate actually links — checked against `cargo`'s own
build-script output, not assumed from the source tree:

```bash
cd apps/desktop/src-tauri
cargo build --lib
grep '^cargo:rustc-link-lib=static=' \
  target/debug/build/llama-cpp-sys-2-*/output | sort -u
# -> ggml, ggml-base, ggml-cpu, ggml-metal, llama, llama-common,
#    llama-common-base, llama_cpp_sys_2_common_wrapper

for lib in ggml ggml-base ggml-cpu ggml-metal llama llama-common llama-common-base; do
  find target/debug/build/llama-cpp-sys-2-*/out -name "lib${lib}.a"
done | xargs -I{} nm -u {} 2>/dev/null \
  | grep -iE 'socket|connect|getaddrinfo|curl_|NSURLSession'
```

No output: **zero undefined network symbols** in any library this crate
actually links. `llama-cpp-2` does not enable `LLAMA_CURL`, upstream
`llama.cpp`'s optional model downloader — the same feature mobile's own
audit confirms is absent from `llama.rn`'s prebuilt binaries.

**What the source-tree scan alone would have missed:** the same build also
produces `vendor/cpp-httplib/libcpp-httplib.a` — a real HTTP client/server
library, and unlike everything above, `nm -u` on it is *not* empty:

```bash
nm -u target/debug/build/llama-cpp-sys-2-*/out/build/vendor/cpp-httplib/libcpp-httplib.a \
  | grep -iE 'socket|connect|getaddrinfo|SSL_connect|BIO_new_socket'
# -> _BIO_new_socket, _SSL_connect, _connect, _getaddrinfo, _recv, _send, _socket
```

`llama.cpp`'s CMake project vendors `cpp-httplib` for its own `llama-server`
example tool, which this crate never asked for — and, checked three ways,
none of its object code reaches the shipped app:

1. **Not in the link line.** The `cargo:rustc-link-lib=static=` list above,
   captured straight from the build script's own output, never names
   `cpp-httplib` or `cpp_httplib`.
2. **Not in this crate's own combined archive:**
   `ar t target/debug/libsovereign_edge_desktop_lib.a | grep -i httplib`
   returns nothing.
3. **Not in the compiled app binary:**
   `nm target/debug/sovereign-edge-desktop | grep -iE 'httplib|BIO_new_socket|SSL_connect'`
   returns nothing, while the same command with `llama_model_load` in place
   of those terms finds real matches — proving the scan itself isn't
   silently failing to see symbols that are actually there.

**Limits of this evidence:** covers the arm64 (macOS) debug build via
`nm`/`ar`. A `dlsym`-based lookup would evade it, same as mobile's own
audit names. And this is a point-in-time result, not a standing guarantee:
a future `llama-cpp-sys-2` bump could change what `llama-common` links
against upstream and start pulling `cpp-httplib` in for real — re-run this
whenever that dependency updates, the same discipline
`docs/network-audit.md` asks for `expo-secure-store` on mobile.

## Reproducing everything

```bash
cd apps/desktop/src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings   # mechanisms 2 and 3 (ACL wiring, disallowed-methods lint)
cargo test --lib net_guard                  # mechanism 4, proven against a real local server, both hostname and IP-literal targets
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
