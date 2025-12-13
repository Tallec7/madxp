/**
 * Service de déploiement canary (progressif)
 * Permet de déployer du contenu/mises à jour de manière progressive
 * avec rollback automatique en cas d'échec
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import deploymentService from './deployment.service';
import socketService from './socket.service';
import logger from '../config/logger';

export type CanaryPhase = 'canary' | 'gradual' | 'full' | 'completed' | 'failed' | 'rolled_back';

interface CanaryConfig {
  canaryPercentage: number;     // % de sites pour le canary initial (default: 10%)
  gradualSteps: number[];       // Pourcentages progressifs [25, 50, 75, 100]
  stabilityPeriodMs: number;    // Temps d'observation entre phases (default: 30 min)
  successThreshold: number;     // % de succès requis pour continuer (default: 95%)
  autoAdvance: boolean;         // Avancer auto vers la phase suivante (default: true)
}

interface CanaryDeployment {
  id: string;
  deploymentType: 'content' | 'update';
  resourceId: string;           // video_id ou update_id
  targetType: 'site' | 'group';
  targetId: string;
  config: CanaryConfig;
  currentPhase: CanaryPhase;
  currentStep: number;
  metrics: CanaryMetrics;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CanaryMetrics {
  totalSites: number;
  deployedSites: number;
  successfulSites: number;
  failedSites: number;
  pendingSites: number;
  successRate: number;
}

interface SiteDeploymentStatus {
  siteId: string;
  siteName: string;
  status: 'pending' | 'deployed' | 'failed';
  phase: CanaryPhase;
  deployedAt?: Date;
  errorMessage?: string;
}

const DEFAULT_CONFIG: CanaryConfig = {
  canaryPercentage: 10,
  gradualSteps: [25, 50, 75, 100],
  stabilityPeriodMs: 30 * 60 * 1000, // 30 minutes
  successThreshold: 95,
  autoAdvance: true,
};

class CanaryDeploymentService {
  private tableName = 'canary_deployments';
  private siteStatusTable = 'canary_site_status';
  private tableChecked = false;
  private advanceIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Crée un nouveau déploiement canary
   */
  async createCanaryDeployment(
    deploymentType: 'content' | 'update',
    resourceId: string,
    targetType: 'site' | 'group',
    targetId: string,
    userId: string,
    customConfig: Partial<CanaryConfig> = {}
  ): Promise<{ id: string; canarySites: string[] }> {
    await this.ensureTable();

    const config = { ...DEFAULT_CONFIG, ...customConfig };
    const id = uuidv4();

    // Récupérer tous les sites cibles
    const targetSites = await this.getTargetSites(targetType, targetId);

    if (targetSites.length === 0) {
      throw new Error('Aucun site cible trouvé pour ce déploiement');
    }

    // Si moins de 5 sites, déployer directement sans canary
    if (targetSites.length < 5) {
      logger.info('Less than 5 sites, deploying directly without canary', {
        totalSites: targetSites.length,
      });
      config.canaryPercentage = 100;
      config.gradualSteps = [100];
    }

    // Sélectionner les sites canary (aléatoirement)
    const canaryCount = Math.max(1, Math.ceil(targetSites.length * (config.canaryPercentage / 100)));
    const shuffled = this.shuffleArray([...targetSites]);
    const canarySites = shuffled.slice(0, canaryCount);
    const remainingSites = shuffled.slice(canaryCount);

    // Créer l'entrée canary deployment
    await query(
      `INSERT INTO ${this.tableName}
       (id, deployment_type, resource_id, target_type, target_id, config, current_phase, current_step, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'canary', 0, $7)`,
      [id, deploymentType, resourceId, targetType, targetId, JSON.stringify(config), userId]
    );

    // Créer les statuts de site
    for (const site of canarySites) {
      await query(
        `INSERT INTO ${this.siteStatusTable}
         (canary_deployment_id, site_id, site_name, phase, status)
         VALUES ($1, $2, $3, 'canary', 'pending')`,
        [id, site.siteId, site.siteName]
      );
    }

    for (const site of remainingSites) {
      await query(
        `INSERT INTO ${this.siteStatusTable}
         (canary_deployment_id, site_id, site_name, phase, status)
         VALUES ($1, $2, $3, 'gradual', 'pending')`,
        [id, site.siteId, site.siteName]
      );
    }

    logger.info('Canary deployment created', {
      id,
      deploymentType,
      resourceId,
      totalSites: targetSites.length,
      canarySites: canaryCount,
    });

    return {
      id,
      canarySites: canarySites.map(s => s.siteId),
    };
  }

  /**
   * Démarre le déploiement canary (phase initiale)
   */
  async startCanaryPhase(canaryDeploymentId: string): Promise<void> {
    const deployment = await this.getCanaryDeployment(canaryDeploymentId);

    if (!deployment) {
      throw new Error('Déploiement canary non trouvé');
    }

    if (deployment.currentPhase !== 'canary') {
      throw new Error(`Phase invalide: ${deployment.currentPhase}`);
    }

    // Récupérer les sites canary
    const canarySites = await this.getSitesByPhase(canaryDeploymentId, 'canary');

    logger.info('Starting canary phase', {
      canaryDeploymentId,
      sites: canarySites.length,
    });

    // Déployer vers les sites canary
    for (const site of canarySites) {
      await this.deployToSite(deployment, site.siteId);
    }

    // Programmer la vérification de stabilité
    if (deployment.config.autoAdvance) {
      this.scheduleStabilityCheck(canaryDeploymentId, deployment.config.stabilityPeriodMs);
    }
  }

  /**
   * Avance vers la phase suivante si les métriques sont bonnes
   */
  async advanceToNextPhase(canaryDeploymentId: string): Promise<{ advanced: boolean; reason?: string }> {
    const deployment = await this.getCanaryDeployment(canaryDeploymentId);

    if (!deployment) {
      return { advanced: false, reason: 'Déploiement non trouvé' };
    }

    const metrics = await this.getMetrics(canaryDeploymentId);

    // Vérifier le seuil de succès
    if (metrics.successRate < deployment.config.successThreshold) {
      logger.warn('Cannot advance - success rate below threshold', {
        canaryDeploymentId,
        successRate: metrics.successRate,
        threshold: deployment.config.successThreshold,
      });

      // Rollback automatique
      await this.rollback(canaryDeploymentId, 'Taux de succès insuffisant');

      return {
        advanced: false,
        reason: `Taux de succès (${metrics.successRate.toFixed(1)}%) inférieur au seuil (${deployment.config.successThreshold}%)`,
      };
    }

    // Déterminer la prochaine phase
    const nextStep = deployment.currentStep + 1;
    const steps = deployment.config.gradualSteps;

    if (deployment.currentPhase === 'canary' || nextStep < steps.length) {
      // Passer à la phase graduelle suivante
      const targetPercentage = steps[nextStep] || steps[steps.length - 1];
      const newPhase: CanaryPhase = targetPercentage >= 100 ? 'full' : 'gradual';

      await this.deployGradualPhase(canaryDeploymentId, deployment, targetPercentage, newPhase, nextStep);

      logger.info('Advanced to next phase', {
        canaryDeploymentId,
        phase: newPhase,
        step: nextStep,
        targetPercentage,
      });

      // Programmer la prochaine vérification de stabilité
      if (deployment.config.autoAdvance && newPhase !== 'full') {
        this.scheduleStabilityCheck(canaryDeploymentId, deployment.config.stabilityPeriodMs);
      }

      return { advanced: true };
    }

    // Toutes les phases complétées
    await this.completeDeployment(canaryDeploymentId);

    return { advanced: true };
  }

  /**
   * Déploie vers un pourcentage additionnel de sites
   */
  private async deployGradualPhase(
    canaryDeploymentId: string,
    deployment: CanaryDeployment,
    targetPercentage: number,
    newPhase: CanaryPhase,
    step: number
  ): Promise<void> {
    // Récupérer les sites non encore déployés
    const pendingSites = await query<{ site_id: string; [key: string]: unknown }>(
      `SELECT site_id FROM ${this.siteStatusTable}
       WHERE canary_deployment_id = $1 AND status = 'pending'`,
      [canaryDeploymentId]
    );

    const metrics = await this.getMetrics(canaryDeploymentId);
    const totalSites = metrics.totalSites;
    const targetCount = Math.ceil(totalSites * (targetPercentage / 100));
    const sitesToDeploy = targetCount - metrics.deployedSites;

    // Sélectionner les prochains sites
    const nextSites = pendingSites.rows.slice(0, Math.max(0, sitesToDeploy));

    for (const site of nextSites) {
      await this.deployToSite(deployment, site.site_id);
      await query(
        `UPDATE ${this.siteStatusTable}
         SET phase = $1
         WHERE canary_deployment_id = $2 AND site_id = $3`,
        [newPhase, canaryDeploymentId, site.site_id]
      );
    }

    // Mettre à jour la phase du déploiement
    await query(
      `UPDATE ${this.tableName}
       SET current_phase = $1, current_step = $2, updated_at = NOW()
       WHERE id = $3`,
      [newPhase, step, canaryDeploymentId]
    );
  }

  /**
   * Effectue un rollback du déploiement canary
   */
  async rollback(canaryDeploymentId: string, reason: string): Promise<void> {
    // Annuler le timer d'avancement automatique
    const timer = this.advanceIntervals.get(canaryDeploymentId);
    if (timer) {
      clearTimeout(timer);
      this.advanceIntervals.delete(canaryDeploymentId);
    }

    const deployment = await this.getCanaryDeployment(canaryDeploymentId);

    if (!deployment) {
      throw new Error('Déploiement canary non trouvé');
    }

    // Marquer comme rolled back
    await query(
      `UPDATE ${this.tableName}
       SET current_phase = 'rolled_back', error_message = $1, updated_at = NOW()
       WHERE id = $2`,
      [reason, canaryDeploymentId]
    );

    // Pour un déploiement de contenu, on pourrait envoyer une commande de suppression
    // Pour un update, on enverrait une commande de rollback
    if (deployment.deploymentType === 'update') {
      const deployedSites = await this.getDeployedSites(canaryDeploymentId);

      for (const site of deployedSites) {
        if (socketService.isConnected(site.siteId)) {
          socketService.sendCommand(site.siteId, {
            id: uuidv4(),
            type: 'rollback_update',
            data: {
              canaryDeploymentId,
              updateId: deployment.resourceId,
            },
          });
        }
      }
    }

    logger.warn('Canary deployment rolled back', {
      canaryDeploymentId,
      reason,
    });
  }

  /**
   * Marque le déploiement comme complété
   */
  private async completeDeployment(canaryDeploymentId: string): Promise<void> {
    // Annuler le timer
    const timer = this.advanceIntervals.get(canaryDeploymentId);
    if (timer) {
      clearTimeout(timer);
      this.advanceIntervals.delete(canaryDeploymentId);
    }

    await query(
      `UPDATE ${this.tableName}
       SET current_phase = 'completed', updated_at = NOW()
       WHERE id = $1`,
      [canaryDeploymentId]
    );

    logger.info('Canary deployment completed successfully', { canaryDeploymentId });
  }

  /**
   * Met à jour le statut d'un site après déploiement
   */
  async updateSiteStatus(
    canaryDeploymentId: string,
    siteId: string,
    status: 'deployed' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    await query(
      `UPDATE ${this.siteStatusTable}
       SET status = $1, deployed_at = NOW(), error_message = $2
       WHERE canary_deployment_id = $3 AND site_id = $4`,
      [status, errorMessage || null, canaryDeploymentId, siteId]
    );

    // Recalculer les métriques si nécessaire
    const deployment = await this.getCanaryDeployment(canaryDeploymentId);

    if (deployment?.config.autoAdvance) {
      const metrics = await this.getMetrics(canaryDeploymentId);

      // Si échec critique pendant le canary, rollback immédiat
      if (deployment.currentPhase === 'canary' && metrics.failedSites > 0) {
        if (metrics.successRate < deployment.config.successThreshold) {
          await this.rollback(canaryDeploymentId, 'Échec critique pendant la phase canary');
        }
      }
    }
  }

  /**
   * Récupère les métriques d'un déploiement canary
   */
  async getMetrics(canaryDeploymentId: string): Promise<CanaryMetrics> {
    const result = await query<{
      total: string;
      deployed: string;
      successful: string;
      failed: string;
      pending: string;
      [key: string]: unknown;
    }>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status != 'pending') as deployed,
         COUNT(*) FILTER (WHERE status = 'deployed') as successful,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) FILTER (WHERE status = 'pending') as pending
       FROM ${this.siteStatusTable}
       WHERE canary_deployment_id = $1`,
      [canaryDeploymentId]
    );

    const row = result.rows[0];
    const total = parseInt(row.total, 10);
    const deployed = parseInt(row.deployed, 10);
    const successful = parseInt(row.successful, 10);
    const failed = parseInt(row.failed, 10);
    const pending = parseInt(row.pending, 10);

    return {
      totalSites: total,
      deployedSites: deployed,
      successfulSites: successful,
      failedSites: failed,
      pendingSites: pending,
      successRate: deployed > 0 ? (successful / deployed) * 100 : 100,
    };
  }

  /**
   * Récupère un déploiement canary
   */
  async getCanaryDeployment(id: string): Promise<CanaryDeployment | null> {
    const result = await query<{
      id: string;
      deployment_type: string;
      resource_id: string;
      target_type: string;
      target_id: string;
      config: string;
      current_phase: string;
      current_step: number;
      created_by: string;
      created_at: Date;
      updated_at: Date;
      [key: string]: unknown;
    }>(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      deploymentType: row.deployment_type as 'content' | 'update',
      resourceId: row.resource_id,
      targetType: row.target_type as 'site' | 'group',
      targetId: row.target_id,
      config: JSON.parse(row.config as string),
      currentPhase: row.current_phase as CanaryPhase,
      currentStep: row.current_step,
      metrics: await this.getMetrics(id),
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Liste les déploiements canary actifs
   */
  async getActiveDeployments(): Promise<CanaryDeployment[]> {
    const result = await query<{
      id: string;
      [key: string]: unknown;
    }>(
      `SELECT id FROM ${this.tableName}
       WHERE current_phase NOT IN ('completed', 'failed', 'rolled_back')
       ORDER BY created_at DESC`,
      []
    );

    const deployments: CanaryDeployment[] = [];
    for (const row of result.rows) {
      const deployment = await this.getCanaryDeployment(row.id);
      if (deployment) {
        deployments.push(deployment);
      }
    }

    return deployments;
  }

  // ============= Helpers =============

  private async getTargetSites(
    targetType: string,
    targetId: string
  ): Promise<{ siteId: string; siteName: string }[]> {
    if (targetType === 'site') {
      const result = await query<{ id: string; site_name: string; [key: string]: unknown }>(
        'SELECT id, site_name FROM sites WHERE id = $1',
        [targetId]
      );
      return result.rows.map(r => ({ siteId: r.id, siteName: r.site_name }));
    }

    if (targetType === 'group') {
      const result = await query<{ id: string; site_name: string; [key: string]: unknown }>(
        `SELECT s.id, s.site_name
         FROM sites s
         JOIN site_groups sg ON s.id = sg.site_id
         WHERE sg.group_id = $1`,
        [targetId]
      );
      return result.rows.map(r => ({ siteId: r.id, siteName: r.site_name }));
    }

    return [];
  }

  private async getSitesByPhase(
    canaryDeploymentId: string,
    phase: CanaryPhase
  ): Promise<SiteDeploymentStatus[]> {
    const result = await query<{
      site_id: string;
      site_name: string;
      status: string;
      phase: string;
      deployed_at: Date | null;
      error_message: string | null;
      [key: string]: unknown;
    }>(
      `SELECT site_id, site_name, status, phase, deployed_at, error_message
       FROM ${this.siteStatusTable}
       WHERE canary_deployment_id = $1 AND phase = $2`,
      [canaryDeploymentId, phase]
    );

    return result.rows.map(r => ({
      siteId: r.site_id,
      siteName: r.site_name,
      status: r.status as 'pending' | 'deployed' | 'failed',
      phase: r.phase as CanaryPhase,
      deployedAt: r.deployed_at || undefined,
      errorMessage: r.error_message || undefined,
    }));
  }

  private async getDeployedSites(canaryDeploymentId: string): Promise<{ siteId: string }[]> {
    const result = await query<{ site_id: string; [key: string]: unknown }>(
      `SELECT site_id FROM ${this.siteStatusTable}
       WHERE canary_deployment_id = $1 AND status = 'deployed'`,
      [canaryDeploymentId]
    );

    return result.rows.map(r => ({ siteId: r.site_id }));
  }

  private async deployToSite(deployment: CanaryDeployment, siteId: string): Promise<void> {
    // Utiliser le service de déploiement existant
    if (deployment.deploymentType === 'content') {
      // Créer un déploiement de contenu
      const result = await query<{ id: string; [key: string]: unknown }>(
        `INSERT INTO content_deployments
         (video_id, target_type, target_id, status, deployed_by)
         VALUES ($1, 'site', $2, 'pending', $3)
         RETURNING id`,
        [deployment.resourceId, siteId, deployment.createdBy]
      );

      const deploymentId = result.rows[0].id;
      await deploymentService.startDeployment(deploymentId);
    } else {
      // Déploiement de mise à jour
      socketService.sendCommand(siteId, {
        id: uuidv4(),
        type: 'update_software',
        data: {
          updateId: deployment.resourceId,
          canaryDeploymentId: deployment.id,
        },
      });
    }
  }

  private scheduleStabilityCheck(canaryDeploymentId: string, delayMs: number): void {
    // Annuler le timer existant s'il y en a un
    const existingTimer = this.advanceIntervals.get(canaryDeploymentId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.advanceIntervals.delete(canaryDeploymentId);
      await this.advanceToNextPhase(canaryDeploymentId);
    }, delayMs);

    this.advanceIntervals.set(canaryDeploymentId, timer);

    logger.info('Scheduled stability check', {
      canaryDeploymentId,
      checkInMs: delayMs,
    });
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private async ensureTable(): Promise<void> {
    if (this.tableChecked) return;

    try {
      await query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          deployment_type VARCHAR(50) NOT NULL,
          resource_id UUID NOT NULL,
          target_type VARCHAR(20) NOT NULL,
          target_id UUID NOT NULL,
          config JSONB NOT NULL,
          current_phase VARCHAR(20) DEFAULT 'canary',
          current_step INTEGER DEFAULT 0,
          error_message TEXT,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS ${this.siteStatusTable} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          canary_deployment_id UUID REFERENCES ${this.tableName}(id) ON DELETE CASCADE,
          site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
          site_name VARCHAR(255),
          phase VARCHAR(20) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          deployed_at TIMESTAMPTZ,
          error_message TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_canary_phase ON ${this.tableName}(current_phase)
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_canary_site_status ON ${this.siteStatusTable}(canary_deployment_id, status)
      `);

      this.tableChecked = true;
    } catch (error) {
      logger.error('Failed to create canary deployment tables:', error);
    }
  }

  /**
   * Nettoyage à l'arrêt du service
   */
  cleanup(): void {
    for (const timer of this.advanceIntervals.values()) {
      clearTimeout(timer);
    }
    this.advanceIntervals.clear();
  }
}

export const canaryDeploymentService = new CanaryDeploymentService();
export default canaryDeploymentService;
