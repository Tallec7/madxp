---
phase: 06-captive-fire-stick-page-neopro
plan: 02
type: execute
wave: 2
depends_on: ["06-captive-01"]
files_modified:
  - raspberry/server/routes/captive.js
  - raspberry/server/__tests__/routes/captive.test.js
  - raspberry/server/server.js
autonomous: true
requirements: [CAPTIVE-02, CAPTIVE-03, CAPTIVE-04]
must_haves:
  truths:
    - "GET /api/captive/whoami avec une IP cliente assignée retourne { mac, displayIndex: N, displayName }"
    - "GET /api/captive/whoami avec une IP cliente non assignée retourne { mac, displayIndex: null }"
    - "GET /api/captive/whoami avec une IP cliente inconnue retourne 404 { error: 'mac_not_found' }"
    - "L'endpoint lit l'IP cliente depuis req.headers['x-real-ip'] avant de fallback sur req.socket.remoteAddress (proxy nginx transparent)"
  artifacts:
    - path: "raspberry/server/routes/captive.js"
      provides: "Express router factory createCaptiveRouter({ receiversService, configPath }) → router avec GET /whoami"
      contains: "createCaptiveRouter"
    - path: "raspberry/server/__tests__/routes/captive.test.js"
      provides: "Jest tests via supertest pour les 3 cas (assigné / non assigné / inconnu) + cas X-Real-IP forwarded"
    - path: "raspberry/server/server.js"
      provides: "Wire app.use('/api/captive', createCaptiveRouter({ receiversService, configPath: CONFIG_PATH }))"
      contains: "/api/captive"
  key_links:
    - from: "raspberry/server/routes/captive.js"
      to: "receiversService.resolveMacByIp"
      via: "appel direct sur l'instance injectée par createCaptiveRouter"
      pattern: "resolveMacByIp"
    - from: "raspberry/server/routes/captive.js"
      to: "fs.readFileSync(configPath)"
      via: "lookup display dans displays[].receiver.mac (cohérent ADR Phase 4)"
      pattern: "configuration\\.json|configPath"
    - from: "raspberry/server/server.js"
      to: "createCaptiveRouter"
      via: "app.use('/api/captive', router)"
      pattern: "/api/captive"
---

<objective>
Créer le routeur Express `/api/captive/whoami` qui résout l'IP cliente Fire Stick en MAC (via `receiversService.resolveMacByIp` livré Plan 01) puis lookup le `displayIndex` assigné dans `configuration.json` local. Wirer la route dans `server.js`.

Purpose: Le bootstrap Angular (Plan 04) appelle cet endpoint au premier paint pour décider entre redirect `/?display=N` (assigné) ou `/captive/wait?mac=...` (en attente). Sans cet endpoint, aucune décision automatique possible côté Fire Stick — le bénévole devrait saisir manuellement l'URL.
Output: Routeur Express isolé, testé avec supertest (≥ 4 cas), wiré dans `server.js`.
</objective>

<execution_context>
@/home/user/neopro/.claude/get-shit-done/workflows/execute-plan.md
@/home/user/neopro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-RESEARCH.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-VALIDATION.md
@.planning/phases/06-captive-fire-stick-page-neopro/06-captive-01-receivers-resolve-mac-by-ip-PLAN.md
@raspberry/server/server.js
@raspberry/server/services/receivers.service.js
@raspberry/server/routes/health.js

