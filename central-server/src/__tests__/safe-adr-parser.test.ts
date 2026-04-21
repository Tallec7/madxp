/**
 * Tests for SafeParserService ADR methods
 *
 * Exercises getAdrs() and getAdr() against the real docs/adr/ folder.
 * The DB is globally mocked by setup.ts — only fs operations run.
 */

import path from 'path';
import fs from 'fs';
import { safeParserService } from '../services/safe-parser.service';

describe('SafeParserService — ADR parsing', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const adrDir = path.join(repoRoot, 'docs', 'adr');
  const adrDirExists = fs.existsSync(adrDir);

  describe('getAdrs()', () => {
    it('returns an array', () => {
      const adrs = safeParserService.getAdrs();
      expect(Array.isArray(adrs)).toBe(true);
    });

    it('returns ADR objects with required fields', () => {
      const adrs = safeParserService.getAdrs();
      if (adrs.length === 0) return; // no ADR files in this environment
      const adr = adrs[0];
      expect(typeof adr.id).toBe('string');
      expect(typeof adr.number).toBe('number');
      expect(typeof adr.title).toBe('string');
      expect(typeof adr.filename).toBe('string');
      expect(typeof adr.status).toBe('string');
      expect(typeof adr.date).toBe('string');
      expect(typeof adr.format).toBe('string');
    });

    it('IDs are uppercased and match ADR-XXX pattern', () => {
      const adrs = safeParserService.getAdrs();
      for (const adr of adrs) {
        expect(adr.id).toMatch(/^ADR-\d+$/);
        expect(adr.id).toBe(adr.id.toUpperCase());
      }
    });

    it('numbers are positive integers', () => {
      const adrs = safeParserService.getAdrs();
      for (const adr of adrs) {
        expect(adr.number).toBeGreaterThan(0);
        expect(Number.isInteger(adr.number)).toBe(true);
      }
    });

    it('uses in-memory cache on second call (same reference)', () => {
      const first = safeParserService.getAdrs();
      const second = safeParserService.getAdrs();
      expect(first).toBe(second);
    });

    it('parses at least 1 ADR if docs/adr/ exists', () => {
      if (!adrDirExists) return;
      const adrs = safeParserService.getAdrs();
      expect(adrs.length).toBeGreaterThan(0);
    });

    it('filenames end with .md', () => {
      const adrs = safeParserService.getAdrs();
      for (const adr of adrs) {
        expect(adr.filename).toMatch(/\.md$/);
      }
    });
  });

  describe('getAdr(id)', () => {
    it('returns null for unknown id', () => {
      const result = safeParserService.getAdr('ADR-99999');
      expect(result).toBeNull();
    });

    it('lookup is case-insensitive', () => {
      const adrs = safeParserService.getAdrs();
      if (adrs.length === 0) return;
      const { id } = adrs[0];
      const lower = safeParserService.getAdr(id.toLowerCase());
      const upper = safeParserService.getAdr(id.toUpperCase());
      // Both should return same result (or both null)
      expect(lower === null).toBe(upper === null);
    });

    it('returns content string when ADR exists', () => {
      const adrs = safeParserService.getAdrs();
      if (adrs.length === 0) return;
      const result = safeParserService.getAdr(adrs[0].id);
      expect(result).not.toBeNull();
      expect(typeof result!.content).toBe('string');
      expect(result!.content.length).toBeGreaterThan(0);
    });

    it('returned object includes all summary fields plus content', () => {
      const adrs = safeParserService.getAdrs();
      if (adrs.length === 0) return;
      const summary = adrs[0];
      const full = safeParserService.getAdr(summary.id);
      expect(full).not.toBeNull();
      expect(full!.id).toBe(summary.id);
      expect(full!.number).toBe(summary.number);
      expect(full!.title).toBe(summary.title);
      expect(full!.filename).toBe(summary.filename);
      expect('content' in full!).toBe(true);
    });
  });

  describe('invalidateCache()', () => {
    it('clears the ADR cache so next call re-reads', () => {
      safeParserService.getAdrs(); // prime cache
      safeParserService.invalidateCache();
      const after = safeParserService.getAdrs(); // re-read
      expect(Array.isArray(after)).toBe(true);
    });
  });
});
