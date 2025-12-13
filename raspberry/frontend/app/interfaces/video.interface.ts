export interface Video {
    name: string;
    type: string;
    path: string;
    /**
     * ID de la catégorie parente (ajouté dynamiquement au chargement de la config)
     * Utilisé pour le mapping vers les catégories analytics
     */
    categoryId?: string;
}