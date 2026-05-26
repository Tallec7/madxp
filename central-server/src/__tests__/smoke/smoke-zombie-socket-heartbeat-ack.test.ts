/**
 * Smoke — issue #824: zombie socket detection via heartbeat ACK
 *
 * Root cause: lastSuccessfulHeartbeat was updated unconditionally after
 * socket.emit('heartbeat'), which always succeeds locally even in a TCP zombie
 * state (data is buffered in OS TCP send queue). The health check
 * startConnectionHealthCheck() therefore never saw a stale timestamp.
 *
 * Fix: lastSuccessfulHeartbeat is now ONLY updated inside the Socket.IO ACK
 * callback (server-side ack?.() → client callback fires). This test guards
 * against regression by statically verifying the wiring across three files.
 */

import * as fs from 'fs';
import * as path from 'path';

const AGENT_ROOT = path.resolve(__dirname, '../../../../raspberry/sync-agent/src');
const SERVER_ROOT = path.resolve(__dirname, '../..');

describe('Issue #824 — zombie socket heartbeat ACK wiring (smoke)', () => {
  describe('sync-agent heartbeat.js (Pi side)', () => {
    let src: string;

    beforeAll(() => {
      src = fs.readFileSync(path.join(AGENT_ROOT, 'services/heartbeat.js'), 'utf8');
    });

    it('uses socket.timeout().emit() instead of plain socket.emit() for heartbeat', () => {
      expect(src).toMatch(/socket\.timeout\(\d+\)\.emit\(['"]heartbeat['"]/);
    });

    it('does NOT set lastSuccessfulHeartbeat unconditionally after emit', () => {
      // lastSuccessfulHeartbeat must only appear inside the ACK callback (after "if (!err)")
      // Split on the emit call and verify the assignment only follows the err-check
      const afterEmit = src.split(/socket\.timeout\(\d+\)\.emit\(['"]heartbeat['"]/)[1] ?? '';
      // The ACK callback pattern: (err) => { if (!err) { ... lastSuccessfulHeartbeat ... } }
      expect(afterEmit).toMatch(/if\s*\(!err\)[^}]*lastSuccessfulHeartbeat\s*=/s);
    });

    it('increments pendingZombieRecoveries in the health check zombie path', () => {
      expect(src).toMatch(/incrementZombieRecovery\(\)/);
      // incrementZombieRecovery must be called inside startConnectionHealthCheck
      const healthCheckFn = src.split('function startConnectionHealthCheck')[1] ?? '';
      expect(healthCheckFn).toMatch(/incrementZombieRecovery\(\)/);
    });

    it('exports incrementZombieRecovery', () => {
      expect(src).toMatch(/incrementZombieRecovery/);
      // Verify it appears in module.exports
      const exportsBlock = src.split('module.exports')[1] ?? '';
      expect(exportsBlock).toMatch(/incrementZombieRecovery/);
    });

    it('includes zombieSocketRecoveries in the heartbeat payload when non-zero', () => {
      expect(src).toMatch(/zombieSocketRecoveries/);
      expect(src).toMatch(/capturedZombieRecoveries\s*>\s*0\s*\?\s*capturedZombieRecoveries/);
    });
  });

  describe('socket.service.ts (server — handler registration)', () => {
    let src: string;

    beforeAll(() => {
      src = fs.readFileSync(path.join(SERVER_ROOT, 'services/socket.service.ts'), 'utf8');
    });

    it('passes ack callback to handleHeartbeat', () => {
      // heartbeat handler lambda must accept an ack parameter and forward it
      expect(src).toMatch(/heartbeat:\s*\(message:\s*HeartbeatMessage,\s*ack\?:\s*\(\)\s*=>\s*void\)/);
      expect(src).toMatch(/handleHeartbeat\(ctx,\s*siteId,\s*message,\s*ack\)/);
    });
  });

  describe('heartbeat.handler.ts (server — ack invocation)', () => {
    let src: string;

    beforeAll(() => {
      src = fs.readFileSync(path.join(SERVER_ROOT, 'handlers/heartbeat.handler.ts'), 'utf8');
    });

    it('accepts ack as optional parameter', () => {
      expect(src).toMatch(/ack\?:\s*\(\)\s*=>\s*void/);
    });

    it('calls ack?.() after confirming heartbeat receipt', () => {
      expect(src).toMatch(/ack\?\.\(\)/);
    });

    it('calls metricsService.recordZombieSocketRecovery when zombieSocketRecoveries > 0', () => {
      expect(src).toMatch(/recordZombieSocketRecovery/);
      expect(src).toMatch(/message\.zombieSocketRecoveries/);
    });
  });

  describe('metrics.service.ts (server — Prometheus counter)', () => {
    let src: string;

    beforeAll(() => {
      src = fs.readFileSync(path.join(SERVER_ROOT, 'services/metrics.service.ts'), 'utf8');
    });

    it('declares madxp_sync_agent_zombie_socket_recoveries_total counter', () => {
      expect(src).toMatch(/madxp_sync_agent_zombie_socket_recoveries_total/);
    });

    it('exposes recordZombieSocketRecovery() method', () => {
      expect(src).toMatch(/recordZombieSocketRecovery\(/);
    });
  });

  describe('types/index.ts — HeartbeatMessage', () => {
    let src: string;

    beforeAll(() => {
      src = fs.readFileSync(path.join(SERVER_ROOT, 'types/index.ts'), 'utf8');
    });

    it('HeartbeatMessage includes optional zombieSocketRecoveries field', () => {
      expect(src).toMatch(/zombieSocketRecoveries\?:\s*number/);
    });
  });
});
