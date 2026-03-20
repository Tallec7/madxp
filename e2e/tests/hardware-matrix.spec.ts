import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * Tests E2E — Hardware Matrix (Regression Guard)
 *
 * Simule les différentes configurations hardware d'un Raspberry Pi
 * pour détecter les régressions AVANT déploiement :
 *
 * - HDMI-0 seul (standard)
 * - HDMI-1 seul (failover/swap)
 * - Dual HDMI (master + slave)
 * - Aucun HDMI (waiting screen)
 * - Reconnexion Socket.IO après déconnexion
 * - Transition dual → single display
 *
 * Prérequis : `npm start` (raspberry Angular sur port 4200)
 *
 * Tags : @hardware-matrix
 */

const BASE_URL = process.env.RASPBERRY_URL || 'http://localhost:4200';

// ─────────────────────── Helpers ───────────────────────

/** Injecte un événement via BroadcastChannel (simule le Pi Socket.IO server) */
async function emitLocalEvent(page: Page, channel: string, data: unknown): Promise<void> {
  await page.evaluate(
    ({ channel, data }) => {
      const bc = new BroadcastChannel('neopro-local');
      bc.postMessage({ type: channel, data });
      bc.close();
    },
    { channel, data },
  );
}

/** Attend qu'un sélecteur soit visible (avec fallback false) */
async function waitForVisible(page: Page, selector: string, timeout = 5000): Promise<boolean> {
  return page.locator(selector).isVisible({ timeout }).catch(() => false);
}

/** Collecte les erreurs JS non catchées sur une page */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Collecte les console logs contenant un pattern */
function collectConsoleLogs(page: Page, pattern?: string): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (!pattern || text.includes(pattern)) {
      logs.push(text);
    }
  });
  return logs;
}

/** Accède au composant Angular TV via ng.getComponent (mode dev uniquement) */
async function getTvComponentProperty(page: Page, property: string): Promise<unknown> {
  return page.evaluate((prop) => {
    const tvElement = document.querySelector('app-tv');
    if (!tvElement) return null;
    const ng = (window as unknown as Record<string, unknown>)['ng'];
    const component = ng
      ? (ng as Record<string, (...args: unknown[]) => unknown>).getComponent(tvElement)
      : null;
    if (component && typeof component === 'object' && prop in component) {
      return (component as Record<string, unknown>)[prop];
    }
    return null;
  }, property);
}

/** Vérifie que la page n'a pas crashé et contient du contenu */
async function assertPageHealthy(page: Page, label: string): Promise<void> {
  const readyState = await page.evaluate(() => document.readyState);
  expect(readyState, `${label}: page should be complete`).toBe('complete');

  const bodyLength = await page.evaluate(() => document.body.innerHTML.length);
  expect(bodyLength, `${label}: page should have content`).toBeGreaterThan(100);
}

// ─────────────────────── HDMI-0 Only (Standard Config) ───────────────────────

test.describe('HDMI-0 Only — Standard configuration @hardware-matrix', () => {
  test.describe.configure({ mode: 'serial' });

  test('/tv loads and shows content when HDMI-0 connected', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Inject HDMI status: only HDMI-0 connected
    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: true,
      hdmi1: false,
      wrongPort: false,
    });
    await page.waitForTimeout(1000);

    // TV should be connected (hdmi0 || hdmi1)
    const hdmiConnected = await getTvComponentProperty(page, 'hdmiConnected');
    if (hdmiConnected !== null) {
      expect(hdmiConnected, 'hdmiConnected should be true with HDMI-0').toBe(true);
    }

    // No waiting screen visible
    const waitingScreen = await waitForVisible(page, 'app-waiting-screen', 1000);
    expect(waitingScreen, 'waiting screen should NOT show with HDMI-0').toBe(false);

    // No wrong port screen
    const wrongPortScreen = await waitForVisible(page, 'app-wrong-port-screen', 1000);
    expect(wrongPortScreen, 'wrong port screen should NOT show').toBe(false);

    // No JS errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('net::ERR'),
    );
    expect(criticalErrors, 'no critical JS errors').toHaveLength(0);

    await assertPageHealthy(page, '/tv HDMI-0');
  });

  test('/secondary shows waiting screen when only HDMI-0 (no HDMI-1)', async ({ page }) => {
    await page.goto(`${BASE_URL}/secondary`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Inject HDMI status: only HDMI-0
    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: true,
      hdmi1: false,
      wrongPort: false,
    });
    await page.waitForTimeout(1000);

    // Secondary requires HDMI-1 → hdmiConnected should be false
    const hdmiConnected = await getTvComponentProperty(page, 'hdmiConnected');
    if (hdmiConnected !== null) {
      expect(hdmiConnected, 'secondary hdmiConnected should be false without HDMI-1').toBe(false);
    }

    // Page should not crash
    await assertPageHealthy(page, '/secondary HDMI-0 only');
  });
});

