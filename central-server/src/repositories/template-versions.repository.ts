/**
 * ADR-106 — Template Versioning Repository
 *
 * Gère le cycle de vie des versions des templates v2 (data-driven studio) :
 *   - publish : draft → published, snapshot immutable des layers/slots/variants
 *   - fork    : published → nouveau template draft avec parent_template_id
 *   - listVersions / findVersion : lecture du snapshot pour résolution runtime
 *   - setDefaultVersion : rollback ou promote (pointe le slug par défaut sur une version)
 *
 * NB : la table `template_versions` est SÉPARÉE de la legacy `neopro_template_versions`
 * (ADR-054/055) qui ne snapshot que props_schema/default_props pour les templates v1.
 *
 * Refs : ADR-106 §2, migration `add-template-versioning-and-backgrounds.sql`.
 */

import type { QueryResultRow } from 'pg';
import { query, getClient } from '../config/database';
import logger from '../config/logger';

export type TemplateStatus = 'draft' | 'published' | 'archived';

export interface TemplateVersionSnapshot extends QueryResultRow {
  id: string;
  template_id: string;
  version: string;
  layers_snapshot: unknown[];
  text_fields_snapshot: unknown[];
  image_slots_snapshot: unknown[];
  variants_snapshot: unknown[];
  fonts_snapshot: unknown[];
  published_at: Date;
  published_by: string;
}

export interface ForkOptions {
  /** Version cible du fork. Doit être > version source (semver MAJOR.MINOR). */
  next_version: string;
  /** super_admin qui déclenche le fork. */
  forked_by: string;
}

class TemplateVersionsRepository {
  /**
   * Publie une version : passe le template draft → published + crée un snapshot
   * immutable de layers/text_fields/image_slots/variants.
   *
   * Refuse si :
   *   - Le template n'existe pas → null
   *   - Le template est déjà published → throw 'already_published'
   *   - La version est déjà snapshot (collision) → throw 'version_exists'
   */
  async publish(
    templateId: string,
    publishedBy: string
  ): Promise<TemplateVersionSnapshot | null> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const tplResult = (await client.query(
        `SELECT id, version, status FROM neopro_templates WHERE id = $1 FOR UPDATE`,
        [templateId]
      )) as { rows: { id: string; version: string; status: TemplateStatus }[] };
      if (tplResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const tpl = tplResult.rows[0];
      if (tpl.status === 'published') {
        await client.query('ROLLBACK');
        throw new Error('already_published');
      }

      // Snapshot des tables filles via row_to_json + agg.
      const snapshotResult = (await client.query(
        `INSERT INTO template_versions (
           template_id, version,
           layers_snapshot, text_fields_snapshot, image_slots_snapshot,
           variants_snapshot, fonts_snapshot,
           published_by
         )
         SELECT
           t.id,
           t.version,
           COALESCE(
             (SELECT jsonb_agg(row_to_json(l)::jsonb) FROM template_layers l WHERE l.template_id = t.id),
             '[]'::jsonb
           ),
           COALESCE(
             (SELECT jsonb_agg(row_to_json(tf)::jsonb) FROM template_text_fields tf WHERE tf.template_id = t.id),
             '[]'::jsonb
           ),
           COALESCE(
             (SELECT jsonb_agg(row_to_json(s)::jsonb) FROM template_image_slots s WHERE s.template_id = t.id),
             '[]'::jsonb
           ),
           COALESCE(
             (SELECT jsonb_agg(row_to_json(v)::jsonb) FROM template_variants v WHERE v.template_id = t.id),
             '[]'::jsonb
           ),
           '[]'::jsonb,
           $2
         FROM neopro_templates t
         WHERE t.id = $1
         RETURNING *`,
        [templateId, publishedBy]
      )) as { rows: TemplateVersionSnapshot[] };

      await client.query(
        `UPDATE neopro_templates
         SET status = 'published',
             published_at = NOW(),
             published_by = $2
         WHERE id = $1`,
        [templateId, publishedBy]
      );

      await client.query('COMMIT');
      logger.info('Template version published', {
        templateId,
        version: tpl.version,
        publishedBy,
      });
      return snapshotResult.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof Error && err.message === 'already_published') throw err;
      // Collision PK (template_id, version) sur snapshot → version_exists
      if (
        err instanceof Error &&
        /unique|duplicate key/i.test(err.message)
      ) {
        throw new Error('version_exists');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Crée une nouvelle ligne neopro_templates en "fork" du template source :
   *   - Copie name + composition_id + canvas + props_schema + default_props
   *   - parent_template_id = source.id
   *   - status = 'draft', version = next_version
   *   - Copie les tables filles (layers / text_fields / image_slots / variants)
   *
   * Refuse si :
   *   - Source introuvable ou non published → null
   *   - next_version <= version courante → throw 'invalid_version'
   *   - Un autre fork avec ce next_version existe déjà → throw 'fork_exists'
   */
  async fork(
    sourceTemplateId: string,
    options: ForkOptions
  ): Promise<{ id: string; version: string } | null> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const src = (await client.query(
        `SELECT id, version, status, name, composition_id, description,
                canvas_width, canvas_height, props_schema, default_props, site_id
         FROM neopro_templates
         WHERE id = $1 FOR UPDATE`,
        [sourceTemplateId]
      )) as { rows: { id: string; version: string; status: TemplateStatus }[] };
      if (src.rows.length === 0 || src.rows[0].status !== 'published') {
        await client.query('ROLLBACK');
        return null;
      }
      const source = src.rows[0];
      if (!isVersionGreater(options.next_version, source.version)) {
        await client.query('ROLLBACK');
        throw new Error('invalid_version');
      }

      // Vérifie qu'aucun fork existant n'a déjà cette version (même parent_template_id).
      const dup = (await client.query(
        `SELECT id FROM neopro_templates
         WHERE parent_template_id = $1 AND version = $2
         LIMIT 1`,
        [sourceTemplateId, options.next_version]
      )) as { rows: { id: string }[] };
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        throw new Error('fork_exists');
      }

