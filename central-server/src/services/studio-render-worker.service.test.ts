/**
 * Tests for studio-render-worker.service (J4 walking skeleton — STUB).
 *
 * Couvre la boucle minimale : claim → markReady. Le rendu réel est mocké
 * (la fonction `performRender` est interne, mais on mocke le repo pour
 * vérifier les transitions d'état).
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

describe('studio-render-worker.service', () => {
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
