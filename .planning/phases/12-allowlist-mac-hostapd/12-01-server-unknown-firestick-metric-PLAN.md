---
phase: 12-allowlist-mac-hostapd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/src/services/metrics.service.ts
  - central-server/src/services/socket.service.ts
  - central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts
autonomous: true
requirements:
  - OBSERVE-01
  - OBSERVE-02
must_haves:
  truths:
    - 'Quand un Fire Stick non assigné apparaît dans un payload state-sync, un log Winston warn est émis côté cloud'
    - 'Le Counter Prometheus neopro_hotspot_unknown_firestick_total{site_id} est incrémenté à la première détection'
    - "La métrique n'est PAS incrémentée à chaque tick state-sync (dédupliquée par (site_id, mac))"
    - "Les receivers kind='browser' (téléphones bénévoles) ne déclenchent ni log ni métrique"
    - "Les receivers kind='firestick' avec displayIndex !== null ne déclenchent ni log ni métrique"
  artifacts:
    - path: 'central-server/src/services/metrics.service.ts'
      provides: 'Counter neopro_hotspot_unknown_firestick_total + recordHotspotUnknownFirestick(siteId)'
      contains: 'neopro_hotspot_unknown_firestick_total'
    - path: 'central-server/src/services/socket.service.ts'
      provides: 'Détection firestick non assigné dans le handler state-sync + dédup Map<siteId, Set<mac>>'
      contains: 'recordHotspotUnknownFirestick'
    - path: 'central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts'
      provides: 'Garde-fous wiring Counter + dedup + state-sync hook'
      contains: 'neopro_hotspot_unknown_firestick_total'
  key_links:
    - from: 'central-server/src/services/socket.service.ts (state-sync handler)'
      to: 'metricsService.recordHotspotUnknownFirestick'
      via: "Détection r.kind === 'firestick' && r.displayIndex === null"
      pattern: 'recordHotspotUnknownFirestick'
    - from: 'Map<siteId, Set<mac>> de MACs déjà signalées'
      to: 'Skip log + métrique si MAC déjà dans le set'
      via: 'Dédup en mémoire scope process'
      pattern: 'unknownFirestickSeenBySite'
---

<objective>
Côté cloud, détecter dans le payload state-sync les Fire Sticks (kind='firestick') connectés au hotspot Pi sans être assignés à un display (displayIndex === null), émettre un log Winston warn et incrémenter une nouvelle métrique Prometheus `neopro_hotspot_unknown_firestick_total{site_id}`. Dédupliquer par (site_id, mac) pour éviter le spam à chaque tick (state-sync arrive ~10s).

Purpose: Donner à l'admin une observabilité Prometheus + Grafana sur les Fire Sticks branchés mais oubliés en assignation, sans toucher hostapd.conf ni receivers.service.js (hotspot reste ouvert pour les téléphones des bénévoles).

Output: Counter Prometheus exposé sur `/metrics`, log warn Winston, smoke test garde-fou.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/12-allowlist-mac-hostapd/12-CONTEXT.md

# Existing code to reference

@central-server/src/services/metrics.service.ts
@central-server/src/services/socket.service.ts
@central-server/src/**tests**/smoke/smoke-receivers-discovery.test.ts

<interfaces>
<!-- Pattern Counter (metrics.service.ts ~line 108-113 ADR-111) -->
```typescript
const alertsDedupSkippedTotal = new Counter({
  name: 'neopro_alerts_dedup_skipped_total',
  help: 'Number of alert inserts deduplicated into an existing active alert (ADR-111)',
  labelNames: ['type'],
  registers: [register],
});
```

<!-- Existing receivers Counter (line 150-155) à reproduire -->

```typescript
const receiversTotal = new Counter({
  name: 'neopro_receivers_total',
  help: 'Total number of receiver state transitions (Fire Stick detection, assignment, disconnection)',
  labelNames: ['site_id', 'status'],
  registers: [register],
});
```

<!-- Existing recorder method (line 1561) -->

```typescript
recordReceiver(siteId: string, status: 'detected' | 'assigned' | 'disconnected'): void {
  receiversTotal.inc({ site_id: siteId, status });
}
```

<!-- Existing state-sync handler in socket.service.ts (line 567-586) — où brancher le hook -->

