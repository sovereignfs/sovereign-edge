/**
 * The behaviour under test is the one epic 0.4 exists for: a download that
 * goes quiet must fail with a specific, actionable error instead of hanging.
 *
 * Names here are `mock`-prefixed because Jest hoists `jest.mock()` factories
 * above the surrounding declarations and rejects other out-of-scope reads.
 */
import { downloadModel } from './download';
import type { ModelDescriptor } from './types';

const descriptor: ModelDescriptor = {
  id: 'stall-test',
  name: 'Stall Test',
  url: 'https://example.invalid/model.gguf',
  sizeBytes: 1000,
  md5: 'a'.repeat(32),
};

/**
 * A download that connects, then never delivers a byte. Typed as resolving
 * `null` (rather than `never`) so tests can substitute an implementation that
 * actually resolves — which is what the pause race does.
 */
const mockNeverResolves = () => new Promise<null>(() => {});

const mockTask = {
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  downloadAsync: jest.fn(mockNeverResolves),
  resumeAsync: jest.fn(mockNeverResolves),
  pauseAsync: jest.fn(async () => {}),
  savable: jest.fn(() => ({
    url: 'https://example.invalid/model.gguf',
    fileUri: 'file:///models/stall-test.gguf.part',
    isDirectory: false,
  })),
  cancel: jest.fn(),
  release: jest.fn(),
};

const mockWroteResumeState = jest.fn();

jest.mock('expo-file-system', () => ({
  File: { createDownloadTask: jest.fn(() => mockTask) },
  DownloadTask: { fromSavable: jest.fn(() => mockTask) },
}));

jest.mock('./store', () => ({
  assertSpaceFor: jest.fn(),
  modelFile: jest.fn(() => ({ exists: false })),
  partFile: jest.fn(() => ({ exists: false })),
  resumeFile: jest.fn(() => ({
    exists: false,
    write: (contents: string) => mockWroteResumeState(contents),
    delete: jest.fn(),
  })),
  removeModel: jest.fn(),
}));

describe('downloadModel stall detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTask.downloadAsync.mockImplementation(mockNeverResolves);
    mockTask.pauseAsync.mockImplementation(async () => {});
    mockTask.addListener.mockImplementation(() => ({ remove: jest.fn() }));
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fails with code "stalled" when no bytes arrive', async () => {
    const phases: string[] = [];
    const promise = downloadModel(descriptor, {
      stallTimeoutMs: 10_000,
      onPhase: (p) => phases.push(p),
    });
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'stalled',
      modelId: 'stall-test',
    });

    // Advance past the stall timeout. Without the watchdog this promise would
    // never settle — which is the bug, not a slow test.
    await jest.advanceTimersByTimeAsync(15_000);

    await assertion;
    expect(phases).toEqual(['downloading', 'failed']);
  });

  it('pauses rather than cancels, so fetched bytes survive', async () => {
    const promise = downloadModel(descriptor, { stallTimeoutMs: 10_000 });
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'stalled',
    });

    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;

    expect(mockTask.pauseAsync).toHaveBeenCalled();
    expect(mockTask.cancel).not.toHaveBeenCalled();
  });

  it('persists resume state so the next attempt continues', async () => {
    const promise = downloadModel(descriptor, { stallTimeoutMs: 10_000 });
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'stalled',
    });

    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;

    expect(mockTask.savable).toHaveBeenCalled();
    expect(mockWroteResumeState).toHaveBeenCalledWith(
      expect.stringContaining('stall-test.gguf.part'),
    );
  });

  it('reports "stalled", not "network", when pausing resolves the download', async () => {
    // Regression test for a race found only on-device: pauseAsync() makes the
    // in-flight downloadAsync() resolve with null, and that resolution can win
    // the race. The null must not be misreported as a transport failure — it
    // would hide both the real cause and the fact that this is resumable.
    let resolveDownload: ((v: null) => void) | undefined;
    mockTask.downloadAsync.mockImplementation(
      () => new Promise<null>((res) => (resolveDownload = res)),
    );
    mockTask.pauseAsync.mockImplementation(async () => {
      resolveDownload?.(null);
    });

    const promise = downloadModel(descriptor, { stallTimeoutMs: 10_000 });
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'stalled',
    });

    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;

    // Resume state must still have been persisted despite the race.
    expect(mockWroteResumeState).toHaveBeenCalled();
  });

  it('does not fire while bytes are still arriving', async () => {
    type ProgressData = { bytesWritten: number; totalBytes: number };
    let emit: ((d: ProgressData) => void) | undefined;

    mockTask.addListener.mockImplementation(((
      _event: string,
      listener: (d: ProgressData) => void,
    ) => {
      emit = listener;
      return { remove: jest.fn() };
    }) as unknown as typeof mockTask.addListener);

    const seen: number[] = [];
    void downloadModel(descriptor, {
      stallTimeoutMs: 10_000,
      onProgress: (p) => seen.push(p.bytesWritten),
    }).catch(() => {});

    // Steady trickle: each gap stays inside the timeout window.
    for (let i = 1; i <= 5; i++) {
      await jest.advanceTimersByTimeAsync(8_000);
      emit?.({ bytesWritten: i * 100, totalBytes: 1000 });
    }

    expect(seen).toEqual([100, 200, 300, 400, 500]);
    expect(mockTask.pauseAsync).not.toHaveBeenCalled();
  });
});
