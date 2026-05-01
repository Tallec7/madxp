/**
 * Handler Socket.IO — SaaS Relay (PROP-002 Phase 5 / ADR-037 / ADR-096)
 *
 * Le central server joue le rôle du serveur Socket.IO local du Pi pour les
 * sites SaaS (sans matériel Pi). Ce handler isole toute la logique relay :
 * - Relay des événements télécommande → action (ADR-081 audit)
 * - Sync de l'état partagé (score, phase, timer, options, recording)
 * - Master-slave TV sync (ADR-033/034)
 * - GC sweep des saasStates (issue #594)
 *
 * État privé au module (saasStates, saasRelayRegistered) — pas d'accès
 * externe. Le SocketService délègue ici via 3 fonctions exportées.
 *
 * @see ADR-096 — Extraction handler SaaS relay depuis socket.service.ts
 * @see ADR-037 — Architecture SaaS (sites sans Pi)
 * @see ADR-081 — Audit des commandes télécommande
 * @see ADR-090 — scoreboard-state push depuis Remote SaaS
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import logger from '../config/logger';
import metricsService from '../services/metrics.service';
import { remoteCommandAuditRepository } from '../repositories/remote-command-audit.repository';

// ============================================================================
// State (private au module)
// ============================================================================

interface SaasState {
  score: Record<string, unknown> | null;
  phase: string;
  options: Record<string, unknown> | null;
  timer: { currentTime: number; isRunning: boolean; [key: string]: unknown };
  recording: { isRecording: boolean; isManualOverride: boolean };
  tvInstances: Map<string, { role: 'master' | 'slave'; displayType: string; displayIndex: number; connectedAt: number }>;
  loopState: Record<string, unknown> | null;
}

// SaaS state storage (per site) — initialisé eagerly pour préserver le type
// narrowing dans les closures (issue #594 : la lazy init `Map | undefined`
// bloquait TS2532 dans les handlers `disconnect` qui accèdent à
// `saasStates.delete()` après cleanup).
const saasStates: Map<string, SaasState> = new Map();
const saasRelayRegistered = new Set<string>();

// ============================================================================
// Helpers
// ============================================================================

/**
 * ADR-081 Phase 0 — Audit d'une commande télécommande relayée.
 * Fire-and-forget : log + INSERT. Jamais bloquant pour le relay.
 * `source`: 'saas' (SaaS TV) ou 'pi' (Pi cloud relay).
 */
