import { Response } from 'express';
import { AuthRequest } from '../types';
import logger from '../config/logger';
import { metricsService } from '../services/metrics.service';
import { dispatchCommand, waitForCommandResult } from './site-commands.controller';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const getSiteLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const lines = parseInt(req.query.lines as string, 10) || 100;
    const service = (req.query.service as string) || 'neopro-app';

    logger.info('Getting logs for site', { siteId: id, service, lines });

    const { commandId } = await dispatchCommand(id, 'get_logs', { lines, service }, req.user?.id);
    logger.info('Command dispatched', { commandId, siteId: id });

    const result = await waitForCommandResult(commandId, 30000);
    logger.info('Command result received', { commandId, hasLogs: !!result?.logs, resultKeys: Object.keys(result || {}) });

    const logsText = (result?.logs as string) || '';
    res.json({ logs: logsText.split('\n') });
  } catch (error) {
    logger.error('Get site logs error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la récupération des logs' });
  }
};

export const getSystemInfo = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'get_system_info', {}, req.user?.id)).commandId,
      20000
    );

    if (!result?.systemInfo) {
      throw new HttpError(500, 'Réponse système invalide');
    }

    res.json(result.systemInfo);
  } catch (error) {
    logger.error('Get system info error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la récupération des informations système' });
  }
};

export const getHotspotConfig = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'get_hotspot_config', {}, req.user?.id)).commandId,
      15000
    );

    res.json(result);
  } catch (error) {
    logger.error('Get hotspot config error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la récupération de la configuration hotspot' });
  }
};

export const getHealthStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'get_health_status', {}, req.user?.id)).commandId,
      30000
    );

    res.json(result);
  } catch (error) {
    logger.error('Get health status error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'état de santé' });
  }
};

export const runDiagnostics = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'run_diagnostics', {}, req.user?.id)).commandId,
      60000 // 60 secondes pour les diagnostics complets
    );

    res.json(result);
  } catch (error) {
    logger.error('Run diagnostics error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de l\'exécution des diagnostics' });
  }
};

export const getNetworkDiagnostics = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'network_diagnostics', {}, req.user?.id)).commandId,
      30000 // 30 secondes pour les diagnostics réseau
    );

    res.json(result);
  } catch (error) {
    logger.error('Network diagnostics error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors des diagnostics réseau' });
  }
};

export const fixHotspot = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { autoFix = false } = req.body;

    logger.info('Fixing hotspot', { siteId: id, autoFix });

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'fix_hotspot', { autoFix }, req.user?.id)).commandId,
      120000 // 2 minutes pour le scan des canaux WiFi
    );

    res.json(result);
  } catch (error) {
    logger.error('Fix hotspot error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la réparation du hotspot' });
  }
};

export const getWifiBssidStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Getting WiFi BSSID status', { siteId: id });

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'get_wifi_bssid_status', {}, req.user?.id)).commandId,
      30000 // 30 secondes pour le scan
    );

    res.json(result);
  } catch (error) {
    logger.error('Get WiFi BSSID status error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la récupération du statut WiFi BSSID' });
  }
};

export const removeBssidLock = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Removing BSSID lock', { siteId: id });

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'remove_bssid_lock', {}, req.user?.id)).commandId,
      30000
    );

    res.json(result);
  } catch (error) {
    logger.error('Remove BSSID lock error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la suppression du verrouillage BSSID' });
  }
};

export const optimizeForMesh = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Optimizing for mesh WiFi', { siteId: id });

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'optimize_for_mesh', {}, req.user?.id)).commandId,
      30000
    );

    res.json(result);
  } catch (error) {
    logger.error('Optimize for mesh error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de l\'optimisation pour mesh' });
  }
};

export const scanWifiNetworks = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Scanning WiFi networks', { siteId: id });

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'scan_wifi_networks', {}, req.user?.id)).commandId,
      30000 // 30 secondes pour le scan
    );

    metricsService.recordWifiConfig('scan', 'success');
    res.json(result);
  } catch (error) {
    metricsService.recordWifiConfig('scan', 'failed');
    logger.error('Scan WiFi networks error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors du scan des réseaux WiFi' });
  }
};

export const connectWifiClient = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { ssid, password } = req.body;

    // Validation
    if (!ssid || !ssid.trim()) {
      return res.status(400).json({ error: 'SSID requis' });
    }
    if (!password || password.length < 8 || password.length > 63) {
      return res.status(400).json({ error: 'Mot de passe invalide (8-63 caractères pour WPA2)' });
    }

    logger.info('Configuring WiFi client', { siteId: id, ssid });

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'configure_wifi_client', { ssid, password }, req.user?.id)).commandId,
      45000 // 45 secondes pour configuration + connexion
    );

    metricsService.recordWifiConfig('connect', 'success');
    res.json(result);
  } catch (error) {
    metricsService.recordWifiConfig('connect', 'failed');
    logger.error('Configure WiFi client error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la configuration du WiFi client' });
  }
};

export const exportDebugBundle = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Exporting debug bundle', { siteId: id });

    const result = await waitForCommandResult(
      (await dispatchCommand(id, 'export_debug_bundle', {}, req.user?.id)).commandId,
      60000 // 60 secondes pour collecter toutes les données
    );

    res.json(result);
  } catch (error) {
    logger.error('Export debug bundle error:', error);
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de l\'export du bundle de debug' });
  }
};
