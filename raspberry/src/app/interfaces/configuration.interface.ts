import { Category } from "./category.interface";
import { LoopVideo, Sponsor } from "./sponsor.interface";

/**
 * Types de sports supportés par l'overlay
 */
export type SportType = 'football' | 'basketball' | 'handball' | 'volleyball' | 'rugby' | 'hockey';

/**
 * Thèmes d'overlay disponibles
 */
export type OverlayTheme = 'broadcast' | 'minimal';

/**
 * Positions disponibles pour les overlays (9 positions — utilisé par watermark)
 */
export type OverlayPosition =
    | 'top-left' | 'top-center' | 'top-right'
    | 'middle-left' | 'middle-center' | 'middle-right'
    | 'bottom-left' | 'bottom-center' | 'bottom-right';

/**
 * Positions disponibles pour l'overlay score (6 positions — pas de middle)
 */
export type ScoreOverlayPosition =
    | 'top-left' | 'top-center' | 'top-right'
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
    /** Mode plein écran (l'image couvre tout l'écran) */
    fullscreen: boolean;
    /** Position du watermark (9 positions disponibles) - ignoré si fullscreen */
    position: OverlayPosition;
    /** Distance horizontale du bord (en pixels) - ignoré si fullscreen */
    offsetX: number;
    /** Distance verticale du bord (en pixels) - ignoré si fullscreen */
    offsetY: number;
    /** Opacité du watermark (0-100) */
    opacity: number;
    /** Largeur de l'image (en pixels) - ignoré si fullscreen */
    width: number;
    /** Hauteur de l'image (en pixels, 0 = auto proportionnel) - ignoré si fullscreen */
    height: number;
    /** Arrondi des coins (en pixels) - ignoré si fullscreen */
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
 * Simplifié : thème broadcast/minimal + position.
 */
export interface ScoreOverlayConfig {
    /** Thème d'affichage : broadcast (style TV pro) ou minimal (score discret) */
    theme?: OverlayTheme;
    /** Position de l'overlay score (6 positions) */
    position?: ScoreOverlayPosition;
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
     * Configuration de l'overlay du score (thème + position).
     * Modifiable depuis le Central Dashboard.
     */
    scoreOverlay?: ScoreOverlayConfig;
    /**
     * Configuration du watermark (logo en surimpression).
     * Modifiable depuis le Central Dashboard.
     */
    watermark?: WatermarkConfig;
    /**
     * Active la sortie LED sur HDMI 1 (dual kiosk).
     * Configuré depuis le Central Dashboard.
     */
    ledEnabled?: boolean;
    /**
     * Résolution du panneau LED (ex: '1920x384').
     */
    ledResolution?: string;
}

/**
 * Informations d'une variante vidéo (LED, etc.)
 * Attachée aux entrées vidéo dans configuration.json
 */
export interface VideoVariantInfo {
    path: string;
    filename?: string;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
}