/**
 * Tests : command-dispatch.js — handler receiver_assignment_updated (CLOUD-04)
 *
 * Couvre :
 *  1. Happy path : 2 displays assignés + 1 sans receiver → assignDisplay appelé 2×
 *  2. Payload invalide : null / displays manquant → assignDisplay non appelé + warn émis
 *  3. Résilience : assignDisplay throw → pas de propagation d'erreur
 */

jest.mock('../../../server/services/receivers.service', () => ({
  assignDisplay: jest.fn(),
}));

 
const receiversService = require('../../../server/services/receivers.service');
const { dispatchCommand } = require('../command-dispatch');

describe('command-dispatch — receiver_assignment_updated', () => {
  let warnSpy;
  let infoSpy;

  beforeEach(() => {
    receiversService.assignDisplay.mockReset();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('calls assignDisplay for each assigned display', async () => {
    const payload = {
      displays: [
        { index: 0, kind: 'pi_native' }, // pas de receiver → skip
        { index: 1, receiver: { kind: 'firestick', mac: 'aa:bb:cc:dd:ee:01' } },
        { index: 2, receiver: { kind: 'firestick', mac: 'aa:bb:cc:dd:ee:02' } },
      ],
    };

    await dispatchCommand({ command: 'receiver_assignment_updated', payload });

    expect(receiversService.assignDisplay).toHaveBeenCalledTimes(2);
    expect(receiversService.assignDisplay).toHaveBeenCalledWith('aa:bb:cc:dd:ee:01', 1);
    expect(receiversService.assignDisplay).toHaveBeenCalledWith('aa:bb:cc:dd:ee:02', 2);
  });

  it('warns and does not call assignDisplay when payload.displays missing', async () => {
    await dispatchCommand({ command: 'receiver_assignment_updated', payload: null });

    expect(receiversService.assignDisplay).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('does not throw when assignDisplay throws', async () => {
    receiversService.assignDisplay.mockImplementationOnce(() => {
      throw new Error('cache write fail');
    });

    await expect(
      dispatchCommand({
        command: 'receiver_assignment_updated',
        payload: { displays: [{ index: 1, receiver: { mac: 'aa:bb:cc:dd:ee:03' } }] },
      })
    ).resolves.not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
  });
});
