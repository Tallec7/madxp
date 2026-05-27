/* eslint-disable no-console */
/**
 * Audit FTP path rebrand — count rows referencing legacy `neopro-video/`
 * or `neopro-update/` URL paths across all text/jsonb columns.
 *
 * Context (ADR-133, Phase 6) : avant de migrer les FTP paths legacy vers
 * `madxp-video/` et `madxp-update/`, on doit savoir exactement quelles rows
 * sont impactées. Cette audit est read-only et précède l'exécution de la
 * migration `migrate-ftp-paths-to-madxp.sql`.
 *
 * Stratégie :
 *  - Scanne tous les information_schema columns de type varchar/text/jsonb.
 *  - Pour chaque colonne, compte les rows contenant `neopro-video` ou
 *    `neopro-update`.
 *  - Reporte un tableau classé par count desc + le total global.
 *
 * Usage :
 *   cd central-server && source .env && npx ts-node src/scripts/audit-ftp-path-rebrand.ts
 *
 * Output :
 *   table_name.column_name | type    | rows_with_legacy_path | sample_value
 *   ───────────────────────┼─────────┼───────────────────────┼──────────────
 *   videos.storage_path     | varchar | 0 (filenames only)    | -
 *   template_definitions.manifest_json | jsonb | 142          | "https://...neopro-video/..."
 *   proof_of_broadcasts.screenshot_url | varchar | 87         | "https://kalonpartners.bzh/neopro-video/..."
 *
 * Aucune modification DB. Aucun side-effect.
 */

import type { QueryResultRow } from 'pg';
import pool, { query } from '../config/database';

interface ColumnInfo extends QueryResultRow {
  table_name: string;
  column_name: string;
  data_type: string;
}

interface AuditResult {
  table: string;
  column: string;
  type: string;
  legacyVideoCount: number;
  legacyUpdateCount: number;
  sampleValue: string | null;
}

const LEGACY_VIDEO_TOKEN = 'neopro-video';
const LEGACY_UPDATE_TOKEN = 'neopro-update';

async function listTextColumns(): Promise<ColumnInfo[]> {
  const sql = `
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('character varying', 'text', 'jsonb', 'json')
    ORDER BY table_name, column_name
  `;
  const { rows } = await query<ColumnInfo>(sql);
  return rows;
}

async function countLegacyRefs(col: ColumnInfo, token: string): Promise<number> {
  const isJson = col.data_type === 'jsonb' || col.data_type === 'json';
  const expr = isJson
    ? `"${col.column_name}"::text LIKE $1`
    : `"${col.column_name}" LIKE $1`;
  const sql = `SELECT COUNT(*)::int AS cnt FROM public."${col.table_name}" WHERE ${expr}`;
  try {
    const { rows } = await query<{ cnt: number } & QueryResultRow>(sql, [`%${token}%`]);
    return rows[0]?.cnt ?? 0;
  } catch (err) {
    console.warn(`  ⚠️  scan failed on ${col.table_name}.${col.column_name}: ${(err as Error).message}`);
    return 0;
  }
}

async function fetchSample(col: ColumnInfo, token: string): Promise<string | null> {
  const isJson = col.data_type === 'jsonb' || col.data_type === 'json';
  const expr = isJson
    ? `"${col.column_name}"::text LIKE $1`
    : `"${col.column_name}" LIKE $1`;
  const sql = `SELECT "${col.column_name}"::text AS val FROM public."${col.table_name}" WHERE ${expr} LIMIT 1`;
  try {
    const { rows } = await query<{ val: string } & QueryResultRow>(sql, [`%${token}%`]);
    const raw = rows[0]?.val;
    if (!raw) return null;
    return raw.length > 120 ? raw.slice(0, 117) + '...' : raw;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log('🔍 Audit FTP path rebrand — scanning all public text/jsonb columns…\n');

  const cols = await listTextColumns();
  console.log(`Scanned ${cols.length} columns across public schema.\n`);

  const results: AuditResult[] = [];
  for (const col of cols) {
    const videoCount = await countLegacyRefs(col, LEGACY_VIDEO_TOKEN);
    const updateCount = await countLegacyRefs(col, LEGACY_UPDATE_TOKEN);
    if (videoCount === 0 && updateCount === 0) continue;
    const token = videoCount >= updateCount ? LEGACY_VIDEO_TOKEN : LEGACY_UPDATE_TOKEN;
    const sample = await fetchSample(col, token);
    results.push({
      table: col.table_name,
      column: col.column_name,
      type: col.data_type,
      legacyVideoCount: videoCount,
      legacyUpdateCount: updateCount,
      sampleValue: sample,
    });
  }

  results.sort((a, b) =>
    b.legacyVideoCount + b.legacyUpdateCount - (a.legacyVideoCount + a.legacyUpdateCount),
  );

  if (results.length === 0) {
    console.log('✅ Aucune row ne référence neopro-video/ ou neopro-update/.\n');
    console.log('La migration FTP peut se faire uniquement via changement env vars Railway.');
    await pool.end();
    return;
  }

  console.log('Rows impactées par la migration FTP :\n');
  console.log(
    'table.column'.padEnd(50),
    'type'.padEnd(12),
    'video'.padEnd(7),
    'update'.padEnd(7),
    'sample',
  );
  console.log('─'.repeat(110));

  let totalVideo = 0;
  let totalUpdate = 0;
  for (const r of results) {
    console.log(
      `${r.table}.${r.column}`.padEnd(50),
      r.type.padEnd(12),
      String(r.legacyVideoCount).padEnd(7),
      String(r.legacyUpdateCount).padEnd(7),
      r.sampleValue ?? '(no sample)',
    );
    totalVideo += r.legacyVideoCount;
    totalUpdate += r.legacyUpdateCount;
  }

  console.log('─'.repeat(110));
  console.log(`TOTAL : ${totalVideo} rows neopro-video + ${totalUpdate} rows neopro-update`);
  console.log(`\nProchaine étape : exécuter migrate-ftp-paths-to-madxp.sql une fois que :`);
  console.log(`  1. Daisy a copié les fichiers FTP /neopro-video/* → /madxp-video/*`);
  console.log(`  2. Daisy a copié /neopro-update/* → /madxp-update/*`);
  console.log(`  3. Les env vars Railway FTP_PUBLIC_URL et FTP_UPDATE_PUBLIC_URL pointent sur madxp-*`);

  await pool.end();
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
