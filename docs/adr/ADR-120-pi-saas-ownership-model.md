# ADR-120 : Modèle d'ownership Pi vs SaaS — `:8080` à parité, sync bidirectionnel 3-way merge

**Date** : 2026-05-14
**Statut** : Proposé
**Décideurs** : Daisy
**Amende** : ADR-001 (autonomie locale rappelée), ADR-114 (displays write-through, à inverser pour `site_type = 'pi'`), ADR-116 (cloud-wins implicite à remplacer par 3-way merge pour `site_type = 'pi'`)
**ADR liées** : ADR-121 (proposé, fix drift `video_variants`)

---

## Contexte

### Le positionnement produit n'est pas encodé dans le code

L'offre **Pi** est explicitement vendue comme "TV interactive sans dépendance internet en live". Un Pi a besoin d'internet uniquement pour :

- **Bootstrap initial** : provisioning, premier sync config + vidéos, enrôlement flotte
- **Reconnexion minimum mensuelle** (garde-fou applicatif) : push analytics accumulées, pull MAJ config queueées, OTA si dispo

Entre deux reconnexions, le Pi est conçu pour fonctionner en pleine autonomie. C'est la promesse différenciante vs l'offre **SaaS** (qui suppose internet permanent, ADR-037).

Deux UIs cohabitent volontairement, pour deux personae distinctes :

| UI | Persona | Connectivité | Usage typique |
|---|---|---|---|
| **Central dashboard** | Super admin / operator / advertiser distant | Toujours en ligne | Push content vers la flotte, support distant, multi-sites, analytics, abonnements. **Pas d'accès physique aux Pi.** |
| **`:8080`** (admin Pi local) | Opérateur ON-SITE au club | Pi possiblement offline | Config locale, debug, profils, sponsors, vidéos locales, diag réseau, switch club. |

### Symptôme : couches accumulées d'un seul côté

Les ADRs récentes touchant la config Pi (ADR-114 displays write-through, ADR-116 preview diff baseline, ADR-117 auto-deploy vidéos sur save config) ont été implémentées **uniquement côté central** sans contrepartie `:8080`. Aucune PR depuis février 2026 ne touche simultanément `central-dashboard/` et `raspberry/admin/routes/`.

Inventaire factuel `:8080` au 2026-05-14 (`raspberry/admin/routes/`, 13 fichiers, 67 routes) :

| Domaine | `:8080` (local) | Central (cloud) |
|---|---|---|
| Catégories | ✅ CRUD complet | ✅ CRUD |
| Time-categories | ✅ CRUD complet | ✅ CRUD |
| Sponsors | ✅ CRUD complet | ✅ CRUD |
| Vidéos locales | ✅ upload/edit/delete filesystem | ✅ upload FTP + déploiement |
| **Profils** | ⚠️ read-only + switch (3 routes) | ✅ CRUD complet |
| **Displays / receivers** | ❌ aucune route CRUD | ✅ write-through (ADR-114) |
| **Variants vidéo** | ❌ aucune route | ✅ via `video_variants` (drift actif, voir ADR-121) |
| **Push-back état Pi → cloud** | ❌ sync-agent push uniquement métriques/state, pas la config modifiée localement | n/a |

### Stockage actuel — état des lieux

**Côté Pi** : 100 % filesystem JSON, **aucune DB**.
- `webapp/configuration.json` (config active mergée)
- `webapp/profiles/{id}.json` (un par profil)
- `webapp/profiles/active-profile` (marqueur)
- Services Express (`raspberry/admin/services/`) lisent/écrivent avec écriture atomique (`.tmp` + rename)

**Côté cloud** : PostgreSQL Railway (1 seule DB, ADR-070), avec déjà 3 colonnes pertinentes sur `sites` :
- `local_config_mirror` (JSONB) — miroir cloud-side de la `configuration.json` du Pi
- `local_config_hash` — hash de change detection
- `last_config_sync` — timestamp dernier sync

Et `config_profiles.configuration` (JSONB) = config officielle cloud.

