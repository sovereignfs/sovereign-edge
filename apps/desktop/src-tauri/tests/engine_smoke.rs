//! Task 12.2's own review bar: "a real GGUF model loads and generates a
//! reply on-device on at least macOS", verified by actually running it, not
//! by a green `cargo check`.
//!
//! `#[ignore]`d because it downloads a ~490 MB model on first run — not
//! something CI or a casual `cargo test` should do unattended. Run it
//! explicitly:
//!
//! ```sh
//! cargo test --test engine_smoke -- --ignored --nocapture
//! ```
//!
//! The model is cached under the OS temp directory across runs, so only the
//! first run pays the download cost.

use sovereign_edge_desktop_lib::engine::{
    ChatMessage, EngineAdapter, GenerateOptions, LoadOptions, Role, StopReason,
};
use sovereign_edge_desktop_lib::models::{
    curated_models, download_model, models_directory, DownloadOptions,
};

#[tokio::test]
#[ignore]
async fn loads_and_generates_a_reply_on_device() {
    let scratch = std::env::temp_dir().join("sovereign-edge-desktop-engine-smoke-models");
    let models_dir =
        models_directory(&scratch).expect("could not create the scratch models directory");

    // Smallest catalog entry, to keep the download and the decode loop fast.
    let descriptor = curated_models()
        .into_iter()
        .min_by(|a, b| a.descriptor.size_bytes.cmp(&b.descriptor.size_bytes))
        .expect("catalog is non-empty")
        .descriptor;

    eprintln!(
        "downloading/verifying {} ({})...",
        descriptor.name, descriptor.id
    );
    let client = reqwest::Client::new();
    let model_path = download_model(
        &client,
        &models_dir,
        &descriptor,
        DownloadOptions::default(),
    )
    .await
    .expect("model download+verification failed");
    eprintln!("model ready at {}", model_path.display());

    // `EngineAdapter::load`/`generate` are blocking, CPU-bound calls (see
    // `engine::adapter`'s own doc comment) — run them on a blocking thread
    // rather than the async test's own task, matching how `lib.rs`'s Tauri
    // commands invoke them.
    let result = tokio::task::spawn_blocking(move || {
        let mut engine = EngineAdapter::new().expect("could not initialize the inference backend");

        let info = engine
            .load(LoadOptions {
                model_path,
                context_size: 2048,
                use_gpu: true,
            })
            .expect("model load failed");
        eprintln!(
            "loaded: gpu={} reason_no_gpu={:?} context_size={}",
            info.gpu, info.reason_no_gpu, info.context_size
        );

        let result = engine
            .generate(
                GenerateOptions {
                    messages: vec![ChatMessage {
                        role: Role::User,
                        content: "Say hello in exactly one word.".to_string(),
                    }],
                    max_tokens: 32,
                    temperature: 0.7,
                    stop: Vec::new(),
                },
                None,
                None,
            )
            .expect("generation failed");

        engine.unload();
        result
    })
    .await
    .expect("engine thread panicked");

    eprintln!(
        "reply ({:?}, {} tokens, {:?}ms to first token): {:?}",
        result.stop_reason, result.tokens_generated, result.time_to_first_token_ms, result.text,
    );

    assert!(
        !result.text.trim().is_empty(),
        "expected a non-empty reply, got: {result:?}"
    );
    assert!(
        result.tokens_generated > 0,
        "expected at least one generated token, got: {result:?}"
    );
    assert!(
        matches!(result.stop_reason, StopReason::Eos | StopReason::Length),
        "expected a normal stop reason, got {:?} — result: {result:?}",
        result.stop_reason,
    );
}
