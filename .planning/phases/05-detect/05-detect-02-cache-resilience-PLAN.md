---
phase: 05-detect
plan: 02
type: execute
wave: 2
depends_on: [05-detect-01]
files_modified:
  - raspberry/server/services/receivers.service.js
  - raspberry/server/__tests__/receivers.service.test.js
autonomous: true
requirements: [DETECT-03]
must_haves:
  truths:
    - "Au boot, si /home/pi/neopro/.receivers-cache.json existe, le service restaure le mapping MAC↔display assigné sans appel cloud"
    - "À chaque assignation/désassignation détectée localement, le cache est réécrit atomiquement"
    - "Si le cache est absent ou corrompu, le service repart avec un état vide sans crash"
  artifacts:
    - path: "raspberry/server/services/receivers.service.js"
      provides: "Méthodes loadCache() / saveCache() + assignDisplay(mac, displayIndex) qui persiste mapping local"
      contains: "loadCache"
    - path: "raspberry/server/__tests__/receivers.service.test.js"
      provides: "Tests reboot scenario (write cache, recreate service, restore mapping)"
      contains: "loadCache"
  key_links:
    - from: "ReceiversService.start(io)"
      to: "/home/pi/neopro/.receivers-cache.json"
      via: "fs.readFileSync au boot, JSON.parse, hydrate _state"
      pattern: "\\.receivers-cache\\.json"
    - from: "ReceiversService.assignDisplay()"
      to: "/home/pi/neopro/.receivers-cache.json"
      via: "atomic write (tmp + rename)"
      pattern: "writeFileSync|renameSync"
---

<objective>
Étendre `receivers.service.js` (Plan 01) avec un cache local résilient `/home/pi/neopro/.receivers-cache.json` qui persiste le mapping MAC↔display assigné. Au reboot du Pi, le service recharge le cache sans appel cloud (résilience offline).

Purpose : DETECT-03 (cache local résilient pour reboot scenario). Phase 7 (CLOUD) hydratera ce cache via socket events depuis le cloud.

Output : Méthodes `loadCache()`, `saveCache()`, `assignDisplay(mac, displayIndex)`, `unassignDisplay(mac)`. Le `_state` étend chaque entrée avec `displayIndex?: number | null`. Tests reboot scenario.
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
@raspberry/server/services/receivers.service.js
@raspberry/server/__tests__/receivers.service.test.js

<interfaces>
<!-- État interne étendu : Map<mac, { kind, lastSeenAt, displayIndex?: number | null }> -->
<!-- Pattern atomic write : fs.writeFileSync(tmpPath, json) puis fs.renameSync(tmpPath, finalPath) -->
<!-- Cache shape persisté :
{
  "version": 1,
  "savedAt": "2026-05-06T10:00:00.000Z",
  "assignments": [
    { "mac": "0c:43:f9:36:04:77", "kind": "firestick", "displayIndex": 1 }
  ]
}
-->

API étendue :
```js
class ReceiversService {
  // ... (Plan 01)
  loadCache()                          // Synchrone, hydrate _state au boot. Tolère ENOENT + JSON.parse error.
  saveCache()                          // Atomic write (tmp + rename). Best-effort, log warn si fail.
  assignDisplay(mac, displayIndex)     // Set displayIndex sur entry (auto-saveCache + _emitChange)
  unassignDisplay(mac)                 // Set displayIndex = null (auto-saveCache + _emitChange)
}
```

Constantes ajoutées :
- `CACHE_PATH = path.join(process.env.NEOPRO_ROOT || '/home/pi/neopro', '.receivers-cache.json')`
- `CACHE_VERSION = 1`