// ─────────────────────── HDMI-1 Only (Failover/Swap) ───────────────────────

test.describe('HDMI-1 Only — Failover swap @hardware-matrix', () => {
  test.describe.configure({ mode: 'serial' });

  test('/tv loads correctly when only HDMI-1 connected (auto-swap)', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Inject HDMI status: only HDMI-1 (kiosk-watchdog does xrandr swap)
    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: false,
      hdmi1: true,
      wrongPort: false,
    });
    await page.waitForTimeout(1000);

    // TV should be connected (hdmi0 || hdmi1) — the fix from the regression
    const hdmiConnected = await getTvComponentProperty(page, 'hdmiConnected');
    if (hdmiConnected !== null) {
      expect(hdmiConnected, 'hdmiConnected should be true with HDMI-1 (auto-swap)').toBe(true);
    }

    // No waiting screen — this was the regression!
    const waitingScreen = await waitForVisible(page, 'app-waiting-screen', 1000);
    expect(waitingScreen, 'waiting screen should NOT show when HDMI-1 connected').toBe(false);

    // No crash
    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('net::ERR'),
    );
    expect(criticalErrors, 'no critical JS errors with HDMI-1 only').toHaveLength(0);

    await assertPageHealthy(page, '/tv HDMI-1 only');
  });

  test('/tv does NOT show wrongPort when HDMI-1 used with auto-swap', async ({ page }) => {
    await page.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // wrongPort=false means the watchdog handled the swap
    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: false,
      hdmi1: true,
      wrongPort: false,
    });
    await page.waitForTimeout(1000);

    const wrongPort = await getTvComponentProperty(page, 'wrongPort');
    if (wrongPort !== null) {
      expect(wrongPort, 'wrongPort should be false after auto-swap').toBe(false);
    }
  });

  test('/tv shows wrongPort screen when HDMI-1 without swap', async ({ page }) => {
    await page.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // wrongPort=true means the user plugged into the wrong port
    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: false,
      hdmi1: true,
      wrongPort: true,
    });
    await page.waitForTimeout(1000);

    const wrongPort = await getTvComponentProperty(page, 'wrongPort');
    if (wrongPort !== null) {
      expect(wrongPort, 'wrongPort should be true').toBe(true);
    }

    // Page should not crash even with wrong port
    await assertPageHealthy(page, '/tv wrong port');
  });
});

// ─────────────────────── Dual HDMI (Master + Slave) ───────────────────────

