import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as Device from 'expo-device';

import { EmbeddingEngine, InferenceError } from '@/chat/inference';
import {
  Button,
  ListItem,
  ProgressBar,
  SectionLabel,
  useTheme,
} from '@/design-system';
import { isInstalled, listEmbeddingModels, modelFile } from '@/models';
import { useModelSession } from '@/settings/ModelSessionProvider';

/**
 * Dev-only harness for epic task 16.1.
 *
 * Exists because the task's real question — *can an embedding context be
 * resident alongside a chat model on a mid-range device?* — cannot be
 * answered from a test suite or a simulator, and every later task in epic 16
 * assumes the answer is yes. It is also the only way to get an embedding
 * model onto a device at all: they are filtered out of the model manager
 * (`ModelManager.list()`), because a model that cannot generate text has no
 * business in the chat picker.
 *
 * **What this screen can and cannot measure.** It runs the real scenario and
 * reports what JavaScript can honestly observe: the embedding dimension read
 * off the loaded model, load time, per-chunk embed time, and — the actual
 * go/no-go — whether loading the embedding model *while a chat model is
 * already loaded* succeeds or dies. That last one is the finding, and it is
 * free: `InferenceError` surfaces `out-of-memory`, and an outright kill shows
 * up as the app disappearing, which is its own unambiguous answer.
 *
 * It cannot report peak RSS. `expo-device` exposes only `totalMemory` (the
 * device's, not the app's), and React Native has no process-memory API — so
 * the megabyte figure has to come from Instruments or Android Studio's
 * profiler attached while this runs. Reporting a number the platform does not
 * actually provide would be worse than reporting none.
 *
 * Gated behind `__DEV__` at its route (see `RootNavigator`), so it is
 * unreachable in a release build. The module itself is still bundled — a
 * top-level import is not tree-shaken away by the route guard — which is
 * acceptable for a screen that exposes nothing a user could not already do,
 * and is worth revisiting only if this outlives the spike.
 */

/**
 * Fixed corpus, so throughput is comparable between candidates rather than a
 * measurement of whatever text happened to be handy. Chunk lengths are in the
 * range task 16.4's chunker is likely to produce.
 */
const CORPUS = [
  'The knowledge base stores conversations only when the user has explicitly opted in, and the archive begins at the moment of opt-in rather than reaching backwards.',
  'Chat history is capped on write, so the oldest messages are removed from disk as a conversation grows past its character budget.',
  'An embedding context is separate from the chat context because llama.cpp requires embeddings to be enabled and a pooling type chosen when the context is created.',
  'Retrieval folds the highest-scoring passages into the request the offline pipeline already builds, within its own character budget.',
  'Quantisation noise costs an embedding model more than a generator: it returns subtly wrong neighbours rather than slightly worse prose.',
  'Provenance receipts distinguish the user’s own documents from their past messages and from the assistant’s earlier replies.',
  'Nothing in the chat path opens a socket; the offline boundary is enforced by a lint rule and an import-graph walk in CI.',
  'Model acquisition is the one deliberate exception, and it is a visible, user-initiated action rather than a background fetch.',
];

type SpikeResult = {
  modelId: string;
  modelName: string;
  chatModelAtRun: string | null;
  dimensions: number;
  loadMs: number;
  chunks: number;
  totalEmbedMs: number;
  meanEmbedMs: number;
  outcome: 'ok' | 'out-of-memory' | 'failed';
  error?: string;
};

