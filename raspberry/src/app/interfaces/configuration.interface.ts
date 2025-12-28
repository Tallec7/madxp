import { Category } from "./category.interface";
import { LoopVideo, Sponsor } from "./sponsor.interface";

/**
 * Configuration de l'overlay du score affiché sur la TV.
 * Permet de personnaliser la position, les couleurs et les tailles.
 */
export interface ScoreOverlayConfig {
    /** Position de l'overlay : 'top-right', 'top-left', 'bottom-right', 'bottom-left' */
    position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
    /** Distance horizontale du bord (en pixels) */
    offsetX?: number;
    /** Distance verticale du bord (en pixels) */
    offsetY?: number;
    /** Couleur de fond (format CSS, ex: 'rgba(0, 0, 0, 0.85)') */
    backgroundColor?: string;
    /** Arrondi des coins (en pixels) */
    borderRadius?: number;
    /** Couleur du score (format CSS, ex: '#4caf50') */
    scoreColor?: string;
    /** Taille du score (en pixels) */
    scoreSize?: number;
    /** Couleur des noms d'équipe */
    teamNameColor?: string;
    /** Taille des noms d'équipe (en pixels) */
    teamNameSize?: number;
}

/**
 * TimeCategory pour organiser les catégories dans /remote (Avant-match, Match, Après-match).
 * Chaque phase peut avoir sa propre boucle de vidéos spécifique.
 */
export interface TimeCategory {
    id: string;
    name: string;
    icon: string;
    color: string;
    description: string;
    categoryIds: string[]; // IDs des catégories assignées à ce bloc
    /**
     * Vidéos de la boucle spécifique à cette phase de jeu.
     * Si non défini ou vide, la boucle globale (sponsors[]) sera utilisée.
     */
    loopVideos?: LoopVideo[];
}

/**
 * Configuration complète d'un site Neopro.
 * Structure principale stockée localement et synchronisée avec le central.
 */
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
    /**
     * Boucle de vidéos globale (sponsors, annonces, animations).
     * Jouée automatiquement en mode boucle.
     * @deprecated Le champ s'appelle 'sponsors' pour rétrocompatibilité mais contient des LoopVideo
     */
    sponsors: LoopVideo[];
    timeCategories?: TimeCategory[]; // Organisation des catégories pour /remote
    /**
     * Mapping des catégories de vidéos vers les catégories analytics.
     * Clé: ID de la catégorie vidéo (ex: "But", "Entrée")
     * Valeur: ID de la catégorie analytics (ex: "jingle", "ambiance")
     */
    categoryMappings?: Record<string, string>;
    /**
     * Active l'affichage du score en live sur la télécommande et la TV.
     * Cette option est activée manuellement par NEOPRO (option payante).
     */
    liveScoreEnabled?: boolean;
    /**
     * Configuration de l'overlay du score (position, couleurs, tailles).
     * Modifiable depuis le Central Dashboard.
     */
    scoreOverlay?: ScoreOverlayConfig;
}