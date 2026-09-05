import { render, userEvent } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system';
import {
  ModelSessionContext,
  type ModelSession,
} from '@/settings/ModelSessionProvider';

import { EmbeddingSpikeScreen } from './EmbeddingSpikeScreen';

jest.mock('expo-device', () => ({ totalMemory: 8 * 1024 ** 3 }));

const mockIsInstalled = jest.fn((_id: string) => false);
jest.mock('@/models', () => ({
  ...jest.requireActual<typeof import('@/models')>('@/models'),
  isInstalled: (id: string) => mockIsInstalled(id),
  modelFile: (id: string) => ({ uri: `/models/${id}.gguf` }),
}));

const mockLoad = jest.fn(async () => ({
  gpu: false,
  contextSize: 512,
  dimensions: 384,
}));
const mockEmbedAll = jest.fn(async (texts: string[]) =>
  texts.map(() => ({ vector: [0.1], elapsedMs: 1 })),
);
const mockUnload = jest.fn(async () => {});

jest.mock('@/chat/inference', () => {
  const actual =
    jest.requireActual<typeof import('@/chat/inference')>('@/chat/inference');
  return {
    ...actual,
    EmbeddingEngine: class {
      load = (...args: unknown[]) => mockLoad(...(args as []));
      embedAll = (...args: unknown[]) => mockEmbedAll(...(args as [never]));
      unload = () => mockUnload();
    },
  };
});

function renderSpike(overrides: Partial<ModelSession> = {}) {
  const session: ModelSession = {
    models: [],
    refresh: jest.fn(),
    remove: jest.fn(async () => {}),
    activate: jest.fn(async () => {}),
    activeModelId: null,
    install: jest.fn(async () => {}),
    cancelInstall: jest.fn(),
    downloads: {},
    ...overrides,
  };

  const view = render(
    <ThemeProvider initialPreference="light">
      <ModelSessionContext.Provider value={session}>
        <EmbeddingSpikeScreen />
      </ModelSessionContext.Provider>
    </ThemeProvider>,
  );
  return view;
}

describe('EmbeddingSpikeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsInstalled.mockReturnValue(false);
  });

  it('lists the embedding candidates, which the model manager hides', async () => {
    const s = await renderSpike();

    // The whole reason this screen exists: these are filtered out of
    // ModelManager.list(), so without it there is no way to get one onto a
    // device at all.
    expect(s.getByText('BGE Small EN v1.5')).toBeOnTheScreen();
    expect(s.getByText('Nomic Embed Text v1.5')).toBeOnTheScreen();
  });

  it('warns when no chat model is loaded, because that is not the scenario', async () => {
    const s = await renderSpike({ activeModelId: null });

    // A run without a chat model resident measures the easy case and answers
    // a question nobody asked. The screen has to say so.
    expect(s.getByText(/None — load a chat model first/)).toBeOnTheScreen();
  });

  it('reports which chat model was resident during the run', async () => {
    mockIsInstalled.mockReturnValue(true);
    const user = userEvent.setup();
    const s = await renderSpike({
      activeModelId: 'qwen2.5-0.5b-instruct-q4km',
      models: [
        { id: 'qwen2.5-0.5b-instruct-q4km', name: 'Qwen2.5 0.5B Instruct' },
      ] as ModelSession['models'],
    });

    await user.press(s.getAllByText('Run')[0]!);

    // The measurement is meaningless without knowing what it ran alongside,
    // so the result carries it rather than leaving it to be remembered.
    expect(
      await s.findByText(/alongside: Qwen2\.5 0\.5B Instruct/),
    ).toBeOnTheScreen();
    expect(s.getByText(/384-dim/)).toBeOnTheScreen();
  });

  it('records an out-of-memory failure as the finding, not as an error to hide', async () => {
    mockIsInstalled.mockReturnValue(true);
    const { InferenceError } =
      jest.requireActual<typeof import('@/chat/inference')>('@/chat/inference');
    mockLoad.mockImplementation(async () => {
      throw new InferenceError('out-of-memory', 'failed to allocate');
    });
    const user = userEvent.setup();
    const s = await renderSpike({ activeModelId: null });

    await user.press(s.getAllByText('Run')[0]!);

    // An OOM here is the answer to task 16.1, not a crash to swallow — it
    // means the device cannot hold both models, which is exactly what the
    // spike is trying to find out.
    expect(
      await s.findByText(/BGE Small EN v1\.5 — out-of-memory/),
    ).toBeOnTheScreen();
  });

  it('releases the embedding context even when the run fails', async () => {
    mockIsInstalled.mockReturnValue(true);
    mockLoad.mockImplementation(async () => {
      throw new Error('boom');
    });
    const user = userEvent.setup();
    const s = await renderSpike();

    await user.press(s.getAllByText('Run')[0]!);

    // A half-loaded context left resident would poison whichever candidate
    // runs next, which is the one thing that would silently corrupt the
    // comparison this screen exists to produce.
    await s.findByText(/BGE Small EN v1\.5 — failed/);
    expect(mockUnload).toHaveBeenCalled();
  });
});
