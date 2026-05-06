---
phase: 06-captive-fire-stick-page-neopro
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - raspberry/server/services/receivers.service.js
  - raspberry/server/__tests__/receivers.service.test.js
autonomous: true
requirements: [CAPTIVE-02]
must_haves:
  truths:
    - "Étant donné une IP cliente connue (vue dans dnsmasq.leases ou /proc/net/arp), le service retourne la MAC correspondante sans appel système"
    - "Une IP IPv4-mapped IPv6 (::ffff:192.168.4.X) est normalisée en IPv4 avant lookup"
    - "Une IP inconnue retourne null sans throw"
  artifacts:
    - path: "raspberry/server/services/receivers.service.js"
      provides: "resolveMacByIp(ip) public method + _ipToMac Map populated by _scanLeases and _scanArp"
      contains: "resolveMacByIp"
    - path: "raspberry/server/__tests__/receivers.service.test.js"
      provides: "Jest tests for resolveMacByIp (3+ cases)"
      contains: "resolveMacByIp"
  key_links:
    - from: "raspberry/server/services/receivers.service.js::_scanLeases"
      to: "this._ipToMac"
      via: "set(ip, mac.toLowerCase()) lors du parsing dnsmasq.leases"
      pattern: "_ipToMac\\.set"
    - from: "raspberry/server/services/receivers.service.js::resolveMacByIp"
      to: "this._ipToMac"
      via: "Map.get + normalisation IPv4-mapped IPv6"
      pattern: "resolveMacByIp"
---

<objective>
Étendre `ReceiversService` (livré Phase 5 plan 01) avec une méthode publique `resolveMacByIp(ip)` qui permet le lookup inverse IP→MAC sans appel système, en s'appuyant sur les scans déjà effectués (dnsmasq.leases + ARP).

Purpose: Le futur endpoint `/api/captive/whoami` (Plan 02) doit pouvoir résoudre l'IP cliente vue par Express en MAC pour décider de la redirection (display assigné vs page d'attente). Le scan ARP via shell exec serait trop lent (~30ms + spawn) — réutiliser l'état déjà en mémoire est < 1ms.
Output: Méthode `resolveMacByIp` + Map interne `_ipToMac` peuplée par les deux polls existants, tests Jest couvrant 3 cas (trouvé, IPv4-mapped IPv6, absent).
</objective>

<execution_context>
@/home/user/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/home/user/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-RESEARCH.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-VALIDATION.md
@.planning/phases/05-detect/05-detect-01-SUMMARY.md
@raspberry/server/services/receivers.service.js
@raspberry/server/__tests__/receivers.service.test.js

<interfaces>
<!-- État actuel pertinent (Phase 5 plan 01 livré) -->

