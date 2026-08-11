/**
 * Tests — worker d'export LED async (PROP-014 étape 6).
 * On mocke les dépendances I/O (repos, storage, ffmpeg) pour exercer le wiring
 * sans réseau ni DB.
 */

const mockRepo = {
  failStaleRunning: jest.fn<Promise<number>, [number]>().mockResolvedValue(0),
  claimNextQueued: jest.fn().mockResolvedValue(null),
  markReady: jest.fn().mockResolvedValue(undefined),
  markFailed: jest.fn().mockResolvedValue(undefined),
  touchProcessing: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../repositories', () => ({
  ledExportJobRepository: mockRepo,
  // Seuil d'orphelin — défini par le repository, consommé par le worker.
  LED_EXPORT_STALE_PROCESSING_MIN: 15,
  videoVariantRepository: { findByVideoAndDisplay: jest.fn() },
  siteRepository: { getDisplays: jest.fn() },
}));

jest.mock('./storage.service', () => ({
  getVideoUrl: jest.fn(() => 'https://example/v.mp4'),
  uploadVideoFromDisk: jest.fn(),
}));

jest.mock('./led-fold.service', () => ({
  computeRibbonDimensions: jest.fn(),
  computeFoldGeometry: jest.fn(),
  applyFoldExport: jest.fn(),
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

import {
  startLedExportWorker,
  stopLedExportWorker,
  ledExportWorker,
} from './led-export-worker.service';

describe('led-export-worker.service', () => {
  afterEach(() => {
    stopLedExportWorker();
    jest.clearAllMocks();
  });

  it('expose un singleton start/stop', () => {
    expect(typeof ledExportWorker.start).toBe('function');
    expect(typeof ledExportWorker.stop).toBe('function');
  });

  it('au boot, recovère les jobs processing orphelins (failStaleRunning)', async () => {
    await startLedExportWorker();
    expect(mockRepo.failStaleRunning).toHaveBeenCalledWith(15);
    stopLedExportWorker();
  });

  it('démarre malgré un échec de recovery (non bloquant)', async () => {
    mockRepo.failStaleRunning.mockRejectedValueOnce(new Error('db down'));
    await expect(startLedExportWorker()).resolves.toBeUndefined();
    stopLedExportWorker();
  });
});
