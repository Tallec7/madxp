/**
 * Recherche générique "rows dont une colonne JSONB référence un identifiant".
 *
 * Pattern issu de la cascade DELETE vidéo (PRs #613 → #618) : les profils
 * (`config_profiles.configuration`) et le mirror Pi (`sites.local_config_mirror`)
 * stockent les vidéos dans des structures JSONB imbriquées (sponsors[],
 * categories.videos[], timeCategories.loopVideos[]). Pour détecter les profils
 * qui pointent vers une vidéo donnée, on cast le JSONB en text et on fait un
 * `ILIKE %id%` — rapide jusqu'à ~10k rows, indexable via `gin_trgm_ops` si
 * besoin.
 *
 * Cet util factorise le SQL des deux sondes existantes (config-profile.repo
 * `findProfilesReferencingVideo`, site.repo `findSitesReferencingVideoInLocalMirror`)
 * pour qu'au prochain incident similaire (advertiser, sponsor, campaign…) on
 * puisse plugger une nouvelle sonde en 5 lignes.
 *
 * Garde-fou injection : `table` et `jsonbColumn` sont validés par allowlist
 * regex car ils sont concaténés dans le SQL (impossible à paramétrer côté pg).
 * Les `criteria` passent en placeholders ILIKE (paramétrés).
 */

import type { QueryResultRow } from 'pg';

import { query } from '../config/database';

const SQL_IDENT = /^[a-z][a-z0-9_]*$/;

export type JsonbRefCriteria = Record<string, string | undefined>;

export interface JsonbRefQueryConfig {
  /** Nom de table (allowlist `[a-z_][a-z0-9_]*`). */
  table: string;
  /** Nom de colonne JSONB (allowlist idem). */
  jsonbColumn: string;
  /** Projection SELECT — passée telle quelle (responsabilité de l'appelant). */
  selectColumns: string;
  /**
   * Clause WHERE additionnelle, AND-ée à la recherche JSONB. Ex :
   * `'local_config_mirror IS NOT NULL'`. Pas de placeholders supportés ici.
   */
  extraWhere?: string;
}

function assertSafeIdent(name: string, kind: string): void {
  if (!SQL_IDENT.test(name)) {
    throw new Error(`jsonb-references: invalid ${kind} identifier "${name}"`);
  }
}

/**
 * Construit et exécute un SELECT qui retourne les rows dont la colonne JSONB
 * référence (substring ILIKE) au moins l'un des criteria fournis.
 *
 * Si tous les criteria sont vides/undefined, retourne `[]` sans hit DB.
 */
export async function findRowsReferencingInJsonb<T extends QueryResultRow>(
  config: JsonbRefQueryConfig,
  criteria: JsonbRefCriteria,
): Promise<T[]> {
  assertSafeIdent(config.table, 'table');
  assertSafeIdent(config.jsonbColumn, 'jsonbColumn');

  const filters: string[] = [];
  const params: string[] = [];
  for (const value of Object.values(criteria)) {
    if (typeof value !== 'string' || value.length === 0) continue;
    params.push(`%${value}%`);
    filters.push(`${config.jsonbColumn}::text ILIKE $${params.length}`);
  }
  if (filters.length === 0) return [];

  const whereClauses: string[] = [];
  if (config.extraWhere) whereClauses.push(`(${config.extraWhere})`);
  whereClauses.push(`(${filters.join(' OR ')})`);

  const sql = `SELECT ${config.selectColumns}
       FROM ${config.table}
       WHERE ${whereClauses.join(' AND ')}`;

  const result = await query<T>(sql, params);
  return result.rows;
}
