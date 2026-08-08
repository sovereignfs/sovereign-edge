//! The Phase 1 catalog (task 12.2, mirroring `apps/mobile/src/models/catalog.ts`).
//!
//! Same four entries, same publisher-asserted URLs/sizes/SHA-256 digests as
//! mobile's catalog — it is the same data regardless of platform.

use super::types::ModelDescriptor;
use serde::Serialize;

/// A curated model, as shown in the model manager.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    #[serde(flatten)]
    pub descriptor: ModelDescriptor,
    /// Parameter count, for display: '0.5B', '1.5B'.
    pub parameters: String,
    /// The same count in billions, for comparison — held separately rather
    /// than parsed out of `parameters`, per mobile's own rationale (that
    /// field is a display string; capability decisions should not hinge on
    /// its formatting).
    pub parameters_b: f64,
    /// One line on what this model is good for.
    pub summary: String,
}

pub fn curated_models() -> Vec<CatalogEntry> {
    vec![
        CatalogEntry {
            descriptor: ModelDescriptor {
                id: "qwen2.5-0.5b-instruct-q4km".into(),
                name: "Qwen2.5 0.5B Instruct".into(),
                url: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf".into(),
                size_bytes: 491_400_032,
                md5: None,
                sha256: Some("74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db".into()),
                quantization: Some("Q4_K_M".into()),
            },
            parameters: "0.5B".into(),
            parameters_b: 0.5,
            summary: "Smallest option. Runs on almost anything; answers stay short.".into(),
        },
        CatalogEntry {
            descriptor: ModelDescriptor {
                id: "llama-3.2-1b-instruct-q4km".into(),
                name: "Llama 3.2 1B Instruct".into(),
                url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf".into(),
                size_bytes: 807_694_464,
                md5: None,
                sha256: Some("6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83".into()),
                quantization: Some("Q4_K_M".into()),
            },
            parameters: "1B".into(),
            parameters_b: 1.0,
            summary: "A step up in coherence while staying comfortable on mid-range machines.".into(),
        },
        CatalogEntry {
            descriptor: ModelDescriptor {
                id: "qwen2.5-1.5b-instruct-q4km".into(),
                name: "Qwen2.5 1.5B Instruct".into(),
                url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf".into(),
                size_bytes: 1_117_320_736,
                md5: None,
                sha256: Some("6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e".into()),
                quantization: Some("Q4_K_M".into()),
            },
            parameters: "1.5B".into(),
            parameters_b: 1.5,
            summary: "Noticeably better at following instructions. Wants a recent machine.".into(),
        },
        CatalogEntry {
            descriptor: ModelDescriptor {
                id: "gemma-2-2b-it-q4km".into(),
                name: "Gemma 2 2B Instruct".into(),
                url: "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf".into(),
                size_bytes: 1_708_582_752,
                md5: None,
                sha256: Some("e0aee85060f168f0f2d8473d7ea41ce2f3230c1bc1374847505ea599288a7787".into()),
                quantization: Some("Q4_K_M".into()),
            },
            parameters: "2B".into(),
            parameters_b: 2.0,
            summary: "Best quality here, and the heaviest. High-end machines only.".into(),
        },
    ]
}

pub fn find_in_catalog(id: &str) -> Option<CatalogEntry> {
    curated_models()
        .into_iter()
        .find(|entry| entry.descriptor.id == id)
}
