---
phase: 07-cloud-api-sync-agent
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/src/services/socket.service.ts
  - central-server/src/controllers/sites.controller.ts
  - central-server/src/routes/sites.routes.ts
  - central-server/src/__tests__/sites-connected-receivers.test.ts
autonomous: true
requirements:
  - CLOUD-01
must_haves:
  truths:
    - 'GET /api/sites/:id/connected-receivers retourne 200 + JSON {receivers: ReceiverInfo[]} ordonné par last_seen_at desc'
    - 'Quand le Pi envoie un state-sync contenant un champ `receivers`, la Map<siteId, ReceiverInfo[]> dans SocketService est mise à jour'
    - 'La route est protégée par les mêmes guards que les autres routes /api/sites/:id/* (auth + access guard sur siteId)'
  artifacts:
    - path: central-server/src/services/socket.service.ts
      provides: 'private receiversBySite: Map<string, ReceiverInfo[]> + getter getConnectedReceivers(siteId) + extraction dans handler state-sync'
    - path: central-server/src/controllers/sites.controller.ts
      provides: 'exported function getConnectedReceivers(req, res) lit socketService.getConnectedReceivers(req.params.id)'
    - path: central-server/src/routes/sites.routes.ts
      provides: 'GET /:id/connected-receivers wired avec auth + access guard'
    - path: central-server/src/__tests__/sites-connected-receivers.test.ts
      provides: 'Jest test : injection Map + GET retourne 200 + array trié par last_seen_at desc'
  key_links:
    - from: central-server/src/services/socket.service.ts
      to: 'Pi state-sync payload'
      via: 'Array.isArray(data.receivers) ? this.receiversBySite.set(siteId, data.receivers) : noop'
      pattern: "receiversBySite\\.set\\("
    - from: central-server/src/controllers/sites.controller.ts
      to: central-server/src/services/socket.service.ts
      via: 'socketService.getConnectedReceivers(siteId)'
      pattern: 'getConnectedReceivers'
    - from: central-server/src/routes/sites.routes.ts
      to: central-server/src/controllers/sites.controller.ts
      via: "router.get('/:id/connected-receivers', ...)"
      pattern: '/:id/connected-receivers'
---

<objective>
Expose les MACs auto-détectées par le Pi via une route REST cloud `GET /api/sites/:id/connected-receivers`. Les données vivent dans une Map<siteId, ReceiverInfo[]> en mémoire dans `SocketService`, alimentée par extension du handler `state-sync` existant. Volatilité acceptée (Railway restart → Map vide → rechargée au prochain state-sync ~10-30s).

Purpose: CLOUD-01 — donner au dashboard la liste des Fire Sticks visibles par le Pi pour pré-remplir le dropdown d'assignation (Phase 8).
Output: Route REST + Map state + handler state-sync étendu + test Jest.
</objective>

<execution_context>
@/Users/gletallec/Documents/NEOPRO/OFFICIEL/neopro/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/07-cloud-api-sync-agent/07-CONTEXT.md

@central-server/src/services/socket.service.ts
@central-server/src/controllers/sites.controller.ts
@central-server/src/routes/sites.routes.ts

