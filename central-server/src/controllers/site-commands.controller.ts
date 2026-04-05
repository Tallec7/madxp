import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, UserRole } from '../types';
import logger from '../config/logger';
import { auditService } from '../services/audit.service';
import { commandQueueService } from '../services/command-queue.service';
import { validateShellCommand, getAllowedCommandsForRole } from '../middleware/remote-shell-security';
import {
  siteRepository,
  remoteCommandRepository,
  timelineRepository,
  videoRepository,
} from '../repositories';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const validateCommandPayload = (command: string, data?: Record<string, unknown>) => {
  if (command === 'update_config') {
    const hasValidPayload = data && (
      data.configuration ||
      data.neoProContent ||
      (data.mode === 'update_agent' && data.agentFiles)
    );
    if (!hasValidPayload) {
      throw new HttpError(400, 'Commande update_config invalide: configuration, neoProContent ou agentFiles requis');
    }
  }
};

const ensureSiteConnected = async (siteId: string) => {
  const site = await siteRepository.findBasicInfo(siteId);
  if (!site) {
    throw new HttpError(404, 'Site non trouvé');
  }

  const socketService = (await import('../services/socket.service')).default;
  if (!socketService.isConnected(siteId)) {
    throw new HttpError(503, 'Site non connecté');
  }

  return { site, socketService };
};

export const dispatchCommand = async (
  siteId: string,
  command: string,
  data: Record<string, unknown> | undefined,
  executedBy?: string
): Promise<{ commandId: string; siteName: string }> => {
  if (!command) {
    throw new HttpError(400, 'Commande requise');
  }

  validateCommandPayload(command, data);

  const { site, socketService } = await ensureSiteConnected(siteId);

  const commandId = uuidv4();
  await remoteCommandRepository.create({
    id: commandId,
    siteId,
    commandType: command,
    commandData: data ? JSON.stringify(data) : null,
    executedBy,
  });

  // Pour les commandes update_config, bloquer les sync_local_state pendant 60s
  // pour éviter qu'ils n'écrasent la config fraîchement déployée
  if (command === 'update_config') {
    await siteRepository.setConfigUpdatePending(siteId, 60);
    logger.info('Config update pending lock set for 60s', { siteId, commandId });
  }

  const sent = socketService.sendCommand(siteId, {
    id: commandId,
    type: command,
    data: data || {},
  });

  if (!sent) {
    await remoteCommandRepository.updateStatus(commandId, 'failed', 'Échec envoi');
    // Si l'envoi échoue, lever le blocage
    if (command === 'update_config') {
      await siteRepository.clearConfigUpdatePending(siteId);
    }
    throw new HttpError(503, 'Échec de l\'envoi de la commande');
  }

  await remoteCommandRepository.updateStatus(commandId, 'executing');

  logger.info('Command sent to site', {
    siteId,
    siteName: site.site_name,
    command,
    commandId,
    sentBy: executedBy,
    hasPayload: !!data,
    payloadKeys: data ? Object.keys(data) : [],
  });

  return { commandId, siteName: site.site_name as string };
};

export const waitForCommandResult = async (commandId: string, timeoutMs = 30000) => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const row = await remoteCommandRepository.findStatusById(commandId);

    if (row) {

      if (row.status === 'completed') {
        const parsedResult = typeof row.result === 'string' ? JSON.parse(row.result) : row.result;
        return parsedResult || {};
      }

      if (row.status === 'failed') {
        throw new HttpError(500, row.error_message || 'Commande échouée');
      }
    }

    await wait(1000);
  }

  throw new HttpError(504, 'Timeout en attendant la réponse du boîtier');
};

