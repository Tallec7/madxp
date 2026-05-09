---
phase: 07-cloud-api-sync-agent
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/src/controllers/sites.controller.ts
  - raspberry/sync-agent/src/config.js
  - central-server/src/__tests__/sites-displays-emit-command.test.ts
autonomous: true
requirements:
  - CLOUD-02
  - CLOUD-03
must_haves:
  truths:
    - "Après PATCH /api/sites/:id/displays avec un payload contenant `receiver`, la persistance se fait (DB) ET commandQueueService.sendOrQueue(siteId, 'receiver_assignment_updated', { displays }) est appelé"
    - 'Le sync-agent Pi accepte le command name `receiver_assignment_updated` (présent dans DEFAULT_ALLOWED_COMMANDS)'
    - "Aucune régression sur le PATCH actuel : payloads sans `receiver` continuent de fonctionner sans déclencher d'effet de bord supplémentaire (la commande est émise dans tous les cas, c'est volontaire — cohérent avec le pattern update_config)"
  artifacts:
    - path: central-server/src/controllers/sites.controller.ts
      provides: "updateSiteDisplays étendu : après save, appelle commandQueueService.sendOrQueue(siteId, 'receiver_assignment_updated', { displays })"
    - path: raspberry/sync-agent/src/config.js
      provides: "DEFAULT_ALLOWED_COMMANDS inclut 'receiver_assignment_updated'"
    - path: central-server/src/__tests__/sites-displays-emit-command.test.ts
      provides: "Test Jest : PATCH /:id/displays avec receiver → commandQueueService.sendOrQueue spy appelé avec ('receiver_assignment_updated', { displays })"
  key_links:
    - from: central-server/src/controllers/sites.controller.ts
      to: central-server/src/services/command-queue.service.ts
      via: "commandQueueService.sendOrQueue(siteId, 'receiver_assignment_updated', { displays })"
      pattern: 'receiver_assignment_updated'
    - from: raspberry/sync-agent/src/config.js
      to: 'command-dispatch.js (Plan 03)'
      via: 'DEFAULT_ALLOWED_COMMANDS array'
      pattern: 'receiver_assignment_updated'
---

<objective>
Étendre le controller `updateSiteDisplays` (PATCH `/api/sites/:id/displays` existant) pour émettre `receiver_assignment_updated` au Pi via `commandQueueService.sendOrQueue` après persistance. Ajouter ce command name à la whitelist sync-agent.

Purpose: CLOUD-02 (PATCH persiste + propage) + CLOUD-03 (sync-agent whitelist le nouvel event command).
Output: Controller étendu + whitelist sync-agent + test Jest avec spy sur commandQueueService.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/07-cloud-api-sync-agent/07-CONTEXT.md

@central-server/src/controllers/sites.controller.ts
@central-server/src/services/command-queue.service.ts
@raspberry/sync-agent/src/config.js
@central-server/src/middleware/validation.ts

<interfaces>
Pattern existant `commandQueueService.sendOrQueue` :
```ts
sendOrQueue(siteId: string, commandName: string, payload: object): Promise<void> | void
```
Précédents usages dans le code (cf. CONTEXT.md Zone C) : `rotate_psk`, `update_config`, `update_hotspot`. Le payload pour `receiver_assignment_updated` sera `{ displays }` — le tableau complet des displays après save (cohérent avec `update_config`).

