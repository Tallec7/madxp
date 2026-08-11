/**
 * Service d'audit FTP des vidéos.
 *
 * Vérifie que chaque `videos.storage_path` pointe vers un fichier qui existe
 * réellement sur le FTP Hostinger. Détecte les anomalies que la cascade DELETE
 * ne couvre pas : fichiers supprimés directement sur le FTP (FileZilla / SSH),
 * ou uploads qui n'ont jamais réussi côté FTP malgré la création de la row DB.
 *
 * Cause racine de l'incident PR #613 (vidéo `acff5e34` morte sur SaaS) — la
 * cascade backend (PR2) ne couvre que les suppressions API. Cette défense-ci
 * couvre les manipulations hors API.
 *
 * Appelé par le CRON `video_ftp_audit` (quotidien 03:00).
 */

import { query } from '../config/database';
import { getVideoUrl } from './storage.service';
import metricsService from './metrics.service';
import logger from '../config/logger';
import { alertRepository, videoFtpAuditRepository } from '../repositories';

const PROBE_TIMEOUT_MS = 15000;
const FALLBACK_DELAY_MS = 2000;

/** Type d'alerte des vidéos programmées absentes du stockage. */
const MISSING_VIDEO_ALERT_TYPE = 'video_missing_on_storage';

/** Au-delà, le message devient illisible — la liste complète va dans `metadata`. */
const MAX_PATHS_IN_MESSAGE = 5;

interface ProbeResult {
  reachable: boolean;
  notFound: boolean;
  httpStatus: number | null;
  errorMessage?: string;
}

async function probe(url: string, method: 'HEAD' | 'GET', extraHeaders?: Record<string, string>): Promise<ProbeResult> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const response = await fetch(url, { method, headers: extraHeaders, signal: ctrl.signal });
    clearTimeout(timeout);
    if (response.status === 404) return { reachable: true, notFound: true, httpStatus: 404 };
    if (response.status >= 500) return { reachable: false, notFound: false, httpStatus: response.status };
    if (response.status >= 200 && response.status < 400) {
      return { reachable: true, notFound: false, httpStatus: response.status };
    }
    return { reachable: false, notFound: false, httpStatus: response.status };
  } catch (err) {
    return { reachable: false, notFound: false, httpStatus: null, errorMessage: (err as Error).message };
  }
}

// Skip the fallback delay under jest to keep unit tests fast — production runs
// in node, jest sets NODE_ENV=test by default.
const sleep = (ms: number) =>
  process.env.NODE_ENV === 'test'
    ? Promise.resolve()
    : new Promise<void>(resolve => setTimeout(resolve, ms));

export interface AuditResult {
  scanned: number;
  missing: number;
  unreachable: number;
  resolved: number;
  durationMs: number;
}

export interface AuditOptions {
  batchSize?: number;
  concurrency?: number;
}

interface VideoRow {
  [key: string]: unknown;
  id: string;
  storage_path: string;
}

class VideoFtpAuditService {
  /**
   * Audite toutes les vidéos en DB. Pour chaque storage_path :
   *   - HEAD sur l'URL upstream (avec timeout 8s)
   *   - 404 → upsert dans `video_ftp_audit_warnings` (status='missing')
   *   - timeout / 5xx → upsert (status='unreachable')
   *   - 200 → si une warning existe, la supprimer (auto-resolve)
   */
  async auditAllVideos(opts: AuditOptions = {}): Promise<AuditResult> {
    const startedAt = Date.now();
    const batchSize = opts.batchSize ?? 50;
    const concurrency = opts.concurrency ?? 5;

    const videos = await this.fetchAllVideos();
    logger.info('Video FTP audit started', { totalVideos: videos.length, batchSize, concurrency });

    let scanned = 0;
    let missing = 0;
    let unreachable = 0;
    let resolved = 0;

    for (let i = 0; i < videos.length; i += batchSize) {
      const batch = videos.slice(i, i + batchSize);
      const results = await this.processBatch(batch, concurrency);
      for (const r of results) {
        scanned++;
        if (r === 'missing') missing++;
        else if (r === 'unreachable') unreachable++;
        else if (r === 'resolved') resolved++;
      }
    }

    const durationMs = Date.now() - startedAt;

    metricsService.recordVideoFtpAudit({ missing, unreachable, resolved, scanned, durationMs });

    logger.info('Video FTP audit completed', { scanned, missing, unreachable, resolved, durationMs });

    return { scanned, missing, unreachable, resolved, durationMs };
  }

