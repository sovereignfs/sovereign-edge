//! The Phase 1 catalog (task 12.2, mirroring `apps/mobile/src/models/catalog.ts`).
//!
//! Same entries, same publisher-asserted URLs/sizes/SHA-256 digests as
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
        // A different shape of model from the four above: tuned specifically
        // to answer only from text handed to it in the prompt, not as a
        // general chat model. Desktop's grammar-constrained tool-calling
        // (engine/grammar.rs) is model-agnostic — unlike mobile, there is no
        // chat-template capability gate this model could fail here.
        // Licensed under LFM Open License v1.0, not fully permissive: free
        // for commercial use under $10M annual revenue.
        CatalogEntry {
            descriptor: ModelDescriptor {
                id: "lfm2-1.2b-rag-q4km".into(),
                name: "LFM2 1.2B RAG".into(),
                url: "https://huggingface.co/LiquidAI/LFM2-1.2B-RAG-GGUF/resolve/main/LFM2-1.2B-RAG-Q4_K_M.gguf".into(),
                size_bytes: 730_894_048,
                md5: None,
                sha256: Some("5e4d123cd76dd38a1b55f86a5e1f5fa579e452ff89fa636709edbecd3513db0a".into()),
                quantization: Some("Q4_K_M".into()),
            },
            parameters: "1.2B".into(),
            parameters_b: 1.2,
            summary: "Answers only from text you give it — not a general chat model.".into(),
        },
        CatalogEntry {
            descriptor: ModelDescriptor {
                id: "qwen3-4b-instruct-2507-q4km".into(),
                name: "Qwen3 4B Instruct".into(),
                url: "https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf".into(),
                size_bytes: 2_497_280_736,
                md5: None,
                sha256: Some("2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e".into()),
                quantization: Some("Q4_K_M".into()),
            },
            parameters: "4B".into(),
            parameters_b: 4.0,
            summary: "Best quality here, and Apache-licensed. Wants a capable machine.".into(),
        },
        // Google's own official QAT release, not a community requant — the
        // most trustworthy source for a model this new. "E4B" names the
        // model's "effective 4B" elastic-inference footprint (Gemma's
        // MatFormer architecture can run a nested, cheaper sub-model), but
        // that name describes compute, not what has to be downloaded and
        // mapped into memory: this is a real 8B-parameter checkpoint,
        // quantized to 5.15 GB — by far the heaviest entry here, more than
        // double Qwen3 4B above. `parameters_b` is deliberately 8, not 4,
        // for the same reason as mobile's own catalog: it should match what
        // is actually resident in memory, not the marketing figure.
        CatalogEntry {
            descriptor: ModelDescriptor {
                id: "gemma-4-e4b-it-q4-0".into(),
                name: "Gemma 4 E4B Instruct".into(),
                url: "https://huggingface.co/google/gemma-4-E4B-it-qat-q4_0-gguf/resolve/main/gemma-4-E4B_q4_0-it.gguf".into(),
                size_bytes: 5_154_941_280,
                md5: None,
                sha256: Some("676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee".into()),
                quantization: Some("Q4_0".into()),
            },
            parameters: "8B (4B effective)".into(),
            parameters_b: 8.0,
            summary: "The heaviest option by far — a large download. Flagship machines only.".into(),
        },
    ]
}

pub fn find_in_catalog(id: &str) -> Option<CatalogEntry> {
    curated_models()
        .into_iter()
        .find(|entry| entry.descriptor.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn curated_models_is_non_empty() {
        assert!(!curated_models().is_empty());
    }

    #[test]
    fn every_curated_entry_has_a_unique_id() {
        let ids: HashSet<_> = curated_models()
            .into_iter()
            .map(|e| e.descriptor.id)
            .collect();
        assert_eq!(ids.len(), curated_models().len());
    }

    #[test]
    fn every_curated_entry_carries_a_verifiable_checksum() {
        for entry in curated_models() {
            assert!(
                entry.descriptor.sha256.is_some() || entry.descriptor.md5.is_some(),
                "{} has no checksum, so a download of it could never be verified",
                entry.descriptor.id,
            );
        }
    }

    #[test]
    fn find_in_catalog_finds_a_known_id() {
        let known = curated_models()[0].descriptor.id.clone();
        assert_eq!(
            find_in_catalog(&known).map(|e| e.descriptor.id),
            Some(known)
        );
    }

    #[test]
    fn find_in_catalog_returns_none_for_an_unknown_id() {
        assert!(find_in_catalog("no-such-model-id").is_none());
    }
}
