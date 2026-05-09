---
phase: 05-detect
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - raspberry/server/services/receivers.service.js
  - raspberry/server/__tests__/receivers.service.test.js
autonomous: true
requirements: [DETECT-01, DETECT-02]
must_haves:
  truths:
    - "Quand un Fire Stick rejoint le hotspot, sa MAC est observable côté Pi en moins de 30s (logs Winston + état service)"
    - "Quand un Fire Stick quitte le hotspot, sa disparition est détectée et émise via socket"
    - "Le service distingue le kind 'firestick' des autres clients hotspot par MAC OUI Amazon (préfixe MAC) ou fallback générique 'browser'"
  artifacts:
    - path: "raspberry/server/services/receivers.service.js"
      provides: "Service de détection passive des receivers WiFi (dnsmasq.leases watch + ARP fallback)"
      min_lines: 120
    - path: "raspberry/server/__tests__/receivers.service.test.js"
      provides: "Tests Jest mock fs + child_process pour parsing leases + ARP + diff"
      min_lines: 80
  key_links:
    - from: "raspberry/server/services/receivers.service.js"
      to: "Socket.IO io instance"
      via: "io.emit('connected-receivers-changed', { receivers: [...] })"
      pattern: "connected-receivers-changed"
    - from: "raspberry/server/services/receivers.service.js"
      to: "/var/lib/misc/dnsmasq.leases"
      via: "fs.statSync mtime + fs.readFileSync"
      pattern: "dnsmasq\\.leases"
---

<objective>
Créer `receivers.service.js` qui détecte passivement les MACs présentes sur le hotspot Pi (`wlan0`) en suivant le pattern `hdmi.service.js` (PROP-002 phase 5). Le service watch `/var/lib/misc/dnsmasq.leases` (mtime polling) avec fallback ARP, calcule un diff de l'état précédent vs courant, et émet les événements socket `connected-receivers-changed` à chaque transition.

Purpose : DETECT-01 (auto-discovery MACs hotspot) + DETECT-02 (push events socket). Bloque Plan 03 (intégration state.service + sync-agent).

Output : Module Node.js exportant la classe `ReceiversService` avec API `start(io)`, `stop()`, `getReceivers()`, et tests Jest verts.
</objective>

<execution_context>
@/home/user/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/home/user/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/firestick-poc/VISION.md
@raspberry/server/services/hdmi.service.js
@raspberry/server/__tests__/hdmi.service.test.js

<interfaces>
<!-- Pattern de référence : hdmi.service.js (lecture EDID/CEC, cache TTL, getStatus()/getFullStatus()) -->
<!-- Le receivers.service ne fait PAS de cache TTL — il maintient un état interne mis à jour à chaque tick -->

API à exposer :
```js
class ReceiversService {
  constructor() { /* state: Map<mac, { kind, lastSeenAt }> */ }
  start(io)     // Démarre les polls : mtime watch dnsmasq.leases (10s), ARP fallback (30s). Stocke `io`.
  stop()        // clearInterval des polls
  getReceivers() // Returns [{ mac, kind, lastSeenAt }] sorted by lastSeenAt desc
  _scanLeases() // Lit dnsmasq.leases si mtime a changé, parse, diff, emit
  _scanArp()    // exec `arp -an` (fallback robustesse), enrichit l'état
  _emitChange(io) // io.emit('connected-receivers-changed', { receivers: [...] })
}
```

Format dnsmasq.leases (lignes "expiration mac ip hostname clientid") :
```
1714400000 0c:43:f9:36:04:77 192.168.4.42 firestick-bedroom *
1714400123 b8:27:eb:01:02:03 192.168.4.50 staff-phone *
```

Format `arp -an` :
```
? (192.168.4.42) at 0c:43:f9:36:04:77 [ether] on wlan0
? (192.168.4.50) at b8:27:eb:01:02:03 [ether] on wlan0
```