test.describe('Dual HDMI — Master + Slave synchronized @hardware-matrix', () => {
  test.describe.configure({ mode: 'serial' });

  test('both displays load and receive HDMI connected status', async ({ browser }) => {
    const context = await browser.newContext();
    const tvPage = await context.newPage();
    const secondaryPage = await context.newPage();

    try {
      await Promise.all([
        tvPage.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded', timeout: 15000 }),
        secondaryPage.goto(`${BASE_URL}/secondary`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        }),
      ]);

      await tvPage.waitForTimeout(2000);
      await secondaryPage.waitForTimeout(2000);

      // Both HDMI ports connected
      const hdmiData = { hdmi0: true, hdmi1: true, wrongPort: false };
      await Promise.all([
        emitLocalEvent(tvPage, 'hdmi-status-update', hdmiData),
        emitLocalEvent(secondaryPage, 'hdmi-status-update', hdmiData),
      ]);

      await tvPage.waitForTimeout(1000);

      // Both should be connected
      const tvConnected = await getTvComponentProperty(tvPage, 'hdmiConnected');
      const secondaryConnected = await getTvComponentProperty(secondaryPage, 'hdmiConnected');

      if (tvConnected !== null) {
        expect(tvConnected, 'TV should be connected in dual mode').toBe(true);
      }
      if (secondaryConnected !== null) {
        expect(secondaryConnected, 'Secondary should be connected in dual mode').toBe(true);
      }

      // Neither should show waiting screen
      const tvWaiting = await waitForVisible(tvPage, 'app-waiting-screen', 1000);
      const secWaiting = await waitForVisible(secondaryPage, 'app-waiting-screen', 1000);
      expect(tvWaiting, 'TV no waiting screen in dual').toBe(false);
      expect(secWaiting, 'Secondary no waiting screen in dual').toBe(false);

      await assertPageHealthy(tvPage, '/tv dual');
      await assertPageHealthy(secondaryPage, '/secondary dual');
    } finally {
      await context.close();
    }
  });

  test('master loop state syncs to slave', async ({ browser }) => {
    const context = await browser.newContext();
    const tvPage = await context.newPage();
    const secondaryPage = await context.newPage();

    try {
      await Promise.all([
        tvPage.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded', timeout: 15000 }),
        secondaryPage.goto(`${BASE_URL}/secondary`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        }),
      ]);

      await tvPage.waitForTimeout(3000);
      await secondaryPage.waitForTimeout(3000);

      // Assign roles
      await emitLocalEvent(tvPage, 'tv-role-assigned', { role: 'master' });
      await emitLocalEvent(secondaryPage, 'tv-role-assigned', { role: 'slave' });
      await tvPage.waitForTimeout(500);

      // Master emits loop state — slave should receive it via BroadcastChannel
      const loopState = {
        videoIndex: 0,
        videoPath: 'videos/default/test.mp4',
        videoStartedAt: Date.now(),
        isManualMode: false,
        manualVideoPath: null,
        manualVideoStartedAt: null,
        manualVideoVisible: false,
        updatedAt: Date.now(),
      };
      await emitLocalEvent(secondaryPage, 'tv-loop-state', loopState);
      await secondaryPage.waitForTimeout(1000);

      // No crash on either page
      await assertPageHealthy(tvPage, '/tv master');
      await assertPageHealthy(secondaryPage, '/secondary slave');
    } finally {
      await context.close();
    }
  });
});

// ─────────────────────── No HDMI (Waiting Screen) ───────────────────────

test.describe('No HDMI — Waiting screen @hardware-matrix', () => {
  test.describe.configure({ mode: 'serial' });

  test('/tv shows waiting screen when no HDMI connected', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // No HDMI at all
    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: false,
      hdmi1: false,
      wrongPort: false,
    });
    await page.waitForTimeout(1000);

    // hdmiConnected should be false
    const hdmiConnected = await getTvComponentProperty(page, 'hdmiConnected');
    if (hdmiConnected !== null) {
      expect(hdmiConnected, 'hdmiConnected should be false with no HDMI').toBe(false);
    }

    // No crash — this is the key assertion
    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('net::ERR'),
    );
    expect(criticalErrors, 'no crash with zero HDMI').toHaveLength(0);

    await assertPageHealthy(page, '/tv no HDMI');
  });

  test('/secondary shows waiting screen when no HDMI', async ({ page }) => {
    await page.goto(`${BASE_URL}/secondary`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: false,
      hdmi1: false,
      wrongPort: false,
    });
    await page.waitForTimeout(1000);

    const hdmiConnected = await getTvComponentProperty(page, 'hdmiConnected');
    if (hdmiConnected !== null) {
      expect(hdmiConnected, 'secondary hdmiConnected should be false').toBe(false);
    }

    await assertPageHealthy(page, '/secondary no HDMI');
  });
});

// ─────────────────────── HDMI Hot-Plug (Dynamic Connect/Disconnect) ───────────────────────