function auditRemoteCommand(
  io: SocketIOServer | null,
  siteId: string,
  data: Record<string, unknown>,
  source: 'saas' | 'pi'
): void {
  const room = io?.sockets.adapter.rooms.get(siteId);
  const roomSize = room ? room.size : 0;
  // Exclure le socket emitter du count : on veut le nombre de receivers
  const receivers = Math.max(0, roomSize - 1);
  const commandId = (data?.commandId as string) || undefined;
  const commandType = (data?.type as string) || 'unknown';

  logger.info('Remote command relayed', {
    commandId,
    siteId,
    commandType,
    source,
    receivers,
  });

  if (!commandId) return; // Phase 0 : pas d'audit sans commandId

  remoteCommandAuditRepository
    .insert({
      commandId,
      siteId,
      commandType,
      roomSize: receivers,
      metadata: { source },
    })
    .catch((err: Error) => {
      logger.warn('Remote command audit insert failed', {
        commandId,
        siteId,
        error: err.message,
      });
    });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Phase 5 — PROP-002 : enregistre tous les listeners SaaS sur un socket.
 * Appelé une fois par socket SaaS authentifié. Idempotent (évite la double
 * registration en cas de reconnexion rapide).
 *
 * Réplique le serveur Socket.IO local du Pi pour les sites SaaS.
 */
export function registerSaasRelay(io: SocketIOServer | null, socket: Socket, siteId: string): void {
  // Avoid duplicate registration on reconnect
  if (saasRelayRegistered.has(socket.id)) return;
  saasRelayRegistered.add(socket.id);

  // State storage per site (lightweight, in-memory)
  if (!saasStates.has(siteId)) {
    saasStates.set(siteId, { score: null, phase: 'neutral', options: null, timer: { currentTime: 0, isRunning: false }, recording: { isRecording: false, isManualOverride: false }, tvInstances: new Map(), loopState: null });
    metricsService.recordSaasStatesCount(saasStates.size);
  }
  const state = saasStates.get(siteId)!;

  // command → action relay (same as Pi server)
  // ADR-081 Phase 0: log + audit (fire-and-forget, non-bloquant)
  socket.on('command', (data: Record<string, unknown>) => {
    socket.to(siteId).emit('action', data);
    auditRemoteCommand(io, siteId, data, 'saas');
  });

  // ADR-059 SaaS — relay state-sync (émis après chaque commande granulaire)
  socket.on('state-sync', (data: Record<string, unknown>) => {
    socket.to(siteId).emit('state-sync', data);
  });

  // Score relay + state persistence
  socket.on('score-update', (data: Record<string, unknown>) => {
    state.score = data;
    socket.to(siteId).emit('score-update', data);
  });

  socket.on('score-reset', () => {
    state.score = null;
    socket.to(siteId).emit('score-reset');
  });

  // Phase relay
  socket.on('phase-change', (data: Record<string, unknown>) => {
    state.phase = (data as { phase: string }).phase || 'neutral';
    socket.to(siteId).emit('phase-change', data);
  });

  // Timer relay
  socket.on('timer-update', (data: Record<string, unknown>) => {
    Object.assign(state.timer, data);
    socket.to(siteId).emit('timer-update', data);
  });

  // Breaking news relay
  socket.on('breaking-news', (data: Record<string, unknown>) => {
    socket.to(siteId).emit('breaking-news', data);
  });

  // Options relay
  socket.on('options-update', (data: Record<string, unknown>) => {
    state.options = data;
    socket.to(siteId).emit('options-update', data);
  });

  // Recording state relay
  socket.on('recording-state', (data: Record<string, unknown>) => {
    state.recording = data as { isRecording: boolean; isManualOverride: boolean };
    socket.to(siteId).emit('recording-state', data);
  });

  // Match info relay
  socket.on('match-info-updated', (data: Record<string, unknown>) => {
    socket.to(siteId).emit('match-info-updated', data);
  });

  // ADR-090 — scoreboard-state push depuis la Remote SaaS (pas de JWT : relay socket).
  // Le Remote SaaS est déjà authentifié par son siteId room (saas-register).
  // Le payload est validé par `validateScoreboardStatePush` avant persistence + broadcast.
  socket.on('scoreboard-state-push', (data: Record<string, unknown>) => {
    try {
      const { validateScoreboardStatePush } = require('../validators/scoreboard.validator');
      const validated = validateScoreboardStatePush(data);
      if (!validated) return;
      const {
        scoreboardStateRepository,
      } = require('../repositories/scoreboard-state.repository');
      const fullState = { siteId, ...validated, updatedAt: Date.now() };
      scoreboardStateRepository.upsert(fullState);
      if (io) io.to(siteId).emit('scoreboard-state', fullState);
    } catch (err) {
      logger.warn('scoreboard-state-push invalid payload', { siteId, err: (err as Error).message });
    }
  });

  // --- Master-Slave TV sync (same as Pi local server) ---

  // TV registration with role assignment
  socket.on('tv-register', (data: Record<string, unknown>) => {
    const displayType = (data?.displayType as string) || 'tv';
    const displayIndex = (data?.displayIndex as number) ?? 0;
    const instances = state.tvInstances;

    // Find current master
    const masterEntry = [...instances.entries()].find(([, info]) => info.role === 'master');

    let role: 'master' | 'slave';
    let demotedId: string | null = null;

    if (!masterEntry) {
      role = 'master';
    } else if (displayType === 'tv' && masterEntry[1].displayType !== 'tv') {
      // Pi kiosk priority
      masterEntry[1].role = 'slave';
      demotedId = masterEntry[0];
      role = 'master';
    } else {
      role = 'slave';
    }

    instances.set(socket.id, { role, displayType, displayIndex, connectedAt: Date.now() });
    socket.emit('tv-role-assigned', { role });
    logger.info('SaaS TV registered', { siteId, socketId: socket.id, role, displayType, displayIndex });

    if (demotedId && io) {
      io.to(demotedId).emit('tv-role-assigned', { role: 'slave' });
      io.to(demotedId).emit('tv-loop-state', state.loopState);
    }

    if (role === 'slave' && state.loopState) {
      socket.emit('tv-loop-state', state.loopState);
    }

    // Notify displays changed
    const displays = getSaasConnectedDisplays(io, siteId);
    socket.to(siteId).emit('displays-changed', { displays });
    socket.emit('displays-changed', { displays });
  });

  // ADR-106 — preview-slave heartbeat tick (master → preview only).
  // Relayed to room without persistence; only preview-slaves consume it.
  socket.on('tv-preview-tick', (data: Record<string, unknown>) => {
    const instance = state.tvInstances.get(socket.id);
    if (!instance || instance.role !== 'master') return;
    socket.to(siteId).emit('tv-preview-tick', data);
  });

  // TV loop update (master → slaves)
  socket.on('tv-loop-update', (data: Record<string, unknown>) => {
    const instance = state.tvInstances.get(socket.id);
    if (!instance || instance.role !== 'master') return;
    state.loopState = data;
    socket.to(siteId).emit('tv-loop-state', data);
  });

  // Request state (SaaS equivalent of Pi's request-state)
  socket.on('request-state', () => {
    if (state.score) socket.emit('score-update', state.score);
    socket.emit('phase-change', { phase: state.phase });
    socket.emit('recording-state', state.recording);
    if (state.options) socket.emit('options-update', state.options);
    if (state.timer.isRunning || state.timer.currentTime > 0) {
      socket.emit('timer-update', { action: 'sync', ...state.timer });
    }
    const displays = getSaasConnectedDisplays(io, siteId);
    socket.emit('displays-changed', { displays });
  });

  // Cleanup on disconnect — unregister TV + promote slave if master disconnects
  socket.on('disconnect', () => {
    saasRelayRegistered.delete(socket.id);
    const instance = state.tvInstances.get(socket.id);
    if (instance) {
      const wasMaster = instance.role === 'master';
      state.tvInstances.delete(socket.id);

      if (wasMaster) {
        // Promote oldest slave
        let oldest: { id: string; connectedAt: number } | null = null;
        for (const [id, info] of state.tvInstances) {
          if (!oldest || info.connectedAt < oldest.connectedAt) {
            oldest = { id, connectedAt: info.connectedAt };
          }
        }
        if (oldest && io) {
          state.tvInstances.get(oldest.id)!.role = 'master';
          io.to(oldest.id).emit('tv-role-assigned', { role: 'master' });
          logger.info('SaaS TV promoted to master', { siteId, promoted: oldest.id });
        }
      }
    }

    // Release saasStates entry when no clients remain for this site (issue #594 fix)
    if (state.tvInstances.size === 0) {
      const room = io?.sockets.adapter.rooms.get(siteId);
      if (!room || room.size === 0) {
        saasStates.delete(siteId);
        metricsService.recordSaasStatesCount(saasStates.size);
        logger.info('SaaS state released — no remaining clients', { siteId });
      }
    }
  });
}

/**
 * ADR-106 — preview-slave handler attached on EVERY socket connection
 * (not gated behind saas-register, because the preview iframe explicitly
 * skips saas-register to avoid being counted in getSaasClientCount).
 *
 * Payload: `{ siteId }`. The handler does `socket.join(siteId)` so room
 * broadcasts of `tv-loop-state` and `tv-preview-tick` reach the preview,
 * then emits the current loopState immediately to avoid a black frame.
 *
 * Does NOT register the socket as a TV instance (no master/slave election),
 * does NOT broadcast displays-changed, does NOT touch getSaasClientCount.
 */
export function registerPreviewSlaveOnSocket(io: SocketIOServer | null, socket: Socket): void {
  socket.on('tv-preview-register', (data: Record<string, unknown>) => {
    const siteId = (data?.siteId as string) || '';
    if (!siteId) {
      logger.warn('tv-preview-register missing siteId, ignoring', { socketId: socket.id });
      return;
    }
    socket.join(siteId);
    logger.info('Preview-slave joined room', { siteId, socketId: socket.id });

    const state = saasStates.get(siteId);
    if (state?.loopState) {
      socket.emit('tv-loop-state', state.loopState);
    }
  });
}

/**
 * Phase 5 — PROP-002 : retourne les displays SaaS connectés pour un site.
 * Lecture only ; déduplication par displayIndex.
 */
export function getSaasConnectedDisplays(
  io: SocketIOServer | null,
  siteId: string
): Array<{ index: number; type: string }> {
  if (!io) return [];
  const room = io.sockets.adapter.rooms.get(siteId);
  if (!room) return [];
  const seen = new Set<number>();
  const displays: Array<{ index: number; type: string }> = [];
  for (const socketId of room) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock && (sock as any).clientType === 'saas-tv') {
      const index = (sock as any).displayIndex ?? 0;
      if (!seen.has(index)) {
        seen.add(index);
        displays.push({ index, type: `display-${index}` });
      }
    }
  }
  return displays.sort((a, b) => a.index - b.index);
}