⚠️ **Limitation actuelle** (mémoire `feedback_diff_baseline_mismatch_multi_profile`) : `local_config_mirror` est par site, pas par profil. Sur sites multi-profils, il reflète uniquement le profil ACTIF Pi (TV). Le 3-way merge nécessitera de passer en per-profil.

### Conséquences pratiques

Un super admin sur place, sans internet :

1. Ne peut pas **ajouter un 3ᵉ profil club** au Pi multi-clubs (CRUD profil = cloud-only)
2. Ne peut pas **assigner un receiver** (Fire Stick, Chromecast, Pi-LAN-display) à un display (ADR-114 cloud-only)
3. Modifie cat/sponsors via `:8080` → ses modifs sont **écrasées au prochain `sync_profiles`** parce que ADR-116 cloud-wins, et parce que le sync-agent ne push jamais la config locale vers cloud → cloud ignore que ces modifs existent

### Ce qui existe déjà côté infra

- `central-server/src/services/command-queue.service.ts` : `sendOrQueue()` + table `pending_commands`. 11 `REALTIME_ONLY_COMMANDS`, tout le reste queueable. Badge `⏳ En attente de confirmation du Pi` dans dashboard.
- `raspberry/sync-agent/src/agent.js` push déjà métriques, état connexion, analytics events.
- ADR-001 : "autonomie locale, command queue pour offline" — modèle Pi-first **jamais inversé**, juste partiellement oublié.

---

## Décision

### 1. Matrice d'ownership par champ (`site_type = 'pi'`)

| Champ | Source de vérité | Sens du sync | Notes |
|---|---|---|---|
| `categories` | **Pi** (`configuration.json`) | Pi → cloud au resync (push-back) | Partagé : conflits possibles, gérés via 3-way merge §3 |
| `sponsors` | **Pi** (`configuration.json.sponsors`) | Pi → cloud au resync | Idem |
| `timeCategories` | **Pi** (`configuration.json`) | Pi → cloud au resync | Idem |
| `displays` (assignation receivers) | **Pi** (`configuration.json.displays`) | Pi → cloud au resync | Inverse ADR-114 pour `site_type = 'pi'` |
| `video_variants` (par display) | **Cloud** (`video_variants` table) | Cloud → Pi via `deploy_video` | Drift actif, opérationnel après ADR-121. Hors scope ADR-120. |
| `profiles/{id}.json` (contenu : cats/sponsors/temps/vidéos) | **Pi** (filesystem) | Pi → cloud au resync | Idem |
| `profiles` métadonnées (name, sport, city, is_default) | **Cloud** (`config_profiles` row) | Cloud → Pi au resync | Partage profil = subtil ; doc explicite dans `admin-pi-local.spec.md` |
| `active-profile` (marqueur) | **Pi** | Pi → cloud informatif | Sert au dashboard pour savoir "quel profil joue ?" |
| Vidéos (référentiel + fichiers FTP) | **Cloud** (`videos` + FTP) | Cloud → Pi via `deploy_video` | Inchangé |
| `api_key`, `hotspot.wifi_psk_encrypted` | **Cloud** (ADR-074) | Cloud → Pi | Inchangé |
| `analytics` / `video_plays` | **Pi** (collecte) → **cloud** (agrégation) | Pi → cloud au resync mensuel | Inchangé |

**Pour les sites `site_type = 'saas'`** : ADR-116 cloud-wins reste **inchangé**. Le SaaS n'a pas de `:8080`, le cloud est légitimement source de vérité.

### 2. `:8080` à parité pour les champs Pi-owned

Mise à parité des routes manquantes :

- `POST /api/profiles` — créer un profil local (write `profiles/{id}.json` + ajout dans `clubs.json`)
- `PUT /api/profiles/:id` — éditer un profil local
- `DELETE /api/profiles/:id` — supprimer un profil local (garde-fou : refuser si profil actif)
- `POST /api/displays/:idx/assign` — assigner un receiver à un display (write `configuration.json.displays`)
- `DELETE /api/displays/:idx/assign` — révoquer
- `GET /api/conflicts` — lister les conflits actifs (read-only depuis `:8080`)

Toutes les routes existantes restent inchangées.

### 3. Sync bidirectionnel — Modèle C 3-way merge

#### 3.1 Versions stockées

