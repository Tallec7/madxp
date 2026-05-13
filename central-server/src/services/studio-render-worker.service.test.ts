/**
 * Tests for studio-render-worker.service (J5 walking skeleton).
 *
 * Couvre les 2 paths :
 * - STUB (env STUDIO_RENDER_SERVER_URL absente) : produit URL placeholder
 * - HTTP (env présente) : POST au render server, output_url absolue
 *
 * `RENDER_SERVER_URL` est capturé à l'import — le block "HTTP" utilise
 * `jest.isolateModulesAsync` pour recharger le module avec l'env set.
 */

jest.mock('../config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../repositories', () => ({
  renderRequestRepository: {
    claimNextQueued: jest.fn(),
    markReady: jest.fn(),
    markFailed: jest.fn(),
    failStaleRunning: jest.fn(),
  },
  templateDefinitionRepository: {
    findById: jest.fn(),
  },
}));

import { renderRequestRepository } from '../repositories';
import {
  startStudioRenderWorker,
  stopStudioRenderWorker,
} from './studio-render-worker.service';

type Mock = jest.Mock;

const mocked = renderRequestRepository as unknown as {
  claimNextQueued: Mock;
  markReady: Mock;
  markFailed: Mock;
  failStaleRunning: Mock;
};

describe('studio-render-worker.service — STUB path (env not set)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mocked.failStaleRunning.mockResolvedValue(0);
    mocked.markReady.mockResolvedValue(undefined);
    mocked.markFailed.mockResolvedValue(undefined);
  });

  afterEach(() => {
    stopStudioRenderWorker();
    jest.useRealTimers();
  });

  it('calls failStaleRunning at boot before starting the poll loop', async () => {
    mocked.claimNextQueued.mockResolvedValue(null);

    await startStudioRenderWorker();

    expect(mocked.failStaleRunning).toHaveBeenCalledWith(10);
  });

  it('does nothing when the queue is empty', async () => {
    mocked.claimNextQueued.mockResolvedValue(null);

    await startStudioRenderWorker();
    // Avance d'un tick pour déclencher le 1er poll.
    await jest.advanceTimersByTimeAsync(2_000);

    expect(mocked.markReady).not.toHaveBeenCalled();
    expect(mocked.markFailed).not.toHaveBeenCalled();
  });

  it('claims a queued request, performs fake render, and marks it ready', async () => {
    mocked.claimNextQueued
      .mockResolvedValueOnce({
        id: 'req-1',
        site_id: 'site-1',
        template_id: 'tpl-1',
        status: 'rendering',
      })
      .mockResolvedValue(null);

    await startStudioRenderWorker();
    // Avance pour déclencher 1 tick + 2s du fake render.
    await jest.advanceTimersByTimeAsync(2_000);
    await jest.advanceTimersByTimeAsync(2_000);

    expect(mocked.claimNextQueued).toHaveBeenCalled();
    expect(mocked.markReady).toHaveBeenCalledTimes(1);
    const [requestId, outputUrl] = mocked.markReady.mock.calls[0];
    expect(requestId).toBe('req-1');
    expect(outputUrl).toMatch(
      /^https:\/\/kalonpartners\.bzh\/neopro-video\/renders\/\d{4}-\d{2}\/req-1\.mp4$/,
    );
  });

  it('marks failed with error message if the render throws', async () => {
    mocked.claimNextQueued
      .mockResolvedValueOnce({
        id: 'req-fail',
        site_id: 's',
        template_id: 't',
        status: 'rendering',
      })
      .mockResolvedValue(null);
    // Force markReady to throw — simulates a downstream failure path.
    mocked.markReady.mockRejectedValueOnce(new Error('boom'));

    await startStudioRenderWorker();
    await jest.advanceTimersByTimeAsync(2_000);
    await jest.advanceTimersByTimeAsync(2_000);

    expect(mocked.markFailed).toHaveBeenCalledWith('req-fail', 'boom');
  });
});

describe('studio-render-worker.service — HTTP path (env set)', () => {
  const originalEnv = process.env.STUDIO_RENDER_SERVER_URL;
  const originalFetch = globalThis.fetch;
  const templateRepo = (
    require('../repositories') as {
      templateDefinitionRepository: { findById: Mock };
    }
  ).templateDefinitionRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    // Real timers : on attend que le setInterval réel se déclenche, puisque
    // fake timers + fetch mockée ne se reconcilient pas proprement.
    process.env.STUDIO_RENDER_SERVER_URL = 'http://render-server:5175';
    mocked.failStaleRunning.mockResolvedValue(0);
    mocked.markReady.mockResolvedValue(undefined);
    mocked.markFailed.mockResolvedValue(undefined);
  });

  afterEach(() => {
    stopStudioRenderWorker();
    if (originalEnv === undefined) delete process.env.STUDIO_RENDER_SERVER_URL;
    else process.env.STUDIO_RENDER_SERVER_URL = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it('POSTs to the render server with composition + kind + props, marks ready with absolute URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        url: '/renders/FaitsDeJeu_abc.mp4',
        cached: false,
        durationMs: 7500,
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    templateRepo.findById.mockResolvedValueOnce({
      id: 'tpl-1',
      remotion_composition_id: 'FaitsDeJeu2Min',
      kind: 'video',
    });
    mocked.claimNextQueued
      .mockResolvedValueOnce({
        id: 'req-http',
        site_id: 's-1',
        template_id: 'tpl-1',
        props_json: { label: '2MIN' },
        status: 'rendering',
      })
      .mockResolvedValue(null);

    await startStudioRenderWorker();
    // Real timer wait — laisse le setInterval (2s) déclencher le 1er tick.
    await new Promise((r) => setTimeout(r, 2_500));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://render-server:5175/api/render');
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({
      compositionId: 'FaitsDeJeu2Min',
      kind: 'video',
      props: { label: '2MIN' },
    });
    expect(mocked.markReady).toHaveBeenCalledWith(
      'req-http',
      'http://render-server:5175/renders/FaitsDeJeu_abc.mp4',
    );
  });

  it('marks failed if the render server returns non-2xx', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'upstream error',
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    templateRepo.findById.mockResolvedValueOnce({
      id: 'tpl-1',
      remotion_composition_id: 'FaitsDeJeu2Min',
      kind: 'video',
    });
    mocked.claimNextQueued
      .mockResolvedValueOnce({
        id: 'req-fail',
        site_id: 's',
        template_id: 'tpl-1',
        props_json: {},
        status: 'rendering',
      })
      .mockResolvedValue(null);

    await startStudioRenderWorker();
    await new Promise((r) => setTimeout(r, 2_500));

    expect(mocked.markFailed).toHaveBeenCalledWith(
      'req-fail',
      expect.stringContaining('render server 502'),
    );
    expect(mocked.markReady).not.toHaveBeenCalled();
  });
});
