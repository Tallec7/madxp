import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { query } from '../config/database';
import logger from '../config/logger';
import { uploadAsset, getAssetUrl } from '../services/storage.service';

dotenv.config();

/**
 * ADR-075 — Backfill des assets V2 pour les templates legacy ButSimple / ButImgJoueur.
 *
 * Contexte : la migration `seed-but-simple-but-img-joueur-v2-shadow.sql` crée les
 * lignes `template_variants` et `template_text_fields` / `template_image_slots`
 * mais laisse `background_video_url = ''` et zéro layer. En V1, le runtime
 * `resolveAsset()` fallback sur `staticFile(...)` pour lire les .webm bundlés ;
 * en V2 data-driven, la runtime exige des URLs http/blob/data → preview noir.
 *
 * Ce script upload une seule fois les .webm de `templates-remotion/public/`
 * vers FTP sous `template-assets/studio/legacy/`, puis seed :
 *   - `template_variants.background_video_url` ← fragment A
 *   - `template_layers[]` ← fragments B, C, D, E (ordre Z par ordre alphabétique)
 *
 * Idempotent : ne ré-upload que si l'URL n'est pas déjà dans la DB.
 *
 * Usage :
 *   npx ts-node src/scripts/backfill-legacy-templates-v2-assets.ts
 *   npm run db:backfill-legacy-templates-v2
 */

interface LegacyTemplate {
  compositionId: string;
  label: string;
  fragments: string[];
}

const LEGACY_TEMPLATES: LegacyTemplate[] = [
  {
    compositionId: 'ButSimple',
    label: 'ButSimple',
    fragments: ['BUT_simple_A.webm', 'BUT_simple_B.webm', 'BUT_simple_C.webm'],
  },
  {
    compositionId: 'ButImgJoueur',
    label: 'ButImgJoueur',
    fragments: [
      'BUT_img_joueur_A.webm',
      'BUT_img_joueur_B.webm',
      'BUT_img_joueur_C.webm',
      'BUT_img_joueur_D.webm',
      'BUT_img_joueur_E.webm',
    ],
  },
];

const PUBLIC_DIR = path.join(__dirname, '../../../templates-remotion/public');
const FTP_PREFIX = 'template-assets/studio/legacy';

async function ftpPathForFragment(fragment: string): Promise<string> {
  return `${FTP_PREFIX}/${fragment}`;
}

async function uploadIfNeeded(
  fragment: string,
  existingUrls: Set<string>,
): Promise<string> {
  const storagePath = await ftpPathForFragment(fragment);
  const expectedUrl = getAssetUrl(storagePath);
  if (existingUrls.has(expectedUrl)) {
    logger.info('Backfill: fragment déjà uploadé', { fragment, url: expectedUrl });
    return expectedUrl;
  }
  const filePath = path.join(PUBLIC_DIR, fragment);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fragment bundlé introuvable: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  const result = await uploadAsset(buffer, storagePath, 'video/webm');
  if (!result) {
    throw new Error(`Upload FTP échoué pour ${fragment}`);
  }
  logger.info('Backfill: fragment uploadé', { fragment, url: expectedUrl });
  return expectedUrl;
}

async function backfillTemplate(legacy: LegacyTemplate): Promise<void> {
  const tpl = await query<{ id: string; schema_version: number }>(
    `SELECT id, schema_version FROM neopro_templates WHERE composition_id = $1 LIMIT 1`,
    [legacy.compositionId],
  );
  if (tpl.rows.length === 0) {
    logger.warn('Backfill: template introuvable en DB', { composition: legacy.compositionId });
    return;
  }
  const templateId = tpl.rows[0].id;

  const existing = await query<{ url: string }>(
    `SELECT background_video_url AS url FROM template_variants WHERE template_id = $1
     UNION ALL
     SELECT video_url AS url FROM template_layers WHERE template_id = $1`,
    [templateId],
  );
  const existingUrls = new Set(existing.rows.map((r) => r.url).filter(Boolean));

  const urls: string[] = [];
  for (const fragment of legacy.fragments) {
    urls.push(await uploadIfNeeded(fragment, existingUrls));
  }

  // Fragment A → background de la première variante (créée par seed-but-simple-but-img-joueur-v2-shadow.sql).
  const [bgUrl, ...layerUrls] = urls;
  const updated = await query(
    `UPDATE template_variants
       SET background_video_url = $1
     WHERE template_id = $2 AND (background_video_url IS NULL OR background_video_url = '')
     RETURNING id`,
    [bgUrl, templateId],
  );
  logger.info('Backfill: variants mis à jour', {
    composition: legacy.compositionId,
    count: updated.rowCount,
  });

  // Layers B..E → un row template_layers par fragment, z-index incrémental.
  // Ne pas écraser des layers existants (idempotence).
  const existingLayersCount = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM template_layers WHERE template_id = $1`,
    [templateId],
  );
  if (parseInt(existingLayersCount.rows[0].count, 10) > 0) {
    logger.info('Backfill: layers déjà présents, skip', { composition: legacy.compositionId });
    return;
  }

  for (let i = 0; i < layerUrls.length; i++) {
    const zIndex = i + 1;
    const name = legacy.fragments[i + 1].replace(/\.webm$/i, '');
    await query(
      `INSERT INTO template_layers (template_id, name, video_url, z_index, mask_top, mask_bottom, mask_left, mask_right)
       VALUES ($1, $2, $3, $4, 0, 0, 0, 0)`,
      [templateId, name, layerUrls[i], zIndex],
    );
  }
  logger.info('Backfill: layers insérés', {
    composition: legacy.compositionId,
    count: layerUrls.length,
  });
}

async function main(): Promise<void> {
  logger.info('Backfill legacy templates V2 assets — start');
  for (const legacy of LEGACY_TEMPLATES) {
    try {
      await backfillTemplate(legacy);
    } catch (error) {
      logger.error('Backfill: échec template', {
        composition: legacy.compositionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.info('Backfill legacy templates V2 assets — done');
  process.exit(0);
}

main().catch((error) => {
  logger.error('Backfill fatal', { error });
  process.exit(1);
});
