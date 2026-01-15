import { Category } from "./category.interface";
import { LoopVideo, Sponsor } from "./sponsor.interface";

/**
 * Types de sports supportés par l'overlay
 */
export type SportType = 'football' | 'basketball' | 'handball' | 'volleyball' | 'rugby' | 'hockey';

/**
 * Positions disponibles pour l'overlay (9 positions)
 */
export type OverlayPosition =
    | 'top-left' | 'top-center' | 'top-right'
    | 'middle-left' | 'middle-center' | 'middle-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right';

/**
 * Types d'animation d'entrée pour le watermark
 */
export type WatermarkAnimation = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-top' | 'slide-bottom' | 'zoom';

/**
 * Règle de planification du watermark
 */
export interface WatermarkScheduleRule {
    /** Identifiant unique de la règle */
    id: string;
    /** Heure de début (format HH:mm) */
    startTime: string;
    /** Heure de fin (format HH:mm) */
    endTime: string;
    /** Jours de la semaine actifs (0=Dimanche, 1=Lundi, ..., 6=Samedi) */
    daysOfWeek: number[];
    /** Phases de match où le watermark est visible */
    matchPhases: ('all' | 'neutral' | 'before' | 'during' | 'after')[];
}

/**
 * Configuration du scheduling horaire du watermark
 */
export interface WatermarkSchedule {
    /** Activer le scheduling (si false, watermark toujours visible) */
    enabled: boolean;
    /** Liste des règles de planification */
    rules: WatermarkScheduleRule[];
}

/**
 * Configuration du watermark affiché sur la TV.
 * Permet d'afficher un logo/image en surimpression permanente.
 */
export interface WatermarkConfig {
    /** Activer l'affichage du watermark */
    enabled: boolean;
    /** Chemin local de l'image sur le Pi (ex: 'assets/watermarks/logo.png') */
    imagePath: string;
    /** Position du watermark (9 positions disponibles) */
    position: OverlayPosition;
    /** Distance horizontale du bord (en pixels) */
    offsetX: number;
    /** Distance verticale du bord (en pixels) */
    offsetY: number;
    /** Opacité du watermark (0-100) */
    opacity: number;
    /** Largeur de l'image (en pixels) */
    width: number;
    /** Hauteur de l'image (en pixels, 0 = auto proportionnel) */
    height: number;
    /** Arrondi des coins (en pixels) */
    borderRadius: number;
    /** Animation d'entrée */
    animation: WatermarkAnimation;
    /** Durée de l'animation (en millisecondes) */
    animationDuration: number;
    /** Configuration du scheduling horaire (optionnel) */
    schedule?: WatermarkSchedule;
}

/**
 * Configuration de l'overlay du score affiché sur la TV.
 * Permet de personnaliser la position, les couleurs et les tailles.
 */
export interface ScoreOverlayConfig {
    /** Position de l'overlay (9 positions disponibles) */
    position?: OverlayPosition;
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
     * Active l'affichage du score en live et l'accès aux options avancées sur la télécommande.
     * Cette option est activée manuellement par NEOPRO (option payante).
     */
    liveScoreEnabled?: boolean;
    /**
     * Configuration de l'overlay du score (position, couleurs, tailles).
     * Modifiable depuis le Central Dashboard.
     */
    scoreOverlay?: ScoreOverlayConfig;
    /**
     * Configuration du watermark (logo en surimpression).
     * Modifiable depuis le Central Dashboard.
     */
    watermark?: WatermarkConfig;
}