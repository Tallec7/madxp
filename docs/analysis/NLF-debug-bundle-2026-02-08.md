# NLF Handball - Debug Bundle Analysis

**Date**: 2026-02-08 15:05-16:05 UTC
**Pi Model**: Raspberry Pi 5 Model B Rev 1.0
**Software**: v3.7.13.1 (built 2026-02-07)
**OS**: Debian GNU/Linux 13 (trixie), Kernel 6.12.47+rpt-rpi-2712

---

## Overall Status: Healthy (Score 100/100) — 5 Actionable Issues

| Metric | Value | Status |
|--------|-------|--------|
| CPU | 40.8% | OK |
| Memory | 40.4% | OK |
| Disk | 35.4% (9.5G/28G) | OK |
| Temperature | 65-66°C | OK |
| Throttling | 0x0 | None |
| WiFi signal | -69 dBm / 59% | Marginal |
| Central server latency | 243ms | OK |
| All 7 services | Active | OK |

---

## Issue 1: SharedImageStub GPU Errors (Every ~5s)

**Severity**: Medium
**Service**: neopro-kiosk (Chromium)

### Symptoms

```
SharedImageFactory: Could not find SharedImageBackingFactory with params:
  usage: Gles2Read|RasterRead|DisplayRead|CpuWriteOnly|CpuRead,
  format: (Y_UV, 420, 8unorm, ExtSamplerOff),
  size: 1920x1080, debug_label: MediaGmbVideoFramePoolMappableSI_Pid:0_Pid:0

SharedImageStub: Unable to create shared image
SharedImageManager::ProduceSkia: Trying to Produce a Skia representation from a non-existent mailbox.
```

These errors repeat every ~5 seconds during video playback (1920x1080 Y_UV format).

### Analysis

Per CLAUDE.md v3.7.2/v3.7.3 history, EGL native mode caused these exact "SharedImageStub" errors on Pi 5. The fix in v3.7.3 was to remove ALL custom GPU flags and let Chromium use the V3D Mesa driver natively. The Pi is running v3.7.13.1, so the fix should be applied.

However, the errors are still present. This suggests either:
1. The `kiosk-watchdog.sh` on this Pi was not updated to the v3.7.3 version
2. The Pi 5's VideoCore VII has inherent shared memory limitations with 1920x1080 Y_UV shared images

### Recommended Action

```bash
# Check actual GPU flags being used
ssh pi@neopro.local 'ps aux | grep chromium | grep -v grep'

# Verify kiosk-watchdog.sh has correct flags (should NOT have --use-gl, --use-angle, or SwiftShader)
ssh pi@neopro.local 'cat /home/pi/neopro/scripts/kiosk-watchdog.sh | grep -E "(use-gl|use-angle|swiftshader|gpu)"'
```

If the old flags are still present, deploy the updated `kiosk-watchdog.sh`:
```bash
scp raspberry/scripts/kiosk-watchdog.sh pi@neopro.local:/home/pi/neopro/scripts/
ssh pi@neopro.local 'sudo systemctl restart neopro-kiosk'
```

### Impact

Log pollution (~12 error lines per 5 seconds). Videos appear to play but GPU shared image pipeline is failing. May cause instability during long sessions (5h+ match days).

---

## Issue 2: Analytics Buffer Not Draining (2,676 Events)

**Severity**: Medium
**Service**: neopro-sync-agent / neopro-app

### Data

| Buffer | Count | Size | Oldest Event | Newest Event |
|--------|-------|------|-------------|-------------|
| Analytics | 2,676 | 656KB | 2026-02-07 11:50 | 2026-02-08 15:05 |
| Sponsors | 666 | 164KB | N/A | N/A |

### Analysis

- Sponsor impressions were successfully sent at 15:32:06 via batching (batch send visible in logs)
- Analytics buffer is accumulating at ~1 event every 5 seconds but **no send attempt is logged**
- The oldest event is ~27 hours old, meaning the buffer hasn't been flushed since at least Feb 7 at 11:50
- At current rate (~17,280/day), the 50K limit would be reached in ~2.7 days

### Recommended Action

1. Check if analytics send is configured correctly in the sync-agent
2. Verify the central server analytics endpoint is accessible:
   ```bash
   ssh pi@neopro.local 'curl -s -o /dev/null -w "%{http_code}" https://neopro-central-production.up.railway.app/api/analytics/video-plays'
   ```
3. If stuck, restart sync-agent to trigger a flush:
   ```bash
   ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'
   ```

### Impact

Loss of video play analytics data if buffer hits 50K limit. Club usage stats will be incomplete.

---

## Issue 3: NetworkWatchdog Fighting Auto-Optimization

