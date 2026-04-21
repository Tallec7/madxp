/**
 * ADR-075 V3 Phase D — Club template quota service.
 *
 * Deux plafonds pour le tier premium :
 *   - CLUB_TEMPLATE_LIMIT  = 3   (templates scopés au site du club)
 *   - CLUB_RENDER_DAILY_LIMIT = 10 (renders enqueued par tranche de 24h glissante)
 *
 * Les quotas s'appuient sur les tables existantes (`neopro_templates.site_id`,
 * `remotion_render_jobs.requested_for_site_id`) — pas de table dédiée pour
 * éviter une migration supplémentaire.
 */

import { remotionTemplatesRepository } from '../repositories/remotion-templates.repository';
import { remotionRenderJobRepository } from '../repositories/remotion-render-job.repository';

export const CLUB_TEMPLATE_LIMIT = 3;
export const CLUB_RENDER_DAILY_LIMIT = 10;

export interface ClubTemplateQuota {
  templates: { used: number; limit: number; remaining: number };
  renders: { used: number; limit: number; remaining: number; windowHours: 24 };
}

export const clubTemplateQuotaService = {
  async getQuotaFor(siteId: string): Promise<ClubTemplateQuota> {
    const [templatesUsed, rendersUsed] = await Promise.all([
      remotionTemplatesRepository.countOwnedBySite(siteId),
      remotionRenderJobRepository.countRendersLast24h(siteId),
    ]);
    return {
      templates: {
        used: templatesUsed,
        limit: CLUB_TEMPLATE_LIMIT,
        remaining: Math.max(0, CLUB_TEMPLATE_LIMIT - templatesUsed),
      },
      renders: {
        used: rendersUsed,
        limit: CLUB_RENDER_DAILY_LIMIT,
        remaining: Math.max(0, CLUB_RENDER_DAILY_LIMIT - rendersUsed),
        windowHours: 24,
      },
    };
  },

  async assertRenderAllowed(siteId: string): Promise<{ ok: true } | { ok: false; quota: ClubTemplateQuota }> {
    const quota = await this.getQuotaFor(siteId);
    if (quota.renders.remaining <= 0) return { ok: false, quota };
    return { ok: true };
  },
};
