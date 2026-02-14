/**
 * Service de déploiement de mises à jour logicielles
 * Gère l'envoi des commandes update_software aux Raspberry Pi
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import socketService from './socket.service';
import { commandQueueService } from './command-queue.service';
import logger from '../config/logger';

import { uploadVerificationService } from './upload-verification.service';
import { metricsService } from './metrics.service';

interface UpdateDeploymentRow {
  id: string;
  update_id: string;
  target_type: string;
  target_id: string;
  status: string;
  [key: string]: unknown;
}

interface SoftwareUpdateRow {
  id: string;
  version: string;
  description: string | null;
  is_critical: boolean;
  changelog: string | null;
  package_url: string;
  package_size: number | null;
  checksum: string | null;
  [key: string]: unknown;
}

interface DeploymentTarget {
  siteId: string;
  siteName: string;
}

class UpdateDeploymentService {
  /**
   * Démarre un déploiement de mise à jour vers les sites connectés
   */
  async startDeployment(deploymentId: string): Promise<void> {
    try {
      logger.info('Starting update deployment', { deploymentId });

      // Récupérer les infos du déploiement
      const deploymentResult = await query<UpdateDeploymentRow>(
        `SELECT ud.*, su.version, su.description, su.is_critical, su.changelog,
                su.package_url, su.package_size, su.checksum, su.upload_status
         FROM update_deployments ud
         JOIN software_updates su ON ud.update_id = su.id
         WHERE ud.id = $1`,
        [deploymentId]
      );

      if (deploymentResult.rows.length === 0) {
        throw new Error(`Déploiement de mise à jour non trouvé: ${deploymentId}`);
      }

      const deployment = deploymentResult.rows[0] as UpdateDeploymentRow & SoftwareUpdateRow & { upload_status: string; schedule_reboot: boolean; auto_rollback: boolean };
      logger.info('Deployment info retrieved', {
        deploymentId,
        version: deployment.version,
        targetType: deployment.target_type,
        targetId: deployment.target_id,
        packageUrl: deployment.package_url,
        uploadStatus: deployment.upload_status,
      });

      // === DOUBLE-CHECK: Vérifier que l'upload est prêt avant de continuer ===
      // Cette vérification est une sécurité supplémentaire au cas où le contrôleur
      // n'aurait pas fait la vérification (ex: retry automatique, appel direct)
      if (deployment.upload_status !== 'ready') {
        const errorMessage = uploadVerificationService.getDeploymentBlockedMessage(
          deployment.upload_status as 'uploading' | 'verifying' | 'ready' | 'failed' | null
        );
        logger.error('Update deployment blocked in service: upload not ready', {
          deploymentId,
          updateId: deployment.update_id,
          uploadStatus: deployment.upload_status,
        });
        await this.failDeployment(deploymentId, `Upload non vérifié: ${errorMessage}`);
        return;
      }

      // Récupérer les sites cibles
      const targets = await this.getTargetSites(deployment.target_type, deployment.target_id);
      logger.info('Target sites retrieved', {
        deploymentId,
        targetCount: targets.length,
        targets: targets.map(t => ({ siteId: t.siteId, siteName: t.siteName }))
      });

      if (targets.length === 0) {
        await this.failDeployment(deploymentId, 'Aucun site cible trouvé');
        return;
      }

      // Vérifier que le package existe
      if (!deployment.package_url) {
        await this.failDeployment(deploymentId, 'URL du package non définie');
        return;
      }

      // Tenter d'envoyer aux sites (ou mettre en queue si offline)
      let successCount = 0;
      const commandSentSites: string[] = [];
      const commandQueuedSites: string[] = [];
      const commandFailedSites: string[] = [];

      // Debug: Log l'état complet du socketService
      const socketDebugInfo = socketService.getDebugInfo();
      logger.info('Socket service state before deployment', {
        deploymentId,
        connectedSites: socketDebugInfo.connectedSites,
        connectedCount: socketDebugInfo.connectedSites.length,
        targetSiteIds: targets.map(t => t.siteId),
      });

      for (const target of targets) {
        const isConnected = socketService.isConnected(target.siteId);
        logger.info('Processing site for deployment', {
          deploymentId,
          siteId: target.siteId,
          siteName: target.siteName,
          isConnected,
        });

        // deployToSite utilise maintenant sendOrQueue, donc fonctionne même si offline
        const success = await this.deployToSite(deploymentId, target.siteId, deployment, deployment.schedule_reboot, deployment.auto_rollback);
        if (success) {
          successCount++;
          if (isConnected) {
            commandSentSites.push(target.siteName);
          } else {
            commandQueuedSites.push(target.siteName);
          }
        } else {
          commandFailedSites.push(target.siteName);
        }
      }

      // Mettre à jour le statut avec des informations détaillées
      if (successCount > 0) {
        // Au moins une commande envoyée ou mise en queue
        const statusMessage = [];
        if (commandSentSites.length > 0) {
          statusMessage.push(`Envoyé: ${commandSentSites.join(', ')}`);
        }
        if (commandQueuedSites.length > 0) {
          statusMessage.push(`En attente de reconnexion: ${commandQueuedSites.join(', ')}`);
        }

        await query(
          `UPDATE update_deployments
           SET status = 'in_progress', started_at = NOW(), error_message = $1
           WHERE id = $2`,
          [statusMessage.join(' | ') || null, deploymentId]
        );

        metricsService.recordDeployment('in_progress', deployment.target_type);

        logger.info('Update deployment in progress', {
          deploymentId,
          commandSentSites,
          commandQueuedSites,
          commandFailedSites,
        });
      } else {
        // Aucune commande n'a pu être envoyée ou mise en queue → marquer comme échoué
        await this.failDeployment(deploymentId, 'Échec de l\'envoi à tous les sites cibles');

        logger.error('Update deployment failed for all sites', {
          deploymentId,
          commandFailedSites,
        });
      }

      logger.info('Update deployment initiated', {
        deploymentId,
        version: deployment.version,
        totalSites: targets.length,
        successCount,
        commandSentSites,
        commandQueuedSites,
        commandFailedSites,
      });
    } catch (error) {
      logger.error('Error starting update deployment:', { deploymentId, error });
      await this.failDeployment(deploymentId, error instanceof Error ? error.message : 'Erreur inconnue');
    }
  }

  /**
   * Traite les déploiements de mises à jour en attente pour un site qui vient de se connecter
   */
  async processPendingDeploymentsForSite(siteId: string): Promise<void> {
    try {
      // Récupérer les déploiements pending/in_progress qui ciblent ce site (directement ou via un groupe)
      const result = await query<UpdateDeploymentRow & SoftwareUpdateRow & { schedule_reboot: boolean; auto_rollback: boolean }>(
        `SELECT ud.*, su.version, su.description, su.is_critical, su.changelog,
                su.package_url, su.package_size, su.checksum
         FROM update_deployments ud
         JOIN software_updates su ON ud.update_id = su.id
         WHERE ud.status IN ('pending', 'in_progress')
           AND (
             (ud.target_type = 'site' AND ud.target_id = $1)
             OR (ud.target_type = 'group' AND ud.target_id IN (
               SELECT group_id FROM site_groups WHERE site_id = $1
             ))
           )`,
        [siteId]
      );

      if (result.rows.length === 0) {
        return;
      }

      // Réconciliation : si le Pi tourne déjà la version cible, marquer comme terminé
      // Cela couvre le cas où le Pi s'est restarté après la mise à jour et le
      // callback completed a été perdu (race condition avec le restart du sync-agent)
      const siteRow = await query<{ software_version: string | null }>(
        `SELECT software_version FROM sites WHERE id = $1`,
        [siteId]
      );
      const currentVersion = siteRow.rows[0]?.software_version;

      logger.info('Processing pending update deployments for site', {
        siteId,
        count: result.rows.length,
        currentVersion,
      });

      for (const deployment of result.rows) {
        // Si le site tourne déjà la version cible → le déploiement a réussi mais le callback a été perdu
        if (currentVersion && deployment.version && currentVersion === deployment.version) {
          logger.info('Reconciliation: site already running target version, marking deployment as completed', {
            siteId,
            deploymentId: deployment.id,
            targetVersion: deployment.version,
            currentVersion,
          });
          await this.handleDeploymentResult(deployment.id, siteId, true);
          continue;
        }

        const success = await this.deployToSite(deployment.id, siteId, deployment, deployment.schedule_reboot, deployment.auto_rollback);

        if (success) {
          // Passer en in_progress si c'était pending
          await query(
            `UPDATE update_deployments
             SET status = 'in_progress', started_at = COALESCE(started_at, NOW())
             WHERE id = $1 AND status = 'pending'`,
            [deployment.id]
          );
        }
      }
    } catch (error) {
      logger.error('Error processing pending update deployments for site:', { siteId, error });
    }
  }

  /**
   * Récupère les sites cibles d'un déploiement
   */
  private async getTargetSites(targetType: string, targetId: string): Promise<DeploymentTarget[]> {
    if (targetType === 'site') {
      const result = await query<{ siteId: string; siteName: string }>(
        'SELECT id as "siteId", site_name as "siteName" FROM sites WHERE id = $1',
        [targetId]
      );
      return result.rows;
    }

    if (targetType === 'group') {
      const result = await query<{ siteId: string; siteName: string }>(
        `SELECT s.id as "siteId", s.site_name as "siteName"
         FROM sites s
         JOIN site_groups sg ON s.id = sg.site_id
         WHERE sg.group_id = $1`,
        [targetId]
      );
      return result.rows;
    }

    return [];
  }

  /**
   * Pré-migration avant OTA : corrige les problèmes connus sur le Pi AVANT
   * que l'ancien code n'exécute l'update. Deux migrations idempotentes :
   *
   * 1. Fichiers VERSION/release.json owned par root → sudo chown pi:pi
   *    (sinon fs.copy échoue avec EACCES car le process tourne en pi)
   *
   * 2. Ancien code avec "sudo cp/tee" → remplacer par "cp/tee"
   *    (bloqué par NoNewPrivileges=true depuis la 3.9.4)
   *    + kill pour forcer un restart avec le code patché
   *
   * TODO: Retirer la migration #2 quand toute la flotte est en >= 3.16.1
   */
  private applyPreUpdateMigration(siteId: string): boolean {
    if (!socketService.isConnected(siteId)) {
      return false;
    }

    // Migration 1 : corriger l'ownership des fichiers VERSION/release.json
    // Idempotent : si déjà pi:pi, chown est un no-op
    const fixOwnershipCommand =
      'for f in /home/pi/neopro/VERSION /home/pi/neopro/release.json /home/pi/neopro/webapp/version.json; do ' +
      '[ -f "$f" ] && [ "$(stat -c %u "$f" 2>/dev/null)" = "0" ] && sudo chown pi:pi "$f" && echo "Fixed: $f"; ' +
      'done; true';

    // Migration 2 : patcher le code qui utilise sudo cp/chown/tee
    // grep -q skip si déjà patché (0 impact)
    // kill force un restart via systemd Restart=always
    const targetFile = '/home/pi/neopro/sync-agent/src/commands/update-software.js';
    const patchCodeCommand =
      `grep -q "sudo cp" ${targetFile} ` +
      `&& sed -i 's/sudo cp/cp/g; s/sudo chown/chown/g; s/sudo tee/tee/g' ${targetFile} ` +
      `&& sed -i '/sudo usermod/d' ${targetFile} ` +
      `&& kill $(pgrep -f agent.js) ` +
      '|| true';

    const migrateCommand = `${fixOwnershipCommand}; ${patchCodeCommand}`;

    try {
      const commandId = uuidv4();

      socketService.sendCommand(siteId, {
        id: commandId,
        type: 'remote_shell',
        data: { command: migrateCommand, timeout: 15000 },
      });

      logger.info('Pre-update migration sent', { siteId });
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('Pre-update migration failed (non-blocking)', { siteId, error: errorMessage });
      return false;
    }
  }

  /**
   * Envoie la commande de mise à jour à un site spécifique
   * Utilise commandQueueService.sendOrQueue() pour gérer les sites offline
   * (même comportement que update_config)
   */
  private async deployToSite(
    deploymentId: string,
    siteId: string,
    update: SoftwareUpdateRow,
    scheduleReboot = false,
    autoRollback = true
  ): Promise<boolean> {
    logger.info('deployToSite called', { deploymentId, siteId, updateVersion: update.version });

    // Migration legacy : patch les Pi avec l'ancien sudo cp (idempotent, 0 impact si déjà OK)
    // Si le Pi est patché, il va restart et recevoir l'update via la queue
    this.applyPreUpdateMigration(siteId);

    const commandData = {
      deploymentId,
      updateId: update.id,
      version: update.version,
      updateUrl: update.package_url, // sync-agent expects 'updateUrl'
      packageSize: update.package_size,
      checksum: update.checksum,
      isCritical: update.is_critical,
      description: update.description,
      changelog: update.changelog,
      scheduleReboot,
      autoRollback,
    };

    logger.info('Sending update_software command via sendOrQueue', {
      siteId,
      deploymentId,
      version: update.version,
      updateUrl: update.package_url,
    });

    // Utiliser sendOrQueue comme pour update_config
    // Si le site est connecté, envoie immédiatement
    // Sinon, met en queue pour envoi à la reconnexion
    const result = await commandQueueService.sendOrQueue(
      siteId,
      'update_software',
      commandData,
      {
        priority: update.is_critical ? 1 : 3, // Priorité haute pour les mises à jour critiques
        description: `Mise à jour v${update.version}`,
        expiresIn: 7 * 24 * 60 * 60 * 1000, // Expire après 7 jours
      }
    );

    logger.info('Command sendOrQueue result', {
      deploymentId,
      siteId,
      sent: result.sent,
      queued: result.queued,
      commandId: result.commandId,
      message: result.message,
    });

    // Retourne true si envoyé OU mis en queue (sera traité à la reconnexion)
    return result.sent || result.queued;
  }

  /**
   * Met à jour le statut d'un déploiement en fonction du résultat
   */
  async handleDeploymentResult(
    deploymentId: string,
    siteId: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    try {
      if (success) {
        // Vérifier si tous les sites ont terminé
        const deployment = await query<{ target_type: string; target_id: string }>(
          `SELECT target_type, target_id FROM update_deployments WHERE id = $1`,
          [deploymentId]
        );

        if (deployment.rows.length === 0) return;

        // Pour simplifier, on marque comme complété dès qu'un site réussit
        // Une implémentation plus complète suivrait chaque site individuellement
        await query(
          `UPDATE update_deployments
           SET status = 'completed', progress = 100, completed_at = NOW()
           WHERE id = $1`,
          [deploymentId]
        );

        metricsService.recordDeployment('completed', deployment.rows[0].target_type);

        logger.info('Update deployment completed', { deploymentId, siteId });
      } else {
        await query(
          `UPDATE update_deployments
           SET status = 'failed', error_message = $1, completed_at = NOW()
           WHERE id = $2`,
          [errorMessage || 'Erreur inconnue', deploymentId]
        );

        metricsService.recordDeployment('failed', 'site');
        logger.error('Update deployment failed', { deploymentId, siteId, errorMessage });
      }
    } catch (error) {
      logger.error('Error handling deployment result:', { deploymentId, error });
    }
  }

  /**
   * Met à jour le progress d'un déploiement
   */
  async updateProgress(deploymentId: string, progress: number): Promise<void> {
    try {
      await query(
        `UPDATE update_deployments
         SET progress = $1, status = 'in_progress'
         WHERE id = $2`,
        [Math.round(progress), deploymentId]
      );
    } catch (error) {
      logger.error('Error updating deployment progress:', { deploymentId, error });
    }
  }

  /**
   * Marque un déploiement comme échoué
   */
  private async failDeployment(deploymentId: string, errorMessage: string): Promise<void> {
    await query(
      `UPDATE update_deployments
       SET status = 'failed', error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      [errorMessage, deploymentId]
    );

    metricsService.recordDeployment('failed', 'site');
    logger.error('Update deployment failed', { deploymentId, errorMessage });
  }

  /**
   * Annule un déploiement en cours
   */
  async cancelDeployment(deploymentId: string): Promise<void> {
    await query(
      `UPDATE update_deployments
       SET status = 'failed', error_message = 'Annulé', completed_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'in_progress')`,
      [deploymentId]
    );

    logger.info('Update deployment cancelled', { deploymentId });
  }

  /**
   * Retente un déploiement échoué
   */
  async retryDeployment(deploymentId: string): Promise<boolean> {
    try {
      const result = await query(
        `SELECT id FROM update_deployments WHERE id = $1 AND status = 'failed'`,
        [deploymentId]
      );

      if (result.rows.length === 0) {
        logger.warn('Update deployment not found or not in failed state', { deploymentId });
        return false;
      }

      // Remettre en pending pour retry
      await query(
        `UPDATE update_deployments
         SET status = 'pending', error_message = NULL, progress = 0, completed_at = NULL
         WHERE id = $1`,
        [deploymentId]
      );

      // Démarrer le déploiement
      await this.startDeployment(deploymentId);

      logger.info('Update deployment manually retried', { deploymentId });
      return true;
    } catch (error) {
      logger.error('Error manually retrying update deployment:', { deploymentId, error });
      return false;
    }
  }
}

export const updateDeploymentService = new UpdateDeploymentService();
export default updateDeploymentService;
