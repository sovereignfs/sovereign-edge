//! `llama-cpp-2`-backed `EngineAdapter` (task 12.2, mirroring
//! `apps/mobile/src/chat/inference/engine.ts`'s `InferenceEngine`).
//!
//! `load`/`generate`/`unload` are blocking, CPU-bound calls — there is no JS
//! bridge to cross here the way `llama.rn` has, so unlike mobile's `async`
//! wrapper this is plain synchronous Rust. Callers on Tauri's async runtime
//! should invoke these via `tokio::task::spawn_blocking` (see `lib.rs`).

use super::types::{
    EngineInfo, GenerateOptions, GenerateResult, InferenceError, InferenceErrorCode, LoadOptions,
    StopReason,
};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::context::LlamaContext;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaChatMessage, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;
use self_cell::self_cell;
use std::num::NonZeroU32;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tokio_util::sync::CancellationToken;

self_cell!(
    struct LoadedModel {
        owner: LlamaModel,
        #[not_covariant]
        dependent: LlamaContext,
    }
);

/// Wraps `llama-cpp-2`, exposing load / generate / unload.
///
/// Two invariants mirrored exactly from mobile's `InferenceEngine`:
///
///  - **One context at a time.** `load()` releases any existing context
///    first — holding two sets of weights briefly is a real way to exhaust
///    memory on a modest machine.
///  - **Nothing here touches the network.** The model path points at a file
///    `crate::models` already placed on disk.
pub struct EngineAdapter {
    backend: LlamaBackend,
    loaded: Option<LoadedModel>,
    info: Option<EngineInfo>,
    generating: AtomicBool,
}

impl EngineAdapter {
    pub fn new() -> Result<Self, InferenceError> {
        let backend = LlamaBackend::init().map_err(|cause| {
            InferenceError::new(
                InferenceErrorCode::ModelLoadFailed,
                format!("Could not initialize the inference backend: {cause:?}"),
            )
        })?;
        Ok(Self {
            backend,
            loaded: None,
            info: None,
            generating: AtomicBool::new(false),
        })
    }

    pub fn is_loaded_engine(&self) -> bool {
        self.loaded.is_some()
    }

    pub fn engine_info(&self) -> Option<EngineInfo> {
        self.info.clone()
    }

    pub fn load(&mut self, options: LoadOptions) -> Result<EngineInfo, InferenceError> {
        // Releasing first is not merely tidy: holding two sets of weights
        // briefly is enough to exhaust memory on a modest machine.
        self.unload();

        // Preflight memory budget check. Unlike mobile's `llama.rn`,
        // `llama-cpp-2`'s load failure (`LlamaModelLoadError::NullResult`)
        // carries no message text at all — there is nothing to
        // regex-match `/memory|alloc|oom/i` against, so mobile's technique
        // for telling "out of memory" apart from "the file is broken" does
        // not port as-is. This reuses `models::device`'s own fit formula as
        // the adaptation: if the file alone wouldn't fit the machine's
        // usable RAM budget, a load failure is classified as out-of-memory;
        // otherwise it's treated as a bad/unsupported file.
        let likely_oom = {
            let file_size = std::fs::metadata(&options.model_path)
                .map(|m| m.len())
                .unwrap_or(0);
            let estimated_peak = (file_size as f64 * 1.15) as u64 + 256 * 1024 * 1024;
            match crate::models::device::total_memory_bytes() {
                Some(total) => estimated_peak as f64 > total as f64 * 0.5,
                None => false,
            }
        };
        let classify = |verb: &str, cause: String| {
            let code = if likely_oom {
                InferenceErrorCode::OutOfMemory
            } else {
                InferenceErrorCode::ModelLoadFailed
            };
            InferenceError::new(
                code,
                format!(
                    "Could not {verb} the model at {}: {cause}",
                    options.model_path.display()
                ),
            )
        };

        let n_gpu_layers: u32 = if options.use_gpu { 99 } else { 0 };
        let model_params = LlamaModelParams::default().with_n_gpu_layers(n_gpu_layers);

        let model = LlamaModel::load_from_file(&self.backend, &options.model_path, &model_params)
            .map_err(|cause| classify("load", cause.to_string()))?;

        let ctx_params =
            LlamaContextParams::default().with_n_ctx(NonZeroU32::new(options.context_size));
        let backend = &self.backend;
        let loaded = LoadedModel::try_new(model, |m| m.new_context(backend, ctx_params))
            .map_err(|cause| classify("create an inference context for", cause.to_string()))?;

        let gpu = options.use_gpu && self.backend.supports_gpu_offload();
        let reason_no_gpu = if gpu {
            None
        } else if !options.use_gpu {
            Some("GPU offload not requested".to_string())
        } else {
            Some("This build has no GPU backend available".to_string())
        };

        let info = EngineInfo {
            gpu,
            reason_no_gpu,
            context_size: options.context_size,
            tool_capable: false,
        };
        self.loaded = Some(loaded);
        self.info = Some(info.clone());
        Ok(info)
    }

    /// Streams a completion. `on_token` fires per token if provided; the
    /// returned result carries the full text and timing.
    pub fn generate(
        &mut self,
        options: GenerateOptions,
        on_token: Option<Sender<String>>,
        cancel: Option<CancellationToken>,
    ) -> Result<GenerateResult, InferenceError> {
        let Some(loaded) = self.loaded.as_mut() else {
            return Err(InferenceError::new(
                InferenceErrorCode::NoModelLoaded,
                "Generation was requested before a model was loaded.",
            ));
        };
        if self.generating.swap(true, Ordering::SeqCst) {
            return Err(InferenceError::new(
                InferenceErrorCode::GenerationFailed,
                "A generation is already in progress on this context.",
            ));
        }

        let result = generate_inner(loaded, &options, on_token, cancel);
        self.generating.store(false, Ordering::SeqCst);
        result
    }