  /**
   * Transforme les fichiers manquants en alertes — la restitution qui manquait.
   *
   * ## Le défaut corrigé
   *
   * L'audit remplissait `video_ftp_audit_warnings` depuis mai 2026 et personne
   * n'en savait rien : 46 fichiers absents du FTP, 51 lignes, `notified_at` NULL
   * sur toutes. Le CRON logguait et incrémentait sa métrique, sans jamais créer
   * d'alerte. Le système savait depuis trois mois ; l'exploitant, non.
   *
   * ## On n'alerte QUE sur ce qui est diffusé
   *
   * Sur les 46 fichiers absents, 30 ne sont référencés par aucune config : ce sont
   * des rows orphelines, un ménage de base, pas un incident. Les noyer dans la même
   * alerte que les 16 réellement à l'écran ferait ignorer les deux. Seul ce qui part
   * en diffusion déclenche — les orphelins restent dans la table et la métrique.
   *
   * ## Une alerte par site, pas par fichier
   *
   * La dédup ADR-111 porte sur `(site_id, alert_type, status='active')` : émettre
   * par fichier les fusionnerait toutes en une seule ligne dont le message ne
   * refléterait que le dernier passage. On agrège donc explicitement par site, et
   * `message` porte le compte + les noms. Les ré-émissions quotidiennes montent
   * `occurrences` au lieu de spammer — « manquant depuis 90 jours » se lit alors
   * dans le compteur.
   */
  async notifyMissingReferencedInProfiles(): Promise<{ sitesAlerted: number; pathsNotified: number }> {
    const impacted = await videoFtpAuditRepository.findMissingReferencedInProfiles();

    if (impacted.length === 0) {
      logger.info('Video FTP audit: aucun fichier manquant diffusé, pas d’alerte');
      return { sitesAlerted: 0, pathsNotified: 0 };
    }

    for (const site of impacted) {
      const noms = site.storage_paths.slice(0, MAX_PATHS_IN_MESSAGE).join(', ');
      const reste = site.storage_paths.length - MAX_PATHS_IN_MESSAGE;

      await alertRepository.create({
        site_id: site.site_id,
        alert_type: MISSING_VIDEO_ALERT_TYPE,
        severity: 'critical',
        message:
          `${site.storage_paths.length} vidéo(s) programmée(s) sont absentes du stockage ` +
          `et ne s'afficheront pas : ${noms}${reste > 0 ? ` (+${reste} autre(s))` : ''}`,
        // La liste COMPLÈTE va dans metadata : le message est tronqué pour rester
        // lisible, mais celui qui traite l'incident a besoin de tout.
        metadata: { storage_paths: site.storage_paths, count: site.storage_paths.length },
      });
    }

    const pathsNotified = await videoFtpAuditRepository.markNotified(
      [...new Set(impacted.flatMap((s) => s.storage_paths))],
    );

    logger.warn('Video FTP audit: fichiers manquants diffusés signalés', {
      sitesAlerted: impacted.length,
      pathsNotified,
    });

    return { sitesAlerted: impacted.length, pathsNotified };
  }

  private async fetchAllVideos(): Promise<VideoRow[]> {
    const result = await query<VideoRow>(
      `SELECT id, storage_path FROM videos WHERE storage_path IS NOT NULL AND storage_path <> ''`
    );
    return result.rows;
  }

