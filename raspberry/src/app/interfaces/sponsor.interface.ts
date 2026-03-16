/**
 * Configuration d'une video dans la boucle de lecture.
 * Les videos de la boucle sont souvent des annonceurs mais pas exclusivement
 * (peuvent inclure des annonces club, des animations, etc.)
 */
export interface LoopVideo {
    /** Nom affiche de la video */
    name: string;
    /** Type MIME (ex: "video/mp4") */
    type: string;
    /** Chemin relatif vers le fichier video */
    path: string;
    /**
     * UUID de la video sur le central server (pour le tracking analytics)
     */
    video_id?: string;
    /**
     * UUID de l'annonceur associe (si applicable, pour filtrage contrat)
     */
    advertiser_id?: string;
    /**
     * @deprecated Utiliser advertiser_id a la place
     */
    sponsor_id?: string;
    /**
     * Categorie analytics (ex: 'advertiser', 'annonce', 'animation')
     */
    analytics_category?: string;
    /** UUID du site_sponsor unifie (P1 — tracking granulaire par site) */
    site_sponsor_id?: string;
    /** Poids de rotation (defaut 1). Plus le poids est eleve, plus la video passe souvent. */
    weight?: number;
    /** Variantes video par type d'ecran (secondary, etc.) */
    variants?: {
        secondary?: {
            path: string;
            filename?: string;
            width?: number | null;
            height?: number | null;
        };
    };
}

/**
 * @deprecated Utiliser LoopVideo a la place.
 * Conserve pour retrocompatibilite avec les configurations existantes.
 */
export type Sponsor = LoopVideo;

/**
 * Alias pour LoopVideo - terme plus semantiquement correct
 */
export type AdvertiserVideo = LoopVideo;