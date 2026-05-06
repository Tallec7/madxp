---
phase: 05-detect
plan: 03
type: execute
wave: 2
depends_on: [05-detect-01]
files_modified:
  - raspberry/server/services/state.service.js
  - raspberry/server/__tests__/state.service.test.js
  - raspberry/server/server.js
  - raspberry/sync-agent/src/config.js
  - raspberry/sync-agent/__tests__/config.test.js
autonomous: true
requirements: [DETECT-01, DETECT-02, DETECT-03]
must_haves:
  truths:
    - "state.service.js getState()/getFullState() expose les receivers détectés (MAC, kind, lastSeenAt, displayIndex)"
    - "Le ReceiversService est instancié dans server.js, démarré avec io, et son état est consommé par state.service.js"
    - "Sync-agent DEFAULT_ALLOWED_COMMANDS contient 'receiver-detected' et 'receiver-disconnected' (whitelist event Pi → cloud, pré-requis Phase 7)"
  artifacts:
    - path: "raspberry/server/services/state.service.js"
      provides: "getReceivers() + setReceivers() + receivers dans getFullState() return"
      contains: "_receivers"
    - path: "raspberry/server/server.js"
      provides: "Instanciation + démarrage ReceiversService, injection dans state.service via setReceivers callback"
      contains: "ReceiversService"
    - path: "raspberry/sync-agent/src/config.js"
      provides: "DEFAULT_ALLOWED_COMMANDS étendu avec 'receiver-detected' et 'receiver-disconnected'"
      contains: "receiver-detected"
  key_links:
    - from: "raspberry/server/server.js"
      to: "ReceiversService"
      via: "new ReceiversService() + .start(io) au boot"
      pattern: "new ReceiversService"
    - from: "ReceiversService.getReceivers()"
      to: "state.service.js getFullState()"
      via: "stateService.setReceivers(receiversService.getReceivers()) à chaque emit"
      pattern: "setReceivers"
    - from: "raspberry/sync-agent/src/config.js DEFAULT_ALLOWED_COMMANDS"
      to: "Phase 7 cloud whitelist"
      via: "'receiver-detected', 'receiver-disconnected' dans l'array"
      pattern: "'receiver-detected'"
---

<objective>
Cross-cutting integration : (1) étendre `state.service.js` avec un champ `_receivers` exposé dans `getFullState()`, (2) instancier le `ReceiversService` dans `server.js` et le brancher avec `state.service` (callback de mise à jour à chaque emit), (3) whitelister les events `receiver-detected` / `receiver-disconnected` dans le sync-agent (`DEFAULT_ALLOWED_COMMANDS`) — pré-requis ADR-074-style pour que Phase 7 puisse pousser ces events Pi→cloud sans rejet.

Purpose : Cross-cutting DETECT-01/02/03. Sans cette intégration le service tourne en silo : pas exposé via getState (donc invisible pour les consommateurs locaux), pas instancié au boot, et les events seraient rejetés par le sync-agent au moment de Phase 7.

Output : `state.service.js` étendu, `server.js` qui instancie le service, sync-agent config étendue, tous tests verts.
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
@.claude/rules/hotspot-psk.md
@raspberry/server/services/state.service.js
@raspberry/server/__tests__/state.service.test.js
@raspberry/server/server.js
@raspberry/sync-agent/src/config.js

<interfaces>
<!-- Pattern ADR-074 (hotspot-psk.md) : ajouter à DEFAULT_ALLOWED_COMMANDS array dans config.js -->
<!-- Pattern state.service : champs `_xxx` privés + getter `getXxx()` + setter pour update + inclusion dans getFullState() -->

API ajoutée à `state.service.js` :
```js
class StateService {
  // Existing: _score, _phase, _options, _timer, _hdmiState, _tvInstances, _loopState, ...
  // NEW:
  _receivers = []  // Array<{ mac, kind, lastSeenAt, displayIndex: number | null }>

  getReceivers()                  // returns [...this._receivers]
  setReceivers(receivers)         // replace + return new copy. Validates that input is an array.
  // getFullState() return now includes `receivers: this.getReceivers()`
}
```

Wiring dans `server.js` :
```js
const ReceiversService = require('./services/receivers.service');
// après stateService instancié :
const receiversService = new ReceiversService();
// io déjà créé via socketIO(server, ...), passer une wrapper qui sync state à chaque emit
const ioWithStateSync = {
  emit: (event, data) => {
    if (event === 'connected-receivers-changed') {
      stateService.setReceivers(data.receivers);
    }
    io.emit(event, data);
  }
};
receiversService.start(ioWithStateSync);
// graceful shutdown
process.on('SIGTERM', () => receiversService.stop());
```

