/**
 * TvPreviewService — capture du Chromium kiosk, encodage JPEG, multipart broadcast.
 *
 * Cf. SPEC-V2-TVMON-01 + ADR-101 (MJPEG V1, WebRTC V2 conditionnel).
 *
 * Invariant absolu : 0 dégradation TV publique. Throttle CPU/temp prioritaire :
 * - CPU >80% continu 5 s   → dégrade fps cible à 5 fps
 * - CPU >90% continu 5 s   → suspend la capture (preview tombe sur placeholder)
 * - Temp >75°C immédiat     → suspend la capture
 * - Crash CDP / Chromium    → suspend la capture, reuse GPU_DECODE_FALLBACK_FILE
 *
 * Le service tourne en cold-state au boot. Il n'attache CDP que quand un
 * subscriber se connecte (via subscribe()). Aucun coût CPU si personne ne regarde.
 *
 * Publish/subscribe simple via callback : 1 seul abonné concurrent (single-subscriber
 * enforcé côté route /preview.mjpeg). Le service ne se charge pas de l'auth ni du
 * status HTTP — uniquement de produire des frames JPEG et de gérer le throttle.
 */

const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const DEFAULTS = {
  width: 640,
  height: 360,
  targetFps: 10,
  jpegQuality: 70,
  throttleFps: 5,
  cpuWarnPct: 80,
  cpuCritPct: 90,
  tempCritC: 75,
  sweepIntervalMs: 5000,
  // Kiosk Chromium DevTools port (cf. raspberry/admin sudoers + kiosk launcher)
  cdpEndpoint: process.env.KIOSK_CDP_ENDPOINT || 'http://127.0.0.1:9222',
  // SPEC §6 — token éphémère HMAC TTL 5 min pour les Remote distantes (cloud)
  tokenTtlMs: 5 * 60 * 1000,
};

class TvPreviewService {
  /**
   * @param {Object} opts
   * @param {(frame: Buffer) => void} [opts.onFrame] - default subscriber (broadcast)
   * @param {(reason: string, info?: object) => void} [opts.onThrottle]
   * @param {() => Promise<{cpuPct: number, tempC: number|null}>} [opts.metricsProvider]
   * @param {boolean} [opts.enabled=true] - feature flag (sync-agent → configuration.json)
   * @param {string} [opts.gpuFallbackFile] - reuse mécanisme ADR existant
   */
  constructor(opts = {}) {
    this._opts = { ...DEFAULTS, ...opts };
    this._subscribers = new Set();
    this._capturing = false;
    this._suspended = false;
    this._currentFps = this._opts.targetFps;
    this._throttleStreak = 0;
    this._cpuWindow = [];
    this._sweepTimer = null;
    this._frameTimer = null;
    this._browser = null;
    this._page = null;
    this._onFrame = opts.onFrame || null;
    this._onThrottle = opts.onThrottle || null;
    this._metricsProvider = opts.metricsProvider || (() => this._sampleHostMetrics());
    this._enabled = opts.enabled !== false;
    this._gpuFallbackFile = opts.gpuFallbackFile || process.env.GPU_DECODE_FALLBACK_FILE || null;
    this._metrics = {
      framesTotal: 0,
      throttleTotal: { cpu: 0, temp: 0 },
      subscribers: 0,
    };
    // HMAC secret pour les tokens éphémères (cloud distant). Lazy-getter (peut
    // venir de configuration.json ou d'une env var injectée par sync-agent).
    this._hmacSecretGetter = opts.hmacSecretGetter || (() => process.env.TV_PREVIEW_HMAC_SECRET || null);
  }

