# ADR-108 : Template Studio v2 — versioning et verrouillage des masters

**Date** : 2026-04-30
**Statut** : Proposé
**Décideurs** : Gwenvael (Lead Dev), Daisy (Product)
**Remplace** : —
**Remplacé par** : —

---

## Contexte

Le Template Studio v2 (ADR-086, ADR-095) permet à un super_admin de créer des templates Remotion data-driven (rows DB + assets WebM) consommés par les sites Pi et SaaS pour produire des clips vidéo (présentations joueur, animations buts, etc.).

**Problème actuel** :

1. Les templates sont **mutables en place**. Une modif d'un champ par super_admin (position d'un slot, durée d'un layer, font_size d'un texte) impacte **immédiatement** tous les sites qui consomment ce template.
2. Aucun mécanisme de **rollback** : si une modif casse le rendu, on doit re-modifier en urgence, sans état stable de référence.
3. Aucun **audit trail** : on ne sait pas qui a modifié quoi quand.
4. Le chantier templates JOUEUR (PR #757, avril 2026) a fait émerger l'exigence métier explicite (réponse Daisy 30/04) :
   > « J'aimerais un verrou supplémentaire côté super admin pour modifier les templates existants, l'idée est de ne pas casser la base qu'on va développer. »

**Contraintes** :

- **Templates en prod** : NLF + démos consomment déjà des templates (BUT Simple, BUT Img Joueur V2). Toute migration doit être backward-compatible.
- **Performance** : la résolution `template_id@version` côté runtime ne doit pas ajouter de latence sur le rendu Pi (déjà coûteux).
- **Simplicité dev** : le workflow super_admin doit rester intuitif (pas de complexité Git-like).

## Décision

Adopter un **modèle de versioning sémantique** des templates, avec **lock implicite** au passage en `published` et **fork explicite** pour modifier un template publié.

### 2.1 Schéma DB

```sql
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS parent_template_id UUID REFERENCES templates(id);

-- Snapshot d'une version publiée (immutable)
CREATE TABLE template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  layers_snapshot JSONB NOT NULL,
  text_fields_snapshot JSONB NOT NULL,
  image_slots_snapshot JSONB NOT NULL,
  fonts_snapshot JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_by UUID NOT NULL REFERENCES users(id),
  UNIQUE (template_id, version)
);

CREATE INDEX idx_template_versions_template_version ON template_versions (template_id, version);
```

**Conventions** :

- `version` est en **semver** : `MAJOR.MINOR` (`1.0`, `1.1`, `2.0`). Pas de patch.
- `MAJOR` change pour breaking changes (suppression slot, changement contrat utilisateur).
- `MINOR` change pour ajouts compatibles (nouveau slot optionnel, ajustement positions).
- Les **slugs sont immutables** : `joueur-simple` reste `joueur-simple` à travers les versions.

### 2.2 Cycle de vie

```
[draft] ─publish──> [published, locked]
   ▲                       │
   │                       │ fork (modif)
   └──nouvelle ver.────────┘
```

| État        | Mutable ?              | Servi à la production ?  |
| ----------- | ---------------------- | ------------------------ |
| `draft`     | ✅ par super_admin     | ❌                       |
| `published` | ❌ (immutable, locked) | ✅                       |
| `archived`  | ❌                     | ❌ (rollback uniquement) |

**Workflow super_admin** :

1. Créer template → status `draft`, version `1.0`
2. Itérer (modif slots/layers libres tant qu'en draft)
3. Validation acceptance (cf. SPEC §7.3) → `POST /api/templates/:id/publish`
4. Backend : copie l'état actuel dans `template_versions` (snapshot immutable) + passe `status = 'published'`
5. **Verrou implicite** : toute modif post-publish renvoie HTTP 409 Conflict sauf via fork
6. Pour modifier : `POST /api/templates/:id/fork?next=1.1` → crée un nouveau template `parent_template_id` pointant sur l'ancien, status `draft`, version `1.1`
7. Validation du fork → publish → la nouvelle version devient la **default_version** du slug

### 2.3 Résolution côté runtime

**Sites consommateurs référencent une version explicite** :

```sql
ALTER TABLE site_templates_used
  ADD COLUMN IF NOT EXISTS template_version TEXT NOT NULL DEFAULT '1.0';
```

Au moment du rendu (Pi ou SaaS) :

```typescript
// templateStudioRepository.findByIdAndVersion(templateId, version)
// → lit template_versions, pas templates (immutable)
const tpl = await templateStudioRepository.findVersion(templateId, version);
```

**Politique par défaut** : un site qui ne précise pas `template_version` pointe sur la `default_version` (= la dernière `published` du template). Le super_admin peut **épingler** un site sur une version spécifique (rollback ou freeze).

### 2.4 Rollback

Trois scénarios :

| Scénario                             | Action                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Bug détecté en prod sur v1.1         | `PATCH /api/templates/:id/default-version` → `1.0` (immédiat)             |
| Site spécifique veut figer v1.0      | `PATCH /api/sites/:id/templates/:tpl-id` → `pinned_version: 1.0`          |
| Suppression définitive d'une version | `DELETE /api/templates/:id/versions/1.1` (refusé si ≥ 1 site la consomme) |

## Alternatives Considérées

### 1. Flag `locked` simple

**Avantages** : simple, 1 colonne, peu de code.
**Inconvénients** :

- Pas d'audit trail
- Pas de rollback (sauf restore PostgreSQL backup)
- Si super_admin déverrouille pour modifier, les sites consomment immédiatement la nouvelle version → casse possible
- Pas de coexistence multi-versions (impossible de tester v1.1 sur 1 site avant rollout)

**Verdict** : Rejeté — le risque "déverrouille + modifie + casse prod" est précisément ce que Daisy veut éviter.

### 2. Versioning semver explicite (choisie) ✅

**Avantages** :

- Sites en prod immutables (chaque version `published` est figée)
- Rollback en 1 commande SQL (`UPDATE default_version`)
- Audit trail natif (table `template_versions`)
- Coexistence multi-versions possible (NLF sur v1.0 stable, démo sur v1.1 en test)
- Pattern connu (semver, npm, Docker tags)

**Inconvénients** :

- Plus de boulot moteur initial (résolution `template_id@version` côté runtime)
- Snapshots JSONB → DB plus volumineuse (mitigé par GZIP de PostgreSQL)
- Workflow super_admin plus complexe (étape "fork" explicite)

**Verdict** : Accepté — l'inconvénient principal (complexité workflow) est compensé par un UI assistant (fork = bouton "Modifier ce template" qui crée la v+1 automatiquement).

### 3. Git-like (branches, merge, conflicts)

**Avantages** : flexibilité maximale.
**Inconvénients** : sur-ingénierie, courbe d'apprentissage super_admin, pas de cas d'usage merge en pratique.

**Verdict** : Rejeté — over-engineering, on ne fait pas de collaboration parallèle sur les templates.

## Conséquences

### Positives

1. **Verrou métier respecté** : impossible de casser un template en prod par accident.
2. **Rollback en 1 clic** : si v1.1 régresse, retour à v1.0 immédiat.
3. **Tests en prod safe** : on peut publier v1.1 et l'épingler sur 1 seul site démo avant rollout flotte.
4. **Audit trail** : on sait qui a publié quoi quand (`published_by`, `published_at`).
5. **Pattern réutilisable** : même mécanisme pour futurs templates (sponsors, alertes, etc.).

### Négatives

1. **Migration DB non triviale** : tous les templates existants doivent être backfillés en `version = '1.0', status = 'published'` + snapshot dans `template_versions`.
2. **Storage** : les snapshots JSONB doublent l'empreinte DB des templates (acceptable, ~10 KB/template × 50 templates = 500 KB).
3. **Cognitive load super_admin** : nouveau workflow "fork" à apprendre. Mitigé par UI assistant.
4. **Repository pattern** : `templateStudioRepository.findVersion()` à ajouter, `findById()` reste pour les drafts.

### Risques

| Risque                                                         | Mitigation                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Migration backfill casse les templates en prod                 | Migration testée sur staging + dry-run en local + rollback script |
| Sites Pi cachent une vieille version qui n'existe plus en DB   | Sync-agent invalide le cache au push de nouvelle version          |
| Super_admin oublie de fork et bloque sur 409 Conflict          | Erreur explicite + bouton "Forker en v1.1" dans le toast          |
| Perfs : JOIN supplémentaire `template_versions` à chaque rendu | Index sur `(template_id, version)` + cache 5 min côté API         |

## Plan d'implémentation

### Phase 1 — Migration DB (1 PR)

1. Migration `add-template-versioning.sql` (cf. §2.1)
2. Backfill : tous les templates existants → `status = 'published'`, `version = '1.0'`, snapshot dans `template_versions`
3. Smoke test `smoke-template-versioning.test.ts` (vérifie qu'aucun INSERT n'omet `version`)

### Phase 2 — Repository + API (1 PR)

1. `templateStudioRepository.findVersion(templateId, version)` lit `template_versions`
2. `templateStudioRepository.findDefaultVersion(templateId)` (= la dernière publiée)
3. Endpoint `POST /api/templates/:id/publish` (snapshot + lock)
4. Endpoint `POST /api/templates/:id/fork?next=1.1` (clone draft)
5. Endpoint `PATCH /api/templates/:id/default-version` (rollback)
6. Tests Jest

### Phase 3 — Runtime resolution (1 PR)

1. `templates-remotion/src/runtime/TemplateRuntime.tsx` lit la version épinglée du site
2. Cache 5 min des versions résolues
3. Smoke test E2E render avec 2 versions coexistantes

### Phase 4 — UI super_admin (1 PR)

1. Composant `<app-template-version-manager>` : liste versions, default, sites consommateurs
2. Bouton "Modifier" sur template `published` → modal fork explicite
3. Bouton "Rollback" → confirm dialog + PATCH default_version

### Critères de validation

- [ ] Migration backfill : `SELECT COUNT(*) FROM template_versions` = `SELECT COUNT(*) FROM templates`
- [ ] Smoke test refuse `INSERT INTO templates ...` sans version
- [ ] Tentative de modifier un template `published` → 409 Conflict
- [ ] Fork v1.0 → v1.1 : nouveau template draft, parent_template_id correct
- [ ] Rollback v1.1 → v1.0 sur un site : prochain rendu utilise v1.0
- [ ] Aucun template existant ne change de comportement après migration

## Références

- ADR-086 — Template Studio n-layers, safe-zones, animations réversibles
- ADR-095 — Template Studio admin UX v2
- [PR #757](https://github.com/Tallec7/madxp/pull/757) — SPEC famille JOUEUR (déclencheur)
- [JOUEUR-SPEC-GLOBAL.md §5](../templates/JOUEUR-SPEC-GLOBAL.md) — exigence verrouillage masters
- [JOUEUR-ACTION-PLAN.md §2.1](../templates/JOUEUR-ACTION-PLAN.md) — plan d'implémentation
- semver.org — convention de versioning