**Severity**: Low-Medium
**Service**: neopro-sync-agent (NetworkWatchdog + SafeNetworkOperations)

### Timeline

```
15:27:57 - bgscan configured → wpa_cli reconfigure
15:28:03 - NetworkWatchdog: Internet problems detected
15:28:03 - NetworkWatchdog: Recovery attempt (wpa_cli reconfigure)
15:28:09 - NetworkWatchdog: No IP, trying DHCP...
15:28:12 - NetworkWatchdog: Internet recovered (9s outage)

15:28:29 - bgscan configured AGAIN → wpa_cli reconfigure
15:38:25 - NetworkWatchdog: Internet problems detected (10 min later)
15:38:25 - NetworkWatchdog: Recovery attempt
15:38:30 - NetworkWatchdog: No IP, trying DHCP...
15:38:33 - NetworkWatchdog: Internet recovered (8s outage)
```

### Analysis

The `SafeNetworkOperations.autoOptimize()` configures bgscan and runs `wpa_cli reconfigure`, which temporarily drops the WiFi connection. The `NetworkWatchdog` (checking every 60s) then detects the drop and initiates its own recovery — including another `wpa_cli reconfigure`.

This creates a feedback loop:
1. Auto-optimize → reconfigure → brief disconnect
2. Watchdog detects → recovery → another reconfigure
3. Second reconfigure extends the outage

### Recommended Fix

In the auto-optimize code, add a short grace period notification to the watchdog so it doesn't trigger recovery immediately after a planned reconfigure. Or skip the watchdog check for 30s after auto-optimize completes.

### Impact

~8-9 second internet outages at boot. May cause Socket.IO heartbeat misses.

---

## Issue 4: Duplicate Network Profile Detection at Boot

**Severity**: Low
**Service**: neopro-sync-agent

### Evidence

```
15:27:57 - Network profile detection complete → bgscan configured
15:28:24 - Starting network profile detection (again)
15:28:29 - Network profile detection complete → bgscan configured (again)
```

Two full network detection cycles run within 32 seconds, each triggering:
- `iwlist wlan1 scan` (5 seconds)
- `journalctl` query
- `sed` to edit wpa_supplicant config (twice each)
- `wpa_cli reconfigure` (twice each)

### Root Cause

Likely the detection is triggered both by the initial boot timer (30s after start) and by a `sync_local_state` response. The second detection is redundant.

### Recommended Fix

Add a debounce/cooldown (e.g., 60s) to `NetworkDetector.detect()` to prevent re-running if already completed recently.

### Impact

Wasted resources, contributes to issue #3 (internet recovery cycles).

---

## Issue 5: Permission Error on videos-processing Directory

**Severity**: Low
**Service**: neopro-admin

### Error

```
⚠ Erreur lors de la création des répertoires: EACCES: permission denied, mkdir '/home/pi/neopro/videos-processing'
```

### Fix

```bash
ssh pi@neopro.local 'sudo mkdir -p /home/pi/neopro/videos-processing && sudo chown pi:pi /home/pi/neopro/videos-processing'
```

### Impact

Video processing features in the admin panel (:8080) may not work until the directory is created.

---

## Non-Issues (Informational)

### D-Bus Errors in Kiosk

```
Failed to connect to the bus: Address does not contain a colon
Failed to call method: org.freedesktop.DBus.NameHasOwner
```

These are cosmetic. Chromium tries to use D-Bus for desktop integration (notifications, media keys) but D-Bus is not configured in the headless kiosk environment. No functional impact.

### Hotspot Client Churn

STA `76:36:2d:ae:6d:25` shows 4 associate/disassociate cycles in 30 minutes. This is normal mobile phone behavior — users connecting to the hotspot to use the remote control, then disconnecting.

### HDMI CEC: 0 Devices Found

CEC is available (`cec_available: true`) but no TV devices are detected (`devices_found: 0`, `tv_power: unknown`). The TV connected to this Pi either doesn't support CEC or has it disabled in settings. Analytics will count all video plays (including when TV is off) since CEC can't determine TV state.

### WiFi Signal Quality

Signal at -69 dBm / 59% is marginal but functional. The NLFH network uses mesh WiFi (as indicated by bgscan configuration). Connection is stable with 0 reconnections in 24h and 0% packet loss.

---

## Summary of Recommended Actions

| Priority | Action | Effort |
|----------|--------|--------|
| 1 | Check & update kiosk-watchdog.sh GPU flags | 5 min |
| 2 | Investigate analytics buffer not sending | 15 min |
| 3 | Fix videos-processing directory permissions | 1 min |
| 4 | Add debounce to network profile detection | Code change |
| 5 | Add watchdog grace period after auto-optimize | Code change |