/**
 * Sweep périodique (audit P0) : purge les saasStates dont aucun client n'est
 * plus connecté (zombie sockets qui ne firérent jamais 'disconnect').
 * Complément du cleanup synchrone fait dans le handler disconnect (issue #594).
 */
export function sweepOrphanSaasStates(io: SocketIOServer | null): void {
  if (!saasStates.size || !io) return;
  let purged = 0;
  for (const [siteId, state] of saasStates) {
    const room = io.sockets.adapter.rooms.get(siteId);
    const roomEmpty = !room || room.size === 0;
    if (roomEmpty && state.tvInstances.size === 0) {
      saasStates.delete(siteId);
      purged++;
    }
  }
  if (purged > 0) {
    metricsService.recordSaasStatesCount(saasStates.size);
    logger.info('SaaS states GC sweep purged orphan entries', {
      purged,
      remaining: saasStates.size,
    });
  }
}

// ============================================================================
// Test-only API (utilisé par socket.service.test.ts pour reset entre tests)
// ============================================================================

/** @internal — reset module state. Tests only. */
export function __resetSaasRelayState(): void {
  saasStates.clear();
  saasRelayRegistered.clear();
}

/** @internal — current state size. Tests only. */
export function __getSaasStatesSize(): number {
  return saasStates.size;
}

/** @internal — read entry for a site. Tests only. */
export function __getSaasState(siteId: string): SaasState | undefined {
  return saasStates.get(siteId);
}

/** @internal — direct access to states Map for assertion. Tests only. */
export function __getSaasStatesMap(): Map<string, SaasState> {
  return saasStates;
}

/** @internal — direct access to registered set for assertion. Tests only. */
export function __getSaasRelayRegistered(): Set<string> {
  return saasRelayRegistered;
}
