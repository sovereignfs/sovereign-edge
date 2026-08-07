// Suppresses the console window Windows would otherwise open alongside the
// app window in release builds. Debug builds keep it, for stdout/stderr.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sovereign_edge_desktop_lib::run();
}
