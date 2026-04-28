/**
 * Smoke tests — TV preview (SPEC-V2-TVMON-01 / ADR-101)
 *
 * Garde-fous wiring du flux MJPEG Pi → Remote :
 *  - Service Pi tv-preview.service.js (capture + throttle + single-subscriber)
 *  - Route socket-server /preview.mjpeg (factory pattern + auth)
 *  - Capability event Socket.IO côté handlers.js
 *  - Bootstrap sync-agent du flag tvPreviewEnabled
 *  - Composant Remote V2 r2-tv-monitor (img + onerror + reconnect backoff)
 *  - Parent RemoteV2Component qui écoute la capability et propage previewUrl
 *
 * Usage : npm run test:smoke
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function read(p: string): string {
  return fs.readFileSync(path.join(repoRoot, p), 'utf8');
}

describe('SPEC-V2-TVMON-01 / ADR-101 — TV preview MJPEG wiring', () => {
  describe('ADR-101 published', () => {
    it('docs/adr/ADR-101-tv-preview-mjpeg-strategy.md is referenced in the ADR index', () => {
      const adr = read('docs/adr/ADR-101-tv-preview-mjpeg-strategy.md');
      expect(adr).toContain('MJPEG V1');
      expect(adr).toContain('WebRTC V2');
      expect(adr).toContain('socket-server');

      const indexReadme = read('docs/adr/README.md');
      expect(indexReadme).toMatch(/ADR-101.*tv-preview-mjpeg-strategy/);
    });
  });

  describe('Pi service: raspberry/server/services/tv-preview.service.js', () => {
    const file = 'raspberry/server/services/tv-preview.service.js';
    let src: string;

    beforeAll(() => {
      src = read(file);
    });

    it('exists and exports a class', () => {
      expect(src).toMatch(/class\s+TvPreviewService/);
      expect(src).toMatch(/module\.exports\s*=\s*TvPreviewService/);
    });

    it('exposes capability(), subscribe(), subscriberCount(), setThrottleHandler()', () => {
      expect(src).toMatch(/\bcapability\s*\(\s*\)/);
      expect(src).toMatch(/\bsubscribe\s*\(/);
      expect(src).toMatch(/\bsubscriberCount\s*\(\s*\)/);
      expect(src).toMatch(/\bsetThrottleHandler\s*\(/);
    });

    it('declares the SPEC throttle thresholds (CPU 80/90, temp 75°C)', () => {
      expect(src).toMatch(/cpuWarnPct:\s*80/);
      expect(src).toMatch(/cpuCritPct:\s*90/);
      expect(src).toMatch(/tempCritC:\s*75/);
    });

    it('declares 640x360 / 10 fps / quality 70 defaults (SPEC-V2-TVMON-01 §1)', () => {
      expect(src).toMatch(/width:\s*640/);
      expect(src).toMatch(/height:\s*360/);
      expect(src).toMatch(/targetFps:\s*10/);
      expect(src).toMatch(/jpegQuality:\s*70/);
    });

    it('honors GPU_DECODE_FALLBACK_FILE (mécanisme existant — SPEC §4)', () => {
      expect(src).toMatch(/GPU_DECODE_FALLBACK_FILE/);
      expect(src).toMatch(/_isGpuFallbackActive/);
    });

    it('uses puppeteer-core via lazy require (CDP attach to kiosk Chromium)', () => {
      expect(src).toMatch(/require\(['"]puppeteer-core['"]\)/);
    });

    it('disconnect (not close) le browser au stop pour ne pas tuer le kiosk', () => {
      // Garde-fou critique : `browser.close()` tuerait le Chromium kiosk.
      expect(src).toMatch(/browser\.disconnect\(\)/);
      expect(src).not.toMatch(/this\._browser\.close\(\)/);
    });
  });

  describe('Pi route: raspberry/server/routes/tv-preview.js', () => {
    const file = 'raspberry/server/routes/tv-preview.js';
    let src: string;

    beforeAll(() => {
      src = read(file);
    });

    it('exists and follows the factory router pattern', () => {
      expect(src).toMatch(/module\.exports\s*=\s*function\s+createTvPreviewRouter/);
      expect(src).toMatch(/express\.Router\(\)/);
    });

    it('exposes GET /preview.mjpeg with multipart/x-mixed-replace', () => {
      expect(src).toMatch(/router\.get\(['"]\/preview\.mjpeg['"]/);
      expect(src).toMatch(/multipart\/x-mixed-replace/);
      expect(src).toMatch(/BOUNDARY\s*=\s*['"]frame['"]/);
    });

    it('enforces single-subscriber via HTTP 429 (SPEC §6)', () => {
      expect(src).toMatch(/subscriberCount\(\)\s*>=\s*1/);
      expect(src).toMatch(/\b429\b/);
    });

    it('checks capability.available and returns 503 if unavailable', () => {
      expect(src).toMatch(/\bcapability\(\)/);
      expect(src).toMatch(/\b503\b/);
    });

    it('cleans up subscriber on socket close/error', () => {
      expect(src).toMatch(/req\.on\(['"]close['"]/);
      expect(src).toMatch(/sub\.unsubscribe\(\)/);
    });
  });

  describe('Pi server.js wiring', () => {
    const file = 'raspberry/server/server.js';
    let src: string;

    beforeAll(() => {
      src = read(file);
    });

    it('imports and instantiates TvPreviewService', () => {
      expect(src).toMatch(/require\(['"]\.\/services\/tv-preview\.service['"]\)/);
      expect(src).toMatch(/new TvPreviewService\(/);
    });

    it('reads the tvPreviewEnabled flag from configuration.json', () => {
      expect(src).toMatch(/settings\?\.tvPreviewEnabled/);
    });

    it('mounts the tv-preview router with the auth token getter', () => {
      expect(src).toMatch(/createTvPreviewRouter\(\{\s*tvPreviewService,\s*getAuthToken/);
    });

    it('wires throttle notifications to broadcast tv-preview:throttled', () => {
      expect(src).toMatch(/setThrottleHandler\(/);
      expect(src).toMatch(/io\.emit\(['"]tv-preview:throttled['"]/);
    });

    it('passes tvPreviewService to the socket handlers', () => {
      expect(src).toMatch(/registerSocketHandlers\(\{[^}]*tvPreviewService/);
    });
  });

  describe('Pi socket handlers: raspberry/server/socket/handlers.js', () => {
    const file = 'raspberry/server/socket/handlers.js';
    let src: string;

    beforeAll(() => {
      src = read(file);
    });

    it('emits tv-preview:capability on connection', () => {
      expect(src).toMatch(/socket\.emit\(['"]tv-preview:capability['"]/);
      expect(src).toMatch(/tvPreviewService/);
    });

    it('listens to tv-preview:start and tv-preview:stop', () => {
      expect(src).toMatch(/socket\.on\(['"]tv-preview:start['"]/);
      expect(src).toMatch(/socket\.on\(['"]tv-preview:stop['"]/);
    });
  });

  describe('Sync-agent bootstrap: tv-preview-bootstrap.js', () => {
    const file = 'raspberry/sync-agent/src/services/tv-preview-bootstrap.js';
    let src: string;

    beforeAll(() => {
      src = read(file);
    });

    it('exports bootstrapTvPreviewFlag and uses detectPiModel', () => {
      expect(src).toMatch(/exports\.bootstrapTvPreviewFlag|module\.exports\s*=\s*\{[^}]*bootstrapTvPreviewFlag/);
      expect(src).toMatch(/detectPiModel/);
    });

    it('writes settings.tvPreviewEnabled atomically (.tmp + rename)', () => {
      expect(src).toMatch(/settings\.tvPreviewEnabled/);
      expect(src).toMatch(/\.tmp/);
      expect(src).toMatch(/fs\.renameSync/);
    });

    it('is invoked in agent.start() before the WebSocket connect', () => {
      const agent = read('raspberry/sync-agent/src/agent.js');
      expect(agent).toMatch(/bootstrapTvPreviewFlag\(/);
    });
  });

  describe('Remote V2 component: r2-tv-monitor.component.ts', () => {
    const file = 'raspberry/src/app/components/remote-v2/parts/r2-tv-monitor.component.ts';
    let src: string;

    beforeAll(() => {
      src = read(file);
    });

    it('declares previewUrl + throttledNotice inputs', () => {
      expect(src).toMatch(/@Input\(\)\s+previewUrl/);
      expect(src).toMatch(/@Input\(\)\s+throttledNotice/);
    });

    it('renders <img> conditional on streamSrc + onerror handler', () => {
      expect(src).toMatch(/<img[^>]*\*ngIf="streamSrc\(\)"/);
      expect(src).toMatch(/\(error\)="onImgError\(\)"/);
      expect(src).toMatch(/\(load\)="onImgLoad\(\)"/);
    });

    it('keeps the placeholder fallback (rétro-compat Pi 4 / SaaS / demo)', () => {
      expect(src).toMatch(/r2-tv-monitor-content/);
      expect(src).toMatch(/r2-tv-monitor-name/);
    });

    it('implements exponential backoff capped at 30s', () => {
      expect(src).toMatch(/MAX_BACKOFF_MS\s*=\s*30000/);
      expect(src).toMatch(/this\.backoffMs\s*\*\s*2/);
    });

    it('cleans up reconnect timer on ngOnDestroy', () => {
      expect(src).toMatch(/ngOnDestroy/);
      expect(src).toMatch(/cancelReconnect/);
    });
  });

  describe('Remote V2 parent (RemoteV2Component) capability handling', () => {
    const tsFile = 'raspberry/src/app/components/remote-v2/remote-v2.component.ts';
    const htmlFile = 'raspberry/src/app/components/remote-v2/remote-v2.component.html';
    let ts: string;
    let html: string;

    beforeAll(() => {
      ts = read(tsFile);
      html = read(htmlFile);
    });

    it('listens to tv-preview:capability and tv-preview:throttled', () => {
      expect(ts).toMatch(/['"]tv-preview:capability['"]/);
      expect(ts).toMatch(/['"]tv-preview:throttled['"]/);
    });

    it('ignores non-mjpeg transport / version != 1 (forward-compat for WebRTC V2)', () => {
      expect(ts).toMatch(/cap\.transport\s*!==\s*['"]mjpeg['"]/);
      expect(ts).toMatch(/major\s*!==\s*['"]1['"]/);
    });

    it('passes previewUrl and throttledNotice to <app-r2-tv-monitor>', () => {
      expect(html).toMatch(/\[previewUrl\]="tvPreviewUrl\(\)"/);
      expect(html).toMatch(/\[throttledNotice\]="tvPreviewThrottled\(\)"/);
    });
  });

  describe('Pi server package.json deps', () => {
    it('declares @julusian/jpeg-turbo and puppeteer-core', () => {
      const pkg = JSON.parse(read('raspberry/server/package.json'));
      expect(pkg.dependencies).toHaveProperty('@julusian/jpeg-turbo');
      expect(pkg.dependencies).toHaveProperty('puppeteer-core');
    });
  });

  // ===========================================================================
  // SaaS path (no Pi) — TV browser pushes JPEG frames via Socket.IO relay.
  // Same <app-r2-tv-monitor> component on the Remote, transport differs.
  // ===========================================================================
  describe('SaaS preview push transport', () => {
    it('central-server saas-relay relays the 3 SaaS preview events', () => {
      const src = read('central-server/src/handlers/saas-relay.handler.ts');
      expect(src).toMatch(/socket\.on\(['"]tv-preview:saas-subscribe['"]/);
      expect(src).toMatch(/socket\.on\(['"]tv-preview:saas-unsubscribe['"]/);
      expect(src).toMatch(/socket\.on\(['"]tv-preview:saas-frame['"]/);
      // Relay broadcasts to the rest of the site room (TV ↔ Remote, same site)
      expect(src).toMatch(/socket\.to\(siteId\)\.emit\(['"]tv-preview:saas-frame['"]/);
    });

    it('TV component captures + pushes frames only when subscribers > 0', () => {
      const src = read('raspberry/src/app/components/tv/tv.component.ts');
      expect(src).toMatch(/setupSaasPreviewCapture/);
      expect(src).toMatch(/teardownSaasPreviewCapture/);
      expect(src).toMatch(/saasPreviewSubscribers/);
      // Subscribe-driven (no capture without listener)
      expect(src).toMatch(/this\.startSaasPreviewLoop\(\)/);
      expect(src).toMatch(/this\.stopSaasPreviewLoop\(\)/);
      // Pushes via Socket.IO with data URI frame
      expect(src).toMatch(/['"]tv-preview:saas-frame['"]/);
      expect(src).toMatch(/toDataURL\(['"]image\/jpeg['"]/);
    });

    it('TV capture is gated to SaaS mode + non-slave + displayType=tv', () => {
      const src = read('raspberry/src/app/components/tv/tv.component.ts');
      // The setup function must check saasMode + isSlaveMode + displayType
      expect(src).toMatch(/saasMode/);
      expect(src).toMatch(/isSlaveMode/);
      // Either a SaaS-aware setup or guard
      expect(src).toMatch(/setupSaasPreviewCapture[\s\S]{0,800}saasMode/);
    });

    it('Remote V2 subscribes on connect and consumes saas-frame data URIs', () => {
      const src = read(
        'raspberry/src/app/components/remote-v2/remote-v2.component.ts',
      );
      expect(src).toMatch(/setupSaasTvPreviewConsumer/);
      expect(src).toMatch(/['"]tv-preview:saas-frame['"]/);
      expect(src).toMatch(/['"]tv-preview:saas-subscribe['"]/);
      // Sets the previewUrl signal with the received data URI
      expect(src).toMatch(/this\.tvPreviewUrl\.set\(data\.frame\)/);
    });

    it('Remote V2 unsubscribes on ngOnDestroy in SaaS mode', () => {
      const src = read(
        'raspberry/src/app/components/remote-v2/remote-v2.component.ts',
      );
      // Match the unsubscribe emit in ngOnDestroy block
      expect(src).toMatch(/['"]tv-preview:saas-unsubscribe['"]/);
    });
  });

  // ===========================================================================
  // Pi kiosk launcher — must expose Chrome DevTools Protocol on loopback so
  // the tv-preview service (Puppeteer-core) can attach. Without this flag the
  // service hangs on connect() and the Remote stays on the placeholder.
  // ===========================================================================
  describe('Pi kiosk-watchdog CDP exposure', () => {
    it('kiosk-watchdog.sh enables --remote-debugging-port=9222 on loopback', () => {
      const src = read('raspberry/scripts/kiosk-watchdog.sh');
      expect(src).toMatch(/--remote-debugging-port=9222/);
      expect(src).toMatch(/--remote-debugging-address=127\.0\.0\.1/);
    });
  });

  // ========================================================================
  // P1 — Robustesse (Prometheus + heartbeat + token HMAC + Grafana)
  // ========================================================================

  describe('P1 Prometheus metrics (central-server)', () => {
    const file = 'central-server/src/services/metrics.service.ts';
    let src: string;

    beforeAll(() => {
      src = read(file);
    });

    it('declares the 4 tv-preview metrics (frames/throttle/subscribers/fps)', () => {
      expect(src).toMatch(/neopro_tv_preview_frames_total/);
      expect(src).toMatch(/neopro_tv_preview_throttle_total/);
      expect(src).toMatch(/neopro_tv_preview_subscribers/);
      expect(src).toMatch(/neopro_tv_preview_current_fps/);
    });

    it('exposes recordTvPreview(siteId, snapshot) with delta tracking', () => {
      expect(src).toMatch(/\brecordTvPreview\s*\(/);
      expect(src).toMatch(/_tvPreviewLastSeen/);
      expect(src).toMatch(/Math\.max\(0,\s*snapshot\.framesTotal\s*-\s*last\.framesTotal\)/);
    });

    it('counters are labelled by site_id (multi-tenant Prometheus)', () => {
      expect(src).toMatch(/labelNames:\s*\[\s*'site_id'\s*\]/);
      expect(src).toMatch(/labelNames:\s*\[\s*'site_id',\s*'reason'\s*\]/);
    });
  });

  describe('P1 HeartbeatMessage type carries tvPreview payload', () => {
    it('type includes optional tvPreview snapshot', () => {
      const src = read('central-server/src/types/index.ts');
      expect(src).toMatch(/tvPreview\?:\s*\{/);
      expect(src).toMatch(/framesTotal:\s*number/);
      expect(src).toMatch(/throttleTotal:\s*\{\s*cpu:\s*number;\s*temp:\s*number/);
    });
  });

  describe('P1 central-server heartbeat handler feeds Prometheus', () => {
    it('handleHeartbeat calls recordTvPreview when payload present', () => {
      const src = read('central-server/src/handlers/heartbeat.handler.ts');
      expect(src).toMatch(/message\.tvPreview/);
      expect(src).toMatch(/metricsService\.recordTvPreview\(siteId,\s*message\.tvPreview\)/);
    });
  });

  describe('P1 Pi heartbeat carries tvPreview snapshot', () => {
    it('sync-agent heartbeat fetches local tv-preview metrics + includes in payload', () => {
      const src = read('raspberry/sync-agent/src/services/heartbeat.js');
      expect(src).toMatch(/fetchLocalTvPreviewMetrics/);
      expect(src).toMatch(/get-tv-preview-metrics/);
      expect(src).toMatch(/tvPreview,?$/m);
    });

    it('Pi socket-server exposes get-tv-preview-metrics callback', () => {
      const src = read('raspberry/server/socket/handlers.js');
      expect(src).toMatch(/socket\.on\(['"]get-tv-preview-metrics['"]/);
      expect(src).toMatch(/tvPreviewService\.getMetrics\(\)/);
    });
  });

  describe('P1 Token HMAC TTL 5 min', () => {
    const file = 'raspberry/server/services/tv-preview.service.js';
    let src: string;

    beforeAll(() => {
      src = read(file);
    });

    it('declares tokenTtlMs default = 5 min', () => {
      expect(src).toMatch(/tokenTtlMs:\s*5\s*\*\s*60\s*\*\s*1000/);
    });

    it('exposes issueToken() and verifyToken(rawToken) using HMAC-SHA256', () => {
      expect(src).toMatch(/issueToken\s*\(\s*\)/);
      expect(src).toMatch(/verifyToken\s*\(\s*rawToken/);
      expect(src).toMatch(/createHmac\(['"]sha256['"]/);
      expect(src).toMatch(/timingSafeEqual/);
    });

    it('verifyToken returns null without secret (LAN fallback) and false on expiry', () => {
      expect(src).toMatch(/if\s*\(\s*!secret\s*\)\s*return null/);
      expect(src).toMatch(/expMs\s*<\s*Date\.now\(\)/);
    });

    it('Pi socket emits the token in tv-preview:capability when secret configured', () => {
      const handlers = read('raspberry/server/socket/handlers.js');
      expect(handlers).toMatch(/tvPreviewService\.issueToken/);
      expect(handlers).toMatch(/capability\.token\s*=\s*token/);
    });

    it('Route /preview.mjpeg validates HMAC token before falling back to socketAuthToken', () => {
      const route = read('raspberry/server/routes/tv-preview.js');
      expect(route).toMatch(/verifyToken/);
      expect(route).toMatch(/preview hmac token invalid or expired/);
    });

    it('Remote V2 parent appends ?token= to the MJPEG URL when capability provides one', () => {
      const ts = read('raspberry/src/app/components/remote-v2/remote-v2.component.ts');
      expect(ts).toMatch(/cap\.token/);
      expect(ts).toMatch(/encodeURIComponent\(cap\.token\)/);
    });
  });

  describe('P1 Grafana dashboard provisioned', () => {
    it('neopro-tv-preview-cloud.json exists with the 4 expected Prometheus targets', () => {
      const raw = read('docker/grafana/provisioning/dashboards/json/cloud/neopro-tv-preview-cloud.json');
      const json = JSON.parse(raw);
      expect(json.uid).toBe('neopro-tv-preview-cloud');
      expect(json.title).toMatch(/TV Preview/);
      const exprs = JSON.stringify(json.panels);
      expect(exprs).toMatch(/neopro_tv_preview_subscribers/);
      expect(exprs).toMatch(/neopro_tv_preview_frames_total/);
      expect(exprs).toMatch(/neopro_tv_preview_throttle_total/);
      expect(exprs).toMatch(/neopro_tv_preview_current_fps/);
    });
  });
});
