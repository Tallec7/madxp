/**
 * Templates Studio V1 — seed des manifests au boot de l'API.
 *
 * Spec : studio-template/templates-remotion/spec/STUDIO_V1.md §5
 *
 * Scanne `src/scripts/templates-studio-manifests/*.json`, valide la forme
 * minimale, puis upsert dans `template_definitions` via le repository.
 *
 * Pas idempotent par version : le `ON CONFLICT (slug)` du repo écrase la row
 * existante (bump version + manifest). C'est volontaire — le designer modifie
 * le fichier source, on resync à chaque boot, pas de drift silencieux.
 *
 * Désactivation des slugs disparus : si un manifest est supprimé du dossier,
 * la row correspondante en DB est passée en `is_active = false` (les FK
 * `render_requests.template_id` restent valides pour les renders historiques).
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../config/logger';
import { query } from '../config/database';
import {
  templateDefinitionRepository,
  type TemplateKind,
} from '../repositories';

const MANIFESTS_DIR = path.join(__dirname, 'templates-studio-manifests');

interface ManifestFile {
  id: string;
  version: string;
  label: string;
  description?: string;
  kind: TemplateKind;
  compositionId: string;
  inputSchema?: unknown;
  bindings?: unknown;
  format?: unknown;
}

function isManifestFile(value: unknown): value is ManifestFile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.version === 'string' &&
    typeof v.label === 'string' &&
    (v.kind === 'video' || v.kind === 'still') &&
    typeof v.compositionId === 'string'
  );
}

export async function seedTemplatesStudioManifests(): Promise<{
  seeded: number;
  deactivated: number;
}> {
  if (!fs.existsSync(MANIFESTS_DIR)) {
    logger.warn('templates-studio: manifests dir not found, skipping seed', {
      dir: MANIFESTS_DIR,
    });
    return { seeded: 0, deactivated: 0 };
  }

  const files = fs
    .readdirSync(MANIFESTS_DIR)
    .filter((f) => f.endsWith('.json'));

  const seededSlugs = new Set<string>();
  let seeded = 0;

  for (const filename of files) {
    const filepath = path.join(MANIFESTS_DIR, filename);
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch (error) {
      logger.error('templates-studio: invalid JSON in manifest', {
        filename,
        error,
      });
      continue;
    }
    if (!isManifestFile(parsed)) {
      logger.error('templates-studio: manifest missing required fields', {
        filename,
        keys: Object.keys((parsed as object) ?? {}),
      });
      continue;
    }

    try {
      await templateDefinitionRepository.upsertFromManifest({
        slug: parsed.id,
        version: parsed.version,
        label: parsed.label,
        description: parsed.description ?? null,
        kind: parsed.kind,
        manifest_json: parsed as unknown as Record<string, unknown>,
        remotion_composition_id: parsed.compositionId,
      });
      seededSlugs.add(parsed.id);
      seeded += 1;
    } catch (error) {
      logger.error('templates-studio: upsert failed', {
        slug: parsed.id,
        error,
      });
    }
  }

  // Deactivate any slug previously seeded but absent from the current dir.
  // Pas via le repo (pas de méthode dédiée) — UPDATE direct, c'est un script
  // de bootstrap qui peut tutoyer la DB.
  let deactivated = 0;
  if (seededSlugs.size > 0) {
    const result = await query<{ slug: string }>(
      `UPDATE template_definitions
       SET is_active = FALSE, updated_at = NOW()
       WHERE is_active = TRUE
         AND slug NOT IN (${Array.from(seededSlugs)
           .map((_, i) => `$${i + 1}`)
           .join(', ')})
       RETURNING slug`,
      Array.from(seededSlugs),
    );
    deactivated = result.rowCount ?? 0;
    if (deactivated > 0) {
      logger.warn('templates-studio: deactivated slugs missing from manifests dir', {
        slugs: result.rows.map((r) => r.slug),
      });
    }
  }

  logger.info('templates-studio: manifests seeded', { seeded, deactivated });
  return { seeded, deactivated };
}

// CLI mode : `npx ts-node src/scripts/seed-templates-studio-manifests.ts`
// Pratique pour run le seed à la main sans booter toute l'API.
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  seedTemplatesStudioManifests()
    .then((res) => {
      // eslint-disable-next-line no-console
      console.log('seed done', res);
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('seed failed', err);
      process.exit(1);
    });
}
