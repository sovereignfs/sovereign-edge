//! How well a model is expected to run on this machine (task 12.2, mirroring
//! `apps/mobile/src/models/device.ts`).
//!
//! Same formula, same constants as mobile — desktop RAM budgets may
//! eventually warrant different numbers, but nothing here has found that yet
//! and inventing a desktop-specific constant speculatively isn't this task's
//! job. `sysinfo::System::total_memory()` replaces `expo-device`'s
//! `Device.totalMemory`.

use super::catalog::CatalogEntry;
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Fit {
    Comfortable,
    Tight,
    Unsupported,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FitAssessment {
    pub fit: Fit,
    /// Estimated peak resident memory while the model is loaded, in bytes.
    pub estimated_peak_bytes: u64,
    /// Total machine RAM, or `None` when it could not be read.
    pub total_memory_bytes: Option<u64>,
    /// One sentence suitable for showing to a user.
    pub note: String,
}

/// Weights are memory-mapped, but the KV cache, compute buffers, and runtime
/// are not, and they scale with context length rather than model size. 15%
/// plus a flat 256 MB approximates a 2048-token context without pretending
/// to be exact — the flat term dominates for small models, which is correct.
const OVERHEAD_RATIO: f64 = 1.15;
const RUNTIME_OVERHEAD_BYTES: u64 = 256 * 1024 * 1024;

/// Share of total RAM a foreground app can realistically hold before the OS
/// starts reclaiming it under pressure. Deliberately conservative.
const USABLE_FRACTION: f64 = 0.5;

pub fn total_memory_bytes() -> Option<u64> {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    let total = sys.total_memory();
    if total == 0 {
        None
    } else {
        Some(total)
    }
}

pub fn estimate_peak_bytes(entry: &CatalogEntry) -> u64 {
    (entry.descriptor.size_bytes as f64 * OVERHEAD_RATIO) as u64 + RUNTIME_OVERHEAD_BYTES
}

fn gb(bytes: u64) -> f64 {
    bytes as f64 / 1024f64.powi(3)
}

pub fn fit_for_device(entry: &CatalogEntry) -> FitAssessment {
    let estimated_peak_bytes = estimate_peak_bytes(entry);
    let Some(total) = total_memory_bytes() else {
        return FitAssessment {
            fit: Fit::Unknown,
            estimated_peak_bytes,
            total_memory_bytes: None,
            note: format!(
                "Needs roughly {:.1} GB of memory. This machine does not report its total RAM, so this cannot be checked in advance.",
                gb(estimated_peak_bytes),
            ),
        };
    };

    let budget = total as f64 * USABLE_FRACTION;
    let peak = estimated_peak_bytes as f64;

    if peak <= budget * 0.7 {
        return FitAssessment {
            fit: Fit::Comfortable,
            estimated_peak_bytes,
            total_memory_bytes: Some(total),
            note: format!(
                "Should run comfortably — about {:.1} GB of this machine's {:.1} GB.",
                gb(estimated_peak_bytes),
                gb(total),
            ),
        };
    }

    if peak <= budget {
        return FitAssessment {
            fit: Fit::Tight,
            estimated_peak_bytes,
            total_memory_bytes: Some(total),
            note: format!(
                "Will fit, but close to the limit — about {:.1} GB of {:.1} GB. Close other apps before a long conversation.",
                gb(estimated_peak_bytes),
                gb(total),
            ),
        };
    }

    FitAssessment {
        fit: Fit::Unsupported,
        estimated_peak_bytes,
        total_memory_bytes: Some(total),
        note: format!(
            "Likely too large for this machine — needs about {:.1} GB, more than the ~{:.1} GB an app can safely use of this machine's {:.1} GB. Pick a smaller model.",
            gb(estimated_peak_bytes),
            gb(budget as u64),
            gb(total),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::types::ModelDescriptor;

    fn entry(size_bytes: u64) -> CatalogEntry {
        CatalogEntry {
            descriptor: ModelDescriptor {
                id: "scratch-device-model".to_string(),
                name: "Scratch".to_string(),
                url: "https://example.org/scratch.gguf".to_string(),
                size_bytes,
                md5: None,
                sha256: Some("0".repeat(64)),
                quantization: None,
            },
            parameters: "0B".to_string(),
            parameters_b: 0.0,
            summary: "Scratch entry for device.rs tests.".to_string(),
        }
    }

    /// The exact formula `estimate_peak_bytes` implements, computed
    /// independently here so the test is a real check, not a restatement.
    fn expected_peak(size_bytes: u64) -> u64 {
        (size_bytes as f64 * 1.15) as u64 + 256 * 1024 * 1024
    }

    #[test]
    fn estimate_peak_bytes_matches_the_documented_formula() {
        let e = entry(1_000_000_000);
        assert_eq!(estimate_peak_bytes(&e), expected_peak(1_000_000_000));
    }

    #[test]
    fn total_memory_bytes_reads_something_real_on_this_machine() {
        // A real machine always reports nonzero RAM — this asserts the
        // function actually reads it, not that it returns a specific value.
        assert!(total_memory_bytes().is_some_and(|t| t > 0));
    }

    #[test]
    fn fit_for_device_reports_comfortable_for_a_small_model() {
        let total = total_memory_bytes().expect("this machine must report its RAM");
        let budget = total as f64 * USABLE_FRACTION;
        // Comfortably under the 70% comfortable threshold.
        let target_peak = budget * 0.3;
        let size = ((target_peak - RUNTIME_OVERHEAD_BYTES as f64) / OVERHEAD_RATIO) as u64;

        let assessment = fit_for_device(&entry(size));
        assert_eq!(assessment.fit, Fit::Comfortable);
        assert_eq!(assessment.total_memory_bytes, Some(total));
    }

    #[test]
    fn fit_for_device_reports_unsupported_for_a_model_far_past_budget() {
        let total = total_memory_bytes().expect("this machine must report its RAM");
        let budget = total as f64 * USABLE_FRACTION;
        // Comfortably past the 100% budget threshold.
        let target_peak = budget * 3.0;
        let size = ((target_peak - RUNTIME_OVERHEAD_BYTES as f64) / OVERHEAD_RATIO) as u64;

        let assessment = fit_for_device(&entry(size));
        assert_eq!(assessment.fit, Fit::Unsupported);
    }

    #[test]
    fn fit_for_device_reports_tight_for_a_model_between_the_two_thresholds() {
        let total = total_memory_bytes().expect("this machine must report its RAM");
        let budget = total as f64 * USABLE_FRACTION;
        // Between the 70% comfortable ceiling and the 100% budget ceiling.
        let target_peak = budget * 0.85;
        let size = ((target_peak - RUNTIME_OVERHEAD_BYTES as f64) / OVERHEAD_RATIO) as u64;

        let assessment = fit_for_device(&entry(size));
        assert_eq!(assessment.fit, Fit::Tight);
    }
}
