/**
 * Configuration d'une vidéo dans la boucle de lecture.
 * Les vidéos de la boucle sont souvent des sponsors mais pas exclusivement
 * (peuvent inclure des annonces club, des animations, etc.)
 */
export interface LoopVideo {
    /** Nom affiché de la vidéo */
    name: string;
    /** Type MIME (ex: "video/mp4") */
    type: string;
    /** Chemin relatif vers le fichier vidéo */
    path: string;
    /**
     * UUID de la vidéo sur le central server (pour le tracking analytics)
     */
    video_id?: string;
    /**
     * UUID du sponsor associé (si applicable, pour filtrage contrat)
     */
    sponsor_id?: string;
    /**
     * Catégorie analytics (ex: 'sponsor', 'annonce', 'animation')
     */
    analytics_category?: string;
}

/**
 * @deprecated Utiliser LoopVideo à la place.
 * Conservé pour rétrocompatibilité avec les configurations existantes.
 */
export type Sponsor = LoopVideo;