<interfaces>
ReceiverInfo (déjà émis par le Pi via state-sync) — shape attendue :
```ts
type ReceiverInfo = {
  mac: string;            // ex: "aa:bb:cc:dd:ee:ff"
  kind: 'firestick' | 'browser' | 'pi_native';
  lastSeenAt: number;     // epoch ms
  displayIndex?: number | null;
  ip?: string | null;
};
```
Note: la version persistée DB (DisplayConfig.receiver) utilise `last_seen_at` (snake), mais l'event Pi state-sync utilise `lastSeenAt` (camel) — voir raspberry/server/services/state.service.js:386. Le tri se fait sur la clé reçue ; à clarifier en lisant le code Pi avant Task 1.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: SocketService — Map receivers + extraction depuis state-sync</name>
  <files>central-server/src/services/socket.service.ts</files>
  <read_first>
    - central-server/src/services/socket.service.ts (handler state-sync existant ~ligne 554, voir pattern complet)
    - raspberry/server/services/state.service.js (méthode getFullState, ligne 386 : confirmer la clé exacte `receivers` et le format des items)
  </read_first>
  <action>
    Dans `central-server/src/services/socket.service.ts` :
    1. Ajouter un champ privé en haut de la classe `SocketService` :
       ```ts
       private receiversBySite: Map<string, ReceiverInfo[]> = new Map();
       ```
       Avec le type `ReceiverInfo` exporté en haut du fichier (ou importé d'un fichier partagé si l'équivalent existe déjà — sinon le déclarer inline) :
       ```ts
       export interface ReceiverInfo {
         mac: string;
         kind: 'firestick' | 'browser' | 'pi_native';
         lastSeenAt: number;
         displayIndex?: number | null;
         ip?: string | null;
       }
       ```
    2. Dans le handler `state-sync` existant (~ligne 554), AVANT le relay vers le room dashboard, ajouter :
       ```ts
       if (data && Array.isArray((data as any).receivers)) {
         this.receiversBySite.set(siteId, (data as any).receivers as ReceiverInfo[]);
       }
       ```
       Le `siteId` doit être celui déjà résolu plus haut dans le handler (ne PAS re-résoudre, réutiliser la variable locale existante).
    3. Ajouter une méthode publique :
       ```ts
       public getConnectedReceivers(siteId: string): ReceiverInfo[] {
         const list = this.receiversBySite.get(siteId) || [];
         return [...list].sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
       }
       ```
    4. Logger Winston `info` la première fois qu'un siteId est vu : `logger.info('Receivers Map updated', { siteId, count: data.receivers.length })` — utile pour debug Railway.

    Ne PAS retirer ou modifier le relay `state-sync` vers le room dashboard.
    Ne PAS faire de query() direct (cette phase n'écrit pas en DB).

  </action>
  <verify>
    <automated>cd central-server && npx tsc --noEmit 2>&1 | grep -E "socket\.service\.ts" || echo "TS OK"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "receiversBySite" central-server/src/services/socket.service.ts` montre au moins 3 occurrences (déclaration, set dans state-sync, get dans getConnectedReceivers)
    - `grep -n "getConnectedReceivers" central-server/src/services/socket.service.ts` montre la méthode publique
    - `grep -n "Array.isArray.*receivers" central-server/src/services/socket.service.ts` montre la garde dans le handler state-sync
    - Le tri par lastSeenAt desc est présent : `grep -n "lastSeenAt.*-.*lastSeenAt\|b\.lastSeenAt.*a\.lastSeenAt" central-server/src/services/socket.service.ts`
    - `cd central-server && npx tsc --noEmit` ne reporte aucune erreur sur socket.service.ts
  </acceptance_criteria>
  <done>SocketService maintient une Map des receivers par site, alimentée par state-sync, exposée via getConnectedReceivers().</done>
</task>

<task type="auto">
  <name>Task 2: Controller + Route GET /:id/connected-receivers</name>
  <files>
    central-server/src/controllers/sites.controller.ts
    central-server/src/routes/sites.routes.ts
  </files>
  <read_first>
    - central-server/src/controllers/sites.controller.ts (lire les exports existants comme `updateSiteDisplays` ligne 450 — copier le pattern signature/auth/error handling)
    - central-server/src/routes/sites.routes.ts (lire la route existante PATCH `/:id/displays` ligne 357 et le guard auth/access utilisé — appliquer les MÊMES middlewares à la nouvelle route GET)
    - central-server/src/services/socket.service.ts (vérifier l'import et l'export du singleton socketService)
  </read_first>
  <action>
    Dans `central-server/src/controllers/sites.controller.ts` :
    1. Importer le singleton SocketService (ou son instance exportée — vérifier le pattern existant dans le fichier, généralement `import { socketService } from '../services/socket.service'`).
    2. Ajouter la fonction exportée :
       ```ts
       export const getConnectedReceivers = async (req: Request, res: Response): Promise<void> => {
         try {
           const siteId = req.params.id;
           const receivers = socketService.getConnectedReceivers(siteId);
           res.json({ receivers });
         } catch (err) {
           logger.error('getConnectedReceivers failed', { err, siteId: req.params.id });
           res.status(500).json({ error: 'Failed to fetch connected receivers' });
         }
       };
       ```
       Adapter `Request`/`Response` aux types Express déjà utilisés dans le fichier.

    Dans `central-server/src/routes/sites.routes.ts` :
    3. Importer `getConnectedReceivers` du controller.
    4. Ajouter la route AVANT les routes catch-all paramétriques (à proximité de `/:id/displays`) :
       ```ts
       router.get('/:id/connected-receivers', authenticate, requireSiteAccess, getConnectedReceivers);
       ```
       Utiliser EXACTEMENT les mêmes middlewares (auth + access guard) que la route PATCH `/:id/displays` voisine. Ne PAS inventer de nouveau guard.

    Ne PAS importer `../config/database` (règle CLAUDE.md). Pas de query() direct.

  </action>
  <verify>
    <automated>cd central-server && npx tsc --noEmit 2>&1 | grep -E "(sites\.controller|sites\.routes)\.ts" || echo "TS OK"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "getConnectedReceivers" central-server/src/controllers/sites.controller.ts` montre l'export de la fonction
    - `grep -n "socketService.getConnectedReceivers" central-server/src/controllers/sites.controller.ts` confirme l'appel au service
    - `grep -n "/:id/connected-receivers" central-server/src/routes/sites.routes.ts` montre la route
    - La route inclut un middleware d'auth (mêmes noms que la route PATCH `/:id/displays` voisine — vérifier visuellement la cohérence avec ligne 357)
    - `cd central-server && npx tsc --noEmit` ne reporte aucune erreur
  </acceptance_criteria>
  <done>Route REST `GET /api/sites/:id/connected-receivers` câblée et protégée, retourne le tableau trié par fraîcheur.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Test Jest — injection Map + GET retourne ordre desc</name>
  <files>central-server/src/__tests__/sites-connected-receivers.test.ts</files>
  <read_first>
    - central-server/src/__tests__ (lister les tests existants pour identifier le pattern d'app Express + mock d'auth — par exemple un test sur `/api/sites/:id/displays` ou similar)
    - central-server/src/services/socket.service.ts (vérifier comment forcer `receiversBySite` depuis un test : exposer un setter test-only ou injecter via la méthode publique)
  </read_first>
  <behavior>
    - Test 1: GET /api/sites/:id/connected-receivers avec 3 receivers en Map → retourne 200 + array de 3 items triés par lastSeenAt desc
    - Test 2: GET sur un siteId inconnu → retourne 200 + { receivers: [] }
    - Test 3: GET sans auth → 401 (vérifier que le middleware auth est bien câblé)
  </behavior>
  <action>
    Créer `central-server/src/__tests__/sites-connected-receivers.test.ts`.

    Stratégie d'injection : si `socketService.receiversBySite` est privé sans hook de test, ajouter dans la classe une méthode `__setReceiversForTest(siteId, list)` (préfixe `__` indique test-only) :
    ```ts
    public __setReceiversForTest(siteId: string, list: ReceiverInfo[]): void {
      this.receiversBySite.set(siteId, list);
    }
    ```
    L'ajouter dans Task 1 si oublié, ou dans Task 3 en éditant socket.service.ts.

    Test :
    ```ts
    import request from 'supertest';
    import { app } from '../server'; // adapter selon export réel
    import { socketService } from '../services/socket.service';

    describe('GET /api/sites/:id/connected-receivers', () => {
      const siteId = 'test-site-id';
      const validToken = '...'; // utiliser le helper d'auth de test existant

      it('returns receivers sorted by lastSeenAt desc', async () => {
        socketService.__setReceiversForTest(siteId, [
          { mac: 'aa:01', kind: 'firestick', lastSeenAt: 100 },
          { mac: 'aa:02', kind: 'firestick', lastSeenAt: 300 },
          { mac: 'aa:03', kind: 'firestick', lastSeenAt: 200 },
        ]);
        const res = await request(app)
          .get(`/api/sites/${siteId}/connected-receivers`)
          .set('Authorization', `Bearer ${validToken}`);
        expect(res.status).toBe(200);
        expect(res.body.receivers.map((r: any) => r.mac)).toEqual(['aa:02', 'aa:03', 'aa:01']);
      });

      it('returns empty array for unknown siteId', async () => {
        const res = await request(app)
          .get('/api/sites/unknown-id/connected-receivers')
          .set('Authorization', `Bearer ${validToken}`);
        expect(res.status).toBe(200);
        expect(res.body.receivers).toEqual([]);
      });

      it('returns 401 without auth', async () => {
        const res = await request(app).get(`/api/sites/${siteId}/connected-receivers`);
        expect(res.status).toBe(401);
      });
    });
    ```
    Adapter l'import de `app` et le helper d'auth en s'alignant sur un test existant du dossier `__tests__/` (pattern déjà en place — ne pas inventer un setup test).

  </action>
  <verify>
    <automated>cd central-server && npx jest --testPathPattern='sites-connected-receivers' --no-coverage --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - Le test file existe et contient au moins 3 `it(...)` blocks
    - `cd central-server && npx jest --testPathPattern='sites-connected-receivers' --no-coverage --forceExit` passe avec 3/3 tests verts
    - `grep -n "lastSeenAt: 300" central-server/src/__tests__/sites-connected-receivers.test.ts` confirme le test de tri
    - `grep -n "401" central-server/src/__tests__/sites-connected-receivers.test.ts` confirme le test d'auth
  </acceptance_criteria>
  <done>3 tests Jest verts couvrant tri desc, siteId inconnu et auth requise.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` côté central-server : 0 erreur
- `npx jest --testPathPattern='sites-connected-receivers'` : 3/3 verts
- `npm run test:smoke:smart` (auto-detect git diff) : pas de régression
- `grep -rn "connected-receivers" central-server/src/` : route + controller + service + test cohérents
</verification>

<success_criteria>

- CLOUD-01 ✅ : GET /api/sites/:id/connected-receivers retourne les MACs détectées triées par fraîcheur
- Map alimentée par state-sync (changement minimal ~3 lignes dans le handler existant)
- Aucune régression sur le relay state-sync vers le room dashboard
- Aucun appel DB direct, aucun import de `../config/database`
  </success_criteria>

<output>
After completion, create `.planning/phases/07-cloud-api-sync-agent/07-cloud-01-SUMMARY.md`.
</output>
