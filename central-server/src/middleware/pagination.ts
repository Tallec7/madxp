/**
 * Middleware et helpers pour la pagination des API
 */

import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types';

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Étendre le type Request pour inclure pagination
declare global {
  namespace Express {
    interface Request {
      pagination?: PaginationParams;
    }
  }
}

/**
 * Middleware qui parse et valide les paramètres de pagination
 * Usage: router.get('/items', paginationMiddleware, handler)
 */
export const paginationMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(
    100, // Limite max pour éviter les abus
    Math.max(1, parseInt(req.query.limit as string, 10) || 20) // Défaut: 20
  );
  const offset = (page - 1) * limit;

  req.pagination = { page, limit, offset };
  next();
};

/**
 * Middleware avec limite configurable
 */
export const createPaginationMiddleware = (defaultLimit = 20, maxLimit = 100) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(
      maxLimit,
      Math.max(1, parseInt(req.query.limit as string, 10) || defaultLimit)
    );
    const offset = (page - 1) * limit;

    req.pagination = { page, limit, offset };
    next();
  };
};

/**
 * Helper pour formater une réponse paginée
 */
export function formatPaginatedResponse<T>(
  data: T[],
  total: number,
  pagination: PaginationParams
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / pagination.limit);

  return {
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages,
      hasNext: pagination.page < totalPages,
      hasPrev: pagination.page > 1,
    },
  };
}

/**
 * Helper pour construire une clause LIMIT/OFFSET SQL
 */
export function buildPaginationClause(pagination: PaginationParams): string {
  return `LIMIT ${pagination.limit} OFFSET ${pagination.offset}`;
}

/**
 * Helper pour exécuter une requête paginée avec count
 * @param pool Pool de connexion
 * @param dataQuery Query pour les données (sans LIMIT/OFFSET)
 * @param countQuery Query pour le count total
 * @param params Paramètres de la requête
 * @param pagination Paramètres de pagination
 */
export async function executePaginatedQuery<T>(
  pool: { query: (q: string, p?: any[]) => Promise<{ rows: T[] }> },
  dataQuery: string,
  countQuery: string,
  params: any[],
  pagination: PaginationParams
): Promise<{ data: T[]; total: number }> {
  // Ajouter LIMIT et OFFSET à la query de données
  const paginatedDataQuery = `${dataQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const paginatedParams = [...params, pagination.limit, pagination.offset];

  // Exécuter les deux requêtes en parallèle
  const [dataResult, countResult] = await Promise.all([
    pool.query(paginatedDataQuery, paginatedParams),
    pool.query(countQuery, params),
  ]);

  const total = parseInt((countResult.rows[0] as any)?.count || '0', 10);

  return {
    data: dataResult.rows,
    total,
  };
}

export default paginationMiddleware;
