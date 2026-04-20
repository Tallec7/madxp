import { Response } from 'express';
import { randomBytes } from 'crypto';
import { AuthRequest } from '../types';
import { SiteAuthRequest } from '../middleware/auth';
import { hotspotConfigRepository } from '../repositories/hotspot-config.repository';
import { commandQueueService } from '../services/command-queue.service';
import { metricsService } from '../services/metrics.service';
import logger from '../config/logger';

/**
 * ADR-074 — Hotspot config controller.
 *
 * Four endpoints:
 *   GET  /api/sites/:id/hotspot-config             → Pi fetch (site API key)
 *   GET  /api/sites/:id/hotspot-config/admin-view  → admin dashboard read (JWT, ADR-076)
 *   POST /api/sites/:id/hotspot-config/bootstrap   → Pi one-shot upload of existing local PSK
 *   POST /api/sites/:id/hotspot-config/rotate      → admin dashboard rotates PSK
 */

const isDecryptError = (err: unknown): boolean => {
  const msg = err instanceof Error ? err.message : String(err);
  return /unable to authenticate data|Unsupported state|bad decrypt|wrong final block length/i.test(msg);
};

export const getHotspotConfig = async (req: SiteAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (req.siteId !== id) {
      res.status(403).json({ error: 'API key does not match site' });
      return;
    }
    const config = await hotspotConfigRepository.findBySiteId(id);
    if (!config) {
      res.status(404).json({ error: 'Hotspot config not bootstrapped yet (ADR-074)' });
      return;
    }
    res.json({
      ssid: config.ssid,
      psk: config.psk,
      rotatedAt: config.rotatedAt,
    });
  } catch (error) {
    if (isDecryptError(error)) {
      metricsService.recordHotspotPskDecryptError();
    }
    logger.error('getHotspotConfig error', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getHotspotConfigAdminView = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const config = await hotspotConfigRepository.findBySiteId(id);
    if (!config) {
      res.json({ configured: false });
      return;
    }
    res.json({
      configured: true,
      ssid: config.ssid,
      psk: config.psk,
      rotatedAt: config.rotatedAt,
    });
  } catch (error) {
    if (isDecryptError(error)) {
      metricsService.recordHotspotPskDecryptError();
    }
    logger.error('getHotspotConfigAdminView error', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const bootstrapHotspotConfig = async (req: SiteAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (req.siteId !== id) {
      metricsService.recordHotspotBootstrapAttempt('forbidden');
      res.status(403).json({ error: 'API key does not match site' });
      return;
    }
    const { ssid, psk } = req.body as { ssid: string; psk: string };
    const stored = await hotspotConfigRepository.bootstrap(id, ssid, psk);
    if (!stored) {
      const existing = await hotspotConfigRepository.findBySiteId(id);
      metricsService.recordHotspotBootstrapAttempt('already_bootstrapped');
      res.status(409).json({
        error: 'Already bootstrapped',
        ssid: existing?.ssid,
        psk: existing?.psk,
      });
      return;
    }
    metricsService.recordHotspotBootstrapAttempt('success');
    logger.info('Hotspot config bootstrapped (ADR-074)', { siteId: id, ssid });
    res.status(201).json({ success: true });
  } catch (error) {
    if (isDecryptError(error)) {
      metricsService.recordHotspotPskDecryptError();
      metricsService.recordHotspotBootstrapAttempt('decrypt_error');
    } else {
      metricsService.recordHotspotBootstrapAttempt('error');
    }
    logger.error('bootstrapHotspotConfig error', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const rotateHotspotConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { psk: providedPsk, ssid } = (req.body ?? {}) as { psk?: string; ssid?: string };
    const psk = providedPsk ?? generatePsk();
    await hotspotConfigRepository.rotate(id, psk, ssid);
    logger.info('Hotspot PSK rotated (ADR-074)', {
      siteId: id,
      userId: req.user?.id,
      generated: !providedPsk,
    });

    // ADR-074 — notify the Pi so it re-pulls the cloud config and rewrites hostapd.conf.
    // Use sendOrQueue so offline Pi get it on next reconnect (handleAuthenticated also syncs).
    let dispatchStatus: 'success' | 'command_dispatch_failed' = 'success';
    try {
      await commandQueueService.sendOrQueue(id, 'rotate_psk', {});
    } catch (cmdErr) {
      dispatchStatus = 'command_dispatch_failed';
      logger.warn('rotate_psk dispatch failed (rotation persisted)', {
        siteId: id,
        error: cmdErr instanceof Error ? cmdErr.message : String(cmdErr),
      });
    }

    metricsService.recordHotspotRotationAttempt(dispatchStatus);
    res.json({ success: true, psk, generated: !providedPsk });
  } catch (error) {
    metricsService.recordHotspotRotationAttempt('error');
    logger.error('rotateHotspotConfig error', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};

function generatePsk(): string {
  return randomBytes(16).toString('base64').replace(/[/+=]/g, '').slice(0, 17) + 'Neo';
}
