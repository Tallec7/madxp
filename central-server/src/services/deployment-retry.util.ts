/**
 * Utilitaires purs pour la logique de retry des déploiements.
 *
 * Extrait de `deployment.service.ts` pour :
 *   1. Réduire la taille du fichier monstre (Phase 5).
 *   2. Préparer le Delivery Strategy pattern (Phase 6 — ADR-069) où
 *      plusieurs stratégies partageront la même politique de retry.
 *
 * Ces helpers sont pures — zéro I/O, zéro dépendance DB — pour rester
 * testables unitairement et réutilisables par n'importe quelle strategy.
 */

export const RETRY_CONFIG = {
  maxRetries: 3,                    // Nombre max de tentatives
  retryDelayMs: 5 * 60 * 1000,      // Délai minimum entre retries (5 minutes)
  retryableErrors: [                 // Erreurs qui peuvent être retryées
    'timeout',
    'connection',
    'network',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'Command timeout',
  ],
} as const;

/**
 * Vérifie si une erreur peut être retryée (matching sur substrings connus).
 */
export function isRetryableError(errorMessage: string | null): boolean {
  if (!errorMessage) return false;
  const lowerError = errorMessage.toLowerCase();
  return RETRY_CONFIG.retryableErrors.some(e => lowerError.includes(e.toLowerCase()));
}

/**
 * Extrait le compteur de retry depuis le message d'erreur.
 * Format attendu : `[retry X/Y] message d'erreur`
 */
export function getRetryCount(errorMessage: string | null): number {
  if (!errorMessage) return 0;
  const match = errorMessage.match(/\[retry (\d+)\/\d+\]/);
  return match ? parseInt(match[1], 10) : 0;
}
