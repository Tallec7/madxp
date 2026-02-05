/**
 * Network Alerts Service
 *
 * Phase 4 de la Network Resilience : Alertes proactives pour les sites à risque.
 *
 * Ce service vérifie périodiquement les sites avec des configurations réseau
 * problématiques et envoie des alertes proactives.
 *
 * Critères d'alerte :
 * - Sites mesh avec BSSID lock (bloquant le roaming)
 * - Sites mesh_isolated (isolation client détectée)
 * - Sites enterprise sans configuration IT
 * - Sites avec score de stabilité faible (<50)
 * - Sites offline depuis plus de 24h en environnement mesh
 *
 * @version 2.37.0
 */

import cron, { ScheduledTask } from 'node-cron';
import { query } from '../config/database';
import logger from '../config/logger';
import { alertService } from './alert.service';

interface SiteNetworkRisk {
  [key: string]: unknown;  // Index signature for QueryResultRow compatibility
  id: string;
  site_name: string;
  club_name: string;
  status: string;
  network_profile: {
    type: string;
    apCount?: number;
    bssidLocked?: boolean;
    hasIsolation?: boolean;
    stabilityScore?: number;
    warningCount?: number;
    detectedAt?: string;
  } | null;
  last_seen_at: Date | null;
}

interface NetworkRiskReport {
  timestamp: Date;
  sitesChecked: number;
  risksFound: number;
  risks: Array<{
    siteId: string;
    siteName: string;
    riskType: string;
    severity: 'warning' | 'critical';
    details: string;
  }>;
}

class NetworkAlertsService {
  private cronJob: ScheduledTask | null = null;
  private isRunning = false;

