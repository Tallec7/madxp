/**
 * ADR-035: Constantes SQL pour les catégories sponsor.
 *
 * Phase 2 sépare analytics_category en :
 *   - 'sponsor_local'  → sponsors club (site_sponsor source=local)
 *   - 'sponsor_neopro' → annonceurs Neopro (advertiser_id)
 *   - 'sponsor'        → valeur legacy (rétrocompat Pi non mis à jour)
 *
 * Utilisation dans les requêtes SQL :
 *   `AND category IN ${ALL_SPONSOR_CATEGORIES}`
 *
 * Phase 4 supprimera la valeur legacy 'sponsor'.
 */

/** Toutes les catégories sponsor (local + neopro + legacy) */
export const ALL_SPONSOR_CATEGORIES = `('sponsor', 'sponsor_local', 'sponsor_neopro')`;

/** Sponsors locaux uniquement (club) + legacy */
export const LOCAL_SPONSOR_CATEGORIES = `('sponsor', 'sponsor_local')`;

/** Sponsors neopro uniquement (annonceurs) + legacy */
export const NEOPRO_SPONSOR_CATEGORIES = `('sponsor', 'sponsor_neopro')`;
