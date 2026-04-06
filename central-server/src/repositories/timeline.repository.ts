import { QueryResultRow } from 'pg';
import { query } from '../config/database';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface DeploymentTimelineRow extends QueryResultRow {
  event_type: 'deployment';
  id: string;
  timestamp: Date;
  status: string;
  video_name: string | null;
  category: string | null;
  progress: number | null;
  error_message: string | null;
  user_email: string | null;
}

export interface CommandTimelineRow extends QueryResultRow {
  event_type: 'command';
  id: string;
  timestamp: Date;
  command_type: string;
  status: string;
  result: unknown;
  user_email: string | null;
}

export interface ConfigTimelineRow extends QueryResultRow {
  event_type: 'config';
  id: string;
  timestamp: Date;
  comment: string | null;
  changes_summary: unknown[];
  user_email: string | null;
}

export interface AlertTimelineRow extends QueryResultRow {
  event_type: 'alert';
  id: string;
  timestamp: Date;
  alert_type: string;
  severity: string;
  message: string | null;
  resolved: boolean;
  resolved_at: Date | null;
}

export interface TimelineData {
  deployments: DeploymentTimelineRow[];
  commands: CommandTimelineRow[];
  configs: ConfigTimelineRow[];
  alerts: AlertTimelineRow[];
}

export interface CloudVideoRow extends QueryResultRow {
  id: string;
  filename: string;
  original_name: string | null;
  category: string | null;
  subcategory: string | null;
  file_size: number | null;
  duration: number | null;
  checksum: string | null;
  storage_path: string | null;
  uploaded_for_site_id: string | null;
  created_at: Date;
  updated_at: Date;
  metadata: Record<string, unknown> | null;
  advertiser_name: string | null;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

/**
 * Repository pour les requetes multi-tables de la timeline et du contenu.
 * Ne herite pas de BaseRepository car il interroge plusieurs tables.
 */
class TimelineRepositoryImpl {
  /**
   * Recupere les evenements recents pour un site (deployments, commands, configs, alerts).
   */
  async getForSite(siteId: string, limit: number): Promise<TimelineData> {
    const [deployments, commands, configs, alerts] = await Promise.all([
      query<DeploymentTimelineRow>(
        `SELECT
           'deployment' as event_type,
           cd.id,
           cd.created_at as timestamp,
           cd.status,
           v.filename as video_name,
           v.category,
           cd.progress,
           cd.error_message,
           u.email as user_email
         FROM content_deployments cd
         LEFT JOIN videos v ON cd.video_id = v.id
         LEFT JOIN users u ON cd.deployed_by = u.id
         WHERE cd.target_id = $1 AND cd.target_type = 'site'
         ORDER BY cd.created_at DESC
         LIMIT $2`,
        [siteId, limit]
      ),
      query<CommandTimelineRow>(
        `SELECT
           'command' as event_type,
           rc.id,
           rc.created_at as timestamp,
           rc.command_type,
           rc.status,
           rc.result,
           u.email as user_email
         FROM remote_commands rc
         LEFT JOIN users u ON rc.executed_by = u.id
         WHERE rc.site_id = $1
         ORDER BY rc.created_at DESC
         LIMIT $2`,
        [siteId, limit]
      ),
      query<ConfigTimelineRow>(
        `SELECT
           'config' as event_type,
           ch.id,
           ch.deployed_at as timestamp,
           ch.comment,
           ch.changes_summary,
           u.email as user_email
         FROM config_history ch
         LEFT JOIN users u ON ch.deployed_by = u.id
         WHERE ch.site_id = $1
         ORDER BY ch.deployed_at DESC
         LIMIT $2`,
        [siteId, limit]
      ),
      query<AlertTimelineRow>(
        `SELECT
           'alert' as event_type,
           a.id,
           a.created_at as timestamp,
           a.alert_type,
           a.severity,
           a.message,
           a.status = 'resolved' as resolved,
           a.resolved_at
         FROM alerts a
         WHERE a.site_id = $1
         ORDER BY a.created_at DESC
         LIMIT $2`,
        [siteId, limit]
      ),
    ]);

    return {
      deployments: deployments.rows,
      commands: commands.rows,
      configs: configs.rows,
      alerts: alerts.rows,
    };
  }

  /**
   * Recupere les videos cloud (pour le contenu local d'un site).
   */
  async getCloudVideos(limit = 500): Promise<CloudVideoRow[]> {
    const result = await query<CloudVideoRow>(
      `SELECT
         v.id,
         v.filename,
         v.original_name,
         v.category,
         v.subcategory,
         v.file_size,
         v.duration,
         v.checksum,
         v.storage_path,
         v.uploaded_for_site_id,
         v.created_at,
         v.updated_at,
         v.metadata,
         a.name as advertiser_name
       FROM videos v
       LEFT JOIN advertiser_videos av ON av.video_id = v.id
       LEFT JOIN advertisers a ON a.id = av.advertiser_id
       ORDER BY v.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Recupere les videos cloud filtrees pour un club (uniquement ses propres videos + NEOPRO).
   */
  async getCloudVideosForClub(siteId: string, limit = 500): Promise<CloudVideoRow[]> {
    const result = await query<CloudVideoRow>(
      `SELECT
         v.id,
         v.filename,
         v.original_name,
         v.category,
         v.subcategory,
         v.file_size,
         v.duration,
         v.checksum,
         v.storage_path,
         v.uploaded_for_site_id,
         v.created_at,
         v.updated_at,
         v.metadata,
         a.name as advertiser_name
       FROM videos v
       LEFT JOIN advertiser_videos av ON av.video_id = v.id
       LEFT JOIN advertisers a ON a.id = av.advertiser_id
       WHERE v.uploaded_for_site_id = $1 OR UPPER(v.category) = 'NEOPRO'
       ORDER BY v.created_at DESC
       LIMIT $2`,
      [siteId, limit]
    );
    return result.rows;
  }

  /**
   * Recupere une commande en attente pour verification d'appartenance.
   */
  async findPendingCommand(commandId: string, siteId: string): Promise<{ id: string } | null> {
    const result = await query<{ id: string }>(
      'SELECT id FROM pending_commands WHERE id = $1 AND site_id = $2',
      [commandId, siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere une commande avec son site_id (pour getCommandStatus).
   */
  async findCommandBySiteAndId(commandId: string, siteId: string): Promise<Record<string, unknown> | null> {
    const result = await query(
      `SELECT * FROM remote_commands WHERE id = $1 AND site_id = $2`,
      [commandId, siteId]
    );
    return (result.rows[0] as Record<string, unknown>) || null;
  }
}

export const timelineRepository = new TimelineRepositoryImpl();
