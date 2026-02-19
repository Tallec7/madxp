/**
 * Draft Service
 *
 * Gère les brouillons de configuration pour les sites.
 * Permet de préparer des configurations à l'avance, même si le Pi est offline.
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import logger from '../config/logger';
import {
  ConfigDraft,
  DraftValidationResult,
  MissingVideoInfo,
  SiteConfiguration,
  Video,
} from '../types';

interface CloudVideo {
  id: string;
  filename: string;
  storage_path: string;
}

interface LocalVideo {
  filename: string;
  path: string;
}

class DraftService {
  /**
   * Récupère le brouillon d'un site (ou null si aucun)
   */
  async getDraft(siteId: string): Promise<ConfigDraft | null> {
    const result = await query(
      `SELECT * FROM config_drafts WHERE site_id = $1`,
      [siteId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToDraft(result.rows[0]);
  }

  /**
   * Crée ou met à jour le brouillon d'un site
   * (UPSERT car un seul brouillon par site)
   */
  async createOrUpdateDraft(
    siteId: string,
    name: string,
    configuration: SiteConfiguration,
    userId: string
  ): Promise<ConfigDraft> {
    const existingDraft = await this.getDraft(siteId);

    // Extraire les vidéos référencées dans la configuration
    const cloudVideos = await this.getCloudVideos();
    const referencedVideoIds = this.extractReferencedVideoIds(configuration, cloudVideos);

    if (existingDraft) {
      // Mise à jour
      const result = await query(
        `UPDATE config_drafts
         SET name = $1,
             configuration = $2,
             referenced_video_ids = $3,
             updated_by = $4,
             status = 'draft'
         WHERE site_id = $5
         RETURNING *`,
        [name, JSON.stringify(configuration), referencedVideoIds, userId, siteId]
      );

      logger.info('Draft updated', { siteId, draftId: result.rows[0].id });
      return this.mapRowToDraft(result.rows[0]);
    }

    // Création
    const draftId = uuidv4();
    const result = await query(
      `INSERT INTO config_drafts
       (id, site_id, name, configuration, referenced_video_ids, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING *`,
      [draftId, siteId, name, JSON.stringify(configuration), referencedVideoIds, userId]
    );

    logger.info('Draft created', { siteId, draftId });
    return this.mapRowToDraft(result.rows[0]);
  }

  /**
   * Supprime le brouillon d'un site
   */
  async deleteDraft(siteId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM config_drafts WHERE site_id = $1`,
      [siteId]
    );

    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) {
      logger.info('Draft deleted', { siteId });
    }

    return deleted;
  }

  /**
   * Met à jour le statut d'un brouillon
   */
  async updateDraftStatus(
    siteId: string,
    status: 'draft' | 'deploying' | 'deployed' | 'failed'
  ): Promise<void> {
    await query(
      `UPDATE config_drafts SET status = $1 WHERE site_id = $2`,
      [status, siteId]
    );
  }

  /**
   * Valide un brouillon : vérifie si toutes les vidéos référencées sont disponibles
   */
  async validateDraft(siteId: string): Promise<DraftValidationResult> {
    const draft = await this.getDraft(siteId);
    if (!draft) {
      return {
        valid: false,
        missingVideos: [],
        videosToDeploy: [],
      };
    }

    // Récupérer les vidéos locales du Pi
    const siteResult = await query(
      `SELECT local_config_mirror FROM sites WHERE id = $1`,
      [siteId]
    );
    const localConfig = (siteResult.rows[0]?.local_config_mirror || {}) as Record<string, unknown>;
    const localVideos: LocalVideo[] = (localConfig._localVideos as LocalVideo[]) || [];
    const localFilenames = new Set(localVideos.map((v: LocalVideo) => v.filename.toLowerCase()));

    // Récupérer les vidéos cloud
    const cloudVideos = await this.getCloudVideos();
    const cloudVideosByFilename = new Map<string, CloudVideo>();
    for (const video of cloudVideos) {
      cloudVideosByFilename.set(video.filename.toLowerCase(), video);
    }

    // Extraire tous les chemins de vidéos de la configuration
    const videoPaths = this.extractVideoPaths(draft.configuration);

    const missingVideos: MissingVideoInfo[] = [];
    const videosToDeploy: string[] = [];

    for (const videoPath of videoPaths) {
      const filename = this.extractFilenameFromPath(videoPath);
      const filenameLower = filename.toLowerCase();

      const isOnPi = localFilenames.has(filenameLower);
      const cloudVideo = cloudVideosByFilename.get(filenameLower);
      const isInCloud = !!cloudVideo;

      if (!isOnPi) {
        // Vidéo pas sur le Pi
        if (isInCloud && cloudVideo) {
          // Mais disponible dans le cloud → à déployer
          videosToDeploy.push(cloudVideo.id);
          missingVideos.push({
            videoId: cloudVideo.id,
            filename,
            path: videoPath,
            isInCloud: true,
            isOnPi: false,
          });
        } else {
          // Ni sur Pi, ni dans le cloud → vraiment manquante
          missingVideos.push({
            videoId: null,
            filename,
            path: videoPath,
            isInCloud: false,
            isOnPi: false,
          });
        }
      }
    }

    // Filtrer les doublons dans videosToDeploy
    const uniqueVideosToDeploy = [...new Set(videosToDeploy)];

    return {
      valid: missingVideos.filter(v => !v.isInCloud).length === 0,
      missingVideos,
      videosToDeploy: uniqueVideosToDeploy,
    };
  }

  /**
   * Récupère les vidéos qui doivent être déployées pour ce brouillon
   */
  async getVideosToDeployForDraft(siteId: string): Promise<Video[]> {
    const validation = await this.validateDraft(siteId);

    if (validation.videosToDeploy.length === 0) {
      return [];
    }

    const result = await query(
      `SELECT * FROM videos WHERE id = ANY($1)`,
      [validation.videosToDeploy]
    );

    return result.rows.map((row) => this.mapRowToVideo(row));
  }

  /**
   * Récupère toutes les vidéos cloud
   */
  private async getCloudVideos(): Promise<CloudVideo[]> {
    const result = await query(
      `SELECT id, filename, storage_path FROM videos`
    );
    return result.rows.map((row) => ({
      id: row.id as string,
      filename: row.filename as string,
      storage_path: row.storage_path as string,
    }));
  }

  /**
   * Convertit une row de base de données en Video
   */
  private mapRowToVideo(row: Record<string, unknown>): Video {
    return {
      id: row.id as string,
      filename: row.filename as string,
      original_name: row.original_name as string,
      category: row.category as string | null,
      subcategory: row.subcategory as string | null,
      file_size: row.file_size as number,
      duration: row.duration as number | null,
      mime_type: row.mime_type as string | null,
      storage_path: row.storage_path as string,
      thumbnail_url: row.thumbnail_url as string | null,
      metadata: (row.metadata as Record<string, unknown>) || {},
      uploaded_by: row.uploaded_by as string | null,
      created_at: row.created_at as Date,
      updated_at: row.updated_at as Date,
    };
  }

  /**
   * Extrait les IDs des vidéos cloud référencées dans une configuration
   */
  private extractReferencedVideoIds(
    config: SiteConfiguration,
    cloudVideos: CloudVideo[]
  ): string[] {
    const videoPaths = this.extractVideoPaths(config);
    const cloudVideosByFilename = new Map<string, string>();

    for (const video of cloudVideos) {
      cloudVideosByFilename.set(video.filename.toLowerCase(), video.id);
    }

    const referencedIds: string[] = [];

    for (const videoPath of videoPaths) {
      const filename = this.extractFilenameFromPath(videoPath);
      const videoId = cloudVideosByFilename.get(filename.toLowerCase());
      if (videoId) {
        referencedIds.push(videoId);
      }
    }

    return [...new Set(referencedIds)];
  }

  /**
   * Extrait tous les chemins de vidéos d'une configuration
   */
  private extractVideoPaths(config: SiteConfiguration): string[] {
    const paths: string[] = [];

    // Sponsors (boucle par défaut)
    if (config.sponsors) {
      for (const sponsor of config.sponsors) {
        if (sponsor.path) {
          paths.push(sponsor.path);
        }
      }
    }

    // Categories
    if (config.categories) {
      for (const category of config.categories) {
        if (category.videos) {
          for (const video of category.videos) {
            if (video.path) {
              paths.push(video.path);
            }
          }
        }
        if (category.subCategories) {
          for (const subCat of category.subCategories) {
            if (subCat.videos) {
              for (const video of subCat.videos) {
                if (video.path) {
                  paths.push(video.path);
                }
              }
            }
          }
        }
      }
    }

    // Time Categories (phases de match)
    if (config.timeCategories) {
      for (const timeCategory of config.timeCategories) {
        if (timeCategory.loopVideos) {
          for (const video of timeCategory.loopVideos) {
            if (video.path) {
              paths.push(video.path);
            }
          }
        }
      }
    }

    return [...new Set(paths)];
  }

  /**
   * Extrait le nom de fichier d'un chemin (ex: "videos/SPONSORS/video.mp4" → "video.mp4")
   */
  private extractFilenameFromPath(videoPath: string): string {
    const parts = videoPath.split('/');
    return parts[parts.length - 1];
  }

  /**
   * Convertit une row de base de données en ConfigDraft
   */
  private mapRowToDraft(row: any): ConfigDraft {
    return {
      id: row.id,
      site_id: row.site_id,
      name: row.name,
      configuration: typeof row.configuration === 'string'
        ? JSON.parse(row.configuration)
        : row.configuration,
      referenced_video_ids: row.referenced_video_ids || [],
      status: row.status,
      created_by: row.created_by,
      updated_by: row.updated_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export const draftService = new DraftService();
export default draftService;
