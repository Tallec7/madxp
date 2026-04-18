/**
 * Video — modèles canoniques côté frontend dashboard.
 *
 * Phase 2 du chantier `video-deploy-unification` + Phase 3a (ADR-065).
 *
 * Hiérarchie :
 *  - `Video`     → miroir type-level de la row DB `videos` (snake_case).
 *                  Sert de verrou de namespace (smoke guard empêche toute
 *                  redéclaration ailleurs) et d'alignement avec le type
 *                  `Video` du backend (`central-server/src/types/index.ts`).
 *                  Aucun consommateur runtime — les endpoints API retournent
 *                  toujours des DTOs camelCase (`CloudVideo`, `VideoItem`…).
 *  - `VideoView` → vue UI camelCase commune à tous les composants dashboard.
 *
 * Les view-models feature-spécifiques (`VideoItem`, `SponsorVideoRow`, etc.)
 * doivent `extends VideoView` et ajouter uniquement les champs propres à leur
 * contexte. Ne PAS dupliquer ces interfaces ailleurs.
 *
 * Convention API : le backend expose des DTOs camelCase. Si un nouvel endpoint
 * renvoie une row brute snake_case, écrire un mapper dédié au point de
 * consommation (pas de mapper "universel" — cf. ADR-065 décision).
 */

/**
 * Video — row canonique de la table `videos` (snake_case, miroir DB).
 *
 * Contrat de type aligné avec `central-server/src/types/index.ts Video`.
 * Non instancié côté dashboard — conservé comme verrou de nommage.
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

