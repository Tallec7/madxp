/**
 * RemotePreferencesRepository — ADR-102.
 *
 * Persistance des préférences UX télécommande (Remote V2) par (site, profil).
 *
 * - `prefs` : haptics, highContrast, lockRotation, fontSize, layoutMobile,
 *   layoutDesktop. Default défini côté frontend (cf. RemotePreferencesService).
 * - `widgets` : score / chrono / breaking — flags d'activation.
 *
 * Les `recents` (vidéos récentes) NE PASSENT PAS par cette table : volume +
 * privacy device-local justifient le maintien en localStorage non-synchronisé.
 *
 * Smoke test enforced :
 *   - Repository utilisé par saas.controller (pas de query() direct).
 *   - Pas d'`import "../config/database"` dans les controllers.
 */
import { QueryResultRow } from 'pg';
import { query } from '../config/database';

export interface RemotePreferencesRow extends QueryResultRow {
  site_id: string;
  profile_id: string;
  prefs: Record<string, unknown>;
  widgets: Record<string, unknown>;
  updated_at: Date;
}

class RemotePreferencesRepositoryImpl {
  /**
   * Charge la ligne (site, profil) ou null si jamais sauvegardée.
   * Le frontend applique les defaults côté client si null.
   */
  async findBySiteAndProfile(
    siteId: string,
    profileId: string,
  ): Promise<RemotePreferencesRow | null> {
    const result = await query<RemotePreferencesRow>(
      `SELECT site_id, profile_id, prefs, widgets, updated_at
       FROM remote_preferences
       WHERE site_id = $1 AND profile_id = $2
       LIMIT 1`,
      [siteId, profileId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Upsert atomique : INSERT ON CONFLICT DO UPDATE merge les deux clés
   * indépendamment. Permet au frontend de PATCHer un seul des deux objets
   * sans craindre d'écraser l'autre (last-write-wins par clé entière).
   */
  async upsert(
    siteId: string,
    profileId: string,
    payload: { prefs?: Record<string, unknown>; widgets?: Record<string, unknown> },
  ): Promise<RemotePreferencesRow> {
    const prefsJson = payload.prefs ? JSON.stringify(payload.prefs) : null;
    const widgetsJson = payload.widgets ? JSON.stringify(payload.widgets) : null;

    const result = await query<RemotePreferencesRow>(
      `INSERT INTO remote_preferences (site_id, profile_id, prefs, widgets, updated_at)
       VALUES (
         $1, $2,
         COALESCE($3::jsonb, '{}'::jsonb),
         COALESCE($4::jsonb, '{}'::jsonb),
         NOW()
       )
       ON CONFLICT (site_id, profile_id) DO UPDATE
       SET prefs = COALESCE($3::jsonb, remote_preferences.prefs),
           widgets = COALESCE($4::jsonb, remote_preferences.widgets),
           updated_at = NOW()
       RETURNING site_id, profile_id, prefs, widgets, updated_at`,
      [siteId, profileId, prefsJson, widgetsJson],
    );
    return result.rows[0];
  }
}

export const remotePreferencesRepository = new RemotePreferencesRepositoryImpl();