Sync-agent whitelist (DEFAULT_ALLOWED_COMMANDS) :
- Ajouter `'receiver-detected'` et `'receiver-disconnected'` à la fin de l'array dans `raspberry/sync-agent/src/config.js`
- Commenter avec `// v4.0 Phase 5 — Fire Stick auto-discovery (DETECT-02)`
- Aucun handler dans agent.js cette phase (Phase 7 ajoutera le handler côté cloud receveur). C'est juste un pré-requis whitelist pour ne pas bloquer la phase suivante.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: state.service.js — _receivers field + getReceivers/setReceivers + getFullState extension</name>
  <files>raspberry/server/services/state.service.js, raspberry/server/__tests__/state.service.test.js</files>
  <read_first>
    - raspberry/server/services/state.service.js (lignes 1-82 — voir tous les `_xxx` champs initialisés au constructor, et getFullState ligne 358-368)
    - raspberry/server/__tests__/state.service.test.js (pattern existant — instanciation directe + assertions)
  </read_first>
  <behavior>
    - Test 1 : Une instance neuve a `getReceivers()` qui retourne `[]`
    - Test 2 : `setReceivers([{ mac: '0c:43:f9:36:04:77', kind: 'firestick', lastSeenAt: '2026-05-06T10:00:00Z', displayIndex: 1 }])` → `getReceivers()` retourne ce tableau
    - Test 3 : `setReceivers()` retourne une copie défensive (mutation externe ne change pas l'état interne)
    - Test 4 : `setReceivers(notAnArray)` → throw ou retourne sans changer l'état (choix : log warn + ignore, pas de throw — résilience)
    - Test 5 : `getFullState()` retourne un objet incluant la clé `receivers` avec le tableau courant
  </behavior>
  <action>
    Modifier `raspberry/server/services/state.service.js` :

    1. Dans le constructor, après `this._loopState = {...}` (ligne 82), ajouter :
       ```js
       // v4.0 Phase 5 — Fire Stick receivers auto-discovery (DETECT-01/02)
       // Updated by ReceiversService via stateService.setReceivers() on each emit
       this._receivers = [];
       ```

    2. Ajouter une section `// --- Receivers (v4.0 Phase 5) ---` avant `// --- TV Registration` (ligne 269) avec :
       ```js
       getReceivers() {
         return this._receivers.map(r => ({ ...r }));
       }

       setReceivers(receivers) {
         if (!Array.isArray(receivers)) {
           console.warn('[StateService] setReceivers ignored: input not an array');
           return this.getReceivers();
         }
         this._receivers = receivers.map(r => ({ ...r }));
         return this.getReceivers();
       }
       ```

    3. Modifier `getFullState()` (ligne 358-368) — ajouter `receivers: this.getReceivers(),` avant le `}` de fin.

    Étendre `raspberry/server/__tests__/state.service.test.js` avec un nouveau `describe('Receivers (v4.0 Phase 5)', ...)` couvrant les 5 tests behavior.

    NE PAS : muter `this._receivers` directement depuis getReceivers (toujours map+spread pour copie défensive).
    NE PAS : utiliser un Map au lieu d'un Array (le ReceiversService gère son propre Map ; state.service stocke un snapshot en array, ce qui est consommé par les clients).
  </action>
  <verify>
    <automated>cd /home/user/neopro/raspberry/server && npm test -- --testPathPattern='state.service' --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "_receivers" raspberry/server/services/state.service.js` → exit 0
    - `grep -q "getReceivers\|setReceivers" raspberry/server/services/state.service.js` → exit 0
    - `grep -q "receivers: this.getReceivers" raspberry/server/services/state.service.js` → exit 0
    - `grep -cE "test\(|it\(" raspberry/server/__tests__/state.service.test.js` augmenté de 5 minimum vs version actuelle
    - `cd raspberry/server && npm test -- --testPathPattern='state.service' --forceExit` GREEN
  </acceptance_criteria>
  <done>
    - `_receivers` initialisé à `[]` dans le constructor.
    - `getReceivers()` retourne copie défensive.
    - `setReceivers()` valide input array (sinon warn + ignore).
    - `getFullState()` inclut `receivers`.
    - Tests state.service GREEN avec 5 nouveaux tests.
  </done>
</task>

<task type="auto">
  <name>Task 2: server.js — instancier ReceiversService, brancher state.service via io wrapper, graceful stop</name>
  <files>raspberry/server/server.js</files>
  <read_first>
    - raspberry/server/server.js (lignes 1-150 — voir comment HdmiService est instancié ligne 41, comment registerSocketHandlers ligne 142 reçoit `io` + `stateService`)
    - raspberry/server/services/receivers.service.js (Plan 01 — API start(io)/stop()/getReceivers())
    - raspberry/server/services/state.service.js (Task 1 — setReceivers signature)
  </read_first>
  <action>
    Modifier `raspberry/server/server.js` :

    1. **Import** (après l'import de `HdmiService`, ligne 23) :
       ```js
       const ReceiversService = require('./services/receivers.service');
       ```

    2. **Instanciation** (après `const hdmiService = new HdmiService()` ligne 41) :
       ```js
       const receiversService = new ReceiversService();
       ```

    3. **Démarrage avec io wrapper** (après `registerSocketHandlers({ io, stateService, configPath: CONFIG_PATH, hdmiService })` ligne 142, AVANT le `server.listen` final) :
       ```js
       // v4.0 Phase 5 — Fire Stick receivers auto-discovery (DETECT-01/02/03)
       // Wrapper around io.emit so each connected-receivers-changed updates stateService snapshot.
       const ioForReceivers = {
         emit: (event, data) => {
           if (event === 'connected-receivers-changed' && data && Array.isArray(data.receivers)) {
             stateService.setReceivers(data.receivers);
           }
           io.emit(event, data);
         },
       };
       receiversService.start(ioForReceivers);
       ```

    4. **Graceful shutdown** : si un handler `SIGTERM` / `SIGINT` existe déjà (chercher `process.on('SIGTERM'`), ajouter `receiversService.stop()` dedans. Sinon créer :
       ```js
       process.on('SIGTERM', () => { try { receiversService.stop(); } catch (_e) {} });
       process.on('SIGINT', () => { try { receiversService.stop(); } catch (_e) {} });
       ```

    5. **Pas de route HTTP cette phase** (Phase 7 ajoutera la route cloud `/api/sites/:id/connected-receivers`).

    NE PAS : passer le `io` brut directement à receiversService.start() — utiliser le wrapper pour que state.service reste à jour.
    NE PAS : exposer `receiversService` globalement (rester encapsulé dans server.js scope).
    NE PAS : appeler `loadCache()` manuellement (start() le fait déjà — Plan 02).
  </action>
  <verify>
    <automated>cd /home/user/neopro/raspberry/server && node -e "const m = require('./services/receivers.service'); const s = new m(); console.log(typeof s.start);" && cd /home/user/neopro/raspberry/server && node --check server.js</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "require.*receivers.service" raspberry/server/server.js` → exit 0
    - `grep -q "new ReceiversService" raspberry/server/server.js` → exit 0
    - `grep -q "receiversService.start" raspberry/server/server.js` → exit 0
    - `grep -q "stateService.setReceivers" raspberry/server/server.js` → exit 0
    - `grep -q "receiversService.stop" raspberry/server/server.js` → exit 0
    - `node --check raspberry/server/server.js` exit 0 (syntaxe valide)
  </acceptance_criteria>
  <done>
    - server.js importe et instancie ReceiversService au boot.
    - Wrapper io transforme chaque emit `connected-receivers-changed` en setReceivers sur state.service.
    - SIGTERM / SIGINT appellent receiversService.stop() sans throw.
    - Syntaxe Node valide.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: sync-agent — whitelist 'receiver-detected' / 'receiver-disconnected' dans DEFAULT_ALLOWED_COMMANDS</name>
  <files>raspberry/sync-agent/src/config.js, raspberry/sync-agent/__tests__/config.test.js</files>
  <read_first>
    - raspberry/sync-agent/src/config.js (lignes 16-51 — voir DEFAULT_ALLOWED_COMMANDS array, pattern d'ajout ADR-074 ligne 49-51)
    - .claude/rules/hotspot-psk.md (pattern : ne pas oublier l'event whitelist)
  </read_first>
  <behavior>
    - Test 1 : `DEFAULT_ALLOWED_COMMANDS` contient `'receiver-detected'`
    - Test 2 : `DEFAULT_ALLOWED_COMMANDS` contient `'receiver-disconnected'`
    - Test 3 : `buildAllowedCommands()` (sans `process.env.ALLOWED_COMMANDS` set) retourne un array contenant les deux events
    - Test 4 : Si `process.env.ALLOWED_COMMANDS` est défini sans les deux events, `buildAllowedCommands()` les rajoute automatiquement (logique `missingCommands` existante)
  </behavior>
  <action>
    Modifier `raspberry/sync-agent/src/config.js` :

    Dans `DEFAULT_ALLOWED_COMMANDS` (lignes 16-51), AVANT le `]` de fermeture (après `'rotate_psk',`), ajouter :
    ```js
      // v4.0 Phase 5 — Fire Stick receivers auto-discovery (DETECT-02)
      // Pré-requis Phase 7 : ces events Pi → cloud doivent être whitelistés pour ne pas être rejetés.
      // Aucun handler dans agent.js cette phase — la phase 7 ajoutera le handler cloud.
      'receiver-detected',
      'receiver-disconnected',
    ```

    Créer ou étendre `raspberry/sync-agent/__tests__/config.test.js` :
    - Si le fichier n'existe pas, le créer avec :
      ```js
      describe('config — DEFAULT_ALLOWED_COMMANDS', () => {
        beforeEach(() => { jest.resetModules(); delete process.env.ALLOWED_COMMANDS; delete process.env.SITE_ID; delete process.env.SITE_API_KEY; });
        // ... tests
      });
      ```
    - Si le fichier existe déjà, ajouter un nouveau `describe('v4.0 Phase 5 — receiver events whitelist', ...)` block.

    Tests :
    1. `require('../src/config').config.security.allowedCommands` contient `'receiver-detected'` et `'receiver-disconnected'`
    2. Avec `process.env.ALLOWED_COMMANDS = 'reboot,deploy_video'` (incomplet), après `require('../src/config')` (avec resetModules), `config.security.allowedCommands` doit quand même contenir les deux receivers events (logique `missingCommands` reinjecte les défauts).

    Vérifier l'existence d'un répertoire de tests pour le sync-agent :
    ```bash
    ls raspberry/sync-agent/__tests__/ 2>/dev/null || mkdir -p raspberry/sync-agent/__tests__
    ```

    Si le sync-agent n'a pas de Jest configuré (pas de `package.json` test script ou pas de `jest` dans devDeps), créer le test mais documenter dans le SUMMARY que la vérification se fait via grep + `node -e`. Acceptance criteria principal = grep enforcement (smoke-style).

    NE PAS : ajouter de handler `socket.on('receiver-detected', ...)` dans agent.js cette phase (Phase 7).
    NE PAS : retirer les events existants de DEFAULT_ALLOWED_COMMANDS.
  </action>
  <verify>
    <automated>grep -q "'receiver-detected'" /home/user/neopro/raspberry/sync-agent/src/config.js && grep -q "'receiver-disconnected'" /home/user/neopro/raspberry/sync-agent/src/config.js && cd /home/user/neopro/raspberry/sync-agent && (npm test -- --testPathPattern='config' --forceExit 2>/dev/null || node -e "const c = require('./src/config').config; if (!c.security.allowedCommands.includes('receiver-detected')) { process.exit(1); } if (!c.security.allowedCommands.includes('receiver-disconnected')) { process.exit(1); } console.log('OK');")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "'receiver-detected'" raspberry/sync-agent/src/config.js` → exit 0
    - `grep -q "'receiver-disconnected'" raspberry/sync-agent/src/config.js` → exit 0
    - `node -e "const c = require('./raspberry/sync-agent/src/config').config; process.exit(c.security.allowedCommands.includes('receiver-detected') && c.security.allowedCommands.includes('receiver-disconnected') ? 0 : 1)"` → exit 0
    - Aucune référence ajoutée à `socket.on('receiver-detected'` ou `socket.on('receiver-disconnected'` dans `raspberry/sync-agent/src/agent.js` (cette phase ne traite pas les events, juste whitelist)
  </acceptance_criteria>
  <done>
    - `DEFAULT_ALLOWED_COMMANDS` contient les deux events.
    - `buildAllowedCommands()` les ré-injecte quand `process.env.ALLOWED_COMMANDS` est partiel (logique `missingCommands` existante).
    - Test ou node assertion confirme la présence des events dans la config résolue.
    - Aucun handler ajouté côté agent.js (Phase 7).
  </done>
</task>

</tasks>

<verification>
- `cd raspberry/server && npm test -- --testPathPattern='state.service' --forceExit` GREEN
- `node --check raspberry/server/server.js` exit 0
- `node -e "const c = require('./raspberry/sync-agent/src/config').config; process.exit(c.security.allowedCommands.includes('receiver-detected') && c.security.allowedCommands.includes('receiver-disconnected') ? 0 : 1)"` exit 0
- `grep -c "receiver" raspberry/server/services/state.service.js raspberry/server/server.js raspberry/sync-agent/src/config.js` ≥ 5
</verification>

<success_criteria>
- state.service expose `getReceivers()` / `setReceivers()`, `getFullState()` inclut `receivers`.
- server.js instancie `ReceiversService`, le démarre avec un wrapper io qui sync state.service à chaque emit `connected-receivers-changed`.
- sync-agent `DEFAULT_ALLOWED_COMMANDS` contient les deux events Fire Stick (pré-requis Phase 7).
- `node --check` valide la syntaxe de tous les fichiers modifiés.
- Aucune régression sur les tests existants (`state.service.test.js` toujours GREEN).
</success_criteria>

<output>
After completion, create `.planning/phases/05-detect/05-detect-03-SUMMARY.md`
</output>
