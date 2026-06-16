import logger from '../config/logger';

/**
 * Limiteur de concurrence PARTAGÉ pour toutes les exécutions ffmpeg lourdes
 * (image→vidéo + génération de thumbnails).
 *
 * Sans cette borne, un upload en masse (ex : roster de ~20 photos joueuses, PNG
 * haute résolution) lance autant de process ffmpeg en parallèle. Sur le replica
 * Railway à faible RAM, les décodages PNG + libx264 + boxblur saturent la mémoire
 * → OOM-kill (`SIGKILL`, code null) et `ff_frame_thread_encoder_init failed`
 * (incident 2026-06-16). On sérialise donc les exécutions ffmpeg par paquets de N.
 *
 * Borne configurable via `IMAGE_CONVERSION_CONCURRENCY` (défaut 2). La limite est
 * volontairement basse pour préserver la cible coût Railway (pas de scale RAM).
 */

const DEFAULT_CONCURRENCY = 2;

function resolveLimit(): number {
  const raw = process.env.IMAGE_CONVERSION_CONCURRENCY;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (Number.isInteger(parsed) && parsed >= 1) {
    return parsed;
  }
  return DEFAULT_CONCURRENCY;
}

/**
 * Sémaphore FIFO minimal : N slots, file d'attente pour les tâches au-delà de N.
 */
export class ConcurrencyLimiter {
  private readonly maxConcurrent: number;
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  get limit(): number {
    return this.maxConcurrent;
  }

  get activeCount(): number {
    return this.active;
  }

  get queuedCount(): number {
    return this.waiters.length;
  }

  /**
   * Acquiert un slot, exécute `task`, puis libère le slot (même en cas d'erreur).
   */
  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) {
      next();
    }
  }
}

const limit = resolveLimit();

/** Instance partagée — un seul budget de slots pour TOUS les appels ffmpeg. */
export const ffmpegLimiter = new ConcurrencyLimiter(limit);

logger.info('ffmpeg concurrency limiter initialised', { maxConcurrent: limit });

/**
 * Exécute une tâche ffmpeg via le limiteur partagé. Log un warn si la tâche doit
 * patienter (signal opérationnel d'un upload en masse qui sature les slots).
 */
export async function runWithFfmpegSlot<T>(task: () => Promise<T>, label: string): Promise<T> {
  if (ffmpegLimiter.activeCount >= ffmpegLimiter.limit) {
    logger.warn('ffmpeg slot saturated, task queued', {
      label,
      active: ffmpegLimiter.activeCount,
      queued: ffmpegLimiter.queuedCount + 1,
      limit: ffmpegLimiter.limit,
    });
  }
  return ffmpegLimiter.run(task);
}
