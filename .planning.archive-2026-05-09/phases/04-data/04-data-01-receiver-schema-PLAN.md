---
phase: 04-data
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - central-server/src/scripts/migrations/add-display-receiver.sql
  - central-server/src/scripts/full-schema.sql
  - central-server/src/types/index.ts
  - central-server/src/middleware/validation.ts
autonomous: true
requirements:
  - DATA-01
  - DATA-02
must_haves:
  truths:
    - "Un DisplayConfig peut sérialiser/désérialiser un objet receiver avec kind, mac, last_seen_at"
    - "Tous les sites existants en prod (NLF, RACC) restent fonctionnels après migration sans intervention manuelle"
    - "HDMI #0 défaulte à kind: 'pi_native' après migration (backfill idempotent)"
    - "Le schéma Joi updateDisplays accepte un receiver valide et rejette un kind inconnu"
  artifacts:
    - path: "central-server/src/scripts/migrations/add-display-receiver.sql"
      provides: "Migration backfill idempotente HDMI #0 → receiver.pi_native"
      contains: "UPDATE sites SET displays"
    - path: "central-server/src/types/index.ts"
      provides: "Type DisplayConfig.receiver avec union literal pi_native|firestick|browser"
      contains: "kind: 'pi_native' | 'firestick' | 'browser'"
    - path: "central-server/src/middleware/validation.ts"
      provides: "Validateur Joi receiver pour updateDisplays"
      contains: "receiver:"
    - path: "central-server/src/scripts/full-schema.sql"
      provides: "Snapshot DB reflétant la nouvelle forme JSONB displays"
  key_links:
    - from: "central-server/src/types/index.ts (DisplayConfig)"
      to: "central-server/src/middleware/validation.ts (updateDisplays)"
      via: "shape JSONB cohérent TS ↔ Joi"
      pattern: "kind.*pi_native.*firestick.*browser"
    - from: "central-server/src/scripts/migrations/add-display-receiver.sql"
      to: "central-server/src/scripts/full-schema.sql"
      via: "snapshot mis à jour pour bootstrap staging"
      pattern: "receiver"
---

<objective>
Étendre le modèle JSONB `sites.displays[i]` (PROP-002) avec un objet optionnel `receiver: { kind, mac?, last_seen_at? }` pour identifier le récepteur d'un display (Pi natif, Fire Stick, browser).

Purpose: Poser les fondations data du milestone v4.0 Multi-écrans Fire Stick. Sans cette extension, aucune phase suivante (DETECT, CAPTIVE, CLOUD, DASHBOARD) ne peut référencer un récepteur.

Output: Migration safe + type TS étendu + validateur Joi + snapshot full-schema.sql à jour.
</objective>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/firestick-poc/VISION.md
@central-server/src/types/index.ts
@central-server/src/middleware/validation.ts
@central-server/src/scripts/full-schema.sql
@central-server/src/scripts/migrations/n-display-model.sql

<interfaces>
<!-- Existing DisplayConfig type (extension target) -->

From central-server/src/types/index.ts (lines 94-100):
```typescript
export interface DisplayConfig {
  index: number;
  name: string;
  type: string;       // 'tv', 'secondary', 'led-banner', 'totem', etc.
  resolution?: string; // e.g. '1920x1080', '1920x384'
}
```

From central-server/src/middleware/validation.ts (lines 139-148, schemas.updateDisplays):
```typescript
updateDisplays: Joi.object({
  displays: Joi.array().items(
    Joi.object({
      index: Joi.number().integer().min(0).required(),
      name: Joi.string().max(100).required(),
      type: Joi.string().pattern(/^[a-z0-9-]+$/).max(50).required(),
      resolution: Joi.string().pattern(/^\d{1,5}x\d{1,5}$/).max(20).optional(),
    })
  ).min(1).max(20).required(),
}),
```

