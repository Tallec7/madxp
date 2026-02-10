/**
 * Config Sync Handler — Manages configuration synchronization with Pi.
 *
 * Handles local state mirrors from Pi, pending config deployments,
 * and ensures the dashboard sees real-time config updates.
 *
 * @see socket-context.ts for SocketContext interface
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import { CommandMessage } from '../types';
import logger from '../config/logger';
import { SocketContext } from './socket-context';

/**
 * Handle sync_local_state from a Raspberry Pi.
 * Stores the config mirror in DB, triggers pending config sync, and license status.
 *
 * @param sendLicenseStatusFn Callback to send license status (avoids circular handler import)
 */
export async function handleSyncLocalState(
  ctx: SocketContext,
  siteId: string,
  state: Record<string, unknown>,
  sendLicenseStatusFn: (ctx: SocketContext, siteId: string) => Promise<void>
): Promise<void> {
  try {
    const { configHash, config, videos, storage, hotspotSsid, hotspotInfo, networkProfile, timestamp } = state;

    logger.info('Received local state sync', {
      siteId,
      configHash,
      categoriesCount: (config as Record<string, unknown>)?.categories
        ? ((config as Record<string, unknown>).categories as unknown[]).length
        : 0,
      videosCount: Array.isArray(videos) ? videos.length : 0,
      hotspotSsid: hotspotSsid || (hotspotInfo as Record<string, unknown>)?.ssid || null,
      hotspotChannel: (hotspotInfo as Record<string, unknown>)?.channel || null,
      hotspotClients: (hotspotInfo as Record<string, unknown>)?.clients || 0,
      networkType: (networkProfile as Record<string, unknown>)?.type || 'unknown',
      networkApCount: (networkProfile as Record<string, unknown>)?.apCount || 0,
      bssidLocked: (networkProfile as Record<string, unknown>)?.bssidLocked || false,
      timestamp,
    });

    // Avertir si BSSID lock en mesh
    if (
      (networkProfile as Record<string, unknown>)?.type === 'mesh' &&
      (networkProfile as Record<string, unknown>)?.bssidLocked
    ) {
      logger.warn('Site has BSSID lock in mesh environment - connectivity issues may occur', {
        siteId,
        ssid: (networkProfile as Record<string, unknown>).currentSsid,
        apCount: (networkProfile as Record<string, unknown>).apCount,
      });
    }

    // Vérifier si une mise à jour de config est en attente
    const pendingCheck = await query<{ config_update_pending_until: Date | null }>(
      `SELECT config_update_pending_until FROM sites WHERE id = $1`,
      [siteId]
    );
    const pendingUntil = pendingCheck.rows[0]?.config_update_pending_until;
    const isConfigUpdatePending = pendingUntil && new Date(pendingUntil) > new Date();

    // Enrichir la config avec les vidéos, le stockage, les infos hotspot et le profil réseau
    const enrichedConfig = {
      ...(config as Record<string, unknown>),
      _localVideos: videos || [],
      _localStorage: storage || null,
      _hotspotSsid: hotspotSsid || (hotspotInfo as Record<string, unknown>)?.ssid || null,
      _hotspotInfo: hotspotInfo || null,
      _networkProfile: networkProfile || null,
      _lastVideoSync: timestamp,
    };

    if (isConfigUpdatePending) {
      logger.info('Config update pending - updating only metadata fields, preserving deployed config', {
        siteId,
        pendingUntil,
        videosCount: Array.isArray(videos) ? videos.length : 0,
      });

      await query(
        `UPDATE sites
         SET local_config_mirror = jsonb_set(
               jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     jsonb_set(
                       jsonb_set(
                         COALESCE(local_config_mirror, '{}'::jsonb),
                         '{_localVideos}', $1::jsonb
                       ),
                       '{_localStorage}', $2::jsonb
                     ),
                     '{_hotspotSsid}', $3::jsonb
                   ),
                   '{_hotspotInfo}', $4::jsonb
                 ),
                 '{_networkProfile}', $5::jsonb
               ),
               '{_lastVideoSync}', $6::jsonb
             ),
             last_config_sync = NOW(),
             network_profile = COALESCE($8::jsonb, network_profile),
             network_profile_updated_at = CASE WHEN $8 IS NOT NULL THEN NOW() ELSE network_profile_updated_at END
         WHERE id = $7`,
        [
          JSON.stringify(videos || []),
          JSON.stringify(storage || null),
          JSON.stringify(hotspotSsid || (hotspotInfo as Record<string, unknown>)?.ssid || null),
          JSON.stringify(hotspotInfo || null),
          JSON.stringify(networkProfile || null),
          JSON.stringify(timestamp),
          siteId,
          networkProfile ? JSON.stringify(networkProfile) : null,
        ]
      );
    } else {
      await query(
        `UPDATE sites
         SET local_config_mirror = $1,
             local_config_hash = $2,
             last_config_sync = NOW(),
             network_profile = COALESCE($4::jsonb, network_profile),
             network_profile_updated_at = CASE WHEN $4 IS NOT NULL THEN NOW() ELSE network_profile_updated_at END
         WHERE id = $3`,
        [JSON.stringify(enrichedConfig), configHash, siteId, networkProfile ? JSON.stringify(networkProfile) : null]
      );
    }

    // Émettre au dashboard pour mise à jour en temps réel
    const io = ctx.getIO();
    if (io) {
      io.to('dashboard').emit('site_config_updated', {
        siteId,
        configHash,
        categoriesCount: (config as Record<string, unknown>)?.categories
          ? ((config as Record<string, unknown>).categories as unknown[]).length
          : 0,
        videosCount: Array.isArray(videos) ? videos.length : 0,
        timestamp,
      });
    }

    logger.info('Local state stored', {
      siteId,
      configHash,
      videosCount: Array.isArray(videos) ? videos.length : 0,
      configUpdatePending: isConfigUpdatePending,
    });

    await triggerPendingConfigSync(ctx, siteId);

    // Send license status to Pi
    await sendLicenseStatusFn(ctx, siteId);
  } catch (error) {
    logger.error('Error handling sync_local_state:', error);
  }
}

