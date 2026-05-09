---
phase: 04-data
plan: 02
type: execute
wave: 2
depends_on:
  - 04-data-01
files_modified:
  - central-server/src/repositories/site.repository.ts
  - central-server/src/repositories/site.repository.test.ts
autonomous: true
requirements:
  - DATA-03
must_haves:
  truths:
    - "Le code applicatif peut lire le récepteur d'un display via siteRepository.getReceiverForDisplay(siteId, displayIndex)"
    - "Le code applicatif peut écrire le récepteur d'un display via siteRepository.setReceiver(siteId, displayIndex, receiver)"
    - "Aucun appel à siteRepository.updateDisplays() ou query() n'est nécessaire dans les controllers/services qui veulent juste manipuler un receiver"
    - "setReceiver(..., null) désassigne un récepteur sans casser le display"
  artifacts:
    - path: "central-server/src/repositories/site.repository.ts"
      provides: "Méthodes getReceiverForDisplay + setReceiver"
      contains: "async getReceiverForDisplay"
    - path: "central-server/src/repositories/site.repository.test.ts"
      provides: "Couverture unitaire des nouvelles méthodes (lecture, écriture, null, index inexistant)"
      contains: "getReceiverForDisplay"
  key_links:
    - from: "central-server/src/repositories/site.repository.ts (setReceiver)"
      to: "central-server/src/types/index.ts (DisplayReceiver)"
      via: "import type, signature typée"
      pattern: "DisplayReceiver"
    - from: "central-server/src/repositories/site.repository.ts (getReceiverForDisplay)"
      to: "sites.displays JSONB column"
      via: "réutilise getDisplays() existant + indexation par displayIndex"
      pattern: "getDisplays|displays\\["
---

<objective>
Exposer dans `siteRepository` deux méthodes typées qui encapsulent l'accès au récepteur d'un display, sans que les consommateurs aient à manipuler le JSONB brut ni à reconstruire l'array `displays`.

Purpose: DATA-03 — découpler la couche métier (controllers, services Phase 7 CLOUD) de la structure JSONB. Sans cette abstraction, chaque consommateur dupliquerait la logique getDisplays → splice → updateDisplays, avec des risques d'écrasement concurrent.

Output: Deux méthodes repository + tests unitaires verts.
</objective>

<context>
@.planning/phases/04-data/04-data-01-receiver-schema-PLAN.md
@central-server/src/repositories/site.repository.ts
@central-server/src/repositories/site.repository.test.ts
@central-server/src/types/index.ts

<interfaces>
<!-- Existing repo methods to reuse (from site.repository.ts lines 800-822) -->

```typescript
const DEFAULT_DISPLAYS: DisplayConfig[] = [
  { index: 0, name: 'TV', type: 'tv', resolution: '1920x1080' },
];

async getDisplays(id: string): Promise<DisplayConfig[]> {
  const result = await query<{ displays: DisplayConfig[] | null }>(
    'SELECT displays FROM sites WHERE id = $1',
    [id]
  );
  if (!result.rows[0]) return [];
  return result.rows[0].displays ?? DEFAULT_DISPLAYS;
}

async updateDisplays(id: string, displays: DisplayConfig[]): Promise<void> {
  await query(
    'UPDATE sites SET displays = $1::jsonb, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(displays), id]
  );
}
```

<!-- Plan 01 added DisplayReceiver type — to be imported here -->