export function EmbeddingSpikeScreen() {
  const theme = useTheme();
  const { activeModelId, models, install, downloads, refresh } =
    useModelSession();
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<SpikeResult[]>([]);

  const candidates = listEmbeddingModels();
  const activeChatModel =
    models.find((m) => m.id === activeModelId)?.name ?? null;

  const run = useCallback(
    async (modelId: string, modelName: string) => {
      setRunning(modelId);
      // A fresh engine per run: leaving one alive between runs would make the
      // second candidate's numbers depend on whether the first was released,
      // which is exactly the confound this is trying to measure.
      const engine = new EmbeddingEngine();
      const chatModelAtRun = activeChatModel;

      try {
        const loadStart = Date.now();
        const info = await engine.load({ modelPath: modelFile(modelId).uri });
        const loadMs = Date.now() - loadStart;

        const embedStart = Date.now();
        const embedded = await engine.embedAll(CORPUS);
        const totalEmbedMs = Date.now() - embedStart;

        setResults((prev) => [
          {
            modelId,
            modelName,
            chatModelAtRun,
            dimensions: info.dimensions,
            loadMs,
            chunks: embedded.length,
            totalEmbedMs,
            meanEmbedMs: totalEmbedMs / Math.max(embedded.length, 1),
            outcome: 'ok',
          },
          ...prev,
        ]);
      } catch (error) {
        const oom =
          error instanceof InferenceError && error.code === 'out-of-memory';
        setResults((prev) => [
          {
            modelId,
            modelName,
            chatModelAtRun,
            dimensions: 0,
            loadMs: 0,
            chunks: 0,
            totalEmbedMs: 0,
            meanEmbedMs: 0,
            outcome: oom ? 'out-of-memory' : 'failed',
            error: error instanceof Error ? error.message : String(error),
          },
          ...prev,
        ]);
      } finally {
        // Always release, including after a failure: a half-loaded context
        // left resident would poison whichever candidate runs next.
        await engine.unload();
        setRunning(null);
      }
    },
    [activeChatModel],
  );

  const totalMemory = Device.totalMemory;

  return (
    <ScrollView style={{ backgroundColor: theme.colors.surface }}>
      <SectionLabel>Scenario</SectionLabel>
      <ListItem
        title="Chat model loaded"
        subtitle={
          activeChatModel ??
          'None — load a chat model first, or this measures the wrong thing entirely.'
        }
        destructive={activeChatModel === null}
      />
      <ListItem
        title="Device memory"
        subtitle={
          totalMemory
            ? `${(totalMemory / 1e9).toFixed(1)} GB total. The app's own peak is not readable from JS — attach Instruments or Android Studio's profiler to get it.`
            : 'Unknown on this device.'
        }
      />

      <SectionLabel>Candidates</SectionLabel>
      {candidates.map((entry) => {
        const download = downloads[entry.id];
        const installed = isInstalled(entry.id);
        const busy = running !== null;

        return (
          <ListItem
            key={entry.id}
            title={entry.name}
            subtitle={
              installed
                ? `${entry.quantization} · ${(entry.sizeBytes / 1e6).toFixed(0)} MB · installed`
                : `${entry.quantization} · ${(entry.sizeBytes / 1e6).toFixed(0)} MB · not installed`
            }
            footer={
              download && download.fraction !== null && !installed ? (
                <ProgressBar progress={download.fraction} />
              ) : undefined
            }
            accessory={
              installed ? (
                <Button
                  label="Run"
                  size="sm"
                  loading={running === entry.id}
                  onPress={() => void run(entry.id, entry.name)}
                  disabled={busy}
                />
              ) : (
                <Button
                  label="Install"
                  size="sm"
                  variant="secondary"
                  loading={Boolean(download)}
                  onPress={() => {
                    void install(entry.id).then(refresh);
                  }}
                  disabled={Boolean(download)}
                />
              )
            }
          />
        );
      })}

      <SectionLabel>Results</SectionLabel>
      {results.length === 0 ? (
        <ListItem
          title="No runs yet"
          subtitle="Load a chat model, install a candidate, then Run."
        />
      ) : (
        results.map((result, index) => (
          <ListItem
            key={`${result.modelId}-${index}`}
            title={`${result.modelName} — ${result.outcome}`}
            destructive={result.outcome !== 'ok'}
            subtitle={
              result.outcome === 'ok'
                ? [
                    `${result.dimensions}-dim`,
                    `load ${result.loadMs} ms`,
                    `${result.chunks} chunks in ${result.totalEmbedMs} ms`,
                    `mean ${result.meanEmbedMs.toFixed(1)} ms/chunk`,
                    `alongside: ${result.chatModelAtRun ?? 'no chat model'}`,
                  ].join(' · ')
                : `${result.error ?? 'unknown failure'} — alongside: ${
                    result.chatModelAtRun ?? 'no chat model'
                  }`
            }
          />
        ))
      )}

      <View style={{ padding: theme.space[4] }}>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
          }}
        >
          A run with no chat model loaded does not answer task 16.1. The
          question is whether both fit at once, so the number that matters is
          the one measured with a chat model already resident — ideally the
          largest one a target device would realistically run.
        </Text>
      </View>
    </ScrollView>
  );
}
