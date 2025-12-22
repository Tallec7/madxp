import { Category } from "./category.interface";
import { Sponsor } from "./sponsor.interface";

// TimeCategory pour organiser les catégories dans /remote (Avant-match, Match, Après-match)
export interface TimeCategory {
    id: string;
    name: string;
    icon: string;
    color: string;
    description: string;
    categoryIds: string[]; // IDs des catégories assignées à ce bloc
    /**
     * Vidéos de la boucle spécifique à cette phase.
     * Si non défini ou vide, la boucle globale (sponsors[]) sera utilisée.
     */
    loopVideos?: Sponsor[];
}

export interface Configuration {
    remote: {
        title: string;
    };
    auth?: {
        password?: string;
        clubName?: string;
        sessionDuration?: number;
    };
    sync?: {
        enabled?: boolean;
        serverUrl?: string;
        siteName?: string;
        clubName?: string;
        location?: {
            city?: string;
            region?: string;
            country?: string;
        };
        sports?: string[];
        contact?: {
            email?: string;
            phone?: string;
        };
    };
    version: string;
    categories: Category[];
    sponsors: Sponsor[];
    timeCategories?: TimeCategory[]; // Organisation des catégories pour /remote
    /**
     * Mapping des catégories de vidéos vers les catégories analytics
     * Clé: ID de la catégorie vidéo (ex: "But", "Entrée")
     * Valeur: ID de la catégorie analytics (ex: "jingle", "ambiance")
     */
    categoryMappings?: Record<string, string>;
    /**
     * Active l'affichage du score en live sur la télécommande et la TV
     * Cette option est activée manuellement par NEOPRO (option payante)
     */
    liveScoreEnabled?: boolean;
}