  /**
   * Démarre le service d'alertes réseau
   * Exécute immédiatement un check, puis toutes les 4 heures
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('NetworkAlertsService already running');
      return;
    }

    logger.info('Starting NetworkAlertsService...');

    // Check immédiat au démarrage (avec délai pour laisser le serveur s'initialiser)
    setTimeout(() => {
      this.checkNetworkRisks().catch((err) =>
        logger.error('Initial network risk check failed', { error: err.message })
      );
    }, 30000); // 30 secondes après le démarrage

    // Puis toutes les 4 heures
    this.cronJob = cron.schedule('0 */4 * * *', async () => {
      try {
        await this.checkNetworkRisks();
      } catch (error) {
        logger.error('Scheduled network risk check failed', { error });
      }
    });

    this.isRunning = true;
    logger.info('NetworkAlertsService started (checks every 4 hours)');
  }

  /**
   * Arrête le service
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isRunning = false;
    logger.info('NetworkAlertsService stopped');
  }

  /**
   * Vérifie tous les sites pour des configurations réseau à risque
   */
  async checkNetworkRisks(): Promise<NetworkRiskReport> {
    logger.info('Starting network risk check...');

    const report: NetworkRiskReport = {
      timestamp: new Date(),
      sitesChecked: 0,
      risksFound: 0,
      risks: [],
    };

    try {
      // Récupérer tous les sites avec leur profil réseau
      const result = await query<SiteNetworkRisk>(
        `SELECT id, site_name, club_name, status, network_profile, last_seen_at
         FROM sites
         WHERE network_profile IS NOT NULL`,
        []
      );

      report.sitesChecked = result.rows.length;

      for (const site of result.rows) {
        const risks = this.assessSiteRisks(site);

        for (const risk of risks) {
          report.risks.push({
            siteId: site.id,
            siteName: site.site_name,
            ...risk,
          });
        }
      }

      report.risksFound = report.risks.length;

      // Log le rapport
      if (report.risksFound > 0) {
        logger.warn('Network risks detected', {
          sitesChecked: report.sitesChecked,
          risksFound: report.risksFound,
          criticalCount: report.risks.filter((r) => r.severity === 'critical').length,
          warningCount: report.risks.filter((r) => r.severity === 'warning').length,
        });

        // Créer des alertes pour les risques critiques
        for (const risk of report.risks.filter((r) => r.severity === 'critical')) {
          await this.createAlert(risk.siteId, risk.riskType, risk.severity, risk.details);
        }
      } else {
        logger.info('Network risk check completed - no risks found', {
          sitesChecked: report.sitesChecked,
        });
      }

      return report;
    } catch (error) {
      logger.error('Error checking network risks', { error });
      throw error;
    }
  }

  /**
   * Évalue les risques pour un site donné
   */
  private assessSiteRisks(site: SiteNetworkRisk): Array<{
    riskType: string;
    severity: 'warning' | 'critical';
    details: string;
  }> {
    const risks: Array<{
      riskType: string;
      severity: 'warning' | 'critical';
      details: string;
    }> = [];

    const profile = site.network_profile;
    if (!profile) return risks;

    // Risk 1: BSSID lock en environnement mesh
    if ((profile.type === 'mesh' || profile.type === 'mesh_isolated') && profile.bssidLocked) {
      risks.push({
        riskType: 'bssid_lock_in_mesh',
        severity: 'critical',
        details: `BSSID lock activé en environnement mesh (${profile.apCount} APs) - le roaming est bloqué`,
      });
    }

    // Risk 2: Isolation client détectée
    if (profile.type === 'mesh_isolated' || profile.hasIsolation) {
      risks.push({
        riskType: 'client_isolation',
        severity: 'warning',
        details: 'Isolation client détectée - la télécommande locale ne fonctionnera pas, utilisez Remote Cloud',
      });
    }

    // Risk 3: Score de stabilité faible
    if (profile.stabilityScore !== undefined && profile.stabilityScore < 50) {
      risks.push({
        riskType: 'low_stability',
        severity: profile.stabilityScore < 25 ? 'critical' : 'warning',
        details: `Score de stabilité faible: ${profile.stabilityScore}/100 - déconnexions fréquentes détectées`,
      });
    }

    // Risk 4: Environnement enterprise sans config IT
    if (profile.type === 'enterprise') {
      risks.push({
        riskType: 'enterprise_unconfigured',
        severity: 'warning',
        details: 'Réseau enterprise (802.1X) détecté - une configuration IT spécifique peut être requise',
      });
    }

    // Risk 5: Site offline depuis longtemps en mesh
    if (site.status === 'offline' && (profile.type === 'mesh' || profile.type === 'mesh_isolated')) {
      const lastSeen = site.last_seen_at;
      if (lastSeen) {
        const hoursSinceLastSeen = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastSeen > 24) {
          risks.push({
            riskType: 'mesh_offline_extended',
            severity: 'critical',
            details: `Site offline depuis ${Math.round(hoursSinceLastSeen)}h en environnement mesh - intervention probable requise`,
          });
        }
      }
    }

    // Risk 6: Beaucoup de warnings dans le profil
    if (profile.warningCount !== undefined && profile.warningCount >= 3) {
      risks.push({
        riskType: 'multiple_warnings',
        severity: 'warning',
        details: `${profile.warningCount} warnings réseau détectés - vérification recommandée`,
      });
    }

    return risks;
  }

  /**
   * Crée une alerte dans la base de données
   */
  private async createAlert(
    siteId: string,
    riskType: string,
    severity: 'warning' | 'critical',
    details: string
  ): Promise<void> {
    try {
      // Vérifier si une alerte similaire n'existe pas déjà (dans les dernières 24h)
      const existing = await query(
        `SELECT id FROM alerts
         WHERE site_id = $1
           AND alert_type = $2
           AND created_at > NOW() - INTERVAL '24 hours'
         LIMIT 1`,
        [siteId, `network_risk_${riskType}`]
      );

      if (existing.rows.length > 0) {
        logger.debug('Similar alert already exists, skipping', { siteId, riskType });
        return;
      }

      // Créer la nouvelle alerte
      // Note: using alert_type (not type), metadata (not data) to match full-schema.sql
      await query(
        `INSERT INTO alerts (site_id, alert_type, severity, message, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          siteId,
          `network_risk_${riskType}`,
          severity,
          details,
          JSON.stringify({ riskType, proactiveCheck: true }),
        ]
      );

      logger.info('Network risk alert created', { siteId, riskType, severity });
    } catch (error) {
      logger.error('Failed to create network risk alert', { siteId, riskType, error });
    }
  }

  /**
   * Récupère le rapport des risques actuels (pour le dashboard)
   */
  async getCurrentRisks(): Promise<NetworkRiskReport> {
    return this.checkNetworkRisks();
  }

  /**
   * Récupère les statistiques de risques réseau
   */
  async getNetworkRiskStats(): Promise<{
    totalSitesWithProfile: number;
    sitesByType: Record<string, number>;
    sitesWithBssidLock: number;
    sitesWithIsolation: number;
    averageStabilityScore: number;
  }> {
    try {
      const result = await query<{
        type: string;
        count: string;
        bssid_locked: string;
        has_isolation: string;
        avg_stability: string;
      }>(
        `SELECT
           network_profile->>'type' as type,
           COUNT(*) as count,
           SUM(CASE WHEN (network_profile->>'bssidLocked')::boolean = true THEN 1 ELSE 0 END) as bssid_locked,
           SUM(CASE WHEN (network_profile->>'hasIsolation')::boolean = true THEN 1 ELSE 0 END) as has_isolation,
           AVG(COALESCE((network_profile->>'stabilityScore')::numeric, 100)) as avg_stability
         FROM sites
         WHERE network_profile IS NOT NULL
         GROUP BY network_profile->>'type'`,
        []
      );

      const sitesByType: Record<string, number> = {};
      let totalSites = 0;
      let sitesWithBssidLock = 0;
      let sitesWithIsolation = 0;
      let totalStability = 0;

      for (const row of result.rows) {
        const type = row.type || 'unknown';
        const count = parseInt(row.count, 10);
        sitesByType[type] = count;
        totalSites += count;
        sitesWithBssidLock += parseInt(row.bssid_locked, 10);
        sitesWithIsolation += parseInt(row.has_isolation, 10);
        totalStability += parseFloat(row.avg_stability) * count;
      }

      return {
        totalSitesWithProfile: totalSites,
        sitesByType,
        sitesWithBssidLock,
        sitesWithIsolation,
        averageStabilityScore: totalSites > 0 ? Math.round(totalStability / totalSites) : 100,
      };
    } catch (error) {
      logger.error('Failed to get network risk stats', { error });
      throw error;
    }
  }
}

export const networkAlertsService = new NetworkAlertsService();
export default networkAlertsService;
