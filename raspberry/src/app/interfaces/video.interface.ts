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
}
