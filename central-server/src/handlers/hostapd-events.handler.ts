/**
 * hostapd-events.handler.ts — ADR-072 OTA-2.
 *
 * Handle event `hostapd_event` émis par le Pi (hostapd_cli attach via
 * `raspberry/sync-agent/src/services/hostapd-telemetry.js`).
 * Persiste l'event en DB pour diagnostic à distance (table hostapd_events)
 * et relaie vers la room `dashboard` pour affichage temps réel.
 */

import logger from '../config/logger';
import hostapdEventsRepository from '../repositories/hostapd-events.repository';
import { SocketContext } from './socket-context';

const VALID_EVENT_TYPES = new Set([
  'AP-STA-CONNECTED',
  'AP-STA-DISCONNECTED',
  'AP-STA-POSSIBLE-PSK-MISMATCH',
  'CTRL-EVENT-EAP-FAILURE',
]);

const MAC_REGEX = /^[0-9a-f:]{17}$/;

export async function handleHostapdEvent(
  ctx: SocketContext,
  siteId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const eventType = String(payload.eventType || '');
    const clientMac = String(payload.clientMac || '').toLowerCase();
    const rawTs = payload.timestamp ? new Date(String(payload.timestamp)) : new Date();
    const occurredAt = isNaN(rawTs.getTime()) ? new Date() : rawTs;

    if (!VALID_EVENT_TYPES.has(eventType) || !MAC_REGEX.test(clientMac)) {
      logger.debug('hostapd_event: invalid payload, dropped', { siteId, eventType, clientMac });
      return;
    }

    await hostapdEventsRepository.insert({
      siteId,
      eventType,
      clientMac,
      occurredAt,
      metadata: {
        rawLine: payload.rawLine,
      },
    });

    const io = ctx.getIO();
    if (io) {
      io.to('dashboard').emit('hostapd_event', {
        siteId,
        eventType,
        clientMac,
        occurredAt: occurredAt.toISOString(),
      });
    }
  } catch (error) {
    logger.error('Error handling hostapd_event:', { siteId, error });
  }
}
