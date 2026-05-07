---
phase: 07-cloud-api-sync-agent
plan: 03
type: execute
wave: 2
depends_on:
  - 07-cloud-02
files_modified:
  - raspberry/sync-agent/src/command-dispatch.js
  - raspberry/sync-agent/src/__tests__/command-dispatch-receiver-assignment.test.js
autonomous: true
requirements:
  - CLOUD-04
must_haves:
  truths:
    - 'Quand le sync-agent Pi reçoit une commande `receiver_assignment_updated` avec payload `{ displays }`, pour chaque display ayant un `receiver.mac` et un `index`, `receiversService.assignDisplay(mac, displayIndex)` est appelé'
    - "L'appel est idempotent : recevoir 2× la même commande ne casse pas le cache local (assignDisplay existant gère déjà l'idempotence Phase 5)"
    - 'Une commande mal formée (displays manquant, payload null) loggue un warn et ne crash pas le sync-agent'
  artifacts:
    - path: raspberry/sync-agent/src/command-dispatch.js
      provides: 'Case `receiver_assignment_updated` dans le switch/dispatch — appelle receiversService.assignDisplay pour chaque display assigné'
    - path: raspberry/sync-agent/src/__tests__/command-dispatch-receiver-assignment.test.js
      provides: 'Test Jest : payload avec 2 displays assignés → assignDisplay appelé 2× ; payload vide → 0 appel ; payload corrompu → warn + no throw'
  key_links:
    - from: raspberry/sync-agent/src/command-dispatch.js
      to: raspberry/server/services/receivers.service.js
      via: 'receiversService.assignDisplay(mac, displayIndex) pour chaque display'
      pattern: 'assignDisplay'
    - from: raspberry/sync-agent/src/command-dispatch.js
      to: raspberry/sync-agent/src/config.js
      via: 'DEFAULT_ALLOWED_COMMANDS gate'
      pattern: 'receiver_assignment_updated'
---

<objective>
Câbler côté Pi le handler de la commande `receiver_assignment_updated` reçue depuis le cloud (Plan 02). Le handler parcourt le tableau `displays` du payload et appelle `receiversService.assignDisplay(mac, displayIndex)` pour chaque display porteur d'un receiver assigné. La méthode `assignDisplay` existe déjà depuis Phase 5 et persiste le cache local automatiquement.

Purpose: CLOUD-04 — quand un admin assigne une MAC depuis le dashboard, le Pi met à jour son cache local sans reboot.
Output: Handler `receiver_assignment_updated` dans `command-dispatch.js` + test Jest.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/07-cloud-api-sync-agent/07-CONTEXT.md

@raspberry/sync-agent/src/command-dispatch.js
@raspberry/sync-agent/src/config.js
@raspberry/server/services/receivers.service.js

<interfaces>
Payload reçu (envoyé par Plan 02 cloud) :
```js
{
  command: 'receiver_assignment_updated',
  payload: {
    displays: [
      { index: 0, kind: 'pi_native' /* ... */ },
      { index: 1, kind: 'firestick', receiver: { kind: 'firestick', mac: 'aa:bb:cc:dd:ee:ff', last_seen_at: 1234567890 } },
      { index: 2 /* sans receiver = display non assigné */ },
    ],
  },
}
```

API existant (Phase 5) :

```js
// raspberry/server/services/receivers.service.js:222
receiversService.assignDisplay(mac: string, displayIndex: number): void
// Idempotent, persist .receivers-cache.json automatiquement, émet socket event.
```

