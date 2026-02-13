/**
 * Recording State Handler — Captures recording state from Pi agents.
 *
 * Stores recording state in-memory (not DB — ephemeral data).
 * The cloud remote reads this via the remote state API.
 *
 * @see socket-context.ts for SocketContext interface
 */

import { SocketContext } from './socket-context';
import logger from '../config/logger';

export interface RecordingStateMessage {
  isRecording: boolean;
  isManualOverride: boolean;
}

export function handleRecordingState(
  ctx: SocketContext,
  siteId: string,
  message: RecordingStateMessage
): void {
  ctx.recordingStates.set(siteId, {
    isRecording: !!message.isRecording,
    isManualOverride: !!message.isManualOverride,
    updatedAt: Date.now(),
  });

  logger.debug('Recording state updated', {
    siteId,
    isRecording: message.isRecording,
    isManualOverride: message.isManualOverride,
  });
}
