//! Task 12.9's own module: a debug-only runtime egress guard, mirroring
//! mobile's `src/chat/session/offlineTripwire.ts` design decision — a
//! runtime check that fails loudly when the app tries to open a socket
//! outside a sanctioned call site, active only in debug builds.
//!
//! Rust has no ambient global like `fetch` to monkey-patch, so the
//! equivalent interception point here is DNS resolution: every
//! `reqwest::Client` in this app should be built via
//! [`guarded_client_builder`], and resolution fails unless the calling
//! task is inside an [`allow_network`] scope — the direct analogue of
//! mobile's `allowNetworkForConnector`.
//!
//! It is armed only when `cfg!(debug_assertions)`. `docs/network-audit.md`
//! gives the reasoning for mobile's own dev-only tripwire, which applies
//! here unchanged: "failing closed in production would turn a boundary
//! violation into a crash in the user's hands, on a code path never
//! exercised in testing... crashing the app punishes you for it."
//!
//! **Two honest gaps mobile's mechanism doesn't share, not silently
//! accepted — see `docs/desktop-network-audit.md`:**
//! 1. A request to a literal IP address skips DNS resolution entirely and
//!    is not caught by this guard.
//! 2. Unlike a monkey-patched global, this only protects `reqwest::Client`s
//!    built via [`guarded_client_builder`] — a stray `reqwest::Client::new()`
//!    elsewhere is invisible to it. Closed *partially* (not fully — a lint
//!    can always be silenced at the call site) by this crate's
//!    `clippy::disallowed_methods` configuration.

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use std::future::Future;
use std::sync::Arc;
use tokio::task_local;

task_local! {
    static NETWORK_ALLOWED: ();
}

/// Runs `fut` with network egress allowed for the guarded resolver — the
/// sanctioned bypass. Every real network call this app makes (Tier 1
/// connector dispatch, model downloads) must be wrapped in this.
pub async fn allow_network<F: Future>(fut: F) -> F::Output {
    NETWORK_ALLOWED.scope((), fut).await
}

fn network_currently_allowed() -> bool {
    NETWORK_ALLOWED.try_with(|_| ()).is_ok()
}

/// A `reqwest::ClientBuilder` pre-armed with the guard in debug builds; an
/// unmodified builder in release (see module doc for why release stays
/// unguarded). Every `reqwest::Client` this app constructs should start
/// from this, not `reqwest::Client::builder()`/`::new()` directly —
/// enforced by this crate's `clippy::disallowed_methods` lint outside
/// this module.
#[allow(clippy::disallowed_methods)]
pub fn guarded_client_builder() -> reqwest::ClientBuilder {
    let builder = reqwest::Client::builder();
    if cfg!(debug_assertions) {
        builder.dns_resolver(Arc::new(GuardedResolver))
    } else {
        builder
    }
}

struct GuardedResolver;

impl Resolve for GuardedResolver {
    fn resolve(&self, name: Name) -> Resolving {
        if network_currently_allowed() {
            let host = name.as_str().to_string();
            Box::pin(async move {
                // reqwest's own default resolver (`GaiResolver`) is
                // `pub(crate)` and not reachable from outside its crate —
                // `tokio::net::lookup_host` performs the same underlying
                // OS DNS resolution directly. Port 0 is the documented
                // placeholder `Resolve::resolve` expects; reqwest replaces
                // it with the request's real port.
                let addrs: Vec<_> = tokio::net::lookup_host(format!("{host}:0"))
                    .await
                    .map_err(Box::<dyn std::error::Error + Send + Sync>::from)?
                    .collect();
                Ok(Box::new(addrs.into_iter()) as Addrs)
            })
        } else {
            let host = name.as_str().to_string();
            Box::pin(async move {
                Err(format!(
                    "Offline tripwire: attempted to resolve \"{host}\" outside an \
                     allow_network(...) scope. Every network call in this app must go \
                     through connectors::runtime::execute or models::download — see \
                     net_guard.rs."
                )
                .into())
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    /// Same hand-rolled local-server pattern established elsewhere in this
    /// crate (`tests/connector_dispatch.rs`, `models/download.rs`'s own
    /// cancellation tests) — no mocking library in this repo.
    fn serve_one_response(listener: TcpListener, body: &'static str) {
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test server: accept failed");
            let mut buf = [0u8; 4096];
            let mut received = Vec::new();
            loop {
                let n = stream.read(&mut buf).expect("test server: read failed");
                received.extend_from_slice(&buf[..n]);
                if received.windows(4).any(|w| w == b"\r\n\r\n") || n == 0 {
                    break;
                }
            }
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body,
            );
            let _ = stream.write_all(response.as_bytes());
        });
    }

    /// `http://localhost:<port>`, deliberately **not** `127.0.0.1` — an IP
    /// literal skips DNS resolution entirely and would not exercise the
    /// guard at all (that's the documented blind spot, not a testing
    /// shortcut). `localhost` forces a real call into `GuardedResolver`.
    fn bind_localhost_server(body: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("could not bind test server");
        let port = listener.local_addr().expect("no local addr").port();
        serve_one_response(listener, body);
        format!("http://localhost:{port}")
    }

    /// `reqwest::Error`'s own `Display` is a generic wrapper ("error
    /// sending request for url ..."); the tripwire's own message lives
    /// further down the `source()` chain, where `GuardedResolver`'s error
    /// was boxed in.
    fn full_error_chain(error: &(dyn std::error::Error + 'static)) -> String {
        let mut chain = error.to_string();
        let mut cause = error.source();
        while let Some(source) = cause {
            chain.push_str(" -> ");
            chain.push_str(&source.to_string());
            cause = source.source();
        }
        chain
    }

    #[tokio::test]
    async fn a_request_outside_allow_network_is_blocked_with_the_tripwire_s_own_error() {
        let url = bind_localhost_server("should never be read");
        let client = guarded_client_builder().build().expect("client builds");

        let result = client.get(&url).send().await;

        let error = result.expect_err("a request outside allow_network must fail");
        let message = full_error_chain(&error);
        assert!(
            message.contains("Offline tripwire"),
            "expected the tripwire's own error text, got: {message}"
        );
    }

    #[tokio::test]
    async fn a_request_inside_allow_network_reaches_the_real_server() {
        let url = bind_localhost_server("hello from a real socket");
        let client = guarded_client_builder().build().expect("client builds");

        let body = allow_network(async {
            let response = client.get(&url).send().await.expect("request must succeed");
            response.text().await.expect("body must read")
        })
        .await;

        assert_eq!(body, "hello from a real socket");
    }

    #[tokio::test]
    async fn the_guard_re_arms_once_an_allow_network_scope_ends() {
        let first_url = bind_localhost_server("first server");
        let client = guarded_client_builder().build().expect("client builds");

        allow_network(async {
            client
                .get(&first_url)
                .send()
                .await
                .expect("request inside the scope must succeed");
        })
        .await;

        let second_url = bind_localhost_server("second server");
        let result = client.get(&second_url).send().await;

        let error = result.expect_err("a request after the scope ends must be blocked again");
        assert!(
            full_error_chain(&error).contains("Offline tripwire"),
            "the guard must not be a one-way latch"
        );
    }
}
