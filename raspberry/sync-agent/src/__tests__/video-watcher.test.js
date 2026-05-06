jest.mock('../logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../config', () => ({ config: { videosDir: '/tmp', centralUrl: 'http://localhost' } }));

const fs = require('fs');
const path = require('path');
const os = require('os');
const VideoWatcher = require('../watchers/video-watcher');

describe('VideoWatcher.calculateChecksum', () => {
  let tmpFile;

  beforeAll(() => {
    tmpFile = path.join(os.tmpdir(), 'neopro-checksum-test.bin');
    fs.writeFileSync(tmpFile, Buffer.from('neopro-test-content'));
  });

  afterAll(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('uses SHA256 (64 hex chars) — regression guard against MD5 (32 chars)', async () => {
    const watcher = new VideoWatcher('/tmp', () => {}, { getClubConfig: () => ({}) });
    const checksum = await watcher.calculateChecksum(tmpFile);
    expect(checksum).toHaveLength(64);
    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});