    /// Releases the model and its memory. Safe to call when nothing is loaded.
    pub fn unload(&mut self) {
        self.loaded = None;
        self.info = None;
        self.generating.store(false, Ordering::SeqCst);
    }
}

// Safety: every `LlamaContext`/`LlamaSampler` raw pointer `EngineAdapter`
// holds is only ever touched through `&mut self` methods, and every caller
// in this app reaches an `EngineAdapter` through a `std::sync::Mutex`, so
// there is never concurrent access from more than one thread at a time —
// the same contract llama.cpp itself requires. The pointers are `!Send`/
// `!Sync` only because raw pointers are conservatively not auto-derived as
// such; nothing here depends on thread affinity.
unsafe impl Send for EngineAdapter {}
unsafe impl Sync for EngineAdapter {}

impl crate::models::LoadedModelHandle for EngineAdapter {
    fn is_loaded(&self) -> bool {
        self.is_loaded_engine()
    }

    fn unload(&mut self) {
        EngineAdapter::unload(self);
    }
}

fn generate_inner(
    loaded: &mut LoadedModel,
    options: &GenerateOptions,
    on_token: Option<Sender<String>>,
    cancel: Option<CancellationToken>,
) -> Result<GenerateResult, InferenceError> {
    loaded.with_dependent_mut(|model, ctx| {
        let fail =
            |message: String| InferenceError::new(InferenceErrorCode::GenerationFailed, message);

        let tmpl = model
            .chat_template(None)
            .map_err(|cause| fail(format!("This model has no chat template: {cause}")))?;
        let chat_messages = options
            .messages
            .iter()
            .map(|m| LlamaChatMessage::new(m.role.as_str().to_string(), m.content.clone()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|cause| fail(format!("Invalid chat message: {cause}")))?;
        let prompt = model
            .apply_chat_template(&tmpl, &chat_messages, true)
            .map_err(|cause| fail(format!("Could not apply the chat template: {cause}")))?;

        let tokens = model
            .str_to_token(&prompt, AddBos::Always)
            .map_err(|cause| fail(format!("Could not tokenize the prompt: {cause}")))?;
        if tokens.is_empty() {
            return Err(fail("The prompt tokenized to nothing.".to_string()));
        }

        let n_ctx = ctx.n_ctx() as usize;
        if tokens.len() >= n_ctx {
            return Err(fail(
                "The prompt is longer than the model's context window.".to_string(),
            ));
        }

        let mut batch = LlamaBatch::new(tokens.len().max(1), 1);
        let last_index = (tokens.len() - 1) as i32;
        for (i, token) in (0_i32..).zip(tokens.iter().copied()) {
            batch
                .add(token, i, &[0], i == last_index)
                .map_err(|cause| fail(format!("Could not prepare the prompt batch: {cause}")))?;
        }
        ctx.decode(&mut batch)
            .map_err(|cause| fail(format!("Prompt processing failed: {cause}")))?;

        let started_at = Instant::now();
        let mut first_token_at: Option<Instant> = None;
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(1234);
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::temp(options.temperature),
            LlamaSampler::dist(seed),
        ]);

        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut text = String::new();
        let mut n_cur = batch.n_tokens();
        let mut tokens_generated: u32 = 0;

        let stop_reason = 'generation: loop {
            if tokens_generated >= options.max_tokens {
                break StopReason::Length;
            }
            if cancel.as_ref().is_some_and(|c| c.is_cancelled()) {
                break StopReason::Aborted;
            }

            let token = sampler.sample(ctx, batch.n_tokens() - 1);
            sampler.accept(token);

            if model.is_eog_token(token) {
                break StopReason::Eos;
            }

            let piece = model
                .token_to_piece(token, &mut decoder, true, None)
                .map_err(|cause| fail(format!("Could not decode a generated token: {cause}")))?;

            if first_token_at.is_none() {
                first_token_at = Some(Instant::now());
            }
            text.push_str(&piece);
            tokens_generated += 1;

            if let Some(sender) = &on_token {
                let _ = sender.send(piece);
            }

            if options
                .stop
                .iter()
                .any(|s| !s.is_empty() && text.ends_with(s.as_str()))
            {
                break 'generation StopReason::StopSequence;
            }

            batch.clear();
            batch.add(token, n_cur, &[0], true).map_err(|cause| {
                fail(format!("Could not prepare the next token batch: {cause}"))
            })?;
            n_cur += 1;

            ctx.decode(&mut batch)
                .map_err(|cause| fail(format!("Generation failed: {cause}")))?;
        };

        let time_to_first_token_ms =
            first_token_at.map(|t| t.duration_since(started_at).as_millis() as u64);
        // Measured from the first token onward, not from the call — prompt
        // processing dominates a short reply, and folding it in badly
        // distorts the reported rate (same rationale as mobile).
        let tokens_per_second = match first_token_at {
            Some(first) if tokens_generated > 0 => {
                let secs = Instant::now().duration_since(first).as_secs_f64();
                if secs > 0.0 {
                    Some(tokens_generated as f64 / secs)
                } else {
                    None
                }
            }
            _ => None,
        };

        Ok(GenerateResult {
            text,
            stop_reason,
            tokens_generated,
            time_to_first_token_ms,
            tokens_per_second,
            tool_calls: Vec::new(),
        })
    })
}
