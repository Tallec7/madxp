export interface Video {
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
