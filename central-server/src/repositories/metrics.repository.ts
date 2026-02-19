import { QueryResultRow } from 'pg';
import { query } from '../config/database';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface MetricRow extends QueryResultRow {
  id: string;
  site_id: string;
  cpu_usage: number | null;
  memory_usage: number | null;
  temperature: number | null;
  disk_usage: number | null;
  fan_status: Record<string, unknown> | null;
  recorded_at: Date;
}

export interface MetricStatsRow extends QueryResultRow {
  heartbeat_count: string;
  first_heartbeat: Date | null;
  last_heartbeat: Date | null;
}

export interface FleetAveragesRow extends QueryResultRow {
  avg_cpu: string;
  avg_memory: string;
  avg_temperature: string;
  avg_disk: string;
  sites_with_metrics: string;
}

// --------------------------------------------------------------------------
// Repository
// --------------------------------------------------------------------------

/**
 * Repository pour la table metrics (metriques systeme des sites).
 * Ne herite pas de BaseRepository car la table n'a pas le meme schema CRUD standard.
 */
class MetricsRepositoryImpl {
  /**
   * Recupere les metriques d'un site pour une periode donnee en heures.
   */
  async findBySiteId(siteId: string, hours: number): Promise<MetricRow[]> {
    const result = await query<MetricRow>(
      `SELECT * FROM metrics
       WHERE site_id = $1
       AND recorded_at > NOW() - INTERVAL '1 hour' * $2
       ORDER BY recorded_at DESC`,
      [siteId, hours]
    );
    return result.rows;
  }

  /**
   * Recupere la metrique la plus recente pour un site.
   */
  async getLatestForSite(siteId: string): Promise<MetricRow | null> {
    const result = await query<MetricRow>(
      `SELECT * FROM metrics
       WHERE site_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Recupere les stats de heartbeat sur les dernieres 24h pour un site.
   */
  async get24hStatsForSite(siteId: string): Promise<MetricStatsRow> {
    const result = await query<MetricStatsRow>(
      `SELECT
         COUNT(*) as heartbeat_count,
         MIN(recorded_at) as first_heartbeat,
         MAX(recorded_at) as last_heartbeat
       FROM metrics
       WHERE site_id = $1 AND recorded_at > NOW() - INTERVAL '24 hours'`,
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Recupere les moyennes de la flotte sur la derniere heure.
   */
  async getFleetAverages(): Promise<FleetAveragesRow> {
    const result = await query<FleetAveragesRow>(
      `SELECT
        COALESCE(AVG(m.cpu_usage), 0) as avg_cpu,
        COALESCE(AVG(m.memory_usage), 0) as avg_memory,
        COALESCE(AVG(m.temperature), 0) as avg_temperature,
        COALESCE(AVG(m.disk_usage), 0) as avg_disk,
        COUNT(DISTINCT m.site_id) as sites_with_metrics
      FROM metrics m
      WHERE m.recorded_at > NOW() - INTERVAL '1 hour'`
    );
    return result.rows[0];
  }

  /**
   * Recupere les metriques pour une periode specifique (start/end dates).
   */
  async getForPeriod(siteId: string, start: Date, end: Date): Promise<MetricRow[]> {
    const result = await query<MetricRow>(
      `SELECT * FROM metrics
       WHERE site_id = $1
       AND recorded_at >= $2
       AND recorded_at <= $3
       ORDER BY recorded_at ASC`,
      [siteId, start.toISOString(), end.toISOString()]
    );
    return result.rows;
  }
}

export const metricsRepository = new MetricsRepositoryImpl();
