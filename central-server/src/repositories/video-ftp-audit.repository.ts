/**
 * Repository pour `video_ftp_audit_warnings` (PR2.2).
 * Détecte les videos.storage_path qui pointent vers un fichier FTP absent.
 */

import { query } from '../config/database';

export interface VideoFtpAuditWarning {
  [key: string]: unknown; // QueryResultRow index signature
  id: string;
  video_id: string;
  video_filename: string;
  video_category: string | null;
  storage_path: string;
  status: 'missing' | 'unreachable';
  http_status: number | null;
  first_detected_at: Date;
  last_checked_at: Date;
  notified_at: Date | null;
  reference_count: number;
}

class VideoFtpAuditRepository {
  /**
   * Liste toutes les warnings actives, enrichies avec le nom du fichier et
   * le nombre de sites qui référencent encore la vidéo (impact métier).
   */
  async findAllActive(limit = 200): Promise<VideoFtpAuditWarning[]> {
    const result = await query<VideoFtpAuditWarning>(
      `SELECT
         w.id,
         w.video_id,
         v.filename AS video_filename,
         v.category AS video_category,
         w.expected_path AS storage_path,
         w.status,
         w.http_status,
         w.first_detected_at,
         w.last_checked_at,
         w.notified_at,
         (SELECT COUNT(*)::int FROM site_videos sv WHERE sv.video_id = w.video_id) AS reference_count
       FROM video_ftp_audit_warnings w
       JOIN videos v ON v.id = w.video_id
       ORDER BY reference_count DESC, w.first_detected_at ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /**
   * Count active FTP orphans referenced by a specific site, via `site_videos`.
   * Source du badge tab "Contenu" sur `/sites/:id` (chantier vidéos manquantes) :
   * une orpheline référencée par ce site = vidéo qui plantera quand quelqu'un
   * tentera de la jouer côté TV.
   */
  async countActiveForSite(siteId: string): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT w.video_id)::int AS count
       FROM video_ftp_audit_warnings w
       JOIN site_videos sv ON sv.video_id = w.video_id
       WHERE sv.site_id = $1`,
      [siteId],
    );
    return parseInt(String(result.rows[0]?.count || '0'), 10) || 0;
  }

  /**
   * List active FTP orphan warnings for a specific site (joined via site_videos).
   * Alimente la bannière détaillée du tab "Contenu" sur `/sites/:id`.
   */
  async findActiveForSite(siteId: string, limit = 100): Promise<VideoFtpAuditWarning[]> {
    const result = await query<VideoFtpAuditWarning>(
      `SELECT
         w.id,
         w.video_id,
         v.filename AS video_filename,
         v.category AS video_category,
         w.expected_path AS storage_path,
         w.status,
         w.http_status,
         w.first_detected_at,
         w.last_checked_at,
         w.notified_at,
         1 AS reference_count
       FROM video_ftp_audit_warnings w
       JOIN videos v ON v.id = w.video_id
       JOIN site_videos sv ON sv.video_id = w.video_id
       WHERE sv.site_id = $1
       ORDER BY w.first_detected_at ASC
       LIMIT $2`,
      [siteId, limit],
    );
    return result.rows;
  }

  /**
   * Fichiers absents du FTP qui sont encore RÉFÉRENCÉS DANS UNE CONFIG diffusée,
   * groupés par site.
   *
   * ## Pourquoi pas `site_videos`
   *
   * `countActiveForSite` passe par `site_videos`, alimentée à l'upload ciblé et au
   * déploiement (ADR-048). Une config copiée d'un autre club, importée, ou établie
   * avant cette table n'y laisse aucune trace. Mesuré le 2026-08-11 : `site_videos`
   * ne voyait que **3** des 46 fichiers manquants, contre **16** par les configs —
   * zéro sur deux clubs Pi qui en diffusaient pourtant 12 et 10.
   *
   * Ce qui part vraiment à l'écran, c'est `config_profiles.configuration`. C'est
   * donc elle qui décide si un fichier absent est un incident ou un simple orphelin.
   *
   * ## Le LIKE est ancré, volontairement
   *
   * Les configs stockent soit `"videos/default/X.mp4"`, soit `"X.mp4"`. Un
   * `LIKE '%X.mp4%'` nu remonterait `TV_JINGLE_2MIN.mp4` quand on cherche
   * `2MIN.mp4` — un faux positif qui gonflerait l'alerte et la ferait ignorer.
   * On exige donc le guillemet ouvrant ou un `/` juste avant le nom.
   */
  async findMissingReferencedInProfiles(): Promise<
    Array<{ site_id: string; site_name: string; storage_paths: string[] }>
  > {
    const result = await query<{ site_id: string; site_name: string; storage_paths: string[] }>(
      `WITH paths AS (
         SELECT DISTINCT expected_path FROM video_ftp_audit_warnings WHERE status = 'missing'
       )
       SELECT s.id AS site_id,
              s.site_name,
              array_agg(DISTINCT p.expected_path ORDER BY p.expected_path) AS storage_paths
       FROM paths p
       JOIN config_profiles cp
         ON cp.configuration::text LIKE '%"' || p.expected_path || '"%'
         OR cp.configuration::text LIKE '%/' || p.expected_path || '"%'
       JOIN sites s ON s.id = cp.site_id
       GROUP BY s.id, s.site_name
       ORDER BY cardinality(array_agg(DISTINCT p.expected_path)) DESC`,
    );
    return result.rows;
  }

  /**
   * Horodate la notification des warnings dont le chemin vient d'être signalé.
   *
   * `notified_at` existait depuis l'origine sans qu'aucun code ne l'écrive : la
   * colonne promettait une restitution qui n'a jamais eu lieu. On la renseigne
   * pour que « détecté » et « signalé » cessent d'être confondus — c'est ce qui
   * permettra plus tard de repérer un incident détecté mais resté muet.
   */
  async markNotified(storagePaths: string[]): Promise<number> {
    if (storagePaths.length === 0) return 0;
    const result = await query(
      `UPDATE video_ftp_audit_warnings SET notified_at = NOW() WHERE expected_path = ANY($1::text[])`,
      [storagePaths],
    );
    return result.rowCount ?? 0;
  }

  async countActive(): Promise<{ missing: number; unreachable: number }> {
    const result = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::int AS count
       FROM video_ftp_audit_warnings
       GROUP BY status`,
    );
    const out = { missing: 0, unreachable: 0 };
    for (const row of result.rows) {
      if (row.status === 'missing') out.missing = parseInt(String(row.count), 10);
      else if (row.status === 'unreachable') out.unreachable = parseInt(String(row.count), 10);
    }
    return out;
  }
}

export const videoFtpAuditRepository = new VideoFtpAuditRepository();
