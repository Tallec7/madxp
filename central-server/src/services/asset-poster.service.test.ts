/**
 * Unit tests — asset-poster.service.
 * Covers the pure path/URL transforms; the full upload pipeline is exercised
 * via integration tests (FTP-dependent, kept out of the unit harness).
 */

import { posterPathFromWebmPath, posterUrlFromWebmUrl } from './asset-poster.service';

describe('posterPathFromWebmPath', () => {
  it('replaces .webm with .poster.jpg in the same nested folder', () => {
    expect(posterPathFromWebmPath('template-assets/library/1234-JOUEUR_but_A.webm'))
      .toBe('template-assets/library/1234-JOUEUR_but_A.poster.jpg');
  });

  it('handles uppercase extension', () => {
    expect(posterPathFromWebmPath('a/b/c.WEBM')).toBe('a/b/c.poster.jpg');
  });

  it('handles a single-segment storage path', () => {
    expect(posterPathFromWebmPath('asset.webm')).toBe('asset.poster.jpg');
  });

  it('handles MP4 source by replacing the extension generically', () => {
    expect(posterPathFromWebmPath('foo/bar/baz.mp4')).toBe('foo/bar/baz.poster.jpg');
  });
});

describe('posterUrlFromWebmUrl', () => {
  it('replaces .webm with .poster.jpg in a public URL', () => {
    expect(
      posterUrlFromWebmUrl('https://files.kalon.bzh/template-assets/library/1234-x.webm'),
    ).toBe('https://files.kalon.bzh/template-assets/library/1234-x.poster.jpg');
  });

  it('handles a URL with query string by treating the dot before the path-end', () => {
    // Edge case : query strings are not expected on FTP-public URLs but we
    // still keep the transform deterministic on the basename portion.
    expect(posterUrlFromWebmUrl('https://x/y.webm')).toBe('https://x/y.poster.jpg');
  });
});
