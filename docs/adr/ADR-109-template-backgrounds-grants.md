# ADR-109 : Template Studio v2 — backgrounds couleur et grants par user

**Date** : 2026-04-30
**Statut** : Proposé
**Décideurs** : Gwenvael (Lead Dev), Daisy (Product)
**Remplace** : —
**Remplacé par** : —

---

## Contexte

Le chantier templates JOUEUR (PR #757) fait émerger un nouveau besoin : permettre au super_admin de **fournir des backgrounds couleur** (WebM alpha de fonds animés) que les utilisateurs peuvent sélectionner dans le studio comme fond de leurs clips.

**Exigence métier explicite** (réponse Daisy 30/04) :

> « C'est le super admin qui les ajoute et qui leur donne un nom. Il peut également en rendre disponible que pour un certain nombre de user. »

**Exemples concrets** :

- Background public **`BLEU`** (générique, code hexa `#1A4FCC`) → visible par tous les users
- Background **`LANESTER`** (couleur club, hexa `#005CAB`) → visible uniquement par les users du club Lanester
- Background **`NLF-ORANGE`** → visible uniquement par les users NLF (Premium)

**Contraintes** :

- **Réutiliser le pattern existant** : ADR-082 (Video Club Grants) a déjà introduit la mécanique grants user_id pour les vidéos partagées entre clubs. Cohérence forte attendue.
- **Phase 2** : l'implémentation peut être différée mais le **schéma DB** doit être posé maintenant pour ne pas bloquer la phase 1 (templates JOUEUR sans backgrounds dynamiques).
- **Performance** : la liste des backgrounds visibles d'un user doit être calculée en O(1 query) côté API.
- **Pas de notion de "rôle"** : Daisy a explicitement dit "user" (pas "rôle" ou "site"). Plus simple, plus granulaire, plus aligné avec ADR-082.

## Décision

Modèle **2 tables** :

1. `template_backgrounds` — catalogue des fonds disponibles (uploads super_admin)
2. `template_backgrounds_grants` — table de jointure user_id ↔ background_id (visibilité restreinte)

Avec **politique implicite** : un background sans grant est **public** (visible par tous), un background avec ≥ 1 grant est **restreint** (visible uniquement aux users listés).

### 2.1 Schéma DB

```sql
CREATE TABLE template_backgrounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,                  -- ex: "BLEU", "LANESTER", "NLF-ORANGE"
  hex_color TEXT NOT NULL,                    -- ex: "#1A4FCC" (pour preview UI)
  webm_url TEXT NOT NULL,                     -- chemin FTP du WebM alpha
  duration_ms INTEGER,                        -- durée du WebM (mesure auto à l'upload)
  is_public BOOLEAN NOT NULL DEFAULT true,    -- false = backgrounds restreints (≥ 1 grant requis)
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ                     -- soft delete (cf. §2.3)
);

CREATE INDEX idx_template_backgrounds_public ON template_backgrounds (is_public) WHERE archived_at IS NULL;

-- Grants user-level (cf. ADR-082)
CREATE TABLE template_backgrounds_grants (
  background_id UUID NOT NULL REFERENCES template_backgrounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (background_id, user_id)
);

CREATE INDEX idx_tbg_user ON template_backgrounds_grants (user_id);
```

**Différence avec ADR-082** : pas de notion `usage_only` (= droit d'utiliser sans pouvoir supprimer) car ici les users ne peuvent jamais supprimer un background (c'est un asset super_admin partagé).

### 2.2 Politique de visibilité

```sql
-- Liste des backgrounds visibles par user X
SELECT b.* FROM template_backgrounds b
WHERE b.archived_at IS NULL
  AND (
    b.is_public = true
    OR EXISTS (
      SELECT 1 FROM template_backgrounds_grants g
      WHERE g.background_id = b.id AND g.user_id = $1
    )
  );
```

| `is_public` | Grants count | Qui voit ? |
|-------------|--------------|------------|
| `true` | 0 | Tous |
| `true` | ≥ 1 | Tous (les grants sont ignorés, le flag public prime) |
| `false` | 0 | Personne (= soft archived) |
| `false` | ≥ 1 | Uniquement les users avec grant |

**Choix** : le flag `is_public` est **explicite** plutôt qu'implicite (ne pas dériver "public si aucun grant"). Raison : permettre à super_admin de pré-créer des backgrounds restreints sans grant initial (puis ajouter des grants progressivement) sans qu'ils soient temporairement publics.

### 2.3 Cycle de vie

1. **Upload** : super_admin POST `/api/templates/backgrounds` avec WebM + name + hex_color + is_public
2. **Grant** : super_admin POST `/api/templates/backgrounds/:id/grants` avec liste de user_ids
3. **Revoke** : DELETE `/api/templates/backgrounds/:id/grants/:user_id`
4. **Archive** : PATCH `/api/templates/backgrounds/:id` avec `archived_at = NOW()` (soft delete, préserve les clips déjà rendus)
5. **Hard delete** : impossible si ≥ 1 clip en base le référence (FK protection)

### 2.4 API endpoints

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| `GET` | `/api/templates/backgrounds` | user | Liste filtrée par grants (cf. §2.2) |
| `GET` | `/api/templates/backgrounds/:id` | user | Détail si visible |
| `POST` | `/api/templates/backgrounds` | super_admin | Upload + create |
| `PATCH` | `/api/templates/backgrounds/:id` | super_admin | name, is_public, archived_at |
| `DELETE` | `/api/templates/backgrounds/:id` | super_admin | Hard delete (refusé si utilisé) |
| `POST` | `/api/templates/backgrounds/:id/grants` | super_admin | Bulk grant `{ user_ids: [...] }` |
| `GET` | `/api/templates/backgrounds/:id/grants` | super_admin | Liste des users avec grant |
| `DELETE` | `/api/templates/backgrounds/:id/grants/:user_id` | super_admin | Revoke |

## Alternatives Considérées

### 1. Grants par rôle (operator, club, agency...)

**Avantages** : moins de rows, configuration globale.
**Inconvénients** :
- Granularité trop large : "les users du club Lanester" n'est pas un rôle, c'est un user_id list.
- Daisy a explicitement dit "user", pas "rôle".

**Verdict** : Rejeté.

### 2. Grants par site (`site_id` plutôt que `user_id`)

**Avantages** : aligné avec la structure multi-tenant (1 site = 1 club).
**Inconvénients** :
- Un user agency peut gérer plusieurs sites mais a 1 seul user_id → grants par user permet de couvrir le cas multi-clubs naturellement.
- ADR-082 a déjà tranché en faveur de user_id, cohérence > optimisation.

**Verdict** : Rejeté — cohérence avec ADR-082 prime.

### 3. Grants par user_id (choisie) ✅

**Avantages** :
- Cohérent avec ADR-082 (Video Club Grants)
- Granularité maximale
- Réponse explicite Daisy
- Pattern repo connu

**Inconvénients** :
- Plus de rows si beaucoup de grants (acceptable, ~100 users × 10 backgrounds restreints = 1000 rows)
- Pas de "groupement" (mitigation : endpoint bulk grant qui prend une liste)

**Verdict** : Accepté.

### 4. Tags / Catégories au lieu de grants

**Avantages** : flexibilité, taxonomie partagée.
**Inconvénients** : ne résout pas la visibilité restreinte (faut quand même un mécanisme d'accès).

**Verdict** : Hors scope (peut s'ajouter en complément plus tard si besoin de filtres UX).

## Conséquences

### Positives

1. **Pattern réutilisable** : même modèle pour grants sur futures features (templates restreints, polices club-specific, etc.).
2. **Cohérence ADR-082** : un dev qui connaît les video grants comprend immédiatement les background grants.
3. **Pas de breaking change** : les templates JOUEUR phase 1 fonctionnent sans backgrounds (le slot couleur est ignoré tant que la table est vide).
4. **Preview UI simple** : `hex_color` permet d'afficher un swatch couleur sans télécharger le WebM.

### Négatives

1. **Coût DB** : table de jointure peut grossir (mitigé par index `user_id`).
2. **UI super_admin à construire** : panel de gestion grants (drag & drop users, bulk action). Cf. plan d'action §2.
3. **Risque oubli grant** : super_admin upload un background restreint mais oublie d'ajouter des grants → personne ne le voit. Mitigation : warning UI "0 user a accès, ce background est invisible".

### Risques

| Risque | Mitigation |
|--------|------------|
| Super_admin upload un WebM sans canal alpha | Validator côté API (`require_alpha` détecté via libwebp) |
| Un background public devient sensible (ex. couleur d'un sponsor en exclu) | `PATCH is_public = false` puis ajout grants |
| Suppression user → orphelins dans grants | `ON DELETE CASCADE` côté `user_id` |
| Sync-agent Pi cache une vieille liste de backgrounds | Invalidation au push de nouveau background (event WS) |

## Plan d'implémentation

### Phase 1 — Migration DB (incluse dans la PR ADR-108)

1. Migration `add-template-backgrounds-and-grants.sql` (cf. §2.1)
2. Repository `templateBackgroundsRepository` avec méthodes :
   - `listForUser(userId)` (cf. §2.2)
   - `create(name, hex, webm_url, is_public, uploaded_by)`
   - `grant(background_id, user_ids[], granted_by)`
   - `revoke(background_id, user_id)`
   - `archive(background_id)`

### Phase 2 — API (1 PR, peut être différée à la phase 2 du roadmap)

1. Controller + routes (cf. §2.4)
2. Validation Joi (name unique, hex valide, WebM alpha)
3. Tests Jest + smoke `smoke-template-backgrounds-grants.test.ts`

### Phase 3 — UI super_admin (1 PR)

1. Composant `<app-template-backgrounds-manager>` : liste + upload + grants
2. Composant `<app-grant-editor>` : recherche users + bulk add/remove
3. Sélecteur côté user : `<app-background-picker>` filtré par grants

### Critères de validation

- [ ] Migration sans casse : tables créées, contraintes FK OK
- [ ] User sans grant ne voit pas un background restreint dans `GET /api/templates/backgrounds`
- [ ] User avec grant voit le background restreint
- [ ] Soft delete préserve les clips déjà rendus
- [ ] Bulk grant 50 users en 1 requête fonctionne (perf < 500ms)
- [ ] UI super_admin permet d'auditer : "Qui a accès au background X ?"

## Références

- ADR-082 — Video Club Grants (pattern source)
- ADR-086 — Template Studio n-layers
- [ADR-108](ADR-108-template-versioning-and-master-locking.md) — Versioning des templates (couplé)
- [PR #757](https://github.com/Tallec7/neopro/pull/757) — SPEC famille JOUEUR
- [JOUEUR-SPEC-GLOBAL.md §5.3](../templates/JOUEUR-SPEC-GLOBAL.md) — exigence visibilité backgrounds
- [JOUEUR-ACTION-PLAN.md §3.1](../templates/JOUEUR-ACTION-PLAN.md) — plan d'implémentation
