/**
 * Tests : command-dispatch.js — handler receiver_assignment_updated (CLOUD-04 + ADR-114)
 *
 * Couvre :
 *  1. Happy path : 2 displays assignés + 1 sans receiver → assignDisplay appelé 2×
 *  2. Payload invalide : null / displays manquant → assignDisplay non appelé + warn émis
 *  3. Résilience : assignDisplay throw → pas de propagation d'erreur
 *  4. ADR-114 : write-through configuration.json.displays après assignDisplay
 *  5. ADR-114 : échec d'écriture → warn + on continue (pas de throw)
 */

jest.mock('../../../server/services/receivers.service', () => ({
  assignDisplay: jest.fn(),
}));

jest.mock('../utils/safe-config-io', () => ({
  safeReadConfig: jest.fn(),
  atomicWriteJson: jest.fn(),
}));

jest.mock('../config', () => ({
  config: {
    paths: { config: '/tmp/test-configuration.json' },
  },
}));


const receiversService = require('../../../server/services/receivers.service');
const { safeReadConfig, atomicWriteJson } = require('../utils/safe-config-io');
const { dispatchCommand } = require('../command-dispatch');

describe('command-dispatch — receiver_assignment_updated', () => {
  let warnSpy;
  let infoSpy;

  beforeEach(() => {
    receiversService.assignDisplay.mockReset();
    safeReadConfig.mockReset();
    atomicWriteJson.mockReset();
    safeReadConfig.mockResolvedValue({ siteId: 'test', displays: [] });
    atomicWriteJson.mockResolvedValue(undefined);
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

  // ADR-114 — write-through configuration.json.displays
  it('persists displays to configuration.json after assignDisplay (ADR-114)', async () => {
    safeReadConfig.mockResolvedValue({ siteId: 'test', displays: [{ index: 0 }] });
    const displays = [
      { index: 0, name: 'TV', receiver: { kind: 'pi-hdmi' } },
      { index: 1, name: 'Bandeau', receiver: { kind: 'firestick', mac: 'aa:bb:cc:dd:ee:01' } },
    ];

    await dispatchCommand({ command: 'receiver_assignment_updated', payload: { displays } });

    expect(safeReadConfig).toHaveBeenCalledWith('/tmp/test-configuration.json');
    expect(atomicWriteJson).toHaveBeenCalledTimes(1);
    const [writePath, writeBody] = atomicWriteJson.mock.calls[0];
    expect(writePath).toBe('/tmp/test-configuration.json');
    expect(writeBody.displays).toEqual(displays);
    expect(writeBody.siteId).toBe('test');
  });

  it('warns and continues when configuration.json write fails (ADR-114)', async () => {
    atomicWriteJson.mockRejectedValueOnce(new Error('EACCES'));

    await expect(
      dispatchCommand({
        command: 'receiver_assignment_updated',
        payload: { displays: [{ index: 1, receiver: { mac: 'aa:bb:cc:dd:ee:01' } }] },
      })
    ).resolves.not.toThrow();

    expect(receiversService.assignDisplay).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to persist displays'),
      expect.objectContaining({ err: 'EACCES' })
    );
  });

  it('warns when configuration.json is unreadable (ADR-114)', async () => {
    safeReadConfig.mockResolvedValueOnce(null);

    await dispatchCommand({
      command: 'receiver_assignment_updated',
      payload: { displays: [{ index: 1, receiver: { mac: 'aa:bb:cc:dd:ee:01' } }] },
    });

    expect(atomicWriteJson).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('configuration.json unreadable'),
      expect.any(Object)
    );
  });
});
