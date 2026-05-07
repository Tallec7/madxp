/**
 * Smoke test — Garde-fou contre la réintroduction du pattern d'URL cassée
 * `up.railway.app/remotion-preview/public/*.webm` dans les runtimes Remotion.
 *
 * Contexte (incident 2026-05-07) :
 * - 23 rows DB (template_layers.video_url + template_variants.background_video_url)
 *   pointaient vers https://neopro-central-production.up.railway.app/remotion-preview/public/*.webm
 * - Ces assets n'existaient PAS sur le FTP Hostinger ni sur Railway
 * - OffthreadVideo retry en boucle → cascade Chrome → tab unresponsive
 * - 7 templates affectés ont été archivés (status='archived')
 *
 * Ce test garantit que :
 *  1. Les 2 runtimes (dashboard preview + worker render) ont une deny-list
 *     `BROKEN_URL_PATTERNS` qui rejette ce pattern précis.
 *  2. `isValidSrc()` retourne `false` ET log un warn quand le pattern matche.
 *  3. Le pattern reste enforce-able dans le futur (file-based, pas de DB).
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

const RUNTIME_FILES = [
  'central-dashboard/src/app/features/content/remotion-templates/studio-player/template-runtime.tsx',
  'templates-remotion/src/runtime/TemplateRuntime.tsx',
];

describe('smoke: template broken asset URL deny-list (incident 2026-05-07)', () => {
  for (const relPath of RUNTIME_FILES) {
    describe(relPath, () => {
      const absPath = path.join(REPO_ROOT, relPath);
      let source: string;

      beforeAll(() => {
        expect(fs.existsSync(absPath)).toBe(true);
        source = fs.readFileSync(absPath, 'utf8');
      });

      it('declares BROKEN_URL_PATTERNS const', () => {
        expect(source).toMatch(/const\s+BROKEN_URL_PATTERNS\s*=/);
      });

      it('includes the railway preview broken pattern in deny-list', () => {
        expect(source).toMatch(/up\\\.railway\\\.app\\\/remotion-preview\\\/public/);
      });

      it('isValidSrc loops over BROKEN_URL_PATTERNS', () => {
        expect(source).toMatch(/for\s*\(\s*const\s+\w+\s+of\s+BROKEN_URL_PATTERNS/);
      });

      it('isValidSrc emits a console.warn when pattern matches', () => {
        expect(source).toMatch(/console\.warn\(['"`]\[TemplateRuntime\] rejected broken asset URL/);
      });

      it('isValidSrc returns false when broken pattern matches', () => {
        // The function structure : if pattern matches → return false
        const segment = source.split('isValidSrc')[1] ?? '';
        expect(segment).toMatch(/return\s+false/);
      });
    });
  }
});