```typescript
socket.on('state-sync', (data: unknown) => {
  metricsService.recordWebsocketMessage('inbound', 'state-sync');
  metricsService.recordStateSyncRelay();
  if (data && Array.isArray((data as Record<string, unknown>).receivers)) {
    const receivers = (data as Record<string, unknown>).receivers as ReceiverInfo[];
    const isFirstSeen = !this.receiversBySite.has(siteId);
    this.receiversBySite.set(siteId, receivers);
    if (isFirstSeen) {
      logger.info('Receivers Map updated', { siteId, count: receivers.length });
    }
    if (receivers.length > 0) {
      metricsService.recordReceiver(siteId, 'detected');
    }
  }
  if (this.io) {
    this.io.to(siteId).emit('state-sync', data);
  }
});
```

<!-- ReceiverInfo shape (consumed elsewhere in socket.service.ts) -->

```typescript
interface ReceiverInfo {
  mac: string;
  kind: 'firestick' | 'browser' | 'pi_native';
  displayIndex: number | null;
  lastSeenAt: string | number;
}
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add Counter neopro_hotspot_unknown_firestick_total + recorder + smoke wiring guard</name>
  <files>central-server/src/services/metrics.service.ts, central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts</files>

<read_first> - central-server/src/services/metrics.service.ts (read lines 100-160 — pattern alertsDedupSkippedTotal + receiversTotal + section comment headers) - central-server/src/services/metrics.service.ts (read line ~1561 — recordReceiver method, suit exactement le même pattern) - central-server/src/**tests**/smoke/smoke-receivers-discovery.test.ts (read entire — pour comprendre le pattern source-string assertions)
</read_first>

  <behavior>
    - Test 1 (smoke): grep on metrics.service.ts source MUST find exact string "neopro_hotspot_unknown_firestick_total" with labelNames including 'site_id'.
    - Test 2 (smoke): grep on metrics.service.ts MUST find a public method named recordHotspotUnknownFirestick that calls .inc({ site_id: ... }).
    - Test 3 (unit-style assertion): import metricsService, call recordHotspotUnknownFirestick('site-A'); register.metrics() MUST contain `neopro_hotspot_unknown_firestick_total{site_id="site-A"} 1`.
  </behavior>

  <action>
    1. In `central-server/src/services/metrics.service.ts`, immediately after the existing `receiversTotal` Counter (after line ~155), add:
    ```typescript
    // Phase 12 OBSERVE — Fire Sticks branchés sur le hotspot mais non assignés à un display.
    // Incrémenté UNIQUEMENT à la première détection par (site_id, mac) — la dédup
    // vit dans socket.service.ts (Map<siteId, Set<mac>>) pour éviter le spam à chaque
    // tick state-sync (~10s). kind === 'browser' (téléphones bénévoles) jamais comptés.
    const hotspotUnknownFirestickTotal = new Counter({
      name: 'neopro_hotspot_unknown_firestick_total',
      help: 'Fire Sticks (kind=firestick) détectés sur le hotspot Pi sans assignation à un display (displayIndex=null), comptés une fois par (site_id, mac) (Phase 12 OBSERVE)',
      labelNames: ['site_id'],
      registers: [register],
    });
    ```

    2. In the same file, find the `recordReceiver` method (around line 1561) and add immediately after it:
    ```typescript
    /**
     * Phase 12 OBSERVE — Incrémenter le Counter Fire Stick non assigné détecté
     * sur le hotspot. La dédup par (site_id, mac) est gérée par l'appelant
     * (socket.service.ts state-sync handler).
     */
    recordHotspotUnknownFirestick(siteId: string): void {
      hotspotUnknownFirestickTotal.inc({ site_id: siteId });
    }
    ```

    3. In `central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts`, add a new `describe('Phase 12 OBSERVE — neopro_hotspot_unknown_firestick_total', ...)` block at the end of the file with these `it` assertions:
       - `it('declares hotspot_unknown_firestick Counter with site_id label', ...)` — read metrics.service.ts file as string, expect to contain `'neopro_hotspot_unknown_firestick_total'` AND `"labelNames: ['site_id']"` within ~15 lines distance (use a regex window).
       - `it('exposes recordHotspotUnknownFirestick recorder method', ...)` — expect source to match `/recordHotspotUnknownFirestick\s*\(siteId:\s*string\)/`.
       - `it('increments the Counter when recordHotspotUnknownFirestick is called', ...)` — `import { metricsService } from '../../services/metrics.service'; import { register } from 'prom-client';` (or use the existing pattern in the test file). Call `metricsService.recordHotspotUnknownFirestick('test-site-12-01');` then expect `await register.metrics()` to contain `neopro_hotspot_unknown_firestick_total{site_id="test-site-12-01"} 1`.

    Do NOT modify the existing receiversTotal or recordReceiver. Do NOT add any new label besides site_id (mac as label = high cardinality, refused).

  </action>

  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke/smoke-receivers-discovery' --no-coverage --forceExit</automated>
  </verify>

<acceptance_criteria> - `grep -n "neopro_hotspot_unknown_firestick_total" central-server/src/services/metrics.service.ts` returns at least 2 matches (Counter declaration + name field). - `grep -n "recordHotspotUnknownFirestick" central-server/src/services/metrics.service.ts` returns exactly 1 match (the method definition). - `grep -nc "neopro_hotspot_unknown_firestick_total" central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts` >= 2. - Smoke suite `smoke-receivers-discovery` passes with ALL prior tests still green. - The new label set is ONLY `['site_id']` — assertion: `grep -A2 "neopro_hotspot_unknown_firestick_total" central-server/src/services/metrics.service.ts | grep -c "mac"` returns 0.
</acceptance_criteria>

  <done>
    Counter Prometheus déclaré, recorder exposé, et 3 nouveaux tests smoke verts dans `smoke-receivers-discovery.test.ts`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Hook state-sync handler with (site_id, mac) dedup + Winston warn + smoke wiring guard</name>
  <files>central-server/src/services/socket.service.ts, central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts</files>

<read_first> - central-server/src/services/socket.service.ts (read lines 560-590 — state-sync handler existant) - central-server/src/services/socket.service.ts (read class header / constructor area — pour positionner la nouvelle Map en private member) - central-server/src/**tests**/smoke/smoke-receivers-discovery.test.ts (read entire — pour ajouter assertions cohérentes)
</read_first>

  <behavior>
    - Test 1 (source assertion): smoke MUST find that socket.service.ts source contains the call `metricsService.recordHotspotUnknownFirestick(siteId)` inside the `socket.on('state-sync', ...)` callback.
    - Test 2 (source assertion): smoke MUST find a private member named `unknownFirestickSeenBySite` typed as `Map<string, Set<string>>` (the dedup tracker).
    - Test 3 (source assertion): smoke MUST find that the firestick detection condition matches `kind === 'firestick'` AND `displayIndex === null` (NOT undefined, NOT just null on kind unchecked).
    - Test 4 (source assertion — anti-regression): smoke MUST NOT find any call to `recordHotspotUnknownFirestick` outside socket.service.ts (the only caller is state-sync).
    - Test 5 (source assertion — anti-regression): smoke MUST find a logger.warn call near the recorder including the keyword `unknown_firestick` or `Fire Stick non assigné`.
  </behavior>

  <action>
    1. In `central-server/src/services/socket.service.ts`, locate the class private members area near `receiversBySite` and add immediately after it:
    ```typescript
    /**
     * Phase 12 OBSERVE — Dédup MAC déjà signalée par site, scope process.
     * Évite l'incrément du Counter à chaque tick state-sync (~10s).
     * Reset implicite au reboot Railway (acceptable — granularité par session process).
     */
    private unknownFirestickSeenBySite: Map<string, Set<string>> = new Map();
    ```

    2. Modify the existing `socket.on('state-sync', ...)` handler (around line 567-586) by ADDING (do NOT remove anything existing) — immediately after the `if (receivers.length > 0) { metricsService.recordReceiver(siteId, 'detected'); }` line, insert:
    ```typescript
        // Phase 12 OBSERVE — Détecter les Fire Sticks non assignés (kind=firestick, displayIndex=null).
        // kind === 'browser' (téléphones bénévoles) volontairement ignoré.
        // Dédup par (siteId, mac) pour ne compter qu'à la première apparition de la session.
        let seen = this.unknownFirestickSeenBySite.get(siteId);
        if (!seen) {
          seen = new Set<string>();
          this.unknownFirestickSeenBySite.set(siteId, seen);
        }
        for (const r of receivers) {
          if (r.kind === 'firestick' && r.displayIndex === null && r.mac && !seen.has(r.mac)) {
            seen.add(r.mac);
            logger.warn('unknown_firestick detected on hotspot — Fire Stick non assigné', {
              siteId,
              mac: r.mac,
              lastSeenAt: r.lastSeenAt,
            });
            metricsService.recordHotspotUnknownFirestick(siteId);
          }
        }
    ```

    3. In `central-server/src/__tests__/smoke/smoke-receivers-discovery.test.ts`, in the same `describe('Phase 12 OBSERVE — neopro_hotspot_unknown_firestick_total', ...)` block created in Task 1, add:
       - `it('socket.service state-sync handler calls recordHotspotUnknownFirestick', ...)` — read socket.service.ts source, assert it contains `recordHotspotUnknownFirestick(siteId)` AND that match falls within ±200 chars of `socket.on('state-sync'`.
       - `it('declares unknownFirestickSeenBySite dedup Map', ...)` — assert source matches `/unknownFirestickSeenBySite\s*:\s*Map<string,\s*Set<string>>/`.
       - `it('detects firestick with displayIndex === null only', ...)` — assert source contains both `r.kind === 'firestick'` and `r.displayIndex === null` within the same handler block (regex with non-greedy capture between `socket.on('state-sync'` and the next `socket.on(`).
       - `it('emits a Winston warn for unknown firestick', ...)` — assert source contains `logger.warn` with literal substring `unknown_firestick`.
       - `it('does NOT call recordHotspotUnknownFirestick outside socket.service.ts', ...)` — `glob central-server/src/**/*.ts` excluding test files and `metrics.service.ts` and `socket.service.ts`, expect 0 occurrences of `recordHotspotUnknownFirestick`.

  </action>

  <verify>
    <automated>cd central-server && npx jest --testPathPattern='smoke/smoke-receivers-discovery' --no-coverage --forceExit && npm run lint -- --max-warnings=0</automated>
  </verify>

<acceptance_criteria> - `grep -n "unknownFirestickSeenBySite" central-server/src/services/socket.service.ts` returns >= 3 matches (declaration + .get + .set). - `grep -n "recordHotspotUnknownFirestick" central-server/src/services/socket.service.ts` returns exactly 1 match (inside state-sync handler). - `grep -n "logger.warn.*unknown_firestick" central-server/src/services/socket.service.ts` returns >= 1 match. - `grep -rn "recordHotspotUnknownFirestick" central-server/src --include='*.ts' | grep -v "__tests__\|metrics.service.ts\|socket.service.ts"` returns 0 matches. - All 5 new smoke assertions in `smoke-receivers-discovery.test.ts` pass; existing tests in the suite remain green. - `npm run lint` passes with no new warnings (no `any` introduced — ReceiverInfo type already defined in socket.service.ts).
</acceptance_criteria>

  <done>
    Le handler state-sync incrémente le Counter UNE FOIS par (siteId, mac) pour les firesticks `displayIndex === null`, émet un log Winston warn, et tous les garde-fous smoke sont verts.
  </done>
</task>

</tasks>

<verification>
- Smoke suite passe : `cd central-server && npx jest --testPathPattern='smoke/smoke-receivers-discovery' --no-coverage --forceExit`
- Smart smoke après touch : `npm run test:smoke:smart`
- Lint propre : `cd central-server && npm run lint`
- Métrique exposée : démarrer le serveur en local, simuler un payload state-sync avec un firestick non assigné, vérifier `curl localhost:3001/metrics | grep neopro_hotspot_unknown_firestick_total` retourne `{site_id="..."} 1`.
</verification>

<success_criteria>

1. Counter `neopro_hotspot_unknown_firestick_total{site_id}` exposé sur `/metrics` (OBSERVE-02).
2. Log Winston `warn` émis avec `siteId`, `mac`, `lastSeenAt` à la première détection (OBSERVE-01).
3. Pas d'incrément lors des ticks state-sync suivants pour la même `(siteId, mac)` (dédup process-scope).
4. `kind === 'browser'` jamais compté.
5. `kind === 'firestick'` AVEC `displayIndex !== null` jamais compté (assignés OK).
6. 5 nouveaux tests smoke verts, suite globale toujours verte.
7. Aucune modification de `receivers.service.js` (Pi-side intact) ni de `hostapd.conf`.
   </success_criteria>

<output>
After completion, create `.planning/phases/12-allowlist-mac-hostapd/12-01-SUMMARY.md`
</output>
