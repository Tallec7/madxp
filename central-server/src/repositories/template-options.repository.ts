/**
 * Template Options Repository — capabilities moteur PDF JOUEUR.
 *
 * Couvre 2 entités :
 *   - template_options : options template-level (intro_mode, packshot, etc.)
 *   - template_packshot_refs : packshot pluggable (référence vers AUTRE template)
 *
 * Refs : PDF Specs Animation Joueur §démarrage, SPEC famille JOUEUR §3.
 */

import type { QueryResultRow } from 'pg';
import { query } from '../config/database';

export type TemplateOptionType = 'enum' | 'boolean';

export interface TemplateOption extends QueryResultRow {
  id: string;
  template_id: string;
  key: string;
  label: string;
  type: TemplateOptionType;
  values: unknown[];
  default_value: string;
  user_editable: boolean;
  sort_order: number;
  created_at: Date;
}

export interface CreateOptionInput {
  template_id: string;
  key: string;
  label: string;
  type?: TemplateOptionType;
  values: unknown[];
  default_value: string;
  user_editable?: boolean;
  sort_order?: number;
}

export interface TemplatePackshotRef extends QueryResultRow {
  id: string;
  template_id: string;
  option_key: string;
  option_value: string;
  packshot_template_id: string;
  start_at_ms: number;
  z_index_offset: number;
  created_at: Date;
}

export interface CreatePackshotRefInput {
  template_id: string;
  option_key: string;
  option_value: string;
  packshot_template_id: string;
  start_at_ms?: number;
  z_index_offset?: number;
}

class TemplateOptionsRepository {
  /** Liste les options d'un template, ordre stable. */
  async listOptions(templateId: string): Promise<TemplateOption[]> {
    const result = await query<TemplateOption>(
      `SELECT * FROM template_options
       WHERE template_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [templateId]
    );
    return result.rows;
  }

  async createOption(input: CreateOptionInput): Promise<TemplateOption> {
    const result = await query<TemplateOption>(
      `INSERT INTO template_options
         (template_id, key, label, type, values, default_value, user_editable, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.template_id,
        input.key,
        input.label,
        input.type ?? 'enum',
        JSON.stringify(input.values),
        input.default_value,
        input.user_editable ?? true,
        input.sort_order ?? 0,
      ]
    );
    return result.rows[0];
  }

  async deleteOption(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM template_options WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Liste les packshot refs d'un template parent. */
  async listPackshotRefs(templateId: string): Promise<TemplatePackshotRef[]> {
    const result = await query<TemplatePackshotRef>(
      `SELECT * FROM template_packshot_refs WHERE template_id = $1`,
      [templateId]
    );
    return result.rows;
  }

  async createPackshotRef(input: CreatePackshotRefInput): Promise<TemplatePackshotRef> {
    const result = await query<TemplatePackshotRef>(
      `INSERT INTO template_packshot_refs
         (template_id, option_key, option_value, packshot_template_id, start_at_ms, z_index_offset)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.template_id,
        input.option_key,
        input.option_value,
        input.packshot_template_id,
        input.start_at_ms ?? 0,
        input.z_index_offset ?? 100,
      ]
    );
    return result.rows[0];
  }

  async deletePackshotRef(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM template_packshot_refs WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Résout le packshot effectif pour un template + une combinaison d'options.
   * Retourne null si aucun packshot ne correspond.
   *
   * Utilisé au moment du render pour décider quelle couche packshot empiler.
   */
  async resolvePackshot(
    templateId: string,
    selectedOptions: Record<string, string>
  ): Promise<TemplatePackshotRef | null> {
    const refs = await this.listPackshotRefs(templateId);
    for (const ref of refs) {
      if (selectedOptions[ref.option_key] === ref.option_value) {
        return ref;
      }
    }
    return null;
  }
}

export const templateOptionsRepository = new TemplateOptionsRepository();