export const sendCommand = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { command, params: data, queueIfOffline = true, priority, expiresIn } = req.body;

    if (!command) {
      return res.status(400).json({ error: 'Commande requise' });
    }

    // Validation spéciale pour remote_shell
    if (command === 'remote_shell') {
      const userRole = req.user?.role as UserRole;

      // Vérifier que l'utilisateur a le droit d'utiliser le terminal
      if (!userRole || !['super_admin', 'superadmin', 'admin', 'operator'].includes(userRole)) {
        return res.status(403).json({
          error: 'Accès non autorisé au terminal distant',
          allowedCommands: [],
        });
      }

      // Valider la commande shell
      const shellCommand = data?.command;
      if (!shellCommand) {
        return res.status(400).json({ error: 'Commande shell requise (params.command)' });
      }

      const validation = validateShellCommand(shellCommand, userRole);
      if (!validation.valid) {
        logger.warn('Shell command blocked', {
          siteId: id,
          command: shellCommand.substring(0, 100),
          reason: validation.reason,
          user: req.user?.email,
          role: userRole,
        });

        // Audit log pour tentative bloquée
        auditService.log({
          action: 'REMOTE_SHELL_BLOCKED',
          userId: req.user?.id,
          targetType: 'site',
          targetId: id,
          details: {
            command: shellCommand.substring(0, 200),
            reason: validation.reason,
          },
        }, req);

        return res.status(403).json({
          error: validation.reason,
          allowedCommands: getAllowedCommandsForRole(userRole),
        });
      }

      // Audit log pour commande shell exécutée
      auditService.log({
        action: 'REMOTE_SHELL_EXECUTE',
        userId: req.user?.id,
        targetType: 'site',
        targetId: id,
        details: {
          command: validation.sanitizedCommand?.substring(0, 500),
        },
      }, req);

      // Les commandes shell ne doivent pas être mises en queue (besoin de connexion temps réel)
      // Forcer queueIfOffline = false pour remote_shell
      const socketService = (await import('../services/socket.service')).default;
      if (!socketService.isConnected(id)) {
        return res.status(503).json({
          error: 'Le site n\'est pas connecté. Le terminal distant nécessite une connexion active.',
        });
      }

      // Envoyer la commande avec la commande sanitizée
      const normalizedShellData = {
        ...data,
        command: validation.sanitizedCommand,
      };

      const { commandId } = await dispatchCommand(id, command, normalizedShellData, req.user?.id);

      // Retourner immédiatement le commandId - le résultat sera envoyé via WebSocket (command_completed)
      // Cela évite les timeouts 504 sur Railway Gateway (60s max)
      return res.status(202).json({
        success: true,
        commandId,
        status: 'pending',
        message: 'Commande envoyée. Le résultat sera reçu via WebSocket (événement command_completed).',
      });
    }

    // Gate: bloquer le déploiement de vidéos fantômes (0 B / sans checksum)
    if (command === 'deploy_video' && data?.videoId) {
      const video = await videoRepository.findVideoById(data.videoId);
      if (video && (!video.checksum || video.file_size === 0)) {
        return res.status(409).json({
          error: 'Vidéo incomplète',
          message: `La vidéo "${video.original_name || video.filename}" est incomplète (fichier absent ou upload échoué). Supprimez-la et re-uploadez.`,
        });
      }
    }

    // Si la commande update_config arrive avec "configuration", convertir en "neoProContent"
    // Le sync-agent attend neoProContent pour le merge intelligent
    let normalizedData = data;
    if (command === 'update_config' && data && data.configuration) {
      // Convertir { configuration, mode? } en { neoProContent, mode }
      const mode = data.mode || 'merge'; // Par défaut "merge" pour préserver le contenu local
      normalizedData = { ...data, neoProContent: data.configuration, mode };
      delete normalizedData.configuration;
      logger.info('update_config: converted configuration to neoProContent', { siteId: id, mode });
    }

    validateCommandPayload(command, normalizedData);

    // Vérifier que le site existe
    const siteInfo = await siteRepository.findBasicInfo(id);
    if (!siteInfo) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    // Utiliser sendOrQueue si queueIfOffline est activé (défaut)
    if (queueIfOffline) {
      const result = await commandQueueService.sendOrQueue(
        id,
        command,
        normalizedData || {},
        {
          userId: req.user?.id,
          priority: priority || 5,
          expiresIn: expiresIn,
          description: `${command} via dashboard`,
        }
      );

      logger.info('Command sent or queued', {
        siteId: id,
        command,
        sent: result.sent,
        queued: result.queued,
        commandId: result.commandId,
        sentBy: req.user?.email,
      });

      return res.json({
        success: result.sent || result.queued,
        sent: result.sent,
        queued: result.queued,
        commandId: result.commandId,
        message: result.message,
      });
    }

    // Mode legacy: requiert une connexion temps réel
    const { commandId } = await dispatchCommand(id, command, normalizedData, req.user?.id);

    res.json({ success: true, sent: true, queued: false, commandId, message: 'Commande envoyée' });
  } catch (error) {
    logger.error('Send command error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de l\'envoi de la commande' });
  }
};

export const getCommandStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id, commandId } = req.params;

    const command = await timelineRepository.findCommandBySiteAndId(commandId, id);

    if (!command) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    res.json(command);
  } catch (error) {
    logger.error('Get command status error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du statut' });
  }
};

export const getPendingCommands = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Vérifier que le site existe
    const siteInfo = await siteRepository.findBasicInfo(id);
    if (!siteInfo) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const commands = await commandQueueService.getPendingCommands(id);

    res.json({
      siteId: id,
      siteName: siteInfo.site_name,
      clubName: siteInfo.club_name,
      pendingCount: commands.length,
      commands,
    });
  } catch (error) {
    logger.error('Get pending commands error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des commandes en attente' });
  }
};

export const cancelPendingCommand = async (req: AuthRequest, res: Response) => {
  try {
    const { id, commandId } = req.params;

    // Vérifier que la commande appartient bien à ce site
    const pendingCmd = await timelineRepository.findPendingCommand(commandId, id);

    if (!pendingCmd) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    const deleted = await commandQueueService.cancelPendingCommand(commandId);

    if (deleted) {
      logger.info('Pending command cancelled', { commandId, siteId: id, cancelledBy: req.user?.email });
      res.json({ success: true, message: 'Commande annulée' });
    } else {
      res.status(404).json({ error: 'Commande non trouvée' });
    }
  } catch (error) {
    logger.error('Cancel pending command error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation de la commande' });
  }
};

export const clearPendingCommands = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Vérifier que le site existe
    const siteInfo = await siteRepository.findBasicInfo(id);
    if (!siteInfo) {
      return res.status(404).json({ error: 'Site non trouvé' });
    }

    const count = await commandQueueService.clearPendingCommands(id);

    logger.info('All pending commands cleared', { siteId: id, count, clearedBy: req.user?.email });

    res.json({
      success: true,
      message: `${count} commande(s) annulée(s)`,
      count,
    });
  } catch (error) {
    logger.error('Clear pending commands error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation des commandes' });
  }
};

export const getQueueSummary = async (req: AuthRequest, res: Response) => {
  try {
    const summary = await commandQueueService.getQueueSummary();

    const totalPending = summary.reduce((acc, s) => acc + s.pending_count, 0);

    res.json({
      totalPending,
      sitesWithPendingCommands: summary.length,
      sites: summary,
    });
  } catch (error) {
    logger.error('Get queue summary error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du résumé de la queue' });
  }
};
