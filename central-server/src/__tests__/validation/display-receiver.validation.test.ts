import { schemas } from '../../middleware/validation';

describe('schemas.updateDisplays — receiver (DATA-01)', () => {
  const wrap = (display: object) => schemas.updateDisplays.validate({ displays: [display] });

  it('accepte un display sans receiver (rétro-compat)', () => {
    expect(wrap({ index: 0, name: 'TV', type: 'tv' }).error).toBeUndefined();
  });

  it('accepte receiver pi_native minimal', () => {
    expect(wrap({ index: 0, name: 'TV', type: 'tv', receiver: { kind: 'pi_native' } }).error).toBeUndefined();
  });

  it('accepte receiver firestick complet (mac + last_seen_at)', () => {
    expect(
      wrap({
        index: 1,
        name: 'Bar',
        type: 'tv',
        receiver: { kind: 'firestick', mac: '0C:43:F9:36:04:77', last_seen_at: '2026-05-06T10:00:00Z' },
      }).error,
    ).toBeUndefined();
  });

  it('accepte receiver: null (désassignation)', () => {
    expect(wrap({ index: 1, name: 'Bar', type: 'tv', receiver: null }).error).toBeUndefined();
  });

  it('rejette un kind inconnu', () => {
    const { error } = wrap({ index: 0, name: 'TV', type: 'tv', receiver: { kind: 'chromecast' } });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/kind/);
  });

  it('rejette une MAC mal formée', () => {
    const { error } = wrap({
      index: 1,
      name: 'Bar',
      type: 'tv',
      receiver: { kind: 'firestick', mac: 'not-a-mac' },
    });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/mac/);
  });
});
