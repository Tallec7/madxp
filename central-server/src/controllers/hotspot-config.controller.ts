import { Response } from 'express';
import { randomBytes } from 'crypto';
import { AuthRequest } from '../types';
import { SiteAuthRequest } from '../middleware/auth';
import { hotspotConfigRepository } from '../repositories/hotspot-config.repository';
import { commandQueueService } from '../services/command-queue.service';
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
    logger.error('getHotspotConfigAdminView error', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const bootstrapHotspotConfig = async (req: SiteAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (req.siteId !== id) {
      res.status(403).json({ error: 'API key does not match site' });
      return;
    }
    const { ssid, psk } = req.body as { ssid: string; psk: string };
    const stored = await hotspotConfigRepository.bootstrap(id, ssid, psk);
    if (!stored) {
      const existing = await hotspotConfigRepository.findBySiteId(id);
      res.status(409).json({
        error: 'Already bootstrapped',
        ssid: existing?.ssid,
        psk: existing?.psk,
      });
      return;
    }
    logger.info('Hotspot config bootstrapped (ADR-074)', { siteId: id, ssid });
    res.status(201).json({ success: true });
  } catch (error) {
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
    try {
      await commandQueueService.sendOrQueue(id, 'rotate_psk', {});
    } catch (cmdErr) {
      logger.warn('rotate_psk dispatch failed (rotation persisted)', {
        siteId: id,
        error: cmdErr instanceof Error ? cmdErr.message : String(cmdErr),
      });
    }

    res.json({ success: true, psk, generated: !providedPsk });
  } catch (error) {
    logger.error('rotateHotspotConfig error', { error, siteId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
};

function generatePsk(): string {
  return randomBytes(16).toString('base64').replace(/[/+=]/g, '').slice(0, 17) + 'Neo';
}
