/**
 * Résolveur tolérant filename → storage_path pour les configs SaaS (ADR-083).
 *
 * Logique extraite de `saas.controller.ts` pour testabilité : on ne veut pas
 * wirer un vrai serveur HTTP pour valider le comportement du fallback fuzzy.
 */

import { normalizeFilename } from './filename-normalize';

export type ResolutionResult = 'exact' | 'fuzzy' | 'miss';

export interface ResolutionOutcome {
  storagePath: string;
  result: ResolutionResult;
}

/**
 * Construit un index `normalized(filename) → storage_path` à partir de la map
 * exacte `filename → storage_path`. Les collisions (plusieurs filenames qui
 * normalisent vers la même clé) gardent la première entrée — en pratique la
 * DB contient une seule variante par vidéo après upload FTP.
 */
export function buildFuzzyIndex(storagePathMap: Map<string, string>): Map<string, string> {
  const fuzzy = new Map<string, string>();
  for (const [filename, storagePath] of storagePathMap.entries()) {
    const key = normalizeFilename(filename);
    if (!fuzzy.has(key)) fuzzy.set(key, storagePath);
  }
  return fuzzy;
}

/**
 * Résout un filename de config en storage_path :
 *   1. lookup exact dans `storagePathMap`                 → 'exact'
 *   2. fallback lookup normalisé dans `fuzzyIndex`        → 'fuzzy'
 *   3. retour du filename brut (anciens uploads à plat)   → 'miss'
 */
export function resolveStoragePath(
  filename: string,
  storagePathMap: Map<string, string>,
  fuzzyIndex: Map<string, string>
): ResolutionOutcome {
  const exact = storagePathMap.get(filename);
  if (exact) return { storagePath: exact, result: 'exact' };

  const fuzzyHit = fuzzyIndex.get(normalizeFilename(filename));
  if (fuzzyHit) return { storagePath: fuzzyHit, result: 'fuzzy' };

  return { storagePath: filename, result: 'miss' };
}
