import dotenv from 'dotenv';
import { query } from '../config/database';
import { logger } from '../utils/logger';

dotenv.config();

/**
 * ADR-075 V2 Sprint 7a — Seed d'un template white-glove pour démo.
 *
 * Usage :
 *   npx ts-node src/scripts/seed-white-glove-template.ts [siteId]
 *
 * Si `siteId` n'est pas fourni, utilise le premier site Premium trouvé
 * (ou le premier site tout court en fallback).
 *
 * Le template est scopé à ce site (`site_id = $1`) — visible seulement
 * par admins/super_admins et users du site en question, rendu gated
 * par le feature flag `template_studio_club_scoped`.
 */

interface SiteRow {
  id: string;
  site_name: string;
  subscription_plan: string | null;
}

const DEMO_TEMPLATE = {
  name: 'Démo White-Glove Club',
  composition_id: 'ButSimple',
  description:
    'Template perso club (ADR-075 V2) — personnalisation white-glove, réservée au tier Premium.',
  props_schema: {
    type: 'object',
    properties: {
      scorer: { type: 'string', title: 'Buteur' },
      minute: { type: 'number', title: 'Minute' },
    },
    required: ['scorer'],
  },
  default_props: {
    scorer: 'Joueur Club',
    minute: 42,
  },
  published: true,
};

async function pickTargetSite(override?: string): Promise<SiteRow> {
  if (override) {
    const result = await query<SiteRow>(
      'SELECT id, site_name, subscription_plan FROM sites WHERE id = $1',
      [override],
    );
    if (result.rows.length === 0) {
      throw new Error(`Site ${override} introuvable`);
    }
    return result.rows[0];
  }

  const premium = await query<SiteRow>(
    `SELECT id, site_name, subscription_plan
     FROM sites
     WHERE subscription_plan = 'premium'
     ORDER BY created_at ASC
     LIMIT 1`,
  );
  if (premium.rows.length > 0) return premium.rows[0];

  const fallback = await query<SiteRow>(
    `SELECT id, site_name, subscription_plan
     FROM sites
     ORDER BY created_at ASC
     LIMIT 1`,
  );
  if (fallback.rows.length === 0) {
    throw new Error('Aucun site en base — seed un site avant de lancer ce script.');
  }
  return fallback.rows[0];
}

async function main(): Promise<void> {
  const siteIdArg = process.argv[2];
  const site = await pickTargetSite(siteIdArg);

  logger.info('Seed white-glove template', {
    siteId: site.id,
    siteName: site.site_name,
    plan: site.subscription_plan ?? 'free',
  });

  const existing = await query<{ id: string }>(
    `SELECT id FROM neopro_templates WHERE name = $1 AND site_id = $2 LIMIT 1`,
    [DEMO_TEMPLATE.name, site.id],
  );

  if (existing.rows.length > 0) {
    logger.info('Template déjà présent, skip', { templateId: existing.rows[0].id });
    return;
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO neopro_templates
       (name, composition_id, description, props_schema, default_props, published, site_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      DEMO_TEMPLATE.name,
      DEMO_TEMPLATE.composition_id,
      DEMO_TEMPLATE.description,
      JSON.stringify(DEMO_TEMPLATE.props_schema),
      JSON.stringify(DEMO_TEMPLATE.default_props),
      DEMO_TEMPLATE.published,
      site.id,
    ],
  );

  logger.info('Template white-glove créé', {
    templateId: inserted.rows[0].id,
    siteId: site.id,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Seed white-glove template failed', { error: err });
    process.exit(1);
  });
