/**
 * StateBroadcaster — ADR-059 (Pi autoritaire)
 *
 * Émet `state-sync` vers tous les clients après chaque mutation d'état.
 * Le numéro de séquence est monotone par session Pi (reset au redémarrage).
 */

let _seq = 0;

/**
 * @param {import('socket.io').Server} io
 * @param {import('../services/state.service')} stateService
 */
module.exports = function createStateBroadcaster(io, stateService) {
  return {
    broadcast() {
      const state = stateService.getFullState();
      _seq++;
      io.emit('state-sync', {
        seq: _seq,
        score: state.score,
        phase: state.phase,
        timer: state.timer,
        options: state.options,
        receivers: state.receivers,
        serverTs: Date.now(),
      });
    },
  };
};