Pour chaque profil de chaque site `site_type = 'pi'`, le cloud stocke **3 versions JSONB** :

| Version | Stockage cloud-side | Mise à jour |
|---|---|---|
| **Baseline** | `sites.local_config_baseline` (JSONB, nouvelle colonne, **par profil**) | Au dernier sync RÉSOLU (= état accordé Pi/cloud) |
| **Pi version** | `sites.local_config_mirror` (JSONB existant, à migrer **par profil**) | À chaque push-back Pi |
| **Cloud version** | `config_profiles.configuration` (JSONB existant) | À chaque édition via central dashboard |

⚠️ **Migration obligatoire** : `local_config_mirror` aujourd'hui = 1 par site (= profil actif uniquement). Doit devenir 1 par profil. Sinon le 3-way merge faussera les diffs sur sites multi-profils (cf. mémoire `feedback_diff_baseline_mismatch_multi_profile`).

Format proposé après migration : `{ [profileId]: { configuration: {...}, last_sync_at: timestamp } }`.

#### 3.2 Endpoint push-back Pi → cloud

`POST /api/sites/:id/pi-config-sync` (REST, cohérent avec heartbeat/analytics existants).

Payload :
```json
{
  "profiles": {
    "<profileId>": {
      "configuration": { /* contenu profile JSON */ },
      "hash": "sha256:...",
      "last_local_edit_at": "2026-04-15T14:32:00Z"
    }
  },
  "active_profile_id": "<id>",
  "displays": [...]
}
```

Authentifié via `api_key` du site (déjà en place).

#### 3.3 Algorithme 3-way merge (par champ partagé)

Pour chaque champ partagé (cf. matrice §1) :

| Cas | Baseline | Pi | Cloud | Action |
|---|---|---|---|---|
| 1 | `X` | `X` | `X` | No-op |
| 2 | `X` | `Y` | `X` | Pi seul → auto-apply : cloud ← Y, baseline ← Y |
| 3 | `X` | `X` | `Y` | Cloud seul → auto-apply : Pi recevra Y au prochain pull, baseline ← Y |
| 4 | `X` | `Y` | `Y` | Both → même valeur, auto-merge : baseline ← Y |
| 5 | `X` | `Y` | `Z` | **CONFLIT** : créer row `config_conflicts` |
| 6 | `X` | `null` | `null` | Auto-merge delete : baseline ← null |
| 7 | `X` | `null` | `Z` | **CONFLIT** : delete vs preserve |
| 8 | `X` | `Y` | `null` | **CONFLIT** : preserve vs delete |
| 9 | `null` | `Y` | `Z` | **CONFLIT** : both-create |

#### 3.4 Storage des conflits

Nouvelle table :
```sql
CREATE TABLE config_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  field_key TEXT NOT NULL,          -- 'categories', 'sponsors.<idx>', etc.
  baseline_value JSONB,
  pi_value JSONB,
  cloud_value JSONB,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution TEXT,                  -- 'keep_pi' | 'keep_cloud' | 'merge'
  resolved_value JSONB,
  UNIQUE(site_id, profile_id, field_key) WHERE resolved_at IS NULL
);
```

#### 3.5 Pendant un conflit non résolu

| Côté | Comportement |
|---|---|
| Pi `configuration.json` | Garde sa version `Y` (Pi-wins par défaut, cohérent avec positionnement offre Pi) |
| DB cloud `config_profiles` | Garde sa version `Z` (pas écrasée par Y) |
| `sync_profiles` cloud → Pi | **Suspendu pour les champs en conflit uniquement**, autres champs syncent normalement |
| Dashboard central | Bannière inline en tête onglet Content : "⚠️ 3 conflits à résoudre" |
| Liste flotte `/sites` | Badge ⚠️ sur la card du site concerné |
| `:8080` admin Pi | Bannière info read-only : "X conflits avec le distant — attente résolution super admin/admin" |

#### 3.6 RLS résolution des conflits

**Autorisés à résoudre** : `super_admin` + `admin` (rôle médian).

Operator, advertiser, agency, club : peuvent voir les conflits du site dont ils sont membres (lecture seule), pas résoudre.

