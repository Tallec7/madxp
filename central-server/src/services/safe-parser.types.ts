/**
 * Internal types for the SAFe parser modules.
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/** Signature for the safe file reader used across parser modules. */
export type ReadFileSafeFn = (filePath: string) => string;
