/**
 * command-dispatch.js — v4.0 Phase 7 CLOUD-04
 *
 * Gère le dispatch de la commande `receiver_assignment_updated` reçue depuis
 * le cloud. Cette commande est émise par le central-server après un PATCH
 * /api/sites/:id/displays (Plan 07-cloud-02).
 *
 * Flow :
 *   cloud PATCH displays
 *     → commandQueueService.sendOrQueue('receiver_assignment_updated', { displays })
 *       → sync-agent reçoit la commande via Socket.IO cloud
 *         → dispatchCommand({ command, payload })
 *           → receiversService.assignDisplay(mac, displayIndex) pour chaque display assigné
 *             → cache local `.receivers-cache.json` mis à jour automatiquement
 *
 * Pattern : cohérent avec `rotate_psk` (commands/index.js) — la logique Pi-locale
 * est extraite dans un module dédié testable indépendamment.
 */

// Support both production (ReceiversService class) and test (mocked singleton object).
// In production : receivers.service.js exports the ReceiversService class.
// In tests      : jest.mock replaces the module with { assignDisplay: jest.fn() }.
const _receiversModule = require('../../server/services/receivers.service');

/**
 * Résout le service receivers : singleton mock en test, instance chargée depuis
 * le cache en production.
 * @returns {{ assignDisplay: (mac: string, displayIndex: number) => void }}
 */
function _resolveReceiversService() {
  if (typeof _receiversModule === 'function' && _receiversModule.prototype && typeof _receiversModule.prototype.assignDisplay === 'function') {
    // Production : classe ReceiversService — instancier et charger le cache persiste.
    const svc = new _receiversModule();
    svc.loadCache();
    return svc;
  }
  // Test / mock : objet directement utilisable.
  return _receiversModule;
}

const receiversService = _resolveReceiversService();

/**
 * Dispatch la commande `receiver_assignment_updated`.
 *
 * Parcourt `payload.displays`, appelle `receiversService.assignDisplay(mac, displayIndex)`
 * pour chaque display porteur d'un `receiver.mac` valide.
 *
 * Invariants :
 *  - Idempotent : appeler 2× la même commande ne casse pas le cache local
 *    (assignDisplay est idempotent — Phase 5).
 *  - Défensif   : payload null / displays manquant → warn + no-op, pas de throw.
 *  - Résilient  : assignDisplay throw → capturé, warn, pas de crash sync-agent.
 *
 * @param {{ command: string, payload: object | null }} cmd
 * @returns {Promise<void>}
 */
async function dispatchCommand({ command, payload }) {
  if (command !== 'receiver_assignment_updated') {
    // Ce module ne gère que receiver_assignment_updated.
    // Les autres commandes passent par services/command-dispatch.js → commands/index.js.
    return;
  }

  try {
    const displays = payload && Array.isArray(payload.displays) ? payload.displays : null;

    if (!displays) {
      console.warn('[command-dispatch] receiver_assignment_updated: payload.displays missing or invalid', { payload });
      return;
    }

    let assigned = 0;

    for (const d of displays) {
      const mac =
        d && d.receiver && typeof d.receiver.mac === 'string' ? d.receiver.mac : null;
      const idx = d && typeof d.index === 'number' ? d.index : null;

      if (mac !== null && idx !== null) {
        receiversService.assignDisplay(mac, idx);
        assigned++;
      }
    }

    console.info('[command-dispatch] receiver_assignment_updated processed', {
      total: displays.length,
      assigned,
    });
  } catch (err) {
    console.warn('[command-dispatch] receiver_assignment_updated failed', {
      err: err && err.message,
    });
  }
}

module.exports = { dispatchCommand };
