/**
 * Row-Level Security (RLS) Context Middleware
 *
 * Ce middleware configure le contexte de session PostgreSQL pour activer
 * Row-Level Security au niveau de la base de données.
 *
 * SÉCURITÉ:
 * - Chaque requête authentifiée définit son contexte RLS
 * - Les admins peuvent accéder à toutes les données
 * - Les sites ne peuvent accéder qu'à leurs propres données
 *
 * UTILISATION:
 * - Appliquer APRÈS le middleware authenticate()
 * - Appliquer AVANT les controllers qui font des requêtes DB
 *
 * Date: 2025-12-16
 */

import { Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { AuthRequest } from '../types';
import logger from '../config/logger';

/**
 * Middleware pour définir le contexte RLS PostgreSQL
 *
 * @param pool - Pool de connexions PostgreSQL
 * @returns Middleware Express
 */
export const setRLSContext = (pool: Pool) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Si pas d'utilisateur authentifié, passer au suivant
    // (Les routes non protégées n'ont pas besoin de RLS)
    if (!req.user) {
      return next();
    }

    try {
      const { id: userId, role } = req.user;
      const isAdmin = role === 'admin';

      // Déterminer le site_id selon le contexte
      let siteId: string | null = null;

      // 1. Si c'est une requête site-spécifique (param route)
      if (req.params.siteId) {
        siteId = req.params.siteId;
      }
      // 2. Si c'est une requête site-spécifique (param id générique)
      else if (req.params.id && req.path.includes('/sites/')) {
        siteId = req.params.id;
      }
      // 3. Si le site s'identifie lui-même via body
      else if (req.body?.site_id) {
        siteId = req.body.site_id;
      }
      // 4. Si le site s'identifie via query param
      else if (req.query?.site_id && typeof req.query.site_id === 'string') {
        siteId = req.query.site_id;
      }

      // Note: La vérification des permissions se fait au niveau des policies RLS
      // Les admins peuvent accéder à tous les sites
      // Les non-admins sont limités par les policies PostgreSQL

      // Définir le contexte RLS dans PostgreSQL
      await pool.query(
        'SELECT set_session_context($1, $2, $3)',
        [siteId, userId, isAdmin]
      );

      // Logger pour debugging (seulement en dev)
      if (process.env.NODE_ENV === 'development') {
        logger.debug('RLS Context set:', {
          userId,
          siteId: siteId || 'NULL',
          isAdmin,
          path: req.path
        });
      }

      // Stocker le contexte dans req pour utilisation ultérieure
      req.rlsContext = {
        userId,
        siteId: siteId || undefined,
        isAdmin
      };

      // Nettoyer le contexte RLS après la réponse (important pour le pool de connexions)
      res.on('finish', async () => {
        try {
          await pool.query('SELECT set_session_context(NULL, NULL, false)');
        } catch (cleanupError) {
          logger.error('Erreur lors du nettoyage du contexte RLS:', cleanupError);
        }
      });

      next();
    } catch (error) {
      logger.error('Erreur lors de la définition du contexte RLS:', error);
      // Ne pas bloquer la requête, laisser l'application continuer
      // (RLS sera désactivé pour cette requête, mais l'auth middleware protège déjà)
      next();
    }
  };
};

/**
 * Middleware pour réinitialiser le contexte RLS après la requête
 * Utile pour les connexions poolées réutilisées
 *
 * @param pool - Pool de connexions PostgreSQL
 * @returns Middleware Express
 */
export const resetRLSContext = (pool: Pool) => {
  return async (_req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      await pool.query('SELECT reset_session_context()');
    } catch (error) {
      // Erreur silencieuse, ce n'est pas critique
      logger.debug('Erreur lors de la réinitialisation du contexte RLS:', error);
    }
    next();
  };
};

/**
 * Middleware pour forcer le contexte admin (tâches système)
 * À utiliser uniquement pour les jobs cron et tâches background
 *
 * @param pool - Pool de connexions PostgreSQL
 * @returns Middleware Express
 */
export const setAdminContext = (pool: Pool) => {
  return async (_req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      await pool.query(
        'SELECT set_session_context(NULL, NULL, true)'
      );
      logger.debug('Admin context set for system task');
      next();
    } catch (error) {
      logger.error('Erreur lors de la définition du contexte admin:', error);
      next();
    }
  };
};

/**
 * Helper function: Exécuter une requête avec un contexte RLS spécifique
 * Utile pour les cas edge où on a besoin de changer temporairement de contexte
 *
 * @param pool - Pool de connexions PostgreSQL
 * @param context - Contexte RLS à appliquer
 * @param queryFn - Fonction qui exécute la requête
 * @returns Résultat de la requête
 */
export async function withRLSContext<T>(
  pool: Pool,
  context: {
    siteId?: string | null;
    userId?: string | null;
    isAdmin?: boolean;
  },
  queryFn: () => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    // Définir le contexte
    await client.query(
      'SELECT set_session_context($1, $2, $3)',
      [
        context.siteId || null,
        context.userId || null,
        context.isAdmin || false
      ]
    );

    // Exécuter la requête
    const result = await queryFn();

    return result;
  } finally {
    // Réinitialiser et libérer la connexion
    try {
      await client.query('SELECT reset_session_context()');
    } catch (error) {
      logger.debug('Erreur lors de la réinitialisation du contexte:', error);
    }
    client.release();
  }
}

/**
 * Helper function: Exécuter une requête en tant qu'admin
 * Utile pour les opérations système qui doivent bypass RLS
 *
 * @param pool - Pool de connexions PostgreSQL
 * @param queryFn - Fonction qui exécute la requête
 * @returns Résultat de la requête
 */
export async function withAdminContext<T>(
  pool: Pool,
  queryFn: () => Promise<T>
): Promise<T> {
  return withRLSContext(pool, { isAdmin: true }, queryFn);
}

/**
 * Type augmentation pour Express Request
 */
declare global {
  namespace Express {
    interface Request {
      rlsContext?: {
        userId: string;
        siteId?: string;
        isAdmin: boolean;
      };
    }
  }
}
