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
  /** Présent seulement sur `findActiveForSite` : rattachement via `site_videos`. */
  linked_in_library?: boolean;
  /** Présent seulement sur `findActiveForSite` : rattachement via un profil de config. */
  referenced_in_config?: boolean;
}

class VideoFtpAuditRepository {
  /**
   * Liste toutes les warnings actives, enrichies avec le nom du fichier et
   * le nombre de sites qui référencent encore la vidéo (impact métier).
   *
   * `reference_count` compte les sites rattachés **par la bibliothèque OU par une
   * config**. Il ne comptait que `site_videos`, donc renvoyait 0 pour 48 des 51
   * lignes de prod : le tri « impact décroissant » rangeait les sponsors facturés
   * réellement diffusés en bas de liste, derrière des orphelines sans effet.
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
         (SELECT COUNT(*)::int FROM sites s
            WHERE EXISTS (SELECT 1 FROM site_videos sv
                          WHERE sv.video_id = w.video_id AND sv.site_id = s.id)
               OR EXISTS (SELECT 1 FROM config_profiles cp
                          WHERE cp.site_id = s.id
                            AND (strpos(cp.configuration::text, v.filename) > 0
                                 OR (v.original_name IS NOT NULL
                                     AND strpos(cp.configuration::text, v.original_name) > 0)))
         ) AS reference_count
       FROM video_ftp_audit_warnings w
       JOIN videos v ON v.id = w.video_id
       ORDER BY reference_count DESC, w.first_detected_at ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  /**
   * Prédicat « ce fichier absent concerne ce site » — bibliothèque OU diffusion.
   *
   * ## Pourquoi l'union, et pas `site_videos` seul
   *
   * `site_videos` est alimentée à l'upload ciblé et au déploiement (ADR-048) : une
   * config copiée d'un autre club ou importée n'y laisse rien. Mesuré en prod le
   * 2026-08-11, elle ne voyait que **3 des 51 lignes** de la table. Le badge du tab
   * « Contenu » affichait donc **0 pour Mangin-Beaulieu (NLF) qui en diffusait 17**,
   * et 1 pour Lanester qui en diffusait 15. Le tableau de bord ne se taisait pas :
   * il rassurait. C'est le même constat qui a motivé l'alerting de la PR #1165 ;
   * ici on le porte à la restitution qui reste, elle, branchée sur la pivot.
   *
   * ## Pourquoi pas la config seule non plus
   *
   * Ce serait le symétrique de la même erreur. Une vidéo assignée en bibliothèque
   * mais pas encore dans la boucle plantera quand même si la télécommande la
   * déclenche — ce que le texte de la bannière annonce explicitement.
   *
   * ## Détails SQL qui comptent
   *
   * - `strpos()` et non `LIKE` : les noms de fichiers sont pleins de `_`, qui est un
   *   joker « n'importe quel caractère » en LIKE. `LIKE '%TV_PART03%'` matcherait
   *   `TVxPART03`. `strpos()` cherche une sous-chaîne littérale, sans échappement.
   * - `filename` **ET** `original_name` : la config référence le nom d'origine
   *   (`TV_PART03_SPORT&WELNESS.mp4`) là où `storage_path` porte le nom assaini
   *   (`TV_PART03_SPORTWELNESS.mp4`). Ne tester que l'un des deux rate une part
   *   du parc.
   */
  private static readonly LINKED_TO_SITE = `(
    EXISTS (SELECT 1 FROM site_videos sv WHERE sv.video_id = w.video_id AND sv.site_id = $1)
    OR EXISTS (
      SELECT 1 FROM config_profiles cp
      WHERE cp.site_id = $1
        AND (strpos(cp.configuration::text, v.filename) > 0
             OR (v.original_name IS NOT NULL AND strpos(cp.configuration::text, v.original_name) > 0))
    )
  )`;

  /**
   * Compte les fichiers absents rattachés à ce site (bibliothèque OU diffusion).
   * Source du badge tab « Contenu » sur `/sites/:id`.
   */
  async countActiveForSite(siteId: string): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT w.video_id)::int AS count
       FROM video_ftp_audit_warnings w
       JOIN videos v ON v.id = w.video_id
       WHERE ${VideoFtpAuditRepository.LINKED_TO_SITE}`,
      [siteId],
    );
    return parseInt(String(result.rows[0]?.count || '0'), 10) || 0;
  }

  /**
   * Liste les fichiers absents rattachés à ce site (bibliothèque OU diffusion).
   *
   * Alimente la bannière du tab « Contenu » **et** sert de garde à
   * `unlinkSiteFtpOrphan`. Ce double usage rend l'union nécessaire : l'endpoint
   * d'unlink purge déjà le JSONB des profils et le mirror (son
   * `DELETE FROM site_videos` n'est qu'une de ses étapes, no-op sans lien), mais sa
   * garde refusait justement les vidéos référencées en config seule — les seules
   * que l'admin ne pouvait donc pas nettoyer.
   *
   * `linked_in_library` / `referenced_in_config` disent d'où vient le rattachement :
   * utile pour distinguer « assignée mais pas diffusée » de « diffusée sans
   * assignation », le cas majoritaire en prod.
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
         1 AS reference_count,
         EXISTS (SELECT 1 FROM site_videos sv WHERE sv.video_id = w.video_id AND sv.site_id = $1) AS linked_in_library,
         EXISTS (
           SELECT 1 FROM config_profiles cp
           WHERE cp.site_id = $1
             AND (strpos(cp.configuration::text, v.filename) > 0
                  OR (v.original_name IS NOT NULL AND strpos(cp.configuration::text, v.original_name) > 0))
         ) AS referenced_in_config
       FROM video_ftp_audit_warnings w
       JOIN videos v ON v.id = w.video_id
       WHERE ${VideoFtpAuditRepository.LINKED_TO_SITE}
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
