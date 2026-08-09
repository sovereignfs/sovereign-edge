//! The Tier 3 native handler registry (task 12.5), mirroring
//! `apps/mobile/src/connectors/runtime/nativeHandlers.ts`.
//!
//! A Tier 1 connector is entirely described by its manifest; a Tier 3
//! connector is its manifest plus exactly one entry here. This map is the
//! whole of that extension point — `execute_connector_call`'s Tier 3 branch
//! looks up a manifest's `handler.capability` here and calls whatever it
//! finds, with no other connector-specific code in the runtime.
//!
//! A handler receives the model's arguments (already an object; empty when
//! the tool call carried none) and returns `Result<String, String>` — `Ok`
//! text or an error message, the same two outcomes
//! `execute_connector_call` maps into `ExecutionResult::Ok`/`Err` for every
//! other tier. Sync, not async: unlike mobile's `(args) => Promise<...>`,
//! nothing a native handler does here is I/O-bound (`sysinfo` reads are
//! effectively instant), so there's no `async`/`catch_unwind`-around-a-throw
//! machinery to build — a `Result` return expresses "the handler failed"
//! exactly as well as a caught JS exception did.
//!
//! `is_allowed()` is checked by the caller before dispatch, same as Tier 1
//! — a handler here is never reached for a capability the user hasn't
//! granted.
//!
//! `device.info` is this task's proof-of-life handler: reserved-but-real
//! scaffolding, not a shipped connector — it exists to prove the extension
//! point works end to end. Mobile's own version reads `modelName`/`osName`/
//! `osVersion` via `expo-device`; desktop has no exact equivalent, so this
//! reads hostname + OS name + OS version via `sysinfo` instead, the
//! cross-platform proxy research 0010 itself suggested for this task.
//!
//! Calendar (task 10.2, `../calendar/`) is the first real one — its four
//! capabilities are resolved by falling through to
//! `calendar::native_handler_for`, a real macOS-only lookup on macOS and
//! always `None` elsewhere (see that module's own doc comment), so this
//! function needs no `#[cfg(target_os = ...)]` of its own.

pub type NativeHandler = fn(&serde_json::Map<String, serde_json::Value>) -> Result<String, String>;

fn device_info(_args: &serde_json::Map<String, serde_json::Value>) -> Result<String, String> {
    let parts: Vec<String> = [
        sysinfo::System::host_name(),
        sysinfo::System::name(),
        sysinfo::System::os_version(),
    ]
    .into_iter()
    .flatten()
    .filter(|s| !s.is_empty())
    .collect();

    Ok(if parts.is_empty() {
        "Unknown device".to_string()
    } else {
        parts.join(" ")
    })
}

pub fn native_handler_for(capability: &str) -> Option<NativeHandler> {
    match capability {
        "device.info" => Some(device_info),
        _ => crate::connectors::calendar::native_handler_for(capability),
    }
}