#### 3.7 UI résolution — inline dans onglet Content

Page `/sites/:id` onglet "Contenu", bannière collapsable en tête :

```
⚠️ 3 conflits à résoudre avec le club Stade Lorientais        [▼]
─────────────────────────────────────────────────────────────────
Catégories — différence détectée
  Version locale (Pi, 2026-04-15)  : Sevens, U17, U19, Seniors
  Version distante (vous, 04-22)   : U17, U19, Seniors, Femmes
  Baseline (sync 2026-04-01)       : U17, U19, Seniors
  Diff sémantique : local ajouté "Sevens" — distant ajouté "Femmes"
  [Garder local] [Garder distant] [Merger union]

Sponsor "Lidl" — URL différente
  Version locale  : https://lidl.fr/club-lorient
  Version distante: https://lidl.fr/promo-fev
  [Garder local] [Garder distant]

Profil "FC Lorient" — nom différent
  Version locale  : SAR Lorient
  Version distante: Stade Lorientais
  [Garder local] [Garder distant]
```

L'action "Merger union" est proposée uniquement pour les champs où le merge sémantique est défini (listes, sets). Pas pour scalaires.

Après résolution :
- Cloud écrit la valeur résolue dans `config_profiles.configuration` ET `local_config_baseline`
- Cloud queue une commande `apply_resolution` pour le Pi → reçue au prochain ping
- Row `config_conflicts.resolved_at` set, `resolution` set
- Bannière disparaît une fois 0 conflit actif

### 4. Anti-pattern ADR-116 cloud-wins — suspendu pour Pi

ADR-116 `mergeCategories` zeroing avant switch profil → **reste valable** (c'est un fix de bug d'accumulation interne au switch, pas du cloud-wins au sens strict).

Le **cloud-wins au resync** implicite (cloud pousse `sync_profiles` et écrase la config Pi) → **suspendu pour `site_type = 'pi'`** dès que Phase 5 est en place. Tant que Phase 5 n'est pas livrée, comportement actuel maintenu pour éviter régression silencieuse.

### 5. Garde-fou mensuel — hors scope

Le garde-fou applicatif "alerter si Pi non vu depuis N jours" est traité dans une spec séparée (`pi-connectivity-model.spec.md`, à créer en Phase 1 docs). ADR-120 prend pour acquis qu'il existe ou existera.

---

## Alternatives considérées

### 1. Inverser totalement le modèle (cloud = pur miroir d'admin distante)

**Avantages** : cohérent avec marketing offline-first.
**Inconvénients** : casse l'offre SaaS (cloud-as-master), 4-6 semaines minimum, plusieurs ADRs successives.
**Verdict** : Rejeté — Pi et SaaS ont des contraintes différentes, un modèle unique inadapté.

### 2. Flag `localOverrides: true` par site

**Avantages** : 1 semaine, fix immédiat.
**Inconvénients** : contredit ADR-116 sans la remplacer, 2ᵉ couche implicite, dette qui explose. Ne résout pas les routes `:8080` manquantes.
**Verdict** : Rejeté — pansement.

### 3. Last-Write-Wins (timestamps)

**Avantages** : très simple à implémenter (~1 jour).
**Inconvénients** : drift NTP entre Pi et cloud → "le futur écrase le passé". Ne respecte pas l'intention. Frustrant pour l'opérateur terrain.
**Verdict** : Rejeté — fragile en pratique.

### 4. Modèle B+ (ownership matrix + superseded log sans 3-way merge)

**Avantages** : ~5 jours, plus simple que C.
**Inconvénients** : super admin perd ses modifs sans recours visuel (juste notif), pas de pérennité, migration B+ → C ultérieure coûteuse (~1 j de backfill baseline).
**Verdict** : Rejeté en faveur de C direct, conforme demande "construire pérenne".

### 5. Matrice d'ownership + 3-way merge (choisie) ✅

**Avantages** : cohérent ADR-001, pérenne, UX honnête (conflits visibles), réutilise `local_config_mirror` existant, ~10 jours.
**Inconvénients** : nécessite migration `local_config_mirror` per-profil + nouvelle colonne baseline + nouvelle table `config_conflicts` + UI inline.
**Verdict** : Accepté.