```typescript
export interface DisplayReceiver {
  kind: 'pi_native' | 'firestick' | 'browser';
  mac?: string;
  last_seen_at?: string;
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Ajouter getReceiverForDisplay + setReceiver au repository</name>
  <files>
    central-server/src/repositories/site.repository.ts
    central-server/src/repositories/site.repository.test.ts
  </files>
  <read_first>
    - central-server/src/repositories/site.repository.ts (lignes 193-200 imports + DEFAULT_DISPLAYS, lignes 797-822 méthodes N-display existantes)
    - central-server/src/repositories/site.repository.test.ts (pattern mocking de `query`)
    - central-server/src/types/index.ts (DisplayConfig + DisplayReceiver — Plan 01)
    - .claude/rules/code-patterns.md (TS strict, async/await + try/catch côté caller)
    - CLAUDE.md (Repository pattern obligatoire, 0 query() direct hors repos)
  </read_first>
  <behavior>
    - Test 1 (read existing): site avec `displays: [{ index: 0, name: 'TV', type: 'tv', receiver: { kind: 'pi_native' } }]` → `getReceiverForDisplay(siteId, 0)` retourne `{ kind: 'pi_native' }`
    - Test 2 (read missing): display sans `receiver` → retourne `null`
    - Test 3 (read invalid index): displayIndex hors borne → retourne `null` (pas de throw)
    - Test 4 (read site inexistant): siteId inconnu → retourne `null`
    - Test 5 (write firestick): `setReceiver(siteId, 1, { kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF', last_seen_at: '2026-05-06T10:00:00Z' })` → met à jour displays[1].receiver, ne touche pas displays[0], appelle `updateDisplays` une seule fois
    - Test 6 (write null = désassignation): `setReceiver(siteId, 1, null)` → displays[1].receiver passe à null, displays[0] inchangé
    - Test 7 (write index hors borne): `setReceiver(siteId, 99, {...})` → throw une Error explicite (pas de silencieux : on ne crée pas un display fantôme)
  </behavior>
  <action>
    **A. Ajouter l'import du type `DisplayReceiver`** dans `central-server/src/repositories/site.repository.ts` ligne 4 :

    ```typescript
    import { Site, UserRole, DisplayConfig, DisplayReceiver } from '../types';
    ```

    **B. Ajouter deux méthodes** dans la classe `SiteRepositoryImpl`, juste après `updateDisplays` (ligne ~821), dans la section `// N-Display management (Phase 5H)` qu'on renomme en `// N-Display management (Phase 5H + v4.0 receivers)` :

    ```typescript
    /**
     * v4.0 DATA-03: lit le récepteur assigné à un display.
     * @returns le receiver, ou null si display non assigné, index hors borne, ou site inexistant.
     */
    async getReceiverForDisplay(
      siteId: string,
      displayIndex: number
    ): Promise<DisplayReceiver | null> {
      const displays = await this.getDisplays(siteId);
      const display = displays.find(d => d.index === displayIndex);
      if (!display) return null;
      return display.receiver ?? null;
    }

    /**
     * v4.0 DATA-03: écrit (ou désassigne avec `null`) le récepteur d'un display.
     * Préserve les autres displays. Throw si le displayIndex n'existe pas
     * (ne crée jamais de display fantôme — la création passe par updateDisplays).
     */
    async setReceiver(
      siteId: string,
      displayIndex: number,
      receiver: DisplayReceiver | null
    ): Promise<void> {
      const displays = await this.getDisplays(siteId);
      const target = displays.find(d => d.index === displayIndex);
      if (!target) {
        throw new Error(
          `setReceiver: display index ${displayIndex} not found for site ${siteId}`
        );
      }
      const updated: DisplayConfig[] = displays.map(d =>
        d.index === displayIndex ? { ...d, receiver } : d
      );
      await this.updateDisplays(siteId, updated);
    }
    ```

    Note : pas de `query()` direct dans les nouvelles méthodes — elles composent `getDisplays` + `updateDisplays` existants. Conforme au repo pattern et à l'ESLint guard (`no `query()` outside repository`).

    **C. Ajouter les tests unitaires** dans `central-server/src/repositories/site.repository.test.ts` (ajouter un nouveau `describe('receiver methods (DATA-03)')` à la fin du fichier, suivre le pattern de mocking existant — `query` est probablement déjà mocké au niveau du fichier) :

    ```typescript
    import { query } from '../config/database';
    import { siteRepository } from './site.repository';

    jest.mock('../config/database', () => ({
      query: jest.fn(),
    }));

    const mockedQuery = query as jest.MockedFunction<typeof query>;

    describe('siteRepository — receiver methods (v4.0 DATA-03)', () => {
      beforeEach(() => {
        mockedQuery.mockReset();
      });

      describe('getReceiverForDisplay', () => {
        it('retourne le receiver existant', async () => {
          mockedQuery.mockResolvedValueOnce({
            rows: [{ displays: [
              { index: 0, name: 'TV', type: 'tv', receiver: { kind: 'pi_native' } },
              { index: 1, name: 'Bar', type: 'tv', receiver: { kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF' } },
            ]}], rowCount: 1, command: 'SELECT', oid: 0, fields: [],
          } as never);
          const r = await siteRepository.getReceiverForDisplay('site-1', 1);
          expect(r).toEqual({ kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF' });
        });

        it('retourne null si display sans receiver', async () => {
          mockedQuery.mockResolvedValueOnce({
            rows: [{ displays: [{ index: 0, name: 'TV', type: 'tv' }] }],
            rowCount: 1, command: 'SELECT', oid: 0, fields: [],
          } as never);
          const r = await siteRepository.getReceiverForDisplay('site-1', 0);
          expect(r).toBeNull();
        });

        it('retourne null si index hors borne', async () => {
          mockedQuery.mockResolvedValueOnce({
            rows: [{ displays: [{ index: 0, name: 'TV', type: 'tv' }] }],
            rowCount: 1, command: 'SELECT', oid: 0, fields: [],
          } as never);
          const r = await siteRepository.getReceiverForDisplay('site-1', 99);
          expect(r).toBeNull();
        });

        it('retourne null si site inexistant', async () => {
          mockedQuery.mockResolvedValueOnce({
            rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [],
          } as never);
          const r = await siteRepository.getReceiverForDisplay('ghost', 0);
          expect(r).toBeNull();
        });
      });

      describe('setReceiver', () => {
        it('écrit un firestick sans toucher les autres displays', async () => {
          // SELECT (getDisplays)
          mockedQuery.mockResolvedValueOnce({
            rows: [{ displays: [
              { index: 0, name: 'TV', type: 'tv', receiver: { kind: 'pi_native' } },
              { index: 1, name: 'Bar', type: 'tv' },
            ]}], rowCount: 1, command: 'SELECT', oid: 0, fields: [],
          } as never);
          // UPDATE (updateDisplays)
          mockedQuery.mockResolvedValueOnce({
            rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
          } as never);

          await siteRepository.setReceiver('site-1', 1, {
            kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF', last_seen_at: '2026-05-06T10:00:00Z',
          });

          expect(mockedQuery).toHaveBeenCalledTimes(2);
          const updateCall = mockedQuery.mock.calls[1];
          const payload = JSON.parse(updateCall[1]![0] as string);
          expect(payload[0]).toEqual({ index: 0, name: 'TV', type: 'tv', receiver: { kind: 'pi_native' } });
          expect(payload[1].receiver).toEqual({ kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF', last_seen_at: '2026-05-06T10:00:00Z' });
        });

        it('désassigne avec null', async () => {
          mockedQuery.mockResolvedValueOnce({
            rows: [{ displays: [{ index: 0, name: 'TV', type: 'tv', receiver: { kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF' } }] }],
            rowCount: 1, command: 'SELECT', oid: 0, fields: [],
          } as never);
          mockedQuery.mockResolvedValueOnce({
            rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [],
          } as never);

          await siteRepository.setReceiver('site-1', 0, null);

          const payload = JSON.parse(mockedQuery.mock.calls[1][1]![0] as string);
          expect(payload[0].receiver).toBeNull();
        });

        it('throw si index hors borne (pas de display fantôme)', async () => {
          mockedQuery.mockResolvedValueOnce({
            rows: [{ displays: [{ index: 0, name: 'TV', type: 'tv' }] }],
            rowCount: 1, command: 'SELECT', oid: 0, fields: [],
          } as never);

          await expect(
            siteRepository.setReceiver('site-1', 99, { kind: 'firestick', mac: 'AA:BB:CC:DD:EE:FF' })
          ).rejects.toThrow(/display index 99 not found/);
          expect(mockedQuery).toHaveBeenCalledTimes(1); // pas d'UPDATE
        });
      });
    });
    ```

    Si le fichier de test existant utilise un autre pattern de mock, adapter en respectant le pattern existant (lire le fichier en premier, ne pas casser les tests existants).
  </action>
  <verify>
    <automated>cd central-server &amp;&amp; npx jest --testPathPattern='repositories/site.repository.test' --no-coverage --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - `central-server/src/repositories/site.repository.ts` contient `async getReceiverForDisplay(`
    - `central-server/src/repositories/site.repository.ts` contient `async setReceiver(`
    - `central-server/src/repositories/site.repository.ts` importe `DisplayReceiver` depuis `../types`
    - Les nouvelles méthodes ne contiennent PAS d'appel direct à `query(` (elles passent par `getDisplays` + `updateDisplays`)
    - `setReceiver` throw quand displayIndex inconnu (vérifié par test "throw si index hors borne")
    - Le fichier test contient les 7 cas listés dans `<behavior>` et tous passent verts
    - `npx tsc --noEmit` passe sans erreur
    - `npm run lint` (ESLint) passe sans erreur (notamment le guard repository pattern)
  </acceptance_criteria>
  <done>
    Les controllers/services peuvent lire et écrire un récepteur de display via deux appels typés sans toucher au JSONB brut ni dupliquer la logique getDisplays/updateDisplays. 7 tests unitaires verts. DATA-03 satisfait.
  </done>
</task>

</tasks>

<verification>
1. Tests unitaires repo : `cd central-server && npx jest --testPathPattern='repositories/site.repository.test' --no-coverage --forceExit` → vert.
2. TS strict : `cd central-server && npx tsc --noEmit` → 0 erreur.
3. Lint : `npm run lint` → 0 erreur (guard repository pattern respecté — pas de `query()` ajouté hors `getDisplays`/`updateDisplays`).
4. Smoke ciblé : `npm run test:smoke:smart` → vert (suites smoke-server-core, smoke-wiring concernées).
5. API surface complète : `grep -E "getReceiverForDisplay|setReceiver" central-server/src/repositories/site.repository.ts` retourne au moins 2 lignes (déclaration + JSDoc/usage).
</verification>

<success_criteria>
- DATA-03 satisfait : `getReceiverForDisplay(siteId, displayIndex)` et `setReceiver(siteId, displayIndex, receiver | null)` exposés sur `siteRepository`.
- Aucun consommateur n'a besoin de manipuler le JSONB brut pour les opérations courantes (lecture/écriture/désassignation d'un receiver).
- 7 tests unitaires verts couvrent les cas nominal, null/désassignation, index hors borne, site inexistant.
- Conforme repository pattern (CLAUDE.md) : pas de `query()` direct ajouté, composition de méthodes existantes.
- Prêt à être consommé par Phase 5 (DETECT) et Phase 7 (CLOUD).
</success_criteria>

<output>
After completion, create `.planning/phases/04-data/04-data-02-SUMMARY.md` documenting:
- New repo method signatures (getReceiverForDisplay, setReceiver)
- Test coverage (7 cases)
- Files modified
- Confirmation : aucun `query()` direct ajouté, repository pattern préservé
- Phase 4 complete → unblocks Phase 5 (DETECT) et Phase 7 (CLOUD)
</output>