Sémantique :
- `loadCache()` est appelée AU DÉBUT de `start(io)`, AVANT le premier `_scanLeases()`. Les MACs cachées peuvent ne pas être présentes physiquement (Fire Stick éteint) — leur entry conservée avec `lastSeenAt` du cache (informatif, sera rafraîchi au prochain scan si présent).
- `_scanLeases()` ne supprime PAS une entry avec `displayIndex !== null` quand elle disparaît — au contraire, elle bascule `lastSeenAt` à la dernière valeur connue mais reste assignée (cf. VISION : "Pi off → recovery au reboot").
- Décision : on ne supprime du `_state` (et du cache) que les entries SANS displayIndex assigné quand elles disparaissent du leases ET de l'ARP. Une entry assignée "disparue" reste dans le state avec son `displayIndex` mais peut avoir un flag `online: false` au prochain scan.
- Les events socket `connected-receivers-changed` incluent désormais `displayIndex` dans chaque receiver.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: loadCache() / saveCache() + assignDisplay/unassignDisplay + reboot scenario tests</name>
  <files>raspberry/server/services/receivers.service.js, raspberry/server/__tests__/receivers.service.test.js</files>
  <read_first>
    - raspberry/server/services/receivers.service.js (Plan 01 — ajouter méthodes, ne pas réécrire)
    - raspberry/server/__tests__/receivers.service.test.js (Plan 01 — étendre la suite)
    - raspberry/server/services/hdmi.service.js (pattern fs.readFileSync + try/catch ENOENT, lignes 91-138)
    - raspberry/sync-agent/src/utils/safe-config-io.js (pattern atomic write si présent — sinon faire fs.writeFileSync sur tmp + fs.renameSync)
    - .planning/firestick-poc/VISION.md (lignes 102-108 — edge case "Pi off → recovery au reboot")
  </read_first>
  <behavior>
    - Test 1 : `loadCache()` quand le fichier n'existe pas → `_state` reste vide, pas de throw
    - Test 2 : `loadCache()` quand le fichier contient un JSON corrompu → log warn, `_state` reste vide, pas de throw
    - Test 3 : `loadCache()` quand le fichier contient `{ version: 1, assignments: [{ mac, kind, displayIndex: 1 }] }` → `_state` hydraté avec entry incluant `displayIndex: 1`
    - Test 4 : `loadCache()` ignore les entries d'une `version` inconnue (forward-compat) → log warn, `_state` reste vide
    - Test 5 : `assignDisplay('0c:43:f9:36:04:77', 1)` sur entry existante → entry a `displayIndex: 1`, `saveCache()` est appelé, `_emitChange()` est appelé
    - Test 6 : `assignDisplay()` sur MAC inconnue → crée l'entry avec kind inféré + displayIndex
    - Test 7 : `unassignDisplay('0c:43:f9:36:04:77')` → entry conserve la MAC mais `displayIndex: null`, cache réécrit
    - Test 8 : `saveCache()` écrit atomiquement : `fs.writeFileSync` sur `<path>.tmp` puis `fs.renameSync` vers `<path>` (vérifier l'ordre des appels mock)
    - Test 9 : Reboot scenario — instance A : `assignDisplay(mac, 2)`, lit le contenu écrit. Instance B : nouvelle instance, `loadCache()` → `getReceivers()` contient l'entry avec displayIndex=2 SANS appel `_scanLeases` (pas de fs.statSync sur leases, juste lecture cache).
    - Test 10 : `_scanLeases()` quand une MAC assignée disparaît du leases → l'entry n'est PAS supprimée du _state (displayIndex !== null preserve l'entry). Si MAC NON assignée disparaît → suppression OK.
  </behavior>
  <action>
    Étendre `raspberry/server/services/receivers.service.js` :

    1. **Imports ajoutés** : `path` (pour CACHE_PATH).

    2. **Constantes ajoutées en tête de fichier** :
       ```js
       const CACHE_PATH = path.join(process.env.NEOPRO_ROOT || '/home/pi/neopro', '.receivers-cache.json');
       const CACHE_VERSION = 1;
       ```

    3. **Modifier `start(io)`** : appeler `this.loadCache()` AVANT le scan initial.

    4. **`loadCache()`** (méthode synchrone) :
       - try { content = fs.readFileSync(CACHE_PATH, 'utf8') } catch (e) { if (e.code === 'ENOENT') return ; logger.warn '[Receivers] cache read failed' ; return }
       - try { parsed = JSON.parse(content) } catch { logger.warn '[Receivers] cache JSON corrupt' ; return }
       - if (parsed.version !== CACHE_VERSION) { logger.warn '[Receivers] cache version mismatch' ; return }
       - if (!Array.isArray(parsed.assignments)) return
       - For each entry { mac, kind, displayIndex, lastSeenAt? } : valider mac regex, normaliser lowercase, set dans `this._state` avec `{ kind, displayIndex: displayIndex ?? null, lastSeenAt: lastSeenAt || new Date(0).toISOString() }`
       - Log info `'[Receivers] cache restored'` avec count.

    5. **`saveCache()`** :
       - assignments = Array.from(this._state.entries()).map(([mac, v]) => ({ mac, kind: v.kind, displayIndex: v.displayIndex ?? null, lastSeenAt: v.lastSeenAt }))
       - payload = { version: CACHE_VERSION, savedAt: new Date().toISOString(), assignments }
       - try { fs.writeFileSync(CACHE_PATH + '.tmp', JSON.stringify(payload, null, 2)) ; fs.renameSync(CACHE_PATH + '.tmp', CACHE_PATH) } catch (e) { logger.warn '[Receivers] cache write failed' { error: e.message } }
       - NE PAS chmod 600 — fichier 0644 OK (pas de secret, juste un mapping MAC).

    6. **`assignDisplay(mac, displayIndex)`** :
       - macLower = mac.toLowerCase()
       - existing = this._state.get(macLower)
       - this._state.set(macLower, { kind: existing?.kind || this._inferKind(macLower), lastSeenAt: existing?.lastSeenAt || new Date().toISOString(), displayIndex })
       - this.saveCache()
       - this._emitChange()
       - log info `'[Receivers] assigned'` { mac, displayIndex }

    7. **`unassignDisplay(mac)`** :
       - macLower = mac.toLowerCase()
       - existing = this._state.get(macLower)
       - if (!existing) return
       - this._state.set(macLower, { ...existing, displayIndex: null })
       - this.saveCache()
       - this._emitChange()
       - log info `'[Receivers] unassigned'` { mac }

    8. **Modifier `_scanLeases()` (suppression block)** :
       - Avant : `if (mac in _state but not in currentMacs) → delete`
       - Après : `if (mac in _state but not in currentMacs && _state.get(mac).displayIndex == null) → delete` (preserve les MACs assignées même offline).

    9. **Modifier `getReceivers()`** : inclure `displayIndex` dans l'objet retourné. Tri inchangé (par lastSeenAt desc).

    Étendre `raspberry/server/__tests__/receivers.service.test.js` :
    - Ajouter mock `fs.writeFileSync`, `fs.renameSync`.
    - Tests 1-10 selon `<behavior>`.
    - Test reboot : créer instance A, call assignDisplay, capturer ce que fs.writeFileSync a écrit. Mock fs.readFileSync pour retourner ce contenu sur `.receivers-cache.json`. Créer instance B, call loadCache(), assert `getReceivers()` contient l'entry persistée.

    NE PAS : appeler `loadCache()` deux fois (une seule fois au début de `start()`).
    NE PAS : utiliser `chmod 600` (le cache ne contient pas de secret).
    NE PAS : faire des appels cloud / HTTP dans loadCache (résilience offline).
  </action>
  <verify>
    <automated>cd /home/user/neopro/raspberry/server && npm test -- --testPathPattern='receivers.service' --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "loadCache" raspberry/server/services/receivers.service.js` → exit 0
    - `grep -q "saveCache" raspberry/server/services/receivers.service.js` → exit 0
    - `grep -q "assignDisplay\|unassignDisplay" raspberry/server/services/receivers.service.js` → exit 0
    - `grep -q "\\.receivers-cache\\.json" raspberry/server/services/receivers.service.js` → exit 0
    - `grep -q "renameSync" raspberry/server/services/receivers.service.js` (atomic write) → exit 0
    - `grep -q "CACHE_VERSION" raspberry/server/services/receivers.service.js` → exit 0
    - `grep -cE "test\(|it\(" raspberry/server/__tests__/receivers.service.test.js` ≥ 18 (8 du Plan 01 + 10 nouveaux)
    - `cd raspberry/server && npm test -- --testPathPattern='receivers.service' --forceExit` retourne `Tests:.*passed` (au moins 18 passing)
    - Reboot scenario : test simulant fs.readFileSync sur cache → instance B retrouve mapping sans appel `_scanLeases`
  </acceptance_criteria>
  <done>
    - `loadCache()`, `saveCache()`, `assignDisplay()`, `unassignDisplay()` exposés.
    - Atomic write (tmp + rename) implémenté.
    - Tolérance ENOENT + JSON corrupt + version mismatch (warn, pas de throw).
    - Entries assignées (displayIndex !== null) ne sont PAS supprimées du state quand absentes du leases.
    - Test reboot vert : instance B restore le mapping de instance A sans `_scanLeases`.
  </done>
</task>

</tasks>

<verification>
- `cd raspberry/server && npm test -- --testPathPattern='receivers.service' --forceExit` → tous tests verts (18+)
- Inspection manuelle : `grep -c "test\\|it(" raspberry/server/__tests__/receivers.service.test.js` ≥ 18
</verification>

<success_criteria>
- Reboot du Pi simulé (nouvelle instance ReceiversService) → `loadCache()` restaure displayIndex pour les MACs assignées sans appel `_scanLeases`.
- Cache écrit atomiquement (tmp + rename) → pas de fichier corrompu en cas de crash mid-write.
- Cache absent / corrompu / version inconnue → service repart sain avec state vide.
- MAC assignée temporairement offline → reste dans le state avec son displayIndex (resilience par design).
</success_criteria>

<output>
After completion, create `.planning/phases/05-detect/05-detect-02-SUMMARY.md`
</output>