  /**
   * Émet un token signé HMAC-SHA256 valide `tokenTtlMs` (5 min default), à
   * inclure en query string sur /preview.mjpeg pour les Remote en mode cloud
   * distant. Renvoie null si aucun secret n'est disponible (LAN-only suffit).
   *
   * Format : `<expISO>.<base64url(hmac)>` — pas de payload sensible, juste
   * une signature anti-replay basée sur l'expiration.
   */
  issueToken() {
    const secret = this._hmacSecretGetter();
    if (!secret) return null;
    const expMs = Date.now() + this._opts.tokenTtlMs;
    const payload = String(expMs);
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  /**
   * Vérifie un token reçu (query ?token=...). Renvoie true si signature valide
   * ET expiration future. Si aucun secret n'est configuré, renvoie null —
   * la route doit alors retomber sur l'auth socketAuthToken (cf. ADR-073 S2).
   */
  verifyToken(rawToken) {
    const secret = this._hmacSecretGetter();
    if (!secret) return null;
    if (typeof rawToken !== 'string' || !rawToken.includes('.')) return false;
    const [expStr, sig] = rawToken.split('.', 2);
    const expMs = Number(expStr);
    if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
    const expected = crypto.createHmac('sha256', secret).update(expStr).digest('base64url');
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  /** Capabilities exposées via Socket.IO event tv-preview:capability. */
  capability() {
    if (!this._enabled || this._isGpuFallbackActive()) {
      return { available: false, transport: 'mjpeg', version: '1.0' };
    }
    return {
      available: true,
      transport: 'mjpeg',
      url: '/preview.mjpeg',
      resolution: { w: this._opts.width, h: this._opts.height },
      fps: this._currentFps,
      version: '1.0',
    };
  }

  /** Métriques Prometheus. */
  getMetrics() {
    return {
      ...this._metrics,
      subscribers: this._subscribers.size,
      currentFps: this._currentFps,
      suspended: this._suspended,
    };
  }

  /**
   * Subscribe à un flux de frames JPEG. Déclenche la capture si premier subscriber.
   * @returns {{unsubscribe: () => void}}
   */
  subscribe(callback) {
    if (typeof callback !== 'function') {
      throw new Error('TvPreviewService.subscribe expects a callback function');
    }
    this._subscribers.add(callback);
    if (this._subscribers.size === 1 && !this._capturing && this._enabled) {
      this._startCapture().catch((err) => {
        console.error('[tv-preview] startCapture failed:', err.message);
        this._suspend('startup-failure');
      });
    }
    return {
      unsubscribe: () => {
        this._subscribers.delete(callback);
        if (this._subscribers.size === 0) this._stopCapture();
      },
    };
  }

  /** Combien de subscribers (single-subscriber enforced côté route, mais expose pour métriques). */
  subscriberCount() {
    return this._subscribers.size;
  }

  /** Branche la notification de throttle après instantiation (utile quand `io` n'existe pas encore). */
  setThrottleHandler(cb) {
    this._onThrottle = typeof cb === 'function' ? cb : null;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  _isGpuFallbackActive() {
    if (!this._gpuFallbackFile) return false;
    try {
      return fs.existsSync(this._gpuFallbackFile);
    } catch {
      return false;
    }
  }

  async _startCapture() {
    if (this._capturing) return;
    if (this._isGpuFallbackActive()) {
      console.warn('[tv-preview] GPU fallback active — preview disabled');
      return;
    }
    this._capturing = true;
    this._suspended = false;
    this._currentFps = this._opts.targetFps;

    // Lazy-require pour éviter de payer le coût d'import si jamais le service n'est pas
    // utilisé (Pi 4 désactivé via flag, ou aucun subscriber). Tolérant aux modules absents
    // (ex. environnement de test où puppeteer-core / jpeg-turbo ne sont pas installés).
    try {
      const puppeteer = require('puppeteer-core');
      this._browser = await puppeteer.connect({
        browserURL: this._opts.cdpEndpoint,
        defaultViewport: null,
      });
      const pages = await this._browser.pages();
      this._page = pages.find((p) => !p.url().startsWith('chrome://')) || pages[0];
      if (!this._page) throw new Error('No kiosk page found via CDP');
    } catch (err) {
      this._capturing = false;
      throw new Error(`CDP attach failed: ${err.message}`);
    }

    this._startSweep();
    this._scheduleNextFrame();
  }

  _stopCapture() {
    this._capturing = false;
    if (this._sweepTimer) {
      clearInterval(this._sweepTimer);
      this._sweepTimer = null;
    }
    if (this._frameTimer) {
      clearTimeout(this._frameTimer);
      this._frameTimer = null;
    }
    if (this._browser) {
      // disconnect (n'arrête pas Chromium kiosk — important !)
      try { this._browser.disconnect(); } catch { /* noop */ }
      this._browser = null;
      this._page = null;
    }
  }

  _scheduleNextFrame() {
    if (!this._capturing || this._suspended) return;
    const intervalMs = Math.max(50, Math.round(1000 / this._currentFps));
    this._frameTimer = setTimeout(() => this._captureFrame(), intervalMs);
  }

  async _captureFrame() {
    if (!this._capturing || this._suspended || !this._page) return;
    try {
      const buf = await this._page.screenshot({
        type: 'jpeg',
        quality: this._opts.jpegQuality,
        clip: { x: 0, y: 0, width: this._opts.width, height: this._opts.height },
        omitBackground: false,
        captureBeyondViewport: false,
      });
      this._metrics.framesTotal += 1;
      for (const cb of this._subscribers) {
        try { cb(buf); } catch (err) {
          console.warn('[tv-preview] subscriber callback threw:', err.message);
        }
      }
    } catch (err) {
      console.warn('[tv-preview] captureFrame failed:', err.message);
      // CDP perdu → suspendre (le kiosk a peut-être redémarré)
      this._suspend('capture-error');
      return;
    }
    this._scheduleNextFrame();
  }

  _startSweep() {
    if (this._sweepTimer) clearInterval(this._sweepTimer);
    this._sweepTimer = setInterval(async () => {
      try {
        const { cpuPct, tempC } = await this._metricsProvider();
        this._evaluateThrottle(cpuPct, tempC);
      } catch (err) {
        console.warn('[tv-preview] metrics sweep failed:', err.message);
      }
    }, this._opts.sweepIntervalMs);
  }

  _evaluateThrottle(cpuPct, tempC) {
    // Temp critical → suspend immediate (priorité absolue à la TV)
    if (tempC !== null && tempC >= this._opts.tempCritC) {
      this._metrics.throttleTotal.temp += 1;
      this._suspend('temp');
      return;
    }
    // Sliding window 1 sample (sweep 5 s = la fenêtre 5 s demandée par la SPEC).
    if (cpuPct >= this._opts.cpuCritPct) {
      this._metrics.throttleTotal.cpu += 1;
      this._suspend('cpu');
      return;
    }
    if (cpuPct >= this._opts.cpuWarnPct) {
      if (this._currentFps !== this._opts.throttleFps) {
        this._currentFps = this._opts.throttleFps;
        this._metrics.throttleTotal.cpu += 1;
        this._notifyThrottle('cpu', { newFps: this._currentFps });
      }
      return;
    }
    // Recovery
    if (this._currentFps !== this._opts.targetFps) {
      this._currentFps = this._opts.targetFps;
      this._notifyThrottle('recovery', { newFps: this._currentFps });
    }
  }

  _suspend(reason) {
    if (this._suspended) return;
    this._suspended = true;
    this._notifyThrottle(reason, { suspended: true });
    if (this._frameTimer) {
      clearTimeout(this._frameTimer);
      this._frameTimer = null;
    }
    // On ne disconnect pas le browser : un retry sera tenté au prochain subscribe()
    // ou via une bascule manuelle (fora de scope V1).
  }

  _notifyThrottle(reason, info) {
    if (this._onThrottle) {
      try { this._onThrottle(reason, info); } catch (err) {
        console.warn('[tv-preview] onThrottle handler threw:', err.message);
      }
    }
  }

  /**
   * Sampler par défaut quand aucun metricsProvider n'est injecté. Lit /proc côté Linux,
   * sinon fallback os.loadavg() (moins précis, OK pour bootstrap dev).
   */
  async _sampleHostMetrics() {
    let cpuPct = 0;
    let tempC = null;
    try {
      // Linux : /proc/stat → calcul instantané sur 100ms
      if (process.platform === 'linux' && fs.existsSync('/proc/stat')) {
        const sample1 = this._readProcStat();
        await new Promise((r) => setTimeout(r, 100));
        const sample2 = this._readProcStat();
        if (sample1 && sample2) {
          const idleDelta = sample2.idle - sample1.idle;
          const totalDelta = sample2.total - sample1.total;
          if (totalDelta > 0) cpuPct = ((1 - idleDelta / totalDelta) * 100);
        }
      } else {
        // Fallback portable (loadavg / nproc)
        const load = os.loadavg()[0];
        const cores = os.cpus().length || 1;
        cpuPct = Math.min(100, (load / cores) * 100);
      }
    } catch { /* noop */ }

    try {
      // Pi : /sys/class/thermal/thermal_zone0/temp (millicelsius)
      const thermalPath = '/sys/class/thermal/thermal_zone0/temp';
      if (fs.existsSync(thermalPath)) {
        const raw = fs.readFileSync(thermalPath, 'utf8').trim();
        const milli = parseInt(raw, 10);
        if (Number.isFinite(milli)) tempC = milli / 1000;
      }
    } catch { /* noop */ }

    return { cpuPct, tempC };
  }

  _readProcStat() {
    try {
      const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
      const parts = line.trim().split(/\s+/).slice(1).map((n) => parseInt(n, 10));
      if (parts.length < 4 || parts.some((n) => !Number.isFinite(n))) return null;
      const idle = parts[3] + (parts[4] || 0);
      const total = parts.reduce((a, b) => a + b, 0);
      return { idle, total };
    } catch {
      return null;
    }
  }
}

module.exports = TvPreviewService;
module.exports.DEFAULTS = DEFAULTS;
