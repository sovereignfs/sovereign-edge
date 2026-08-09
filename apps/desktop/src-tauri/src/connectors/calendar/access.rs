//! The real macOS system Calendar-access permission (task 10.2), requested
//! once for all four calendar connectors, mirroring
//! `apps/mobile/src/connectors/permissions/calendarAccess.ts`'s own "ask
//! the OS once" doc comment — all four manifests (`manifest.rs`) share one
//! underlying `EKEventStore` authorization domain, so this checks the
//! current status first rather than unconditionally calling
//! `requestFullAccessToEventsWithCompletion`, the same short-circuit
//! mobile's `ensureCalendarAccess()` takes.
//!
//! `lib.rs`'s `request_calendar_access` Tauri command calls this before
//! the app's own `permissions::grant()` for any calendar connector — never
//! the other way around, or the app would record "granted" for a
//! connector EventKit will actually refuse to run.
//!
//! The one completion-handler → async bridge this connector needs at all:
//! `requestFullAccessToEventsWithCompletion` is Apple's own callback-based
//! API (there is no synchronous alternative), turned into something a
//! Tauri async command can `.await` via a `tokio::sync::oneshot` channel
//! the block's closure sends into when EventKit calls it back.

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::Bool;
use objc2::AnyThread;
use objc2_event_kit::{EKAuthorizationStatus, EKEntityType, EKEventStore};
use objc2_foundation::NSError;
use std::sync::Mutex;

fn already_authorized() -> bool {
    let status = unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) };
    matches!(
        status,
        EKAuthorizationStatus::FullAccess | EKAuthorizationStatus::WriteOnly
    )
}

pub async fn request_access() -> bool {
    if already_authorized() {
        return true;
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
    // EventKit calls the completion block exactly once, but the closure's
    // `Fn` bound (not `FnOnce`) means it must still type-check as callable
    // more than once — the `Mutex<Option<Sender>>` lets a second call (which
    // should never happen) be a silent no-op instead of a panic on an
    // already-consumed `oneshot::Sender`.
    let tx = Mutex::new(Some(tx));

    // Scoped and dropped before the `.await` below: `Retained<EKEventStore>`
    // and `RcBlock` both wrap Objective-C object pointers, neither `Send`,
    // so neither may still be in scope across an await point a Tauri async
    // command's future needs to be `Send` to cross. Dropping our Rust-side
    // `RcBlock` handle here is safe — EventKit itself retains the block for
    // as long as it needs to call it back later, the same completion-handler
    // retain contract every such Apple API relies on; our handle owning a
    // +1 only for the duration of the call, not the callback's eventual
    // firing, is the correct, standard shape.
    {
        let block = RcBlock::new(move |granted: Bool, _error: *mut NSError| {
            if let Some(tx) = tx.lock().unwrap_or_else(|e| e.into_inner()).take() {
                let _ = tx.send(granted.as_bool());
            }
        });
        let store: Retained<EKEventStore> = unsafe { EKEventStore::init(EKEventStore::alloc()) };
        unsafe {
            store.requestFullAccessToEventsWithCompletion(RcBlock::as_ptr(&block));
        }
    }

    rx.await.unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn already_authorized_reflects_the_real_current_process_status() {
        // No mock here — `authorizationStatusForEntityType` is a real,
        // side-effect-free EventKit query (never prompts), so this checks
        // it returns *some* boolean without panicking rather than a fixed
        // value, since this test's own CI/dev environment's actual
        // authorization status isn't something this test controls.
        let _ = already_authorized();
    }
}
