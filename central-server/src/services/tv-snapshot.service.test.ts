/**
 * Tests TvSnapshotService — pipeline mini-thumb régie SaaS (ADR-104).
 */

import { tvSnapshotService } from './tv-snapshot.service';

describe('TvSnapshotService', () => {
  const SITE_A = 'site-a-uuid';
  const SITE_B = 'site-b-uuid';
  const FRAME = 'data:image/jpeg;base64,/9j/4AAQ';

  it('returns null when no frame has been pushed', () => {
    expect(tvSnapshotService.get('unknown-site')).toBeNull();
  });

  it('stores and returns the last frame for a site', () => {
    tvSnapshotService.set(SITE_A, FRAME);
    const entry = tvSnapshotService.get(SITE_A);
    expect(entry).not.toBeNull();
    expect(entry!.frame).toBe(FRAME);
    expect(typeof entry!.receivedAt).toBe('number');
  });

  it('isolates snapshots per site', () => {
    tvSnapshotService.set(SITE_A, 'data:image/jpeg;base64,AAAA');
    tvSnapshotService.set(SITE_B, 'data:image/jpeg;base64,BBBB');
    expect(tvSnapshotService.get(SITE_A)!.frame).toBe('data:image/jpeg;base64,AAAA');
    expect(tvSnapshotService.get(SITE_B)!.frame).toBe('data:image/jpeg;base64,BBBB');
  });

  it('expires entries older than the TTL', () => {
    tvSnapshotService.set(SITE_A, FRAME);
    // Fast-forward time beyond the 3s TTL
    const realNow = Date.now;
    Date.now = () => realNow() + 4000;
    try {
      expect(tvSnapshotService.get(SITE_A)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});