Détection kind par OUI MAC :
- Préfixes Amazon Fire Stick (OUI publics) : `0c:43:f9`, `08:e6:38`, `74:c2:46`, `fc:65:de`, `ac:bc:32`, `f0:81:73`, `40:b4:cd`, `38:f7:3d`, `68:54:fd`
- → `kind: 'firestick'`
- Sinon : `kind: 'browser'` (générique pour SaaS / staff phone)
- Pi natif HDMI : exclu (pas une MAC hotspot)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: receivers.service.js core — dnsmasq.leases watch + ARP fallback + diff + emit</name>
  <files>raspberry/server/services/receivers.service.js, raspberry/server/__tests__/receivers.service.test.js</files>
  <read_first>
    - raspberry/server/services/hdmi.service.js (pattern à reproduire : classe avec state interne, parsing fs, fallback chains)
    - raspberry/server/__tests__/hdmi.service.test.js (pattern de test : mock fs + child_process)
    - raspberry/server/socket/handlers.js (lignes 218, 633 — pattern `io.emit('displays-changed', ...)` analogue)
    - .planning/firestick-poc/VISION.md (table comparative HDMI vs Receivers WiFi, ligne 90-99)
  </read_first>
  <behavior>
    - Test 1 : `getReceivers()` retourne `[]` au démarrage (avant tout scan)
    - Test 2 : `_scanLeases()` parse correctement une lease Fire Stick (OUI `0c:43:f9`) → state contient `{ mac: '0c:43:f9:36:04:77', kind: 'firestick', lastSeenAt: ISO }`
    - Test 3 : `_scanLeases()` parse une MAC inconnue (non-Amazon) → `kind: 'browser'`
    - Test 4 : Quand une nouvelle MAC apparaît, le service appelle `io.emit('connected-receivers-changed', { receivers: [...] })`
    - Test 5 : Quand une MAC disparaît du fichier leases (lease expirée + absente d'ARP), le service la retire du state et émet `connected-receivers-changed` avec le state restant
    - Test 6 : Si `dnsmasq.leases` n'existe pas (fs.statSync throws ENOENT), le service log warn et ne crash pas
    - Test 7 : `_scanArp()` (fallback) ajoute une MAC absente de leases mais présente en ARP sur `wlan0`
    - Test 8 : `_scanLeases()` ne re-emit PAS si le state n'a pas changé (mtime identique → skip ; mtime change mais same MACs → skip emit)
    - Test 9 : `start(io)` démarre 2 intervals (10s leases, 30s ARP) ; `stop()` les clear
  </behavior>
  <action>
    Créer `raspberry/server/services/receivers.service.js` :

    1. **Imports** : `fs`, `child_process.exec` promisifié, `winston` logger (`require('../helpers').logger` ou pattern existant dans hdmi.service.js — vérifier `helpers.js`).

    2. **Classe `ReceiversService`** avec :
       - `_state = new Map()` : Map<mac_lowercase, { kind, lastSeenAt }>
       - `_lastLeasesMtime = 0`
       - `_io = null`
       - `_leasesInterval = null`, `_arpInterval = null`
       - Constantes : `LEASES_PATH = '/var/lib/misc/dnsmasq.leases'`, `LEASES_POLL_MS = 10000`, `ARP_POLL_MS = 30000`
       - OUI Amazon array : `['0c:43:f9', '08:e6:38', '74:c2:46', 'fc:65:de', 'ac:bc:32', 'f0:81:73', '40:b4:cd', '38:f7:3d', '68:54:fd']`

    3. **`start(io)`** :
       - Stocke `this._io = io`
       - Log Winston `info` `'[Receivers] Service started'`
       - Schedule `setInterval(() => this._scanLeases(), LEASES_POLL_MS)`
       - Schedule `setInterval(() => this._scanArp(), ARP_POLL_MS)`
       - Trigger un scan initial immédiat

    4. **`stop()`** : clearInterval des deux + log info

    5. **`getReceivers()`** : retourne `Array.from(this._state.entries()).map(([mac, v]) => ({ mac, ...v })).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))`

    6. **`_inferKind(mac)`** : lowercase, prend les 3 premiers octets `mac.slice(0,8)`, retourne `'firestick'` si dans la liste OUI Amazon, sinon `'browser'`. Pi natif (`b8:27:eb`, etc.) → `'browser'` aussi (le service ne traite que des MAC hotspot, le Pi lui-même n'est pas un client de son propre AP).

    7. **`_scanLeases()`** :
       - try { stat = fs.statSync(LEASES_PATH) } catch (ENOENT) → log warn 'leases file missing', return
       - Si `stat.mtimeMs === this._lastLeasesMtime` → return (no change)
       - Sinon : `this._lastLeasesMtime = stat.mtimeMs`
       - `content = fs.readFileSync(LEASES_PATH, 'utf8')`
       - Parse lignes : split by `\n`, ignore blanks. Pour chaque ligne `expiration mac ip hostname clientid` : extract `mac` (champ 1, format `xx:xx:xx:xx:xx:xx`).
       - Build `currentMacs = new Set()` des MACs valides (regex `/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i`)
       - Diff : pour chaque mac in currentMacs, si pas dans `_state` ou state changed → mark `changed = true`. Add/update : `this._state.set(mac, { kind: this._inferKind(mac), lastSeenAt: new Date().toISOString() })`
       - Pour chaque mac in `_state` mais pas dans currentMacs : `this._state.delete(mac)` ; mark `changed = true` ; log info `'[Receivers] disconnected'`.
       - Si `changed` → `this._emitChange()` + log info `'[Receivers] state updated'` avec le count.

    8. **`_scanArp()`** :
       - exec `arp -an` (timeout 5s), catch errors (log warn, return)
       - Parse stdout : regex `/at ([0-9a-f:]{17}) \[ether\] on wlan0/gi` (insensitive, only wlan0)
       - Pour chaque mac trouvée : si déjà dans `_state` → update `lastSeenAt`. Sinon : add `{ kind: this._inferKind(mac), lastSeenAt: ISO }` + mark changed.
       - Si changed → `_emitChange()`.

    9. **`_emitChange()`** :
       - if (!this._io) return
       - this._io.emit('connected-receivers-changed', { receivers: this.getReceivers() })

    10. **Export** : `module.exports = ReceiversService` (classe, pas singleton — sera instanciée au boot du server, comme hdmi).

    Créer `raspberry/server/__tests__/receivers.service.test.js` :
    - Mock `fs.statSync`, `fs.readFileSync`, `child_process.exec` via `jest.mock`
    - Mock `io = { emit: jest.fn() }`
    - Tests selon `<behavior>`, instancier `new ReceiversService()`, appeler `_scanLeases()` directement (pas via interval) pour tester déterministe.

    NE PAS : utiliser `setInterval` réel dans les tests (utiliser `jest.useFakeTimers()` ou mock direct).
    NE PAS : importer `central-server/` (frontière package).
    NE PAS : faire de promiscuous mode / packet capture.
    NE PAS : poll <5s (cible : 10s leases / 30s ARP — recommandation VISION).
  </action>
  <verify>
    <automated>cd /home/user/neopro/raspberry/server && npm test -- --testPathPattern='receivers.service' --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - `test -f raspberry/server/services/receivers.service.js` → exit 0
    - `grep -q "class ReceiversService" raspberry/server/services/receivers.service.js` → exit 0
    - `grep -q "connected-receivers-changed" raspberry/server/services/receivers.service.js` → exit 0
    - `grep -q "/var/lib/misc/dnsmasq.leases" raspberry/server/services/receivers.service.js` → exit 0
    - `grep -q "0c:43:f9\|0c:43:F9" raspberry/server/services/receivers.service.js` (OUI Amazon présent) → exit 0
    - `grep -q "arp -an" raspberry/server/services/receivers.service.js` → exit 0
    - `grep -cE "test\(|it\(" raspberry/server/__tests__/receivers.service.test.js` ≥ 8
    - `cd raspberry/server && npm test -- --testPathPattern='receivers.service' --forceExit` retourne `Tests:.*passed` (au moins 8 passing)
  </acceptance_criteria>
  <done>
    - `receivers.service.js` exporte `ReceiversService` avec API `start(io) / stop() / getReceivers() / _scanLeases() / _scanArp() / _inferKind() / _emitChange()`.
    - Diff state previous vs current → emit socket only when changed (idempotent).
    - 8+ tests Jest verts (mock fs + child_process).
    - Logs Winston `info` au start/stop, à chaque transition, `warn` au catch (leases missing, arp fail).
  </done>
</task>

</tasks>

<verification>
- `cd raspberry/server && npm test -- --testPathPattern='receivers.service' --forceExit` → tous tests verts
- `node -e "const S = require('./raspberry/server/services/receivers.service'); const s = new S(); console.log(typeof s.start, typeof s.stop, typeof s.getReceivers)"` → `function function function`
</verification>

<success_criteria>
- Service `ReceiversService` instanciable, démarrable avec un `io` mock, retourne `[]` initialement.
- Quand fs.readFileSync retourne une lease Fire Stick, `getReceivers()` contient un objet `{ mac, kind: 'firestick', lastSeenAt }` après `_scanLeases()`.
- `io.emit('connected-receivers-changed', ...)` appelé une seule fois par transition (pas en boucle si state inchangé).
- Pas de leak d'intervalles : `stop()` appelé après `start(io)` clear les deux intervals (vérifiable avec `jest.useFakeTimers`).
</success_criteria>

<output>
After completion, create `.planning/phases/05-detect/05-detect-01-SUMMARY.md`
</output>
