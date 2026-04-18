/**
 * PiConfigVideoEntry — entrée vidéo dans le fichier `configuration.json` local du Pi.
 *
 * ADR-066 : renommé depuis `Video` pour éviter la collision sémantique avec
 * le `Video` canonique du dashboard (`central-dashboard/src/app/core/models/video.model.ts`)
 * et le `Video` du backend (`central-server/src/types/index.ts`) qui représentent
 * tous deux la row DB `videos`.
 *
 * Cette interface modélise un concept différent : une entrée locale Pi avec un
 * chemin filesystem (`path`), enrichie dynamiquement au runtime avec des IDs
 * cloud (`video_id`, `sponsor_id`, `categoryId`) pour le tracking analytics.
 *
 * Ne PAS fusionner avec le `Video` canonique — ce sont deux contrats distincts.
 */
export interface PiConfigVideoEntry {
    id?: string;
    name: string;
    type: string;
    path: string;
    /**
     * ID de la catégorie parente (ajouté dynamiquement au chargement de la config)
     * Utilisé pour le mapping vers les catégories analytics
     */
    categoryId?: string;
    /**
     * UUID de la vidéo sur le central server (pour le tracking analytics)
     */
    video_id?: string;
    /**
     * UUID du sponsor associé (si applicable)
     */
    sponsor_id?: string;
    /**
     * Catégorie analytics : sponsor, jingle, ambiance, other
     */
    analytics_category?: string;
    /** UUID du site_sponsor unifié (P1 — tracking granulaire par site) */
    site_sponsor_id?: string;
    /** URL directe du thumbnail (utilisé en mode demo ou quand le thumbnail est hébergé en cloud) */
    thumbnailUrl?: string;
    /** Variantes vidéo (écrites par deploy-video.js dans configuration.json) */
    variants?: {
        secondary?: {
            path: string;
            filename?: string;
            width?: number | null;
            height?: number | null;
        };
    };
}