/**
 * Check if a pending config exists and send it to the Pi.
 *
 * @param sendCommandFn Callback to send command (avoids circular handler import)
 */
export async function triggerPendingConfigSync(
  ctx: SocketContext,
  siteId: string,
  sendCommandFn?: (siteId: string, command: CommandMessage) => boolean
): Promise<void> {
  if (!ctx.connectedSites.has(siteId)) {
    return;
  }

  try {
    const pendingVersion = await getPendingConfigVersion(siteId);
    if (!pendingVersion) {
      return;
    }

    if (await hasActiveConfigCommand(siteId, pendingVersion)) {
      return;
    }

    const configuration = await fetchConfigVersion(pendingVersion);
    if (!configuration) {
      await clearPendingConfig(siteId, pendingVersion);
      return;
    }

    await sendPendingConfigCommand(ctx, siteId, configuration, pendingVersion, sendCommandFn);
  } catch (error) {
    if ((error as Record<string, unknown>)?.code === '42703') {
      logger.warn('pending_config_version_id column missing - skipping pending config sync', {
        siteId,
      });
    } else {
      logger.error('Error triggering pending config sync:', { siteId, error });
    }
  }
}

/**
 * Clear the pending config version for a site after successful deployment.
 */
export async function clearPendingConfig(siteId: string, versionId: string): Promise<void> {
  await query(
    `UPDATE sites
     SET pending_config_version_id = NULL
     WHERE id = $1 AND pending_config_version_id = $2`,
    [siteId, versionId]
  );
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function getPendingConfigVersion(siteId: string): Promise<string | null> {
  const result = await query<{ pending_config_version_id: string | null }>(
    'SELECT pending_config_version_id FROM sites WHERE id = $1',
    [siteId]
  );
  return (result.rows[0]?.pending_config_version_id as string | null) ?? null;
}

async function fetchConfigVersion(versionId: string): Promise<Record<string, unknown> | null> {
  const result = await query<{ configuration: Record<string, unknown> | null }>(
    'SELECT configuration FROM config_history WHERE id = $1',
    [versionId]
  );
  return (result.rows[0]?.configuration as Record<string, unknown> | null) ?? null;
}

async function hasActiveConfigCommand(siteId: string, versionId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM remote_commands
     WHERE site_id = $1
       AND command_type = 'update_config'
       AND status IN ('pending', 'executing')
       AND command_data ->> 'configVersionId' = $2
     LIMIT 1`,
    [siteId, versionId]
  );
  return result.rows.length > 0;
}

async function sendPendingConfigCommand(
  ctx: SocketContext,
  siteId: string,
  configuration: Record<string, unknown>,
  versionId: string,
  sendCommandFn?: (siteId: string, command: CommandMessage) => boolean
): Promise<void> {
  if (!ctx.connectedSites.has(siteId)) {
    return;
  }

  const commandId = uuidv4();
  const commandPayload = {
    configuration,
    configVersionId: versionId,
  };

  await query(
    `INSERT INTO remote_commands (id, site_id, command_type, command_data, status)
     VALUES ($1, $2, 'update_config', $3, 'pending')`,
    [commandId, siteId, JSON.stringify(commandPayload)]
  );

  const command: CommandMessage = {
    id: commandId,
    type: 'update_config',
    data: commandPayload,
  };

  let sent = false;
  if (sendCommandFn) {
    sent = sendCommandFn(siteId, command);
  } else {
    // Fallback: emit directly (used when called without orchestrator wiring)
    const socket = ctx.connectedSites.get(siteId);
    if (socket?.connected) {
      socket.emit('command', command);
      sent = true;
    }
  }

  if (!sent) {
    await query(
      `UPDATE remote_commands
       SET status = 'failed', error_message = 'Site disconnected'
       WHERE id = $1`,
      [commandId]
    );
    return;
  }

  await query(
    `UPDATE remote_commands
     SET status = 'executing', executed_at = NOW()
     WHERE id = $1`,
    [commandId]
  );
}