Pattern de dispatch existant — voir un case déjà câblé dans `command-dispatch.js` (ex: `update_config`, `rotate_psk`) pour copier la signature handler async + try/catch + log Winston/console.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Handler receiver_assignment_updated dans command-dispatch.js</name>
  <files>raspberry/sync-agent/src/command-dispatch.js</files>
  <read_first>
    - raspberry/sync-agent/src/command-dispatch.js (lire tout le fichier — identifier le pattern switch/dispatch et un case existant comme `update_config` ou `rotate_psk` à imiter)
    - raspberry/server/services/receivers.service.js (vérifier l'export du service et la signature exacte de `assignDisplay` à ligne 222 — paramètres et valeur de retour)
    - raspberry/sync-agent/src/config.js (confirmer que `receiver_assignment_updated` est dans DEFAULT_ALLOWED_COMMANDS depuis Plan 02)
  </read_first>
  <action>
    Dans `raspberry/sync-agent/src/command-dispatch.js` :

    1. Importer `receiversService` en haut du fichier si pas déjà présent. Le path exact dépend de la structure ; le pattern attendu :
       ```js
       const receiversService = require('../../server/services/receivers.service');
       ```
       Adapter le path relatif en fonction de la structure réelle découverte dans `read_first` (sync-agent et server sont des packages séparés sous raspberry/).

    2. Dans le switch/if-chain qui dispatche par `command`, ajouter le nouveau case :
       ```js
       case 'receiver_assignment_updated': {
         try {
           const displays = (payload && Array.isArray(payload.displays)) ? payload.displays : null;
           if (!displays) {
             console.warn('[command-dispatch] receiver_assignment_updated: payload.displays missing or invalid', { payload });
             return;
           }
           for (const d of displays) {
             const mac = d && d.receiver && typeof d.receiver.mac === 'string' ? d.receiver.mac : null;
             const idx = (d && typeof d.index === 'number') ? d.index : null;
             if (mac && idx !== null) {
               receiversService.assignDisplay(mac, idx);
             }
           }
           console.info('[command-dispatch] receiver_assignment_updated processed', { count: displays.length });
         } catch (err) {
           console.warn('[command-dispatch] receiver_assignment_updated failed', { err: err && err.message });
         }
         break;
       }
       ```
       Adapter EXACTEMENT à la convention de logging existante du fichier (Winston vs console — la mémoire MEMORY.md indique que sync-agent / raspberry/server n'expose pas Winston, donc console.info/warn cohérent avec hdmi.service.js et receivers.service.js Phase 5).

    3. Si le dispatcher est structuré en `if (command === 'X')` plutôt qu'un switch, suivre le même pattern.

    4. Ne PAS introduire d'appel HTTP, ne PAS appeler le cloud — toute la logique est locale (assignDisplay gère le cache + le socket event vers state.service).

  </action>
  <verify>
    <automated>node -e "const src = require('fs').readFileSync('raspberry/sync-agent/src/command-dispatch.js','utf8'); if (!src.includes('receiver_assignment_updated')) { process.exit(1); } if (!src.includes('assignDisplay')) { process.exit(1); } console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "receiver_assignment_updated" raspberry/sync-agent/src/command-dispatch.js` retourne au moins 1 ligne
    - `grep -n "receiversService.assignDisplay\|assignDisplay" raspberry/sync-agent/src/command-dispatch.js` retourne au moins 1 ligne
    - `grep -n "Array.isArray(payload.displays)\|payload && Array.isArray" raspberry/sync-agent/src/command-dispatch.js` confirme le guard payload
    - `grep -n "console.warn.*receiver_assignment_updated" raspberry/sync-agent/src/command-dispatch.js` confirme le log fallback
    - `node --check raspberry/sync-agent/src/command-dispatch.js` passe (syntax OK)
  </acceptance_criteria>
  <done>Le handler câble la commande cloud → receiversService.assignDisplay locale, avec guards défensifs et logs.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Test Jest — handler dispatche correctement</name>
  <files>raspberry/sync-agent/src/__tests__/command-dispatch-receiver-assignment.test.js</files>
  <read_first>
    - raspberry/sync-agent/src/__tests__ (lister les tests existants — pattern de mock + Jest config sync-agent)
    - raspberry/sync-agent/package.json (vérifier `jest` config + path aux tests)
    - raspberry/sync-agent/src/command-dispatch.js (relire pour confirmer l'export — fonction nommée `dispatchCommand` ou similaire)
  </read_first>
  <behavior>
    - Test 1: payload avec 2 displays assignés (index+receiver.mac) + 1 sans receiver → assignDisplay mock appelé exactement 2× avec les bons args
    - Test 2: payload null ou displays manquant → assignDisplay non appelé + console.warn appelé une fois
    - Test 3: assignDisplay throw → le handler ne propage pas l'erreur (try/catch interne)
  </behavior>
  <action>
    Créer `raspberry/sync-agent/src/__tests__/command-dispatch-receiver-assignment.test.js`.

    Pattern (à adapter au mock style local) :
    ```js
    jest.mock('../../../server/services/receivers.service', () => ({
      assignDisplay: jest.fn(),
    }));

    const receiversService = require('../../../server/services/receivers.service');
    const { dispatchCommand } = require('../command-dispatch'); // adapter export name

    describe('command-dispatch — receiver_assignment_updated', () => {
      let warnSpy;
      let infoSpy;

      beforeEach(() => {
        receiversService.assignDisplay.mockReset();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      });

      afterEach(() => {
        warnSpy.mockRestore();
        infoSpy.mockRestore();
      });

      it('calls assignDisplay for each assigned display', async () => {
        const payload = {
          displays: [
            { index: 0, kind: 'pi_native' },
            { index: 1, receiver: { kind: 'firestick', mac: 'aa:bb:cc:dd:ee:01' } },
            { index: 2, receiver: { kind: 'firestick', mac: 'aa:bb:cc:dd:ee:02' } },
          ],
        };
        await dispatchCommand({ command: 'receiver_assignment_updated', payload });
        expect(receiversService.assignDisplay).toHaveBeenCalledTimes(2);
        expect(receiversService.assignDisplay).toHaveBeenCalledWith('aa:bb:cc:dd:ee:01', 1);
        expect(receiversService.assignDisplay).toHaveBeenCalledWith('aa:bb:cc:dd:ee:02', 2);
      });

      it('warns and does not call assignDisplay when payload.displays missing', async () => {
        await dispatchCommand({ command: 'receiver_assignment_updated', payload: null });
        expect(receiversService.assignDisplay).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
      });

      it('does not throw when assignDisplay throws', async () => {
        receiversService.assignDisplay.mockImplementationOnce(() => { throw new Error('cache write fail'); });
        await expect(dispatchCommand({
          command: 'receiver_assignment_updated',
          payload: { displays: [{ index: 1, receiver: { mac: 'aa:bb:cc:dd:ee:03' } }] },
        })).resolves.not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
      });
    });
    ```
    Adapter exactement les paths relatifs (`../../../server/services/receivers.service`) selon l'arborescence réelle découverte. Adapter le nom de la fonction exportée (`dispatchCommand`, `handle`, etc.) selon `command-dispatch.js`.

    Si la structure du fichier ne permet pas d'unit-tester directement (exemple : dispatcher inline non exporté), exposer une fonction helper `handleReceiverAssignmentUpdated(payload)` extraite et exportée, et tester celle-ci.

  </action>
  <verify>
    <automated>cd raspberry/sync-agent && npx jest --testPathPattern='command-dispatch-receiver-assignment' --no-coverage --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - Le fichier test contient 3 `it(...)`
    - `cd raspberry/sync-agent && npx jest --testPathPattern='command-dispatch-receiver-assignment' --no-coverage --forceExit` passe avec 3/3 verts
    - `grep -n "toHaveBeenCalledTimes(2)" raspberry/sync-agent/src/__tests__/command-dispatch-receiver-assignment.test.js` confirme le test multi-displays
    - `grep -n "not.toThrow\|resolves.not.toThrow" raspberry/sync-agent/src/__tests__/command-dispatch-receiver-assignment.test.js` confirme le test résilience
  </acceptance_criteria>
  <done>3 tests Jest verts couvrant le happy path, le payload corrompu, et la résilience exception.</done>
</task>

</tasks>

<verification>
- `node --check raspberry/sync-agent/src/command-dispatch.js` : OK
- `cd raspberry/sync-agent && npx jest --testPathPattern='command-dispatch-receiver-assignment'` : 3/3 verts
- `grep -n "receiver_assignment_updated" raspberry/sync-agent/src/config.js raspberry/sync-agent/src/command-dispatch.js` : présent dans les 2 fichiers (whitelist + handler)
- Pas d'introduction d'appel HTTP cloud côté Pi (handler purement local)
</verification>

<success_criteria>

- CLOUD-04 ✅ : quand l'admin assigne une MAC côté cloud (PATCH displays Plan 02), le Pi reçoit la commande et met à jour son cache local via assignDisplay sans reboot
- Handler défensif : payload corrompu → warn + no-op, pas de crash sync-agent
- Idempotent : 2 commandes identiques ne cassent rien (garanti par assignDisplay Phase 5)
  </success_criteria>

<output>
After completion, create `.planning/phases/07-cloud-api-sync-agent/07-cloud-03-SUMMARY.md`.
</output>