Joi schema `updateDisplays` (validation.ts:139-155) accepte déjà `receiver` — RIEN À CHANGER côté validation.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: updateSiteDisplays — emit receiver_assignment_updated après save</name>
  <files>central-server/src/controllers/sites.controller.ts</files>
  <read_first>
    - central-server/src/controllers/sites.controller.ts (fonction `updateSiteDisplays` ~ligne 450 — lire la fonction entière pour identifier le point exact APRÈS la persistance et AVANT le `res.json(...)`)
    - central-server/src/services/command-queue.service.ts (vérifier l'export et la signature exacte de `sendOrQueue` — récupérer l'instance ou la fonction exportée)
  </read_first>
  <action>
    Dans `central-server/src/controllers/sites.controller.ts`, fonction `updateSiteDisplays` :

    1. Importer `commandQueueService` en haut du fichier si pas déjà fait :
       ```ts
       import { commandQueueService } from '../services/command-queue.service';
       ```
       (Adapter le path/nom exact selon l'export réel découvert dans `read_first`.)

    2. Après la persistance (ligne où la DB est écrite, généralement via `siteRepository.updateDisplays(...)` ou similaire), AVANT le `res.json(...)` final, ajouter :
       ```ts
       try {
         await commandQueueService.sendOrQueue(siteId, 'receiver_assignment_updated', { displays });
         logger.info('receiver_assignment_updated queued', { siteId, count: Array.isArray(displays) ? displays.length : 0 });
       } catch (cmdErr) {
         // Ne pas bloquer la réponse HTTP si l'émission échoue : la DB est déjà à jour, le Pi rattrapera au prochain reconnect.
         logger.warn('Failed to queue receiver_assignment_updated', { siteId, err: cmdErr });
       }
       ```
       Utiliser le `siteId` et `displays` déjà résolus dans la fonction (variables locales existantes — ne PAS les re-récupérer depuis req.params/req.body).

    3. NE PAS conditionner l'émission à la présence d'un `receiver` dans le payload — le Pi reçoit toujours le tableau complet des displays après PATCH (cohérent avec `update_config`). Le Pi décidera lui-même quoi faire dans Plan 03.

    Ne PAS importer `../config/database`. Ne PAS faire de query() direct.

  </action>
  <verify>
    <automated>cd central-server && npx tsc --noEmit 2>&1 | grep -E "sites\.controller\.ts" || echo "TS OK"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "receiver_assignment_updated" central-server/src/controllers/sites.controller.ts` montre exactement 1 occurrence (l'appel sendOrQueue)
    - `grep -n "commandQueueService.sendOrQueue" central-server/src/controllers/sites.controller.ts` confirme l'appel
    - `grep -n "Failed to queue receiver_assignment_updated" central-server/src/controllers/sites.controller.ts` confirme le warn de fallback
    - L'appel est bien APRÈS la persistance (ordre lexical : `siteRepository.updateDisplays` ou équivalent vient avant `commandQueueService.sendOrQueue` dans le source)
    - `cd central-server && npx tsc --noEmit` ne reporte aucune erreur
  </acceptance_criteria>
  <done>updateSiteDisplays persiste ET émet receiver_assignment_updated avec le tableau complet des displays.</done>
</task>

<task type="auto">
  <name>Task 2: Sync-agent whitelist — DEFAULT_ALLOWED_COMMANDS</name>
  <files>raspberry/sync-agent/src/config.js</files>
  <read_first>
    - raspberry/sync-agent/src/config.js (lire tout le fichier — la liste DEFAULT_ALLOWED_COMMANDS est à ~ligne 16, voir le format exact array literal et les commandes déjà whitelistées comme `rotate_psk`, `update_config`, `update_hotspot`)
  </read_first>
  <action>
    Dans `raspberry/sync-agent/src/config.js`, dans le tableau `DEFAULT_ALLOWED_COMMANDS` :

    1. Ajouter la chaîne `'receiver_assignment_updated'` dans la liste, en respectant le formatage des entrées existantes (indentation, trailing comma, ordre alphabétique si l'ordre actuel est alphabétique — sinon à la fin avant le `]`).

    2. Si un commentaire de groupe existe (par ex. `// PROP-002 / v4.0`), placer le nouvel item à proximité des commandes liées au même domaine (`update_config`, `update_hotspot`).

    Aucune autre modification du fichier — pas de refactor, pas de nouvelles exports.

    Note: `receiver-detected` et `receiver-disconnected` (events Phase 5) sont déjà whitelistés à la ligne 54 du même fichier — ne PAS les retoucher.

  </action>
  <verify>
    <automated>grep -E "['\"]receiver_assignment_updated['\"]" raspberry/sync-agent/src/config.js</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "receiver_assignment_updated" raspberry/sync-agent/src/config.js` retourne au moins 1 ligne
    - La string est dans le tableau `DEFAULT_ALLOWED_COMMANDS` (vérifier visuellement l'imbrication entre `[` et `]`)
    - `grep -n "receiver-detected" raspberry/sync-agent/src/config.js` retourne toujours sa ligne d'origine (régression check Phase 5)
    - `node -e "const c = require('./raspberry/sync-agent/src/config.js'); console.log(c.DEFAULT_ALLOWED_COMMANDS.includes('receiver_assignment_updated'))"` affiche `true`
  </acceptance_criteria>
  <done>Le sync-agent accepte la commande receiver_assignment_updated quand le cloud la pousse.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Test Jest — PATCH displays appelle sendOrQueue</name>
  <files>central-server/src/__tests__/sites-displays-emit-command.test.ts</files>
  <read_first>
    - central-server/src/__tests__ (identifier un test existant qui PATCH /api/sites/:id/displays — copier le setup d'app + auth + repository mock)
    - central-server/src/services/command-queue.service.ts (pour savoir comment mocker / spy sur sendOrQueue)
  </read_first>
  <behavior>
    - Test 1: PATCH /api/sites/:id/displays avec un payload valide incluant un `receiver` → status 200 + commandQueueService.sendOrQueue spy appelé une fois avec (siteId, 'receiver_assignment_updated', { displays: <array> })
    - Test 2: PATCH avec payload sans `receiver` → sendOrQueue spy quand même appelé avec le command name (volontaire : pattern update_config — cohérent avec CONTEXT.md décision Zone C)
    - Test 3: Si sendOrQueue throw → la réponse HTTP reste 200 (la commande est best-effort, ne doit pas bloquer le PATCH)
  </behavior>
  <action>
    Créer `central-server/src/__tests__/sites-displays-emit-command.test.ts`.

    Pattern :
    ```ts
    import request from 'supertest';
    import { app } from '../server';
    import { commandQueueService } from '../services/command-queue.service';

    jest.mock('../services/command-queue.service', () => ({
      commandQueueService: { sendOrQueue: jest.fn() },
    }));

    describe('PATCH /api/sites/:id/displays — receiver_assignment_updated emit', () => {
      const siteId = 'test-site-id';
      const validToken = '...'; // helper d'auth existant

      beforeEach(() => {
        (commandQueueService.sendOrQueue as jest.Mock).mockReset();
        (commandQueueService.sendOrQueue as jest.Mock).mockResolvedValue(undefined);
        // Mock siteRepository.updateDisplays pour qu'il retourne ok
      });

      it('queues receiver_assignment_updated with full displays array on success', async () => {
        const displays = [{ index: 0, kind: 'pi_native' }, { index: 1, receiver: { kind: 'firestick', mac: 'aa:bb' } }];
        const res = await request(app)
          .patch(`/api/sites/${siteId}/displays`)
          .set('Authorization', `Bearer ${validToken}`)
          .send({ displays });
        expect(res.status).toBe(200);
        expect(commandQueueService.sendOrQueue).toHaveBeenCalledTimes(1);
        expect(commandQueueService.sendOrQueue).toHaveBeenCalledWith(
          siteId,
          'receiver_assignment_updated',
          expect.objectContaining({ displays: expect.any(Array) }),
        );
      });

      it('queues command even when payload has no receiver (pattern update_config)', async () => {
        const displays = [{ index: 0, kind: 'pi_native' }];
        await request(app)
          .patch(`/api/sites/${siteId}/displays`)
          .set('Authorization', `Bearer ${validToken}`)
          .send({ displays });
        expect(commandQueueService.sendOrQueue).toHaveBeenCalledWith(
          siteId,
          'receiver_assignment_updated',
          expect.any(Object),
        );
      });

      it('returns 200 even if sendOrQueue throws', async () => {
        (commandQueueService.sendOrQueue as jest.Mock).mockRejectedValueOnce(new Error('queue down'));
        const res = await request(app)
          .patch(`/api/sites/${siteId}/displays`)
          .set('Authorization', `Bearer ${validToken}`)
          .send({ displays: [{ index: 0, kind: 'pi_native' }] });
        expect(res.status).toBe(200);
      });
    });
    ```
    Adapter exactement les imports `app`, le helper d'auth et les mocks de repository en s'alignant sur un test PATCH /displays existant du même dossier.

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='sites-displays-emit-command' --no-coverage --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - Le fichier test contient au moins 3 `it(...)`
    - `cd central-server && npx jest --testPathPattern='sites-displays-emit-command' --no-coverage --forceExit` passe avec 3/3 verts
    - `grep -n "'receiver_assignment_updated'" central-server/src/__tests__/sites-displays-emit-command.test.ts` retourne au moins 2 lignes (assertions)
    - `grep -n "mockRejectedValueOnce\|mockRejected" central-server/src/__tests__/sites-displays-emit-command.test.ts` confirme le test du fallback
  </acceptance_criteria>
  <done>3 tests Jest verts couvrant emission OK, payload sans receiver, et résilience erreur queue.</done>
</task>

</tasks>

<verification>
- `cd central-server && npx tsc --noEmit` : 0 erreur
- `cd central-server && npx jest --testPathPattern='sites-displays-emit-command'` : 3/3 verts
- `npm run test:smoke:smart` : pas de régression
- `node -e "console.log(require('./raspberry/sync-agent/src/config.js').DEFAULT_ALLOWED_COMMANDS.includes('receiver_assignment_updated'))"` affiche `true`
</verification>

<success_criteria>

- CLOUD-02 ✅ : PATCH displays persiste le receiver (Joi déjà en place) ET émet la commande Pi
- CLOUD-03 ✅ : sync-agent accepte le nouveau command name receiver_assignment_updated
- Aucune régression sur le PATCH /displays actuel (payloads existants continuent de fonctionner)
- Pattern best-effort : erreur queue ne bloque pas la réponse HTTP
  </success_criteria>

<output>
After completion, create `.planning/phases/07-cloud-api-sync-agent/07-cloud-02-SUMMARY.md`.
</output>