<interfaces>
<!-- Pattern routes/* existant (lire raspberry/server/routes/health.js et hotspot.js pour le pattern) -->

Routes Express raspberry/server/routes/*.js suivent typiquement:
```javascript
const express = require('express');
function createXxxRouter(deps) {
  const router = express.Router();
  router.get('/foo', (req, res) => { ... });
  return router;
}
module.exports = createXxxRouter;
```

Wirage dans server.js:
```javascript
const createXxxRouter = require('./routes/xxx');
app.use('/api/xxx', createXxxRouter({ ... }));
```

CONFIG_PATH déjà importé dans server.js depuis ./helpers — pointe vers /home/pi/neopro/webapp/configuration.json en prod, surcharge possible via env NEOPRO_CONFIG_PATH.

Format configuration.json (cf. Phase 4 livré):
```json
{
  "siteId": "...",
  "displays": [
    { "index": 0, "name": "Salle principale", "receiver": { "kind": "pi_native", "mac": null } },
    { "index": 1, "name": "Buvette", "receiver": { "kind": "firestick", "mac": "0c:43:f9:36:04:77", "last_seen_at": "..." } }
  ]
}
```

API ReceiversService (Plan 01 livré):
- receiversService.resolveMacByIp(ip: string): string | null
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create /api/captive/whoami route + tests</name>
  <read_first>
    - .planning/phases/06-captive-fire-stick-page-neopro/06-RESEARCH.md sections "MAC ↔ IP resolution pattern recommandé" (snippet code orientation Express) + "Edge cases" (IPv6 link-local, race detection)
    - .planning/phases/06-captive-fire-stick-page-neopro/06-VALIDATION.md (test commandes attendues)
    - raspberry/server/routes/health.js (pattern routeur factory existant à reproduire)
    - raspberry/server/services/receivers.service.js (API resolveMacByIp livrée Plan 01)
    - raspberry/server/server.js (wiring pattern app.use('/api/...'))
  </read_first>
  <files>
    - raspberry/server/routes/captive.js (CREATE)
    - raspberry/server/__tests__/routes/captive.test.js (CREATE)
  </files>
  <action>
    Step 1 — Créer `raspberry/server/routes/captive.js`:

    ```javascript
    const express = require('express');
    const fs = require('fs');

    /**
     * Captive portal endpoints — résolution IP→MAC→displayIndex pour Fire Stick.
     *
     * GET /whoami:
     *   - Lit l'IP cliente (X-Real-IP header forwardé par nginx, sinon req.socket.remoteAddress)
     *   - Resolve MAC via receiversService (Plan 01)
     *   - Lookup displayIndex dans configuration.json local (cache cloud Phase 4 ADR)
     *   - Retourne { mac, displayIndex: number|null, displayName: string|null }
     *   - 404 si MAC introuvable (Fire Stick pas vu par dnsmasq.leases / arp)
     *
     * @param {object} deps
     * @param {ReceiversService} deps.receiversService
     * @param {string} deps.configPath - chemin configuration.json
     */
    function createCaptiveRouter({ receiversService, configPath }) {
      if (!receiversService || typeof receiversService.resolveMacByIp !== 'function') {
        throw new Error('createCaptiveRouter: receiversService with resolveMacByIp required');
      }
      if (!configPath || typeof configPath !== 'string') {
        throw new Error('createCaptiveRouter: configPath required');
      }

      const router = express.Router();

      router.get('/whoami', (req, res) => {
        const clientIp = req.headers['x-real-ip'] || req.socket.remoteAddress || '';
        const mac = receiversService.resolveMacByIp(clientIp);

        if (!mac) {
          return res.status(404).json({ error: 'mac_not_found', ip: clientIp });
        }

        let displays = [];
        try {
          const raw = fs.readFileSync(configPath, 'utf8');
          const config = JSON.parse(raw);
          displays = Array.isArray(config.displays) ? config.displays : [];
        } catch (err) {
          console.warn('[Captive] Failed to read config:', err.message);
          // Fallback résilient: MAC connue mais config illisible → traiter comme non assigné
          return res.json({ mac, displayIndex: null, displayName: null });
        }

        const display = displays.find(
          (d) => d && d.receiver && typeof d.receiver.mac === 'string'
            && d.receiver.mac.toLowerCase() === mac.toLowerCase()
        );

        return res.json({
          mac,
          displayIndex: display ? (typeof display.index === 'number' ? display.index : null) : null,
          displayName: display ? (display.name || null) : null,
        });
      });

      return router;
    }

    module.exports = createCaptiveRouter;
    ```

    Step 2 — Créer `raspberry/server/__tests__/routes/captive.test.js` (utiliser `supertest` déjà installé dans raspberry/server, vérifier package.json sinon ajouter mock-express simple). Tests requis:

    - "GET /whoami returns 404 when MAC not found" → mock receiversService.resolveMacByIp returns null, expect 404 + body.error === 'mac_not_found'
    - "GET /whoami returns displayIndex when MAC assigned" → mock resolveMacByIp returns '0c:43:f9:36:04:77', mock fs.readFileSync returns JSON avec displays[1].receiver.mac = '0c:43:f9:36:04:77', expect 200 + body.displayIndex === 1 + body.displayName === 'Buvette'
    - "GET /whoami returns displayIndex null when MAC not assigned" → mock resolveMacByIp returns 'aa:bb:cc:dd:ee:ff', mock config sans match, expect 200 + body.displayIndex === null
    - "GET /whoami uses X-Real-IP header over socket.remoteAddress" → assert que receiversService.resolveMacByIp est appelé avec la valeur du header X-Real-IP (mock, vérifier l'argument)
    - "GET /whoami returns mac with displayIndex null when configPath unreadable" → mock fs.readFileSync throws ENOENT, mock resolveMacByIp returns mac, expect 200 + body.mac présent + body.displayIndex === null

    Pattern de mock attendu (utiliser `jest.mock('fs')` partiel + injection de receiversService stub):
    ```javascript
    const request = require('supertest');
    const express = require('express');
    const createCaptiveRouter = require('../../routes/captive');

    jest.mock('fs');
    const fs = require('fs');

    function buildApp(receiversService, configPath = '/tmp/test-config.json') {
      const app = express();
      app.use('/api/captive', createCaptiveRouter({ receiversService, configPath }));
      return app;
    }
    // ... tests
    ```

    Lancer `cd raspberry/server && npx jest --testPathPattern='routes/captive' --no-coverage --forceExit` → DOIT passer.

    Commit: `feat(captive): add /api/captive/whoami route with IP→MAC→displayIndex resolution (CAPTIVE-02, CAPTIVE-03)`.

    Vérifier que `supertest` est dans `raspberry/server/package.json` devDependencies. Si absent, l'ajouter avec `npm install --save-dev supertest` (le repo Pi a déjà des deps Jest, supertest devrait être présent — vérifier avant).
  </action>
  <verify>
    <automated>cd raspberry/server && npx jest --testPathPattern='routes/captive' --no-coverage --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - `test -f raspberry/server/routes/captive.js` exit 0
    - `test -f raspberry/server/__tests__/routes/captive.test.js` exit 0
    - `grep -q "createCaptiveRouter" raspberry/server/routes/captive.js` exit 0
    - `grep -q "x-real-ip" raspberry/server/routes/captive.js` exit 0 (case-insensitive lookup attendu, header doit être en lowercase pour Express)
    - `grep -q "module.exports = createCaptiveRouter" raspberry/server/routes/captive.js` exit 0
    - `grep -q "resolveMacByIp" raspberry/server/routes/captive.js` exit 0
    - `cd raspberry/server && npx jest --testPathPattern='routes/captive' --no-coverage --forceExit` exit 0 avec ≥ 4 tests passing
    - Aucun import de `child_process` ou `exec` dans `routes/captive.js` (lookup pur via service)
  </acceptance_criteria>
  <done>
    Route `/api/captive/whoami` opérationnelle, testée pour les 3 cas business (assigné, non assigné, inconnu) + le cas infra critique X-Real-IP forwarded.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire createCaptiveRouter into server.js</name>
  <read_first>
    - raspberry/server/server.js (état complet — 80+ lignes, identifier où sont déjà câblés les autres routers via app.use)
    - raspberry/server/routes/captive.js (livré Task 1)
    - .planning/phases/05-detect/05-detect-03-SUMMARY.md (server.js a été modifié Phase 5 plan 03 — voir où ReceiversService est instancié + start)
  </read_first>
  <files>
    - raspberry/server/server.js (modify — import + app.use)
  </files>
  <action>
    Modifier `raspberry/server/server.js`:

    1) Après les autres `require('./routes/...')` existants (typiquement après health/hotspot/etc.), ajouter:
    ```javascript
    const createCaptiveRouter = require('./routes/captive');
    ```

    2) Après l'instanciation de `receiversService` (déjà présente Phase 5 plan 03) et après les autres `app.use('/api/...', ...)`, ajouter:
    ```javascript
    app.use('/api/captive', createCaptiveRouter({
      receiversService,
      configPath: CONFIG_PATH,
    }));
    ```

    `CONFIG_PATH` est déjà destructuré depuis `./helpers` en haut du fichier (ligne 11) — pas besoin d'import supplémentaire.

    3) Vérifier syntaxe: `node --check raspberry/server/server.js` exit 0.

    4) Lancer la suite Jest complète raspberry/server: `cd raspberry/server && npx jest --no-coverage --forceExit` → tous les tests précédents (state, hdmi, receivers, captive routes…) DOIVENT passer.

    Commit: `feat(captive): wire /api/captive router into raspberry/server (CAPTIVE-02)`.

    NE PAS toucher au wrapper `io.emit` Phase 5 plan 03 — le routeur captive est purement HTTP, indépendant de Socket.IO. NE PAS introduire de nouveau middleware express.json (déjà en place ligne ~50). NE PAS placer `app.use('/api/captive', ...)` après le `server.listen()` final.
  </action>
  <verify>
    <automated>node --check raspberry/server/server.js && cd raspberry/server && npx jest --no-coverage --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "require('./routes/captive')" raspberry/server/server.js` exit 0
    - `grep -q "app.use('/api/captive'" raspberry/server/server.js` exit 0
    - `grep -q "configPath: CONFIG_PATH" raspberry/server/server.js` exit 0
    - `node --check raspberry/server/server.js` exit 0
    - `cd raspberry/server && npx jest --no-coverage --forceExit` exit 0 avec aucune régression (≥ tests pré-existants + 4 nouveaux)
    - L'ordre des middlewares respecte `express.json()` AVANT `app.use('/api/captive', ...)` AVANT `server.listen(...)`
  </acceptance_criteria>
  <done>
    Le serveur Pi expose `/api/captive/whoami` au démarrage. Aucune régression sur les autres routes/services. Boot du serveur reste OK (`node --check` + tests Jest tous verts).
  </done>
</task>

</tasks>

<verification>
- node --check raspberry/server/server.js exit 0
- Tous les tests raspberry/server Jest verts
- Aucun nouveau handler Socket.IO (route purement HTTP)
- Aucune mutation des structures Phase 5 (state.service, ReceiversService API publique inchangée hormis l'ajout resolveMacByIp livré Plan 01)
</verification>

<success_criteria>
- Endpoint testable manuellement (Plan 04 le validera): `curl -H "X-Real-IP: 192.168.4.23" http://localhost:3000/api/captive/whoami` retourne JSON
- Plan 03 (configs nginx + page d'attente + install.sh) peut router `/api/captive/whoami` vers ce serveur
- Plan 04 (Angular bootstrap) peut consommer cet endpoint pour rediriger
</success_criteria>

<output>
After completion, create `.planning/phases/06-captive-fire-stick-page-neopro/06-captive-02-SUMMARY.md`
</output>
</content>
</invoke>