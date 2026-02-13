/**
 * Socket Context — Shared state interface for socket handler DI.
 *
 * All socket handlers receive a `SocketContext` object instead of
 * accessing global state. The SocketService orchestrator owns the
 * actual Maps and passes them to handlers via this interface.
 *
 * @see services/socket.service.ts (orchestrator)
 */

import { Server as SocketIOServer, Socket } from 'socket.io';

/**
 * Tracks an in-flight command sent to a Raspberry Pi.
 * Used by command-dispatch and the orchestrator to detect timeouts.
 */
export interface PendingCommand {
  commandId: string;
  siteId: string;
  type: string;
  sentAt: number;
  timeoutMs: number;
}

/**
 * Shared state context passed to all socket handlers via dependency injection.
 * Owned by SocketService, consumed (read/write) by handler functions.
 *
 * Maps are passed by reference — handlers can call .get(), .set(), .delete().
 */
export interface SocketContext {
  /** Socket.IO server instance (null before initialize()) */
  getIO(): SocketIOServer | null;

  /** Map of siteId → Socket for connected Pi agents */
  readonly connectedSites: Map<string, Socket>;

  /** Map of commandId → PendingCommand for in-flight commands */
  readonly pendingCommands: Map<string, PendingCommand>;

  /** Map of siteId → timestamp (ms) of last pong/heartbeat received */
  readonly lastPongReceived: Map<string, number>;

  /** Map of siteId → recording state (ephemeral, in-memory) */
  readonly recordingStates: Map<string, { isRecording: boolean; isManualOverride: boolean; updatedAt: number }>;
}