Existing migration pattern (PROP-002 — n-display-model.sql):
```sql
ALTER TABLE sites ADD COLUMN IF NOT EXISTS displays JSONB DEFAULT NULL;
COMMENT ON COLUMN sites.displays IS '...';
```

Target shape after this plan:
```typescript
interface DisplayConfig {
  index: number;
  name: string;
  type: string;
  resolution?: string;
  receiver?: {
    kind: 'pi_native' | 'firestick' | 'browser';
    mac?: string;
    last_seen_at?: string;
  } | null;
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Migration backfill HDMI #0 → receiver.pi_native (idempotent)</name>
  <files>
    central-server/src/scripts/migrations/add-display-receiver.sql
  </files>
  <read_first>
    - central-server/src/scripts/migrations/n-display-model.sql (pattern PROP-002 ALTER + COMMENT)
    - central-server/src/scripts/migrations/extend-club-sessions-match-fields.sql (pattern récent ALTER ADD COLUMN IF NOT EXISTS + backfill)
    - central-server/src/scripts/full-schema.sql (lignes ~985-1000, voir colonne `displays jsonb`)
    - .planning/firestick-poc/VISION.md (section "Modèle de données")
  </read_first>
  <action>
    Créer `central-server/src/scripts/migrations/add-display-receiver.sql`. Pas de nouvelle colonne — c'est un backfill JSONB sur la colonne existante `sites.displays`.

    Contenu exact (idempotent, peut tourner 2x sans casser) :

    ```sql
    -- v4.0 Phase 4 (DATA-01, DATA-02): backfill displays[i].receiver
    -- Étend le JSONB sites.displays[i] avec un receiver optionnel.
    -- Idempotent: la condition WHERE garantit que seuls les displays sans receiver
    -- ET avec index = 0 sont rebuildés. Une 2e exécution est un no-op.
    -- Préserve les autres displays (index > 0 restent sans receiver — il est optionnel).

    UPDATE sites
    SET displays = (
      SELECT jsonb_agg(
        CASE
          WHEN (elem->>'index')::int = 0 AND NOT (elem ? 'receiver')
            THEN elem || jsonb_build_object('receiver', jsonb_build_object('kind', 'pi_native'))
          ELSE elem
        END
        ORDER BY (elem->>'index')::int
      )
      FROM jsonb_array_elements(displays) AS elem
    ),
    updated_at = NOW()
    WHERE displays IS NOT NULL
      AND jsonb_array_length(displays) > 0
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(displays) e
        WHERE (e->>'index')::int = 0 AND NOT (e ? 'receiver')
      );

    COMMENT ON COLUMN sites.displays IS 'N-display config: [{index, name, type, resolution, receiver?: {kind: pi_native|firestick|browser, mac?, last_seen_at?}}]. NULL = legacy dual (tv + secondary). HDMI #0 défaulte à receiver.kind=pi_native (v4.0 DATA-02).';
    ```

    Ne PAS toucher la migration existante `n-display-model.sql` (déjà en prod). Ne PAS créer de nouvelle table. Ne PAS rendre `receiver` NOT NULL.
  </action>
  <verify>
    <automated>test -f central-server/src/scripts/migrations/add-display-receiver.sql &amp;&amp; grep -q "jsonb_agg" central-server/src/scripts/migrations/add-display-receiver.sql &amp;&amp; grep -q "pi_native" central-server/src/scripts/migrations/add-display-receiver.sql &amp;&amp; grep -q "NOT (elem ? 'receiver')" central-server/src/scripts/migrations/add-display-receiver.sql</automated>
  </verify>
  <acceptance_criteria>
    - File `central-server/src/scripts/migrations/add-display-receiver.sql` exists
    - Contains `UPDATE sites SET displays =` with `jsonb_agg` reconstruction
    - Contains the literal `'pi_native'` and `'kind'`
    - Contains the idempotent guard `NOT (e ? 'receiver')` AND `(e->>'index')::int = 0`
    - Contains `COMMENT ON COLUMN sites.displays` updated to mention `receiver`
    - Does NOT contain `ALTER TABLE sites ADD COLUMN` (la colonne existe déjà depuis PROP-002)
    - Does NOT introduce a new table (`grep -i "CREATE TABLE" returns nothing`)
  </acceptance_criteria>
  <done>
    Migration créée, idempotente, ne touche que les rows non-déjà-backfillées, HDMI #0 défaulte à `pi_native`, les autres displays restent sans receiver (champ optionnel).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Étendre le type TS DisplayConfig + validateur Joi receiver</name>
  <files>
    central-server/src/types/index.ts
    central-server/src/middleware/validation.ts
    central-server/src/__tests__/validation/display-receiver.validation.test.ts
  </files>
  <read_first>
    - central-server/src/types/index.ts (lignes 80-105, DisplayConfig + Site)
    - central-server/src/middleware/validation.ts (lignes 130-150, schemas.updateDisplays)
    - .planning/firestick-poc/VISION.md (section "Modèle de données" — schéma exact)
    - .claude/rules/code-patterns.md (validation Joi pattern)
  </read_first>
  <behavior>
    - Test 1 (Joi accepte): `schemas.updateDisplays.validate({ displays: [{ index: 0, name: 'TV', type: 'tv', receiver: { kind: 'pi_native' } }] })` → `error` is undefined
    - Test 2 (Joi accepte firestick complet): `{ index: 1, name: 'Bar', type: 'tv', receiver: { kind: 'firestick', mac: '0C:43:F9:36:04:77', last_seen_at: '2026-05-06T10:00:00Z' } }` → valide
    - Test 3 (Joi accepte receiver: null): receiver explicitement null → valide (désassignation)
    - Test 4 (Joi accepte sans receiver): rétro-compat displays existants sans receiver → valide
    - Test 5 (Joi rejette kind inconnu): `receiver: { kind: 'chromecast' }` → error contient 'kind'
    - Test 6 (Joi rejette MAC mal formée): `receiver: { kind: 'firestick', mac: 'not-a-mac' }` → error contient 'mac'
  </behavior>
  <action>
    **A. Étendre `central-server/src/types/index.ts`** — Modifier l'interface `DisplayConfig` (ligne ~95) en ajoutant le champ `receiver` optionnel :

    ```typescript
    /** N-display configuration entry (PROP-002 Phase 5, étendu v4.0 DATA-01) */
    export interface DisplayConfig {
      index: number;
      name: string;
      type: string;       // 'tv', 'secondary', 'led-banner', 'totem', etc.
      resolution?: string; // e.g. '1920x1080', '1920x384'
      /** v4.0: identité du récepteur physique. NULL ou absent = display non assigné. */
      receiver?: DisplayReceiver | null;
    }

    /** v4.0 DATA-01: récepteur physique d'un display (Pi natif HDMI, Fire Stick WiFi, browser SaaS) */
    export interface DisplayReceiver {
      kind: 'pi_native' | 'firestick' | 'browser';
      /** MAC address (format 'XX:XX:XX:XX:XX:XX'). Requis pour firestick, optionnel sinon. */
      mac?: string;
      /** ISO 8601 timestamp de la dernière apparition observée par le Pi. */
      last_seen_at?: string;
    }
    ```

    **B. Étendre le schéma Joi `schemas.updateDisplays`** dans `central-server/src/middleware/validation.ts` (lignes 139-148). Ajouter le champ `receiver` au sous-objet display :

    ```typescript
    updateDisplays: Joi.object({
      displays: Joi.array().items(
        Joi.object({
          index: Joi.number().integer().min(0).required(),
          name: Joi.string().max(100).required(),
          type: Joi.string().pattern(/^[a-z0-9-]+$/).max(50).required(),
          resolution: Joi.string().pattern(/^\d{1,5}x\d{1,5}$/).max(20).optional(),
          receiver: Joi.object({
            kind: Joi.string().valid('pi_native', 'firestick', 'browser').required(),
            mac: Joi.string().pattern(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/).optional(),
            last_seen_at: Joi.string().isoDate().optional(),
          }).optional().allow(null),
        })
      ).min(1).max(20).required(),
    }),
    ```

    **C. Créer le test Joi** dans `central-server/src/__tests__/validation/display-receiver.validation.test.ts` :

    ```typescript
    import { schemas } from '../../middleware/validation';

    describe('schemas.updateDisplays — receiver (DATA-01)', () => {
      const wrap = (display: object) => schemas.updateDisplays.validate({ displays: [display] });

      it('accepte un display sans receiver (rétro-compat)', () => {
        expect(wrap({ index: 0, name: 'TV', type: 'tv' }).error).toBeUndefined();
      });

      it('accepte receiver pi_native minimal', () => {
        expect(wrap({ index: 0, name: 'TV', type: 'tv', receiver: { kind: 'pi_native' } }).error).toBeUndefined();
      });

      it('accepte receiver firestick complet (mac + last_seen_at)', () => {
        expect(wrap({
          index: 1, name: 'Bar', type: 'tv',
          receiver: { kind: 'firestick', mac: '0C:43:F9:36:04:77', last_seen_at: '2026-05-06T10:00:00Z' },
        }).error).toBeUndefined();
      });

      it('accepte receiver: null (désassignation)', () => {
        expect(wrap({ index: 1, name: 'Bar', type: 'tv', receiver: null }).error).toBeUndefined();
      });

      it('rejette un kind inconnu', () => {
        const { error } = wrap({ index: 0, name: 'TV', type: 'tv', receiver: { kind: 'chromecast' } });
        expect(error).toBeDefined();
        expect(error!.message).toMatch(/kind/);
      });

      it('rejette une MAC mal formée', () => {
        const { error } = wrap({ index: 1, name: 'Bar', type: 'tv', receiver: { kind: 'firestick', mac: 'not-a-mac' } });
        expect(error).toBeDefined();
        expect(error!.message).toMatch(/mac/);
      });
    });
    ```
  </action>
  <verify>
    <automated>cd central-server &amp;&amp; npx jest --testPathPattern='validation/display-receiver.validation' --no-coverage --forceExit</automated>
  </verify>
  <acceptance_criteria>
    - `central-server/src/types/index.ts` contient `kind: 'pi_native' | 'firestick' | 'browser'`
    - `central-server/src/types/index.ts` exporte `interface DisplayReceiver`
    - `central-server/src/types/index.ts` contient `receiver?: DisplayReceiver | null` dans DisplayConfig
    - `central-server/src/middleware/validation.ts` contient `Joi.string().valid('pi_native', 'firestick', 'browser')`
    - `central-server/src/middleware/validation.ts` contient le pattern MAC `/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/`
    - `central-server/src/middleware/validation.ts` contient `.optional().allow(null)` sur le champ receiver
    - Le test file `central-server/src/__tests__/validation/display-receiver.validation.test.ts` existe et passe (6 cas verts)
    - `npx tsc --noEmit` ne génère pas d'erreur sur les nouveaux types
  </acceptance_criteria>
  <done>
    Le type DisplayConfig porte un receiver optionnel typé strict, le validateur Joi accepte/rejette correctement les payloads, 6 tests unitaires verts.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Mettre à jour le snapshot full-schema.sql</name>
  <files>
    central-server/src/scripts/full-schema.sql
  </files>
  <read_first>
    - central-server/src/scripts/full-schema.sql (lignes 985-1025, table sites avec colonne displays jsonb + COMMENT existants)
    - central-server/src/scripts/migrations/add-display-receiver.sql (Task 1, source de vérité du nouveau COMMENT)
    - .claude/rules/alerts-dedup.md (section "Migration / schema" — pattern de synchro full-schema.sql ↔ migrations)
  </read_first>
  <action>
    Mettre à jour le COMMENT sur la colonne `sites.displays` dans `central-server/src/scripts/full-schema.sql` pour refléter la nouvelle forme JSONB.

    Localiser le bloc existant (recherche `COMMENT ON COLUMN public.sites.displays` ou similaire — si absent du snapshot, l'ajouter dans la zone des COMMENTs sites, après les COMMENTs `wifi_psk_*` ~ligne 1020).

    Remplacer / ajouter :

    ```sql
    --
    -- Name: COLUMN sites.displays; Type: COMMENT; Schema: public; Owner: -
    --

    COMMENT ON COLUMN public.sites.displays IS 'N-display config: [{index, name, type, resolution, receiver?: {kind: pi_native|firestick|browser, mac?, last_seen_at?}}]. NULL = legacy dual (tv + secondary). HDMI #0 défaulte à receiver.kind=pi_native (v4.0 DATA-02).';
    ```

    Ne pas modifier la définition de la colonne `displays jsonb` (toujours `jsonb` nullable, pas de contrainte NOT NULL — `receiver` est optionnel).
  </action>
  <verify>
    <automated>grep -q "receiver?: {kind: pi_native|firestick|browser" central-server/src/scripts/full-schema.sql &amp;&amp; grep -q "v4.0 DATA-02" central-server/src/scripts/full-schema.sql</automated>
  </verify>
  <acceptance_criteria>
    - `central-server/src/scripts/full-schema.sql` contient le COMMENT mis à jour avec `receiver?: {kind: pi_native|firestick|browser`
    - `central-server/src/scripts/full-schema.sql` mentionne `v4.0 DATA-02` (traçabilité)
    - La colonne `displays jsonb` reste nullable (`grep "displays jsonb"` ne contient pas `NOT NULL`)
    - Aucune nouvelle table n'est ajoutée au schema
  </acceptance_criteria>
  <done>
    Le snapshot bootstrap reflète la nouvelle forme du JSONB. Convention CLAUDE.md (alerts-dedup.md) respectée : full-schema.sql synchro avec la migration.
  </done>
</task>

</tasks>

<verification>
1. Migration syntaxiquement valide : `psql --dry-run` non disponible, mais grep des constructs SQL clés (jsonb_agg, jsonb_build_object, NOT (e ? 'receiver')).
2. Migration idempotente : la 2e exécution sur les mêmes rows est un no-op (la condition WHERE garantit qu'aucun row déjà backfillé n'est retouché).
3. TS strict : `cd central-server && npx tsc --noEmit` doit passer sans erreur.
4. Tests Joi : `npx jest --testPathPattern='validation/display-receiver.validation'` → 6 verts.
5. Snapshot synchro : `full-schema.sql` reflète le nouveau COMMENT.
6. Smoke ciblé : `npm run test:smoke:smart` (depuis racine) — détecte les fichiers modifiés et lance les suites pertinentes (smoke-server-core, smoke-wiring).
</verification>

<success_criteria>
- DATA-01 satisfait : `DisplayConfig.receiver` typé strict avec union `pi_native|firestick|browser` + Joi validator (3 tests verts spécifiques).
- DATA-02 satisfait : migration idempotente, HDMI #0 backfillé en `pi_native`, autres displays préservés sans intervention manuelle.
- Aucune nouvelle table créée, aucune nouvelle colonne SQL séparée — extension pure du JSONB existant.
- full-schema.sql à jour (convention CLAUDE.md alerts-dedup.md).
- Site NLF + RACC (en prod) restent fonctionnels après application : tous les displays existants restent valides, le champ `receiver` est optionnel.
</success_criteria>

<output>
After completion, create `.planning/phases/04-data/04-data-01-SUMMARY.md` documenting:
- Migration filename + safe properties (idempotent, backfill HDMI #0)
- Type extension shape (DisplayReceiver interface)
- Joi validator coverage (6 cases)
- Files modified list
- Confirmation full-schema.sql updated
</output>
