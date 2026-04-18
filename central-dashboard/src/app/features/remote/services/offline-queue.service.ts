/**
 * OfflineQueueService — ADR-060
 * Bufferise les commandes match quand aucun transport n'est disponible.
 * Rejoue en ordre FIFO avec séquence number (ADR-059) dès reconnexion.
 * Storage : localStorage (clé par siteId).
 */
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface QueuedCommand {
  id: string;
  siteId: string;
  command: string;
  data?: Record<string, unknown>;
  seq: number;
  queuedAt: number;
}

const STORAGE_PREFIX = 'neopro_offline_queue_';
let _globalSeq = 0;

@Injectable()
export class OfflineQueueService {
  /** Emits the drained commands batch when drain() is called. */
  readonly drained$ = new Subject<QueuedCommand[]>();

  enqueue(siteId: string, command: string, data?: Record<string, unknown>): QueuedCommand {
    const entry: QueuedCommand = {
      id: crypto.randomUUID(),
      siteId,
      command,
      data,
      seq: ++_globalSeq,
      queuedAt: Date.now(),
    };
    const queue = this.load(siteId);
    queue.push(entry);
    this.save(siteId, queue);
    return entry;
  }

  /** Returns all buffered commands for a site in FIFO order, then clears the queue. */
  drain(siteId: string): QueuedCommand[] {
    const queue = this.load(siteId);
    if (queue.length) {
      this.save(siteId, []);
      this.drained$.next(queue);
    }
    return queue;
  }

  getPendingCount(siteId: string): number {
    return this.load(siteId).length;
  }

  clear(siteId: string): void {
    localStorage.removeItem(STORAGE_PREFIX + siteId);
  }

  private load(siteId: string): QueuedCommand[] {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + siteId);
      return raw ? (JSON.parse(raw) as QueuedCommand[]) : [];
    } catch {
      return [];
    }
  }

  private save(siteId: string, queue: QueuedCommand[]): void {
    localStorage.setItem(STORAGE_PREFIX + siteId, JSON.stringify(queue));
  }
}
