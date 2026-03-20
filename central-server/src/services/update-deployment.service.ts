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

      // Déduplication : vérifier si une commande update_software a déjà été envoyée récemment
      // Empêche le double envoi lors de reconnexions rapides pendant un OTA en cours
      const recentCommandsResult = await query<{ command_id: string }>(
        `SELECT id as command_id FROM remote_commands
         WHERE site_id = $1
           AND command_type = 'update_software'
           AND status IN ('pending', 'executing')
           AND created_at > NOW() - INTERVAL '120 seconds'
         LIMIT 1`,
        [siteId]
      );

      if (recentCommandsResult.rows.length > 0) {
        logger.info('Skipping update deployment: recent update_software command already in flight', {
          siteId,
          existingCommandId: recentCommandsResult.rows[0].command_id,
          pendingDeployments: result.rows.length,
        });
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
   * Pré-migration avant OTA : supprime les fichiers VERSION/release.json root:root
   * AVANT que le sync-agent n'exécute l'update.
   *
   * Problème : les anciennes versions du sync-agent créaient ces fichiers en root:root
   * via "sudo cp/tee". Le code OTA v3.17.1 (et antérieur) fait fs.copy(VERSION,
   * { overwrite: true }) qui appelle fs.unlink() sur le fichier root → EACCES.
   *
   * Solution : SUPPRIMER les fichiers root:root avant l'OTA.
   * Stratégie en 4 niveaux (pour chaque fichier) :
   * 1. rm -f (sans sudo) → marche si le dossier parent est pi:pi (cas standard)
   * 2. sudo chown pi:pi → marche si NoNewPrivileges=false ET sudoers installé
   * 3. sudo rm -f → marche si NoNewPrivileges=false
   * 4. Diagnostic → log les permissions pour debug futur
   */
  private applyPreUpdateMigration(siteId: string): boolean {
    if (!socketService.isConnected(siteId)) {
      return false;
    }

    const diagnostic =
      'echo "=== PRE-MIGRATION DIAG ==="; ' +
      'stat -c "dir %n owner=%U:%G perms=%a" /home/pi/neopro/ 2>/dev/null; ' +
      'stat -c "dir %n owner=%U:%G perms=%a" /home/pi/neopro/webapp/ 2>/dev/null; ' +
      'for f in /home/pi/neopro/VERSION /home/pi/neopro/release.json /home/pi/neopro/webapp/version.json; do ' +
      'stat -c "file %n owner=%U:%G perms=%a uid=%u" "$f" 2>/dev/null || echo "file $f ABSENT"; ' +
      'done';

    const fixFiles =
      'for f in /home/pi/neopro/VERSION /home/pi/neopro/release.json /home/pi/neopro/webapp/version.json; do ' +
      'if [ -f "$f" ] && [ "$(stat -c %u "$f" 2>/dev/null)" = "0" ]; then ' +
      'rm -f "$f" 2>/dev/null && echo "FIXED rm: $f" && continue; ' +
      'sudo chown pi:pi "$f" 2>/dev/null && echo "FIXED chown: $f" && continue; ' +
      'sudo rm -f "$f" 2>/dev/null && echo "FIXED sudo-rm: $f" && continue; ' +
      'echo "FAIL: cannot fix $f (dir may be root:root or NoNewPrivileges)"; ' +
      'fi; done; ' +
      'for d in /home/pi/neopro /home/pi/neopro/webapp; do ' +
      'if [ "$(stat -c %u "$d" 2>/dev/null)" = "0" ]; then ' +
      'sudo chown pi:pi "$d" 2>/dev/null && echo "FIXED dir: $d" || echo "FAIL dir: $d"; ' +
      'fi; done; ' +
      'echo "=== PRE-MIGRATION DONE ==="; true';

    const fixOwnershipCommand = `${diagnostic}; ${fixFiles}`;

    try {
      const commandId = uuidv4();

      socketService.sendCommand(siteId, {
        id: commandId,
        type: 'remote_shell',
        data: { command: fixOwnershipCommand, timeout: 10000 },
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

    // Pré-migration : supprimer les fichiers VERSION/release.json root:root avant l'OTA
    // Les commandes s'exécutent en parallèle sur le Pi, il faut attendre que le rm
    // termine avant d'envoyer update_software sinon fs.copy() → EACCES.
    const migrationSent = this.applyPreUpdateMigration(siteId);
    if (migrationSent) {
      await this.delay(3000);
    }

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
      scheduleReboot,
      autoRollback,
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
        const durationResult = await query<{ duration_seconds: string }>(
          `UPDATE update_deployments
           SET status = 'completed', progress = 100, completed_at = NOW()
           WHERE id = $1
           RETURNING EXTRACT(EPOCH FROM (NOW() - started_at)) as duration_seconds`,
          [deploymentId]
        );

        metricsService.recordDeployment('completed', deployment.rows[0].target_type);
        const durationSeconds = parseFloat(durationResult.rows[0]?.duration_seconds);
        if (!isNaN(durationSeconds)) {
          metricsService.recordDeploymentDuration(deployment.rows[0].target_type, durationSeconds);
        }

        logger.info('Update deployment completed', { deploymentId, siteId });
      } else {
        await query(
          `UPDATE update_deployments
           SET status = 'failed', error_message = $1, completed_at = NOW()
           WHERE id = $2`,
          [errorMessage || 'Erreur inconnue', deploymentId]
        );

        metricsService.recordDeployment('failed', 'site');
        metricsService.recordOtaError(this.categorizeOtaError(errorMessage));
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
    metricsService.recordOtaError(this.categorizeOtaError(errorMessage));
    logger.error('Update deployment failed', { deploymentId, errorMessage });
  }

  /**
   * Categorize OTA error messages for Prometheus labeling
   */
  private categorizeOtaError(errorMessage?: string): string {
    if (!errorMessage) return 'unknown';
    const msg = errorMessage.toLowerCase();
    if (msg.includes('eacces') || msg.includes('permission')) return 'permission';
    if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
    if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('enotfound')) return 'network';
    if (msg.includes('disk') || msg.includes('enospc') || msg.includes('no space')) return 'disk_full';
    if (msg.includes('annulé') || msg.includes('cancel')) return 'cancelled';
    return 'other';
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

  /**
   * Délai asynchrone — méthode séparée pour permettre le mock dans les tests
   */
  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const updateDeploymentService = new UpdateDeploymentService();
export default updateDeploymentService;
