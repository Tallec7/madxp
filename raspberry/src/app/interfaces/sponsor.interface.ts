export interface Sponsor {
    name: string;
    type: string;
    path: string;
    /**
     * UUID de la vidéo sur le central server (pour le tracking analytics)
     */
    video_id?: string;
    /**
     * UUID du sponsor associé (si applicable)
     */
    sponsor_id?: string;
    /**
     * Catégorie analytics (toujours 'sponsor' pour les sponsors)
     */
    analytics_category?: string;
}