---

## Conséquences

### Positives

1. Un super admin sur place peut gérer profils, displays, sponsors, catégories sans internet → promesse offre Pi tenue.
2. Les modifs locales `:8080` ne sont plus écrasées silencieusement au reconnect mensuel.
3. Le cloud reflète l'état réel de la flotte Pi (push-back) → analytics et support distant plus fiables.
4. Future feature touchant config Pi a une cible claire (matrice §1) → fin des oublis `:8080`.
5. Les conflits sont visibles et résolvables → confiance opérationnelle entre super admin et opérateur sur place.
6. Fix latent du bug `local_config_mirror` per-site (mémoire `feedback_diff_baseline_mismatch_multi_profile`).

### Négatives

1. Effort : ~10 jours réparties sur central-server + raspberry/admin + sync-agent + central-dashboard.
2. Migration `local_config_mirror` per-site → per-profil : backfill nécessaire pour ~50 sites Pi en prod.
3. UI conflits ajoute de la complexité à l'onglet Content (mitigé par bannière collapsable, n'apparaît que s'il y a conflit).
4. Edge case : conflit sur un champ non documenté dans la matrice → fallback Pi-wins par défaut.

### Risques

| Risque | Mitigation |
|---|---|
| Conflit Pi-wins efface une commande cloud légitime sans visibilité | UI inline visible super admin, row `config_conflicts` auditée, jamais d'apply silencieux |
| `pi_config_sync` payload trop gros (~50-200 KB par profil) | gzip natif HTTP + chunking si > 5 MB (peu probable en pratique) |
| Bug push-back corrompt `local_config_mirror` | Schema validation Joi côté `/pi-config-sync`, transaction atomique, smoke test garde-fou |
| Régression silencieuse SaaS pendant refacto | Guard `site_type === 'pi'` strict partout, smoke `smoke-saas` continue de valider cloud-wins SaaS |
| Migration `local_config_mirror` per-profil casse les diffs en cours | Backfill non-destructif : nouvelle structure `{ [profileId]: ... }` ; ancienne lecture supporte les deux formats pendant 1 release ; smoke test du backfill |
| Multiple conflits sur le même champ (Pi reconnecte 2x en peu de temps) | Lock sur `config_conflicts` row par `(site_id, profile_id, field_key)` unique-when-unresolved |

---

## Plan d'implémentation

5 phases atomiques, chacune livrable indépendamment. Estimations **indicatives**, à affiner par phase.

### Phase 1 — Documentation (1-2 j)

