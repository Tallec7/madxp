/**
 * Regression tests for safe-config-io.
 *
 * Bug 2026-05-06: deployments failed with
 *   "ENOENT: no such file or directory, rename
 *    '/home/pi/neopro/webapp/.configuration.json.tmp' ->
 *    '/home/pi/neopro/webapp/configuration.json'"
 *
 * Root cause: the tmp filename was fixed (`.configuration.json.tmp`), so
 * two concurrent atomicWriteJson() calls would race — one rename
 * succeeded, the other found the tmp gone and threw ENOENT.
 *
 * These tests pin two guarantees:
 *  1. Each call uses a unique tmp filename.
 *  2. Concurrent calls on the same target are serialized so none fail.
 */

const path = require('path');
const fs = require('fs-extra');
const os = require('os');

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { atomicWriteJson, cleanupOrphanTmpFiles } = require('../utils/safe-config-io');

describe('safe-config-io — concurrent write safety', () => {
  let tmpDir;
  let target;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-config-io-'));
    target = path.join(tmpDir, 'configuration.json');
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => undefined);
  });

  it('serializes concurrent writes on the same path without ENOENT', async () => {
    const writes = Array.from({ length: 20 }, (_, i) =>
      atomicWriteJson(target, { i, payload: `value-${i}` })
    );

    // None should reject — pre-fix, ~half failed with ENOENT on rename.
    await expect(Promise.all(writes)).resolves.toBeDefined();

    const final = await fs.readJson(target);
    expect(final).toHaveProperty('i');
    expect(final).toHaveProperty('payload');
  });

  it('leaves no orphan .tmp files after concurrent writes complete', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        atomicWriteJson(target, { i })
      )
    );

    const entries = await fs.readdir(tmpDir);
    const orphans = entries.filter(f => f.includes('.tmp'));
    expect(orphans).toEqual([]);
  });

  it('uses a unique tmp filename per call (defense in depth across processes)', async () => {
    const seen = new Set();
    const origRename = fs.rename.bind(fs);
    const spy = jest
      .spyOn(fs, 'rename')
      .mockImplementation(async (from, to) => {
        seen.add(path.basename(from));
        return origRename(from, to);
      });

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        atomicWriteJson(target, { i })
      )
    );

    expect(seen.size).toBe(5);
    for (const name of seen) {
      // Must keep `.configuration.json.tmp` as a substring (smoke greps,
      // legacy log parsers) but be unique per call.
      expect(name).toContain('.configuration.json.tmp');
    }

    spy.mockRestore();
  });
});

describe('safe-config-io — cleanupOrphanTmpFiles', () => {
  let tmpDir;
  let target;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-config-io-'));
    target = path.join(tmpDir, 'configuration.json');
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => undefined);
  });

  it('removes leftover .${basename}.tmp.* files', async () => {
    await fs.writeFile(path.join(tmpDir, '.configuration.json.tmp.123.0.abcd'), '{}');
    await fs.writeFile(path.join(tmpDir, '.configuration.json.tmp.456.1.efgh'), '{}');
    await fs.writeFile(path.join(tmpDir, 'unrelated.txt'), 'keep');

    await cleanupOrphanTmpFiles(target);

    const entries = await fs.readdir(tmpDir);
    expect(entries.sort()).toEqual(['unrelated.txt']);
  });

  it('is a no-op when the directory does not exist', async () => {
    await expect(
      cleanupOrphanTmpFiles('/nonexistent/dir/configuration.json')
    ).resolves.toBeUndefined();
  });
});