  private async processBatch(
    batch: VideoRow[],
    concurrency: number,
  ): Promise<Array<'missing' | 'unreachable' | 'ok' | 'resolved'>> {
    const results: Array<'missing' | 'unreachable' | 'ok' | 'resolved'> = [];

    for (let i = 0; i < batch.length; i += concurrency) {
      const slice = batch.slice(i, i + concurrency);
      const checks = await Promise.all(slice.map(v => this.checkOne(v)));
      results.push(...checks);
    }

    return results;
  }

  /**
   * Probe d'un fichier FTP avec stratégie HEAD-then-Range.
   *
   * Hostinger (et d'autres CDN) refusent ou throttlent parfois les requêtes
   * HEAD sur certains paths, alors que le GET fonctionne. Pour éviter les faux
   * positifs `unreachable`, on retry avec un GET Range minimal après échec HEAD.
   *
   * - HEAD 404 → `missing` (immediate, fichier absent confirmé)
   * - HEAD 2xx/3xx → `ok` (fichier servable)
   * - HEAD timeout/5xx → retry GET Range bytes=0-0
   *   - Range 404 → `missing`
   *   - Range 2xx/206 → `ok`
   *   - Range encore en échec → `unreachable` persisté
   */
  private async checkOne(video: VideoRow): Promise<'missing' | 'unreachable' | 'ok' | 'resolved'> {
    const url = getVideoUrl(video.storage_path);

    const headResult = await probe(url, 'HEAD');

    let outcome: 'missing' | 'unreachable' | 'ok';
    let finalHttpStatus: number | null = headResult.httpStatus;

    if (headResult.notFound) {
      outcome = 'missing';
    } else if (headResult.reachable) {
      outcome = 'ok';
    } else {
      // HEAD timeout / 5xx / weird status → fallback Range probe
      logger.warn('Video FTP audit HEAD failed, retrying with Range', {
        videoId: video.id,
        storagePath: video.storage_path,
        httpStatus: headResult.httpStatus,
        err: headResult.errorMessage,
      });
      await sleep(FALLBACK_DELAY_MS);
      const rangeResult = await probe(url, 'GET', { Range: 'bytes=0-0' });
      finalHttpStatus = rangeResult.httpStatus ?? headResult.httpStatus;

      if (rangeResult.notFound) {
        outcome = 'missing';
      } else if (rangeResult.reachable) {
        outcome = 'ok';
      } else {
        outcome = 'unreachable';
        logger.warn('Video FTP audit Range fallback also failed', {
          videoId: video.id,
          storagePath: video.storage_path,
          headHttpStatus: headResult.httpStatus,
          rangeHttpStatus: rangeResult.httpStatus,
          rangeErr: rangeResult.errorMessage,
        });
      }
    }

    if (outcome === 'ok') {
      const cleared = await this.clearWarning(video.id);
      return cleared ? 'resolved' : 'ok';
    }

    await this.upsertWarning(video.id, video.storage_path, outcome, finalHttpStatus);
    return outcome;
  }

  private async upsertWarning(
    videoId: string,
    expectedPath: string,
    status: 'missing' | 'unreachable',
    httpStatus: number | null,
  ): Promise<void> {
    await query(
      `INSERT INTO video_ftp_audit_warnings (video_id, expected_path, status, http_status, last_checked_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (video_id) DO UPDATE
         SET status = EXCLUDED.status,
             expected_path = EXCLUDED.expected_path,
             http_status = EXCLUDED.http_status,
             last_checked_at = NOW()`,
      [videoId, expectedPath, status, httpStatus],
    );
  }

  /** Retourne true si une warning existait et a été supprimée (auto-resolve). */
  private async clearWarning(videoId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM video_ftp_audit_warnings WHERE video_id = $1`,
      [videoId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export const videoFtpAuditService = new VideoFtpAuditService();
export default videoFtpAuditService;