ReceiversService déjà en place (raspberry/server/services/receivers.service.js):
- constructor: this._state = new Map<string mac, {kind, lastSeenAt, displayIndex}>
- start(io) / stop()
- getReceivers(): { receivers: Array<{mac, kind, lastSeenAt, displayIndex}> }
- _scanLeases(): lit /var/lib/misc/dnsmasq.leases avec mtime poll (10s), format ligne: `<unix_ts> <mac> <ip> <hostname> <client_id>`
- _scanArp(): exec `arp -an`, regex /at ([0-9a-f:]{17}) \[ether\] on wlan0/gi (note: NE capture PAS l'IP — à étendre)
- AMAZON_OUIS, MAC_REGEX, ARP_LINE_REGEX déjà définis

À AJOUTER:
- this._ipToMac = new Map<string ip, string mac_lowercase>
- _scanLeases doit aussi peupler _ipToMac
- _scanArp doit étendre sa regex pour capturer aussi l'IP (format `arp -an`: `? (192.168.4.23) at 0c:43:f9:36:04:77 [ether] on wlan0`)
- resolveMacByIp(ip: string): string | null  — gère IPv4-mapped IPv6 (`::ffff:192.168.4.X` → `192.168.4.X`)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add resolveMacByIp tests (RED) + implementation (GREEN)</name>
  <read_first>
    - raspberry/server/services/receivers.service.js (état complet du service Phase 5 plan 01)
    - raspberry/server/__tests__/receivers.service.test.js (pattern Jest existant : mock fs.statSync/readFileSync + util.promisify.custom pour exec)
    - .planning/phases/06-captive-fire-stick-page-neopro/06-RESEARCH.md sections "MAC ↔ IP resolution pattern recommandé" + "Edge cases" (snippet code orientation)
    - .planning/phases/05-detect/05-detect-01-SUMMARY.md (decisions ADR : console.info/warn, pas de Winston côté Pi ; lastSeenAt refresh sans emit)
  </read_first>
  <files>
    - raspberry/server/__tests__/receivers.service.test.js (modify — ajouter describe block "resolveMacByIp")
    - raspberry/server/services/receivers.service.js (modify — ajouter _ipToMac Map + populate dans _scanLeases/_scanArp + méthode publique resolveMacByIp)
  </files>
  <behavior>
    Test 1 — "resolveMacByIp returns mac for IP seen in dnsmasq.leases":
      - Mock fs.readFileSync(LEASES_PATH) returns "1700000000 0c:43:f9:36:04:77 192.168.4.23 firetv abcd\n"
      - Mock fs.statSync returns mtime > _lastLeasesMtime
      - Call service._scanLeases() (sync helper) puis service.resolveMacByIp('192.168.4.23')
      - Expect → '0c:43:f9:36:04:77'
    Test 2 — "resolveMacByIp normalizes IPv4-mapped IPv6":
      - Setup même que Test 1
      - Call service.resolveMacByIp('::ffff:192.168.4.23')
      - Expect → '0c:43:f9:36:04:77'
    Test 3 — "resolveMacByIp returns null for unknown IP":
      - Pas de scan, ou scan avec autres IPs
      - Call service.resolveMacByIp('10.0.0.99')
      - Expect → null
    Test 4 (bonus, optionnel mais recommandé) — "_scanArp populates _ipToMac when arp output includes IP":
      - Mock execAsync returns `? (192.168.4.42) at 08:e6:38:aa:bb:cc [ether] on wlan0\n`
      - Await service._scanArp()
      - Expect service.resolveMacByIp('192.168.4.42') === '08:e6:38:aa:bb:cc'
  </behavior>
  <action>
    Step 1 — RED: Ajouter dans `raspberry/server/__tests__/receivers.service.test.js` un `describe('resolveMacByIp', () => { ... })` avec les 3 (ou 4) tests ci-dessus. Lancer `cd raspberry/server && npx jest --testPathPattern='receivers.service' --no-coverage --forceExit` → DOIT échouer (méthode inexistante). Commit: `test(captive): add failing tests for receivers.resolveMacByIp (CAPTIVE-02)`.

    Step 2 — GREEN: Modifier `raspberry/server/services/receivers.service.js`:

    a) Dans le constructor, après `this._state = new Map();`, ajouter:
    ```javascript
    /** @type {Map<string, string>} ip → mac (lowercase) */
    this._ipToMac = new Map();
    ```

    b) Dans `_scanLeases()`, lors du parsing de chaque ligne, après extraction de la MAC, extraire aussi l'IP (3e champ du split sur espace) et faire:
    ```javascript
    const parts = line.split(' ');
    const mac = (parts[1] || '').toLowerCase();
    const ip = parts[2] || '';
    if (!MAC_REGEX.test(mac) || !ip) continue;
    this._ipToMac.set(ip, mac);
    // ... existing _state update
    ```

    c) Étendre la regex `ARP_LINE_REGEX` pour capturer l'IP. Le format `arp -an` est: `? (192.168.4.23) at 0c:43:f9:36:04:77 [ether] on wlan0`. Remplacer:
    ```javascript
    const ARP_LINE_REGEX = /\(([\d.]+)\) at ([0-9a-f:]{17}) \[ether\] on wlan0/gi;
    ```
    Et dans `_scanArp()`, lors du `match`, capturer `match[1]` (ip) et `match[2]` (mac), peupler `this._ipToMac`.

    d) Ajouter la méthode publique:
    ```javascript
    /**
     * Lookup inverse IP → MAC (sans appel système, lit le state populé par _scanLeases/_scanArp).
     * Normalise les IPv4-mapped IPv6 (`::ffff:192.168.4.X` → `192.168.4.X`).
     * @param {string} ip
     * @returns {string|null} MAC lowercase ou null si inconnu
     */
    resolveMacByIp(ip) {
      if (!ip || typeof ip !== 'string') return null;
      // IPv4-mapped IPv6 normalization (Express derrière nginx avec listen [::]:80 voit souvent ::ffff:X.X.X.X)
      const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
      return this._ipToMac.get(normalized) || null;
    }
    ```

    Lancer `cd raspberry/server && npx jest --testPathPattern='receivers.service' --no-coverage --forceExit` → DOIT passer (10 tests existants + 3-4 nouveaux). Commit: `feat(captive): add receivers.resolveMacByIp for IP→MAC reverse lookup (CAPTIVE-02)`.

    NE PAS modifier la signature `getReceivers()` ni casser les 10 tests Phase 5 existants. NE PAS introduire d'appel à `arp -an` synchrone dans `resolveMacByIp` (lookup pur Map, latence < 1ms).
  </action>
  <verify>
    <automated>cd raspberry/server && npx jest --testPathPattern='receivers.service' --no-coverage --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "resolveMacByIp" raspberry/server/services/receivers.service.js` exit 0
    - `grep -q "_ipToMac" raspberry/server/services/receivers.service.js` exit 0
    - `grep -q "::ffff:" raspberry/server/services/receivers.service.js` exit 0 (normalisation IPv4-mapped IPv6 présente)
    - `grep -c "resolveMacByIp" raspberry/server/__tests__/receivers.service.test.js` ≥ 3 (au moins 3 références dans les tests)
    - `cd raspberry/server && npx jest --testPathPattern='receivers.service' --no-coverage --forceExit` exit 0 ET au moins 13 tests passing (10 existants + 3 nouveaux minimum)
    - `git log --oneline -2` montre 2 commits : `test(captive): ... CAPTIVE-02` puis `feat(captive): ... CAPTIVE-02`
    - Aucun appel à `child_process.exec` ou `execAsync` dans le corps de `resolveMacByIp` (lookup pur Map)
  </acceptance_criteria>
  <done>
    `resolveMacByIp(ip)` retourne la MAC pour une IP vue dans dnsmasq.leases ou ARP, normalise les IPv4-mapped IPv6, retourne null pour une IP inconnue. Tests Jest verts (RED→GREEN). Aucune régression sur les 10 tests Phase 5.
  </done>
</task>

</tasks>

<verification>
- 10/10 tests Phase 5 receivers.service.test.js toujours verts
- 3-4 nouveaux tests resolveMacByIp verts
- Aucune régression sur le pattern Phase 5 (Map _state, emit idempotent, console.info/warn)
- Aucun nouveau import (express, http, fs.exec direct) — extension pure des structures internes
</verification>

<success_criteria>
- `cd raspberry/server && npx jest --testPathPattern='receivers.service' --no-coverage --forceExit` exit 0 avec ≥ 13 tests passing
- `node -e "const R = require('./raspberry/server/services/receivers.service'); const r = new R(); console.log(typeof r.resolveMacByIp)"` outputs `function`
- Plan 02 (captive route) peut consommer `receiversService.resolveMacByIp(clientIp)` sans nouvel import
</success_criteria>

<output>
After completion, create `.planning/phases/06-captive-fire-stick-page-neopro/06-captive-01-SUMMARY.md`
</output>
</content>
</invoke>