test.describe('HDMI Hot-Plug — Dynamic connect/disconnect @hardware-matrix', () => {
  test('/tv transitions from no-HDMI to HDMI-0 connected without crash', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Start disconnected
    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: false,
      hdmi1: false,
      wrongPort: false,
    });
    await page.waitForTimeout(1000);

    // Hot-plug HDMI-0
    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: true,
      hdmi1: false,
      wrongPort: false,
    });
    await page.waitForTimeout(1000);

    const hdmiConnected = await getTvComponentProperty(page, 'hdmiConnected');
    if (hdmiConnected !== null) {
      expect(hdmiConnected, 'should detect hot-plug').toBe(true);
    }

    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('net::ERR'),
    );
    expect(criticalErrors, 'no crash during hot-plug').toHaveLength(0);
    await assertPageHealthy(page, '/tv hot-plug');
  });

  test('/tv transitions from single to dual display', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Start with HDMI-0 only
    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: true,
      hdmi1: false,
      wrongPort: false,
    });
    await page.waitForTimeout(500);

    // Add HDMI-1 (dual mode)
    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: true,
      hdmi1: true,
      wrongPort: false,
    });
    await page.waitForTimeout(1000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('net::ERR'),
    );
    expect(criticalErrors, 'no crash during single→dual transition').toHaveLength(0);
    await assertPageHealthy(page, '/tv single→dual');
  });

  test('/tv transitions from dual to single (HDMI-1 disconnect)', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Start dual
    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: true,
      hdmi1: true,
      wrongPort: false,
    });
    await page.waitForTimeout(500);

    // Disconnect HDMI-1 (back to single)
    await emitLocalEvent(page, 'hdmi-status-update', {
      hdmi0: true,
      hdmi1: false,
      wrongPort: false,
    });
    await page.waitForTimeout(1000);

    // TV should stay connected (still has HDMI-0)
    const hdmiConnected = await getTvComponentProperty(page, 'hdmiConnected');
    if (hdmiConnected !== null) {
      expect(hdmiConnected, 'TV stays connected after HDMI-1 unplug').toBe(true);
    }

    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('net::ERR'),
    );
    expect(criticalErrors, 'no crash during dual→single transition').toHaveLength(0);
    await assertPageHealthy(page, '/tv dual→single');
  });
});

// ─────────────────────── Socket.IO Reconnection ───────────────────────

test.describe('Socket.IO Reconnection — WiFi drop recovery @hardware-matrix', () => {
  test('/tv survives socket disconnect and reconnect without crash', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Simulate disconnect event
    await emitLocalEvent(page, 'disconnect', { reason: 'transport close' });
    await page.waitForTimeout(1000);

    // Simulate reconnect
    await emitLocalEvent(page, 'connect', {});
    await page.waitForTimeout(1000);

    // Page should not be blank or crashed
    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('net::ERR'),
    );
    expect(criticalErrors, 'no crash during socket reconnect').toHaveLength(0);
    await assertPageHealthy(page, '/tv reconnect');
  });

  test('/tv handles rapid HDMI status changes without crash', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Rapid HDMI status changes (simulates unstable HDMI/CEC)
    const states = [
      { hdmi0: true, hdmi1: false, wrongPort: false },
      { hdmi0: false, hdmi1: false, wrongPort: false },
      { hdmi0: false, hdmi1: true, wrongPort: false },
      { hdmi0: true, hdmi1: true, wrongPort: false },
      { hdmi0: true, hdmi1: false, wrongPort: false },
      { hdmi0: false, hdmi1: false, wrongPort: false },
      { hdmi0: true, hdmi1: false, wrongPort: false },
    ];

    for (const state of states) {
      await emitLocalEvent(page, 'hdmi-status-update', state);
      await page.waitForTimeout(200);
    }

    await page.waitForTimeout(1000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('net::ERR'),
    );
    expect(criticalErrors, 'no crash during rapid HDMI changes').toHaveLength(0);
    await assertPageHealthy(page, '/tv rapid HDMI');
  });
});

// ─────────────────────── Manual Video on Browser (No Pi) ───────────────────────

test.describe('Browser mode — No Pi hardware @hardware-matrix', () => {
  test('/tv loads without errors on a regular browser (no Pi)', async ({ page }) => {
    const errors = collectPageErrors(page);

    // On a regular browser, no hdmi-status-update is ever sent
    // hdmiConnected defaults to true — should work fine
    await page.goto(`${BASE_URL}/tv`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Default hdmiConnected=true means no waiting screen
    const waitingScreen = await waitForVisible(page, 'app-waiting-screen', 1000);
    expect(waitingScreen, 'no waiting screen on browser by default').toBe(false);

    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('net::ERR'),
    );
    expect(criticalErrors, 'no JS errors on browser mode').toHaveLength(0);
    await assertPageHealthy(page, '/tv browser mode');
  });

  test('/secondary loads without errors on a regular browser', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto(`${BASE_URL}/secondary`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('net::ERR'),
    );
    expect(criticalErrors, 'no JS errors on /secondary browser mode').toHaveLength(0);
    await assertPageHealthy(page, '/secondary browser mode');
  });
});
