/**
 * Video — modèles canoniques côté frontend dashboard.
 *
 * Phase 2 du chantier `video-deploy-unification` (frontend-only).
 *
 * Hiérarchie :
 *  - `Video`             → miroir exact d'une row de la table `videos` (snake_case DB).
 *  - `VideoView`         → vue UI camelCase commune à tous les composants dashboard.
 *  - `mapVideoRowToView` → unique transformation snake_case → camelCase autorisée.
 *
 * Les view-models feature-spécifiques (`VideoItem`, `SponsorVideoRow`, etc.) doivent
 * `extends VideoView` et ajouter uniquement les champs propres à leur contexte.
 *
 * Ne PAS dupliquer ces interfaces ailleurs. Si un endpoint expose des champs
 * supplémentaires, créer un alias local qui `extends VideoView`.
 */

/**
 * Video — row canonique de la table `videos` (snake_case, miroir DB).
 *
 * Source de vérité pour les payloads API qui exposent la row brute.
 * Pour l'affichage UI, mapper vers `VideoView` via `mapVideoRowToView()`.
 */
export interface Video {
  id: string;
  filename: string;
  original_name: string;
  category: string | null;
  subcategory: string | null;
  file_size: number;
  duration: number | null;
  mime_type: string | null;
  storage_path: string;
  thumbnail_url: string | null;
  metadata: Record<string, unknown>;
  uploaded_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * VideoView — vue camelCase commune à tous les composants UI.
 *
 * Tout view-model feature-spécifique doit `extends VideoView` et ajouter
 * uniquement les champs propres à son contexte (ex: `isOnPi`, `advertiserName`).
 */
export interface VideoView {
  /** id DB — `null` pour une vidéo locale Pi pas encore enregistrée côté cloud. */
  id: string | null;
  filename: string;
  /** Nom à afficher (titre humain ou `original_name` — jamais l'UUID). */
  displayName: string;
  category: string | null;
  subcategory: string | null;
  size: number;
  duration: number | null;
  thumbnailUrl?: string | null;
}

/**
 * Transforme une row DB `Video` en `VideoView` UI.
 *
 * Unique point de mapping snake_case → camelCase autorisé.
 * Si tu trouves la même logique dupliquée ailleurs, c'est un bug.
 */
export function mapVideoRowToView(row: Video): VideoView {
  return {
    id: row.id,
    filename: row.filename,
    displayName: row.original_name || row.filename,
    category: row.category,
    subcategory: row.subcategory,
    size: row.file_size,
    duration: row.duration,
    thumbnailUrl: row.thumbnail_url,
  };
}