      const newTpl = (await client.query(
        `INSERT INTO neopro_templates
           (name, composition_id, description, canvas_width, canvas_height,
            props_schema, default_props, site_id,
            version, status, parent_template_id, schema_version)
         SELECT name, composition_id, description, canvas_width, canvas_height,
                props_schema, default_props, site_id,
                $2, 'draft', id,
                COALESCE(schema_version, 2)
         FROM neopro_templates WHERE id = $1
         RETURNING id`,
        [sourceTemplateId, options.next_version]
      )) as { rows: { id: string }[] };
      const newId = newTpl.rows[0].id;

      // Copie tables filles (layers / text_fields / image_slots / variants).
      // Lecture dynamique des colonnes depuis information_schema → future-proof
      // contre les ajouts de colonnes (text_transform, auto_crop, etc.).
      for (const table of ['template_layers', 'template_text_fields', 'template_image_slots', 'template_variants']) {
        const cols = await listChildTableColumns(client, table);
        if (cols.length === 0) continue;
        // Whitelist défensive (col names déjà filtrés par information_schema, mais
        // on ré-applique \w pour blinder contre toute injection théorique).
        const safe = cols.filter((c) => /^[a-z_][a-z0-9_]*$/.test(c)).join(', ');
        await client.query(
          `INSERT INTO ${table} (template_id, ${safe})
           SELECT $2, ${safe} FROM ${table} WHERE template_id = $1`,
          [sourceTemplateId, newId]
        );
      }

      await client.query('COMMIT');
      logger.info('Template forked', {
        sourceId: sourceTemplateId,
        newId,
        nextVersion: options.next_version,
        forkedBy: options.forked_by,
      });
      return { id: newId, version: options.next_version };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Liste les versions snapshot d'un template, plus récente d'abord. */
  async listByTemplate(templateId: string): Promise<TemplateVersionSnapshot[]> {
    const result = await query<TemplateVersionSnapshot>(
      `SELECT * FROM template_versions
       WHERE template_id = $1
       ORDER BY published_at DESC`,
      [templateId]
    );
    return result.rows;
  }

  /** Lit un snapshot précis (template_id + version). Source de vérité runtime. */
  async findVersion(
    templateId: string,
    version: string
  ): Promise<TemplateVersionSnapshot | null> {
    const result = await query<TemplateVersionSnapshot>(
      `SELECT * FROM template_versions
       WHERE template_id = $1 AND version = $2
       LIMIT 1`,
      [templateId, version]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Promote (ou rollback) : pointe la version `current` du template sur une
   * version snapshot existante. Permet aussi le rollback v1.1 → v1.0.
   *
   * Met simplement à jour neopro_templates.version (la résolution runtime
   * lira ensuite template_versions avec cette version).
   */
  async setDefaultVersion(
    templateId: string,
    version: string
  ): Promise<{ template_id: string; version: string } | null> {
    const snap = await this.findVersion(templateId, version);
    if (!snap) return null;

    const result = await query<{ id: string; version: string }>(
      `UPDATE neopro_templates
       SET version = $2
       WHERE id = $1
       RETURNING id, version`,
      [templateId, version]
    );
    if (result.rows.length === 0) return null;

    logger.info('Template default_version updated', { templateId, version });
    return { template_id: result.rows[0].id, version: result.rows[0].version };
  }
}

/**
 * Compare 2 semver MAJOR.MINOR. Retourne true si a > b.
 * Refuse les versions mal formées (sécurité).
 */
function isVersionGreater(a: string, b: string): boolean {
  const ra = /^(\d+)\.(\d+)$/.exec(a);
  const rb = /^(\d+)\.(\d+)$/.exec(b);
  if (!ra || !rb) return false;
  const [aMaj, aMin] = [Number(ra[1]), Number(ra[2])];
  const [bMaj, bMin] = [Number(rb[1]), Number(rb[2])];
  if (aMaj !== bMaj) return aMaj > bMaj;
  return aMin > bMin;
}

/**
 * Liste les colonnes d'une table fille à copier au fork.
 * Exclut les colonnes auto-gérées (id, template_id, created_at).
 * Lit depuis information_schema → resilient aux migrations futures.
 */
async function listChildTableColumns(
  client: { query: (q: string, p?: unknown[]) => Promise<{ rows: { column_name: string }[] }> },
  tableName: string
): Promise<string[]> {
  const EXCLUDED = new Set(['id', 'template_id', 'created_at']);
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return result.rows.map((r) => r.column_name).filter((c) => !EXCLUDED.has(c));
}

export const templateVersionsRepository = new TemplateVersionsRepository();
