import { render, userEvent } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system';
import {
  ModelSessionContext,
  type ModelDownload,
  type ModelSession,
} from '@/settings/ModelSessionProvider';

import { ModelsScreen } from './ModelsScreen';

jest.mock('expo-device', () => ({ totalMemory: 8 * 1024 ** 3 }));

const QWEN = 'qwen2.5-0.5b-instruct-q4km';

function renderModels(overrides: Partial<ModelSession> = {}) {
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

  // The catalog is the real one; only the session is stubbed, so the rows
  // under test are the rows a user actually sees.
  const { CURATED_MODELS } =
    jest.requireActual<typeof import('../catalog')>('../catalog');
  const { fitForDevice } =
    jest.requireActual<typeof import('../device')>('../device');
  session.models = overrides.models ?? [
    {
      ...CURATED_MODELS[0]!,
      installed: false,
      fit: fitForDevice(CURATED_MODELS[0]!),
    },
  ];

  const view = render(
    <ThemeProvider initialPreference="light">
      <ModelSessionContext.Provider value={session}>
        <ModelsScreen />
      </ModelSessionContext.Provider>
    </ThemeProvider>,
  );
  return { view, session };
}

const downloading = (over: Partial<ModelDownload> = {}): ModelDownload => ({
  phase: 'downloading',
  fraction: 0.42,
  bytesWritten: 2.1e8,
  totalBytes: 4.9e8,
  error: null,
  ...over,
});

describe('ModelsScreen', () => {
  it('offers a way to install a model that is not on the device', async () => {
    // Without this the app is a dead end on first launch: chat says "open
    // Models to add one" and Models offers nothing to press.
    const { view } = renderModels();
    expect((await view).getByText('DOWNLOAD')).toBeTruthy();
  });

  it('starts the download when the row is pressed', async () => {
    const { view, session } = renderModels();
    const s = await view;

    await userEvent.press(s.getByText('DOWNLOAD'));

    expect(session.install).toHaveBeenCalledWith(QWEN);
  });

  it('reports progress rather than a bare spinner', async () => {
    // Epic 0.4's rule: a multi-gigabyte transfer may never look stuck.
    const { view } = renderModels({ downloads: { [QWEN]: downloading() } });
    const s = await view;

    expect(s.getByText(/Downloading 42%/)).toBeTruthy();
    expect(s.getByText(/0.21 of 0.49 GB/)).toBeTruthy();
  });

  it('omits a percentage when the server sends no total', async () => {
    // Inventing one would be a worse lie than admitting the total is unknown.
    const { view } = renderModels({
      downloads: {
        [QWEN]: downloading({ fraction: null, totalBytes: null }),
      },
    });
    const s = await view;

    expect(s.queryByText(/%/)).toBeNull();
    expect(s.getByText(/210 MB so far/)).toBeTruthy();
  });

  it('cancels the transfer when a downloading row is pressed', async () => {
    const { view, session } = renderModels({
      downloads: { [QWEN]: downloading() },
    });
    const s = await view;

    expect(s.getByText('CANCEL')).toBeTruthy();
    await userEvent.press(s.getByText('CANCEL'));

    expect(session.cancelInstall).toHaveBeenCalledWith(QWEN);
    expect(session.install).not.toHaveBeenCalled();
  });

  it('stays cancellable while verifying', async () => {
    // Verification hashes the whole file; on a slow device that is long
    // enough that losing the stop control would strand the user.
    const { view } = renderModels({
      downloads: { [QWEN]: downloading({ phase: 'verifying' }) },
    });
    const s = await view;

    expect(s.getByText('CANCEL')).toBeTruthy();
    expect(s.getByText(/checksum/)).toBeTruthy();
  });

  it('does not present a model the device cannot run as an equal option', async () => {
    // The row's own subtitle says "pick a smaller model". Offering it in the
    // same accent style as the rest contradicts that in the one place the
    // user actually taps, and costs them the whole download to find out.
    const { CURATED_MODELS } =
      jest.requireActual<typeof import('../catalog')>('../catalog');
    const gemma = CURATED_MODELS.find((m) => m.id === 'gemma-2-2b-it-q4km')!;

    const { view } = renderModels({
      models: [
        {
          ...gemma,
          installed: false,
          fit: {
            fit: 'unsupported',
            estimatedPeakBytes: 2.1e9,
            totalMemoryBytes: 3.8e9,
            note: 'Likely too large for this device. Pick a smaller model.',
          },
        },
      ],
    });
    const s = await view;

    expect(s.getByText('DOWNLOAD ANYWAY')).toBeTruthy();
    expect(s.queryByText('DOWNLOAD')).toBeNull();
  });

  it('says what pressing an installed row will do', async () => {
    // The loaded model's row deletes it. That was previously signalled only by
    // drawing the title in the error colour, beside a green IN USE badge —
    // contradictory, and invisible to anyone not reading colour.
    const { CURATED_MODELS } =
      jest.requireActual<typeof import('../catalog')>('../catalog');
    const { fitForDevice } =
      jest.requireActual<typeof import('../device')>('../device');
    const entry = CURATED_MODELS[0]!;

    const { view } = renderModels({
      activeModelId: QWEN,
      models: [{ ...entry, installed: true, fit: fitForDevice(entry) }],
    });
    const s = await view;

    expect(s.getByText(/tap to remove/)).toBeTruthy();
    expect(s.getByText('IN USE')).toBeTruthy();
  });

  it('shows why a download failed and offers a retry', async () => {
    const { view, session } = renderModels({
      downloads: {
        [QWEN]: downloading({
          phase: 'failed',
          error: 'No data received for 60s. The download was paused.',
        }),
      },
    });
    const s = await view;

    expect(s.getByText(/No data received for 60s/)).toBeTruthy();
    await userEvent.press(s.getByText('RETRY'));

    expect(session.install).toHaveBeenCalledWith(QWEN);
  });
});
