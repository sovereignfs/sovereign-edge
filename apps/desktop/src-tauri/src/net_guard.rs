//! Task 12.9's own module: a debug-only runtime egress guard, mirroring
//! mobile's `src/chat/session/offlineTripwire.ts` design decision — a
//! runtime check that fails loudly when the app tries to open a socket
//! outside a sanctioned call site, active only in debug builds.
//!
//! Rust has no ambient global like `fetch` to monkey-patch, so the
//! interception point here is reqwest's connector instead: every
//! `reqwest::Client` in this app should be built via
//! [`guarded_client_builder`], which wraps the connector responsible for
//! actually establishing every outbound connection — hostname-resolved or
//! IP-literal alike — with [`NetGuardLayer`]. A connection attempt is
//! refused unless the calling task is inside an [`allow_network`] scope —
//! the direct analogue of mobile's `allowNetworkForConnector`.
//!
//! It is armed only when `cfg!(debug_assertions)`. `docs/network-audit.md`
//! gives the reasoning for mobile's own dev-only tripwire, which applies
//! here unchanged: "failing closed in production would turn a boundary
//! violation into a crash in the user's hands, on a code path never
//! exercised in testing... crashing the app punishes you for it."
//!
//! **An earlier version of this module intercepted DNS resolution
//! instead** (a custom `reqwest::dns::Resolve`). That only sees requests
//! whose host needs a lookup, so a literal IP address (`http://127.0.0.1:
//! PORT`) skipped resolution entirely and sailed through unguarded —
//! `docs/desktop-network-audit.md` documented that as the guard's most
//! important blind spot. [`NetGuardLayer`] replaces it: reqwest's
//! `ClientBuilder::connector_layer` wraps the connector *service* itself,
//! which every request reaches on its way to a real socket whether or not
//! its host needed resolving first, so one mechanism now covers both cases
//! instead of two.
//!
//! **One honest gap this still doesn't share with mobile, not silently
//! accepted — see `docs/desktop-network-audit.md`:** this only protects
//! `reqwest::Client`s built via [`guarded_client_builder`] — a stray
//! `reqwest::Client::new()` elsewhere is invisible to it. Closed
//! *partially* (not fully — a lint can always be silenced at the call
//! site) by this crate's `clippy::disallowed_methods` configuration.

use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

use tokio::task_local;
use tower_layer::Layer;
use tower_service::Service;

task_local! {
    static NETWORK_ALLOWED: ();
}

/// Runs `fut` with network egress allowed through the guarded connector —
/// the sanctioned bypass. Every real network call this app makes (Tier 1
/// connector dispatch, model downloads) must be wrapped in this.
pub async fn allow_network<F: Future>(fut: F) -> F::Output {
    NETWORK_ALLOWED.scope((), fut).await
}

fn network_currently_allowed() -> bool {
    NETWORK_ALLOWED.try_with(|_| ()).is_ok()
}

fn tripwire_error() -> Box<dyn std::error::Error + Send + Sync> {
    "Offline tripwire: attempted to open a connection outside an \
     allow_network(...) scope. Every network call in this app must go \
     through connectors::runtime::execute or models::download — see \
     net_guard.rs."
        .into()
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
        builder.connector_layer(NetGuardLayer)
    } else {
        builder
    }
}

/// A `tower::Layer` that wraps reqwest's connector service — the step
/// responsible for actually opening a TCP/TLS connection, after any DNS
/// resolution reqwest itself performs internally. Every request reaches
/// this layer on the way to a real socket, regardless of whether its host
/// was a name or a literal IP, which is exactly the property the earlier
/// resolver-based guard lacked (see the module doc).
#[derive(Clone, Copy, Default)]
struct NetGuardLayer;

impl<S> Layer<S> for NetGuardLayer {
    type Service = NetGuardService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        NetGuardService { inner }
    }
}

#[derive(Clone)]
struct NetGuardService<S> {
    inner: S,
}

impl<S, Req> Service<Req> for NetGuardService<S>
where
    S: Service<Req> + Send + 'static,
    S::Error: Into<Box<dyn std::error::Error + Send + Sync>>,
    S::Future: Send + 'static,
    Req: Send + 'static,
{
    type Response = S::Response;
    type Error = Box<dyn std::error::Error + Send + Sync>;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx).map_err(Into::into)
    }

    fn call(&mut self, req: Req) -> Self::Future {
        if network_currently_allowed() {
            let fut = self.inner.call(req);
            Box::pin(async move { fut.await.map_err(Into::into) })
        } else {
            // Refused before `self.inner` (the real connector) is ever
            // called — no socket is opened, no DNS lookup happens.
            Box::pin(async move { Err(tripwire_error()) })
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

    /// `http://localhost:<port>`, deliberately **not** `127.0.0.1` — this
    /// exercises the hostname path (reqwest resolves `localhost` before
    /// handing off to the connector). The IP-literal path below is its own
    /// pair of tests, since — unlike the old resolver-based guard — this
    /// one no longer needs a hostname to see the request at all.
    fn bind_localhost_server(body: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("could not bind test server");
        let port = listener.local_addr().expect("no local addr").port();
        serve_one_response(listener, body);
        format!("http://localhost:{port}")
    }

    fn bind_ip_literal_server(body: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("could not bind test server");
        let port = listener.local_addr().expect("no local addr").port();
        serve_one_response(listener, body);
        format!("http://127.0.0.1:{port}")
    }

    /// `reqwest::Error`'s own `Display` is a generic wrapper ("error
    /// sending request for url ..."); the tripwire's own message lives
    /// further down the `source()` chain, where `NetGuardService`'s error
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

    /// The regression test for the fix this module's doc comment describes:
    /// the earlier DNS-resolver-based guard never saw a literal IP target,
    /// since resolution simply doesn't run for one. `NetGuardLayer`
    /// intercepts at the connector instead, which a literal IP reaches the
    /// same as any resolved hostname would.
    #[tokio::test]
    async fn an_ip_literal_request_outside_allow_network_is_blocked_too() {
        let url = bind_ip_literal_server("should never be read");
        let client = guarded_client_builder().build().expect("client builds");

        let result = client.get(&url).send().await;

        let error = result.expect_err("an IP-literal request outside allow_network must fail");
        let message = full_error_chain(&error);
        assert!(
            message.contains("Offline tripwire"),
            "expected the tripwire's own error text for an IP-literal target, got: {message}"
        );
    }

    #[tokio::test]
    async fn an_ip_literal_request_inside_allow_network_reaches_the_real_server() {
        let url = bind_ip_literal_server("hello from a real ip-literal socket");
        let client = guarded_client_builder().build().expect("client builds");

        let body = allow_network(async {
            let response = client.get(&url).send().await.expect("request must succeed");
            response.text().await.expect("body must read")
        })
        .await;

        assert_eq!(body, "hello from a real ip-literal socket");
    }
}
