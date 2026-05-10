/**
 * Atomic JSON file writes (tmp + rename) for raspberry/admin.
 *
 * Mirrors the contract of `raspberry/sync-agent/src/utils/safe-config-io.js`
 * but lives inside this package to avoid cross-package coupling. Use whenever
 * mutating `configuration.json` or sibling files where a power-loss or two
 * concurrent writers must not leave the file half-written.
 *
 * @see ADR-028 — atomic configuration writes rationale
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

let tmpCounter = 0;

function buildTmpPath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const unique = `${process.pid}.${tmpCounter++}.${crypto.randomBytes(4).toString('hex')}`;
  return path.join(dir, `.${base}.tmp.${unique}`);
}

async function atomicWriteJson(filePath, data) {
  const tmpPath = buildTmpPath(filePath);
  const json = JSON.stringify(data, null, 2);
  JSON.parse(json);
  try {
    await fs.writeFile(tmpPath, json, 'utf-8');
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    try { await fs.unlink(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

function atomicWriteJsonSync(filePath, data) {
  const tmpPath = buildTmpPath(filePath);
  const json = JSON.stringify(data, null, 2);
  JSON.parse(json);
  try {
    fsSync.writeFileSync(tmpPath, json, 'utf-8');
    fsSync.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fsSync.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

module.exports = { atomicWriteJson, atomicWriteJsonSync };