1. Publier ADR-120 (ce doc) et ADR-121 stub
2. MAJ `.claude/rules/context.md` : bloc "Modèle de connectivité Pi vs SaaS"
3. MAJ `CLAUDE.md` : 1 ligne dans table routing → "Si tu touches config Pi → ADR-120 + admin-pi-local.spec.md"
4. Élargir `docs/specs/features/admin-pi-local.spec.md` : routes existantes vs manquantes par domaine
5. Créer `docs/specs/services/command-queue.spec.md`
6. Créer `docs/specs/features/pi-connectivity-model.spec.md` (garde-fou mensuel — vérifier d'abord son implémentation actuelle)
7. Compléter `docs/specs/services/sync-agent-displays-write-through.spec.md` avec sens Pi → cloud
8. Annoter ADR-114, ADR-116 d'un lien vers ADR-120 (amendement partiel)

### Phase 2 — `:8080` profils CRUD (2-3 j)

1. Routes `POST /api/profiles` + `PUT /api/profiles/:id` + `DELETE /api/profiles/:id`
2. Service `profile.service.js` étendu (create/edit/delete) avec écriture atomique
3. UI admin Pi (Angular admin panel) : formulaires create/edit/delete
4. Garde-fous : refuser DELETE sur profil actif, valider unicité `id`
5. Smoke test garde-fou
6. Marquer ADR-120 "Accepté" au merge de cette phase

### Phase 3 — `:8080` displays/receivers CRUD (2 j)

1. Routes `POST /api/displays/:idx/assign` + `DELETE /api/displays/:idx/assign`
2. Write atomique `configuration.json.displays` (pattern ADR-114 inversé)
3. UI admin Pi
4. Smoke test

### Phase 4 — Sync bidirectionnel `pi_config_sync` (4-5 j)

1. **Migration DB** : passer `local_config_mirror` de "1 par site" à "1 par profil" (backfill non-destructif)
2. **Migration DB** : ajouter `local_config_baseline` JSONB sur `sites` (per-profil)
3. **Migration DB** : créer table `config_conflicts` + index
4. Côté Pi : module sync-agent calcule hash + POST `/api/sites/:id/pi-config-sync` au reconnect
5. Côté cloud : endpoint authentifié `api_key`, parse payload, validation Joi
6. Moteur 3-way merge (par champ partagé, selon matrice §1)
7. Création des `config_conflicts` rows quand cas 5/7/8/9
8. Cas auto-mergeables (2/3/4/6) appliqués immédiatement, baseline mise à jour
9. Smoke tests des 9 cas

### Phase 5 — UI conflits + suspension ADR-116 cloud-wins (2 j)

1. Dashboard : bannière inline onglet Content (ne s'affiche que si conflits actifs)
2. Page de résolution inline avec actions "Garder local / distant / Merger"
3. Badge ⚠️ sur card site dans liste flotte
4. `:8080` : endpoint `GET /api/conflicts` (read-only) + bannière info
5. Cloud queue commande `apply_resolution` au Pi après résolution
6. Au prochain `sync_profiles`, exclure les champs en conflit non résolu
7. Annoter ADR-116 statut "amendée par ADR-120 pour `site_type = 'pi'`"
8. Smoke garde-fou : `smoke-pi-ownership-3way-merge.test.ts`

### Critères de validation globale

- Un Pi offline depuis 3 semaines avec modifs locales `:8080` (3 cats ajoutées, 1 sponsor édité, 1 profil créé) → au reconnect, les modifs sont préservées et présentes dans le dashboard cloud.
- Un super admin queue 2 modifs (1 cloud-owned : nouvelle vidéo ; 1 Pi-owned : édit catégorie) pendant que le Pi est offline → au reconnect, vidéo arrive, édit catégorie est détectée en conflit avec une modif locale et apparaît dans la bannière onglet Content.
- Résolution "Garder local" du conflit → cloud DB reflète la version Pi, baseline mise à jour, Pi inchangé.
- Smoke `smoke-saas` continue de passer (zéro régression SaaS).

---

## Références

- [ADR-001](ADR-001-edge-cloud-architecture.md) — Architecture Edge + Cloud (autonomie locale, command queue)
- [ADR-037](ADR-037-saas-mode.md) — Mode SaaS (qui RESTE cloud-wins)
- [ADR-070](ADR-070-postgresql-railway-migration.md) — Migration DB Railway (1 seule DB cloud)
- [ADR-114](ADR-114-displays-write-through-configuration-json.md) — Displays write-through (à amender Phase 3)
- [ADR-116](ADR-116-preview-diff-profile-baseline.md) — Preview diff (cloud-wins implicite à suspendre Phase 5)
- [ADR-117](ADR-117-auto-deploy-videos-on-profile-config-save.md) — Auto-deploy vidéos (reste valable, vidéos = cloud-owned)
- ADR-121 (Proposé) — Fix drift `video_variants` (prérequis advertiser cross-site avec variants)
- `central-server/src/services/command-queue.service.ts` — `sendOrQueue()` et `REALTIME_ONLY_COMMANDS`
- `central-server/src/repositories/site.repository.ts` — `local_config_mirror`, `local_config_hash`, `last_config_sync`
- `raspberry/admin/routes/` — 13 fichiers de routes `:8080` actuelles
- `raspberry/admin/services/` — services filesystem Pi (configuration.service.js, profile.service.js)
- `raspberry/sync-agent/src/agent.js` — push métriques/state existant
- `docs/specs/features/admin-pi-local.spec.md` — spec opérationnelle `:8080`
- Mémoire `feedback_diff_baseline_mismatch_multi_profile` — bug latent fixé en Phase 4
- Mémoire `feedback_variant_pipeline_drift` — drift variants traité par ADR-121
