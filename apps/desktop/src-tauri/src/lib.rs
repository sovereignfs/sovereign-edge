//! Task 12.1's own scope: an empty window, no commands registered. Tier 3
//! native handlers (task 12.5) and every other Tauri command this app ever
//! exposes to the frontend get added here, each gated by its own capability
//! — see docs/epics/desktop/core-port.md.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Sovereign Edge desktop");
}
