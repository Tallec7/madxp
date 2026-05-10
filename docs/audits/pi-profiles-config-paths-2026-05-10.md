# Audit — Profils Pi, configuration & déploiement vidéo

> **Date** : 2026-05-10
> **Auteur** : Daisy (audit cartographique read-only)
> **Scope** : profils Pi + write paths config + déploiement vidéo + drift variants/sponsors
> **Statut** : Read-only — aucune modification de code, schéma DB, ni spec dans cet audit. Décisions de remédiation = phase suivante.

## 1. TL;DR

1. **3 endpoints cloud écrivent une config profil**, avec des effets très différents — et le dashboard combine 2 d'entre eux (`updateProfileConfiguration` + `syncProfiles`) en sautant le 3ᵉ (`deployProfile`) qui est le seul à versionner via `config_history`. Conséquence : aucune trace d'historique pour 90% des MAJ profil envoyées en prod.
2. **Aucune commande `deploy_content` ou `deploy_videos` séparée n'existe.** Les vidéos arrivent uniquement quand `sync_profiles` ou `deploy_video` (par vidéo individuelle, via `POST /api/content/deploy`) est envoyé. Modifier un profil **ne télécharge pas** automatiquement les vidéos qu'il référence.
3. **5 écrivains concurrents sur `configuration.json` côté Pi, dont 3 non-atomiques** ([sync-profiles.js](raspberry/sync-agent/src/commands/sync-profiles.js), [handlers.js](raspberry/server/socket/handlers.js), [auth.js](raspberry/server/routes/auth.js)). Risque : corruption JSON sur power-loss → `safeReadConfig` retourne `{}` silencieusement.
4. **Cascade de pansements 2026-05-08 → 2026-05-10** : 9 commits en 2 jours sur variants/displays/path normalization (#918→#939), 0 fix racine, 0 migration schéma. Pattern symptomatique.
5. **Sélecteur Fusionner/Remplacer décoratif** sur sites avec profils confirmé : `confirmDeployProfile` (deployment-status.component.ts:575) ignore complètement `deployMode`. Seul `confirmDeployLegacy` (ligne 631, sites sans profils) le passe au backend.
6. **Drift `video_variants` actif** : table prévue mais quasi-vide en prod, défaut `['secondary']` hardcodé (PR #921), generateUniqueFilename `_N` orphelins, restore Pi-side préserve les stale.
7. **Drift sponsors** : 2 306 refs `site_sponsor_id` orphelines cross-fleet (incident NLF 2026-02-22→05-07), cascade DELETE manquante côté cloud, Phase 1 FK non fusionnée (audit 2026-05-07 hors scope ici).

## 2. Symptômes vs hypothèses

| Symptôme rapporté                             | Hypothèse Daisy                                                       | Verdict audit                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MAJ d'un profil pas prise en compte sur le Pi | « plusieurs moyens de créer/MAJ, pas tout cohérent »                  | ✅ **Confirmé partiellement.** Le dashboard sauvegarde via `updateProfileConfiguration` + `syncProfiles`. Le Pi reçoit bien `sync_profiles` qui réécrit `profiles/{id}.json` et applique. Mais **aucun versionning `config_history`**, **aucun `pending_config_sync_until`** → impossible de tracer une MAJ perdue. Si le Pi est offline au moment du sendCommand, le `sync_profiles` est queué (REALTIME_ONLY check à valider) ou perdu. |
| Vidéos pas déployées                          | « la création d'une config implique-t-elle que les vidéos suivent ? » | ❌ **Non, jamais automatiquement.** `sync_profiles` envoie la config (avec paths vidéo) au Pi, mais ne déclenche AUCUN download. Si la vidéo n'a pas été préalablement déployée via `POST /api/content/deploy` (qui envoie `deploy_video` au Pi), elle n'arrivera jamais. Le path est dans la config mais le fichier physique manque → 404 silencieux côté kiosk.                                                                         |
| Régressions accumulées 2-3 mois               | « peut-être pas tout vu, juste des pansements »                       | ✅ **Confirmé.** 4 fichiers patchés 3-4× en 2 semaines, 0 migration schéma, 0 ADR de refonte structurelle. Cascade #918→#939 = symptôme canonique.                                                                                                                                                                                                                                                                                        |

## 3. Architecture profils Pi telle qu'elle EST

### 3.1 Modèle DB cloud

| Table                                                        | Rôle                                                                        | Source de vérité ?       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------ |
| `sites`                                                      | site (Pi/SaaS/demo) + `displays` JSONB (ADR-114)                            | ✅ pour displays         |
| `config_profiles`                                            | 1 profil = 1 config JSONB par site                                          | ✅ pour config profil    |
| `config_history`                                             | versioning, alimenté **uniquement** par `deployProfile`                     | ⚠️ partiellement utilisé |
| `pending_config_sync_until` (col sur `sites`)                | timestamp d'attente d'un sync Pi en cours                                   | ⚠️ idem                  |
| `video_variants`                                             | variants par display (`secondary`, `led`...) — table prévue mais quasi-vide | ❌ aspirationnelle       |
| `sites_profiles` (alias `config_profiles` selon les modules) | métadonnées profil (name, display_name, sport, city, is_default)            | ✅                       |

### 3.2 Modèle fichiers Pi

```
/home/pi/neopro/webapp/
├── configuration.json              ← config "active" mergée (lue par captive.js, kiosk, admin)
├── configuration.backup.json       ← backup avant chaque applyProfile
└── profiles/
    ├── clubs.json                  ← métadonnées pour club-selector (Angular remote)
    ├── active-profile              ← marqueur (texte brut = profileId actif)
    ├── {profileId}.json            ← config complète d'un profil (réécrite à chaque sync_profiles)
    └── {profileId}.pin.json        ← métadonnées PIN ADR-058 (chmod 600)
```

`.receivers-cache.json` (ephemeral, ADR-114) est un cache séparé écrit par `assignDisplay()` côté Pi, lu par l'admin API. **Source de vérité displays** = `configuration.json.displays`, persistée via write-through dans `command-dispatch.js:94-115` (handler `receiver_assignment_updated`).

### 3.3 Diagramme des écritures concurrentes sur `configuration.json`

```
                     ┌──────────────────────────────────────┐
                     │     /home/pi/neopro/webapp/          │
                     │     configuration.json (1 fichier)   │
                     └──────────────────────────────────────┘
                                    ▲ ▲ ▲ ▲ ▲
              ┌─────────────────────┘ │ │ │ └─────────────────┐
              │ ✅ atomicWriteJson    │ │ │                   │
              │ command-dispatch.js   │ │ │  ❌ fs.writeFile  │
              │ receiver_assignment   │ │ │  auth.js:59       │
              │      (ADR-114)        │ │ │                   │
              │                       │ │ │                   │
              │ ✅ atomicWriteJson    │ │ │  ❌ fs.writeFileSync (sync !)
              │ deploy-video.js:368   │ │ │  handlers.js:386
              │                       │ │ │  profile-switch (télécommande)
              │ ✅ safeReadConfig +   │ │ │
              │   atomicWriteJson     │ │ │
              │ update-config.js      │ │ │
              │                       │ │ │
              │ ❌ fs.writeFile (async non-atomique)
              │ sync-profiles.js:163  applyProfile
```

## 4. Matrice "chemin × effet" — cloud-side

| #   | Endpoint / Trigger                                                   | Fichier:ligne                                                                                                                                                                                                                                           | DB modif                                                              | Commande Pi queuée                                                                                    | Vidéos déclenchées                    | `mode` honoré                       | Versioning |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------- | ---------- |
| 1   | `PATCH /sites/:id/profiles/:id/configuration`                        | [config-profiles.controller.ts:369](central-server/src/controllers/config-profiles.controller.ts)                                                                                                                                                       | `config_profiles.configuration` (merge ou replace selon `value.mode`) | **Aucune** (sauf event `saas-config-updated` si SaaS, ligne 429)                                      | ❌                                    | ✅ DB-side `mode`                   | ❌         |
| 2   | `POST /sites/:id/profiles/:id/deploy`                                | [config-profiles.controller.ts:487](central-server/src/controllers/config-profiles.controller.ts)                                                                                                                                                       | `config_history` INSERT + `sites.pending_config_sync_until` UPDATE    | `triggerPendingConfigSync` (probablement `update_config`) + `sync_profiles` SI ≥2 profils (ligne 536) | ❌ (config seule, pas de fetch vidéo) | ❌ ignore body `mode`               | ✅         |
| 3   | `POST /sites/:id/profiles/sync`                                      | [config-profiles.controller.ts:605](central-server/src/controllers/config-profiles.controller.ts)                                                                                                                                                       | Aucune écriture                                                       | `sync_profiles` avec tous les profils enrichis (ligne 689-693)                                        | ❌                                    | N/A                                 | ❌         |
| 4   | Cloud → Pi `receiver_assignment_updated`                             | [sites.controller.ts](central-server/src/controllers/sites.controller.ts) (`updateSiteDisplays`)                                                                                                                                                        | `sites.displays` JSONB                                                | `receiver_assignment_updated` (write-through ADR-114)                                                 | ❌                                    | N/A                                 | ❌         |
| 5   | CLI backfill `npm run backfill:displays-resync`                      | [backfill-displays-resync.ts](central-server/src/scripts/backfill-displays-resync.ts)                                                                                                                                                                   | Aucune écriture                                                       | Re-rejoue `receiver_assignment_updated` sur la flotte                                                 | ❌                                    | N/A                                 | ❌         |
| 6   | Bouton dashboard "Sauvegarder/Déployer" (sites avec profils)         | [deployment-status.component.ts:575](central-dashboard/src/app/features/sites/components/site-content-tab/deployment-status/deployment-status.component.ts)                                                                                             | Combine 1 + 3 séquentiellement                                        | (1 → rien) + (3 → `sync_profiles`)                                                                    | ❌                                    | ❌ `deployMode` complètement ignoré | ❌         |
| 7   | Bouton dashboard "Sauvegarder/Déployer" (legacy, sites sans profils) | [deployment-status.component.ts:631](central-dashboard/src/app/features/sites/components/site-content-tab/deployment-status/deployment-status.component.ts)                                                                                             | (via `update_config` côté Pi)                                         | `update_config` avec `mode: this.deployMode` (ligne 641)                                              | ❌                                    | ✅                                  | ❌         |
| 8   | `POST /api/content/deploy` (action utilisateur séparée)              | content.controller.ts                                                                                                                                                                                                                                   | `content_deployments` row                                             | `deploy_video` (par vidéo)                                                                            | ✅                                    | N/A                                 | N/A        |
| 9   | `POST /sites/:id/config-history` (legacy `config-editor`)            | [config-history.controller.ts:154](central-server/src/controllers/config-history.controller.ts) → appelé par [config-editor-data.service.ts:430](central-dashboard/src/app/features/sites/config-editor/config-editor-data.service.ts) `deployConfig()` | `config_history` INSERT + `pending_config_version_id` UPDATE          | `update_config` (legacy, sites SANS profils)                                                          | ❌                                    | ✅ propagé en body                  | ✅         |

> **Note post-rédaction (vérifié empiriquement le 2026-05-10 sur DB prod)** :
>
> Le chemin 9 a été découvert **après livraison de l'audit initial**, en inspectant `config_history` du site NLF (`c994620c`) et en cherchant la source du commit message "Déploiement depuis le dashboard" qui apparaît sur 5 rows entre 2025-12-29 et 2026-01-05. Cause : c'est le **legacy `config-editor`** (sites sans profils) qui frappe ce chemin, **pas** le profile flow. La cohabitation des 2 flux dashboard explique pourquoi les sites avec profils n'ont aucune version dans `config_history` depuis 4+ mois (Phase A1 corrige ça).
>
> Implication : la matrice ci-dessus reste à jour, mais la phrase « 90% des MAJ profil n'ont pas de versioning » du TL;DR doit se lire **uniquement pour les sites avec profils** ; les sites legacy sans profils sont eux versionnés depuis toujours via le chemin 9.

**Constat majeur sur la ligne 6** : c'est le chemin **par défaut en prod** pour les sites Pi avec profils (~majorité de la flotte). Il **ne passe jamais par `deployProfile` (chemin 2)**. Donc :

- Pas de version `config_history` créée → impossible de retracer ce qui a été envoyé.
- Pas de `pending_config_sync_until` → le dashboard ne peut pas afficher l'état "en attente de sync".
- Le mode `merge`/`replace` exposé dans la modal diff est purement décoratif (UI fait `mergeConfiguration` côté DB ligne 412, mais cela n'a rien à voir avec le mode merge/replace côté Pi qui n'est plus déclenché).

## 5. Cartographie écrivains/lecteurs `configuration.json` Pi-side

### Écrivains

| Fichier:ligne                                                                             | Trigger                                                 | Atomique ?                              | Risque                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- | ------------------------------------ |
| [command-dispatch.js:94-115](raspberry/sync-agent/src/command-dispatch.js)                | `receiver_assignment_updated`                           | ✅ `atomicWriteJson`                    | Aucun                                |
| [sync-profiles.js:163](raspberry/sync-agent/src/commands/sync-profiles.js) `applyProfile` | `sync_profiles`                                         | ❌ `fs.writeFile` async non atomique    | Power-loss → JSON corrompu           |
| [sync-profiles.js:35,64,88](raspberry/sync-agent/src/commands/sync-profiles.js)           | `sync_profiles` (profiles/, clubs.json, active-profile) | ❌ `fs.writeFile` async                 | Idem (impacte profiles/, clubs.json) |
| [deploy-video.js:368](raspberry/sync-agent/src/commands/deploy-video.js)                  | déploiement vidéo                                       | ✅ `atomicWriteJson`                    | Aucun                                |
| [update-config.js](raspberry/sync-agent/src/commands/update-config.js)                    | `update_config` (legacy mode merge)                     | ✅ `safeReadConfig` + `atomicWriteJson` | Aucun                                |
| [handlers.js:386](raspberry/server/socket/handlers.js)                                    | profile-switch télécommande Socket.IO                   | ❌ `fs.writeFileSync`                   | Race + corruption                    |
| [auth.js:59](raspberry/server/routes/auth.js)                                             | push auth dashboard                                     | ❌ `fs.writeFileSync`                   | Race + corruption                    |
| [config-rollback.js:73](raspberry/sync-agent/src/services/config-rollback.js)             | rollback watchdog                                       | ✅ `atomicWriteJson`                    | Aucun                                |

### Lecteurs

| Fichier:ligne                                              | Clé lue                                               | Cache ?                                      | Réactivité                          |
| ---------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------- | ----------------------------------- |
| [captive.js:68](raspberry/server/routes/captive.js)        | `displays[].receiver.mac`                             | Non (live)                                   | Fire Stick whoami — chemin critique |
| [handlers.js:360,383](raspberry/server/socket/handlers.js) | `auth`, `siteId`, `apiKey`, `hotspot`, `localNetwork` | Non                                          | Profile-switch + merge              |
| [agent.js](raspberry/sync-agent/src/agent.js) (boot)       | tout                                                  | safeReadConfig fallback `{}`                 | ConfigWatcher déclenche les sync    |
| Admin API endpoints                                        | sponsors, categories, vidéos                          | `.receivers-cache.json` (ephemeral, partiel) | Cache miss → live                   |

**Risque RANK 1** : 3 écrivains non-atomiques (`sync-profiles.js applyProfile`, `handlers.js profile-switch`, `auth.js`) peuvent corrompre `configuration.json` sur power-loss. `safeReadConfig` masque ensuite la corruption (retourne `{}`), perte sponsors/categories silencieuse.

## 6. Drift "variants" — état réel vs aspirationnel

| Aspect                                   | État réel                                                                                                              | Implication                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Table `video_variants`                   | Existe en DB. Quasi-vide en prod (~2 rows selon mémoire 2026-05-08).                                                   | Pipeline LED/totem aspirationnel, jamais alimenté à grande échelle.                                     |
| Défaut `enrichConfigWithDisplayVariants` | `['secondary']` hardcodé après PR #921 (workaround migration `led` → `led-banner`).                                    | Si un site a uniquement display LED, l'enrichissement retombe sur secondary → variants LED non résolus. |
| `generateUniqueFilename`                 | Ajoute `_N` à chaque re-upload du même filename.                                                                       | 16 fichiers `_N` orphelins observés sur Pi NLF (mémoire 2026-05-08) → cleanup manuel.                   |
| `restoreSecondaryVariants` Pi-side       | Préserve les variants même quand la nouvelle config ne les référence plus (ADR-032).                                   | Variants stale traînent sur le Pi indéfiniment. Pas de TTL ni cleanup.                                  |
| Audit drift CLI                          | `npm run audit:variants-drift` existe ([audit-variants-drift.ts](central-server/src/scripts/audit-variants-drift.ts)). | Read-only. Aucune action automatique. À lancer manuellement avant chaque release sensible.              |

## 7. Drift "sponsors" — site_sponsor_id orphelins

Cf. [audits/site-sponsor-orphans-2026-05-07.md](docs/audits/site-sponsor-orphans-2026-05-07.md) pour le détail. Résumé :

- 2 306 refs `site_sponsor_id` orphelines détectées sur la flotte (incident NLF 2026-02-22 → 2026-05-07).
- Cause racine : suppression d'un sponsor côté cloud sans cascade DELETE sur `video_plays.site_sponsor_id`.
- Phase 1 (FK + cleanup UPDATE) **non fusionnée** à ce jour.
- **Hors scope du présent audit** mais cousine directe : même pattern « champ partagé sans contrat de cascade ».

## 8. Cascade pansements 2026-05-08 → 2026-05-10

| PR              | Date       | Classification   | Détail                                                                             |
| --------------- | ---------- | ---------------- | ---------------------------------------------------------------------------------- |
| #918            | 2026-05-08 | 🔴 Trigger       | Renomme `led` → `led-banner` en DB sans patcher `enrichConfigWithDisplayVariants`. |
| #921            | 2026-05-08 | 🔴 Pansement     | Hardcode défaut `['secondary']` (masque #918).                                     |
| #924 (cb33bd37) | 2026-05-08 | 🟡 Fix partiel   | Write-through `sites.displays → configuration.displays` sync-agent (ADR-114).      |
| #925 (322db755) | 2026-05-08 | 🟡 Fix partiel   | Inclut `displays` dans `resolvedConfig` payload SaaS.                              |
| #926 (0c731dd9) | 2026-05-09 | 🔴 Pansement+    | Variant URL resolution all display types — symptôme sur symptôme.                  |
| #927 (a3c9d3b1) | 2026-05-09 | 🟡 Garde-fou     | 6 smoke tests régression (ne fix pas racine #921).                                 |
| #930 (bdef6abd) | 2026-05-09 | 🟡 Fix partiel   | Constrained dropdown + server validation variants drift.                           |
| #931 (16278540) | 2026-05-09 | 🟡 Symptomatique | Badge "2nd" non-TV variants. UX patch.                                             |
| #935 (6e555123) | 2026-05-09 | 🔴 Pansement     | Normalise video paths avant `update_config` Pi.                                    |
| #939 (9bc97058) | 2026-05-09 | 🔴 Pansement+    | Catégories `videos/default` + préfixage write — empile préfixage sur préfixage.    |

**Pattern** : 9 commits / 2 jours, **0 changement schéma**, **0 ADR de refonte**. 4 fichiers patchés 3-4× : `content.controller.ts`, `config-secondary-variants.ts`, `command-dispatch.js`, `config-profile.service.ts`.

## 9. Top 7 risques classés

| Rang   | Risque                                                                                                   | Sévérité                       | Reproducer                                                                                                                                                                                                     | Fix racine proposé                                                                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | Bouton « Sauvegarder/Déployer » dashboard sites avec profils ne crée **aucune version `config_history`** | Data loss audit trail          | Modifier la config d'un profil via UI, vérifier `SELECT * FROM config_history WHERE site_id = ... ORDER BY created_at DESC LIMIT 1` → version absente.                                                         | `confirmDeployProfile` doit appeler `deployProfile` (endpoint 2), pas `updateProfile` + `syncProfiles`.                                                                            |
| **P0** | Aucun déploiement vidéo automatique quand on ajoute une vidéo à la config d'un profil                    | Vidéos jamais sur le Pi        | Ajouter une vidéo cloud (jamais déployée) à un profil via UI → la config arrive sur le Pi, le path est référencé, mais le fichier physique n'existe pas. Kiosk = 404 silencieux.                               | Couplage explicite : après `updateProfileConfiguration`, déclencher `deploy_video` pour chaque path nouvellement référencé qui n'a pas de `content_deployments` actif.             |
| **P1** | 3 écrivains non-atomiques sur `configuration.json` Pi-side                                               | Corruption JSON sur power-loss | Killer le Pi pendant un `sync_profiles` ou un profile-switch télécommande. Au reboot, `safeReadConfig` retourne `{}` → kiosk affiche page vide.                                                                | Remplacer les 3 `fs.writeFile(Sync)` par `atomicWriteJson` (déjà disponible dans `safe-config-io.js`).                                                                             |
| **P1** | Sélecteur Fusionner/Remplacer décoratif sur sites avec profils                                           | UX trompeuse                   | Site avec profils, modifier la radio dans la modal diff puis Confirmer. Le backend reçoit la requête sans `mode` (ligne 584 ne passe rien).                                                                    | Soit retirer la radio pour sites avec profils (cohérent avec ADR-115), soit propager `mode` dans `confirmDeployProfile` ET dans le call `updateProfileConfiguration` côté backend. |
| **P1** | Variants pipeline drift (table aspirationnelle + défaut hardcodé)                                        | LED/totem muets                | Site avec display LED uniquement, ajouter un sponsor. Le Pi reçoit la config mais `enrichConfigWithDisplayVariants` retombe sur `['secondary']` → variant LED non résolu → asset secondary affiché à la place. | Soit alimenter `video_variants` proprement (migration backfill + UI assignation), soit retirer la table et le défaut `['secondary']`. Décision Daisy.                              |
| **P2** | `restoreSecondaryVariants` Pi-side préserve variants stale                                               | Variants fantômes ad vitam     | Retirer un variant via la config cloud, observer le Pi qui conserve l'ancien fichier référencé.                                                                                                                | TTL sur les variants Pi-side + cleanup CRON aligné avec config courante.                                                                                                           |
| **P2** | Cascade DELETE manquante sur sponsors (cousine sponsors)                                                 | 2 306 refs orphelines NLF      | Supprimer un sponsor → `video_plays.site_sponsor_id` reste pointing on dead row.                                                                                                                               | FK + ON DELETE SET NULL (Phase 1 hors scope).                                                                                                                                      |

## 10. Plan de remédiation suggéré (3 phases — décision Daisy)

### Phase A — Réconcilier les chemins UI dashboard

- Choisir : la sauvegarde profil passe-t-elle systématiquement par `deployProfile` (avec versioning) ou reste-t-elle sur `updateProfile + syncProfiles` (sans versioning) ?
- Si versioning : migrer `confirmDeployProfile` vers `deployProfile`. Documenter que la sauvegarde profil = un déploiement versionné.
- Si pas de versioning : retirer `config_history` du chemin sites avec profils ET retirer la radio Fusionner/Remplacer (décoratif) pour ne pas mentir à l'utilisateur.

### Phase B — Atomicité Pi-side

- Remplacer les 3 `fs.writeFile(Sync)` non-atomiques par `atomicWriteJson` :
  - `raspberry/sync-agent/src/commands/sync-profiles.js:35,64,88,163`
  - `raspberry/server/socket/handlers.js:386`
  - `raspberry/server/routes/auth.js:59`
- Ajouter un mutex (lock-file ou semaphore in-memory) pour les écritures concurrentes `update_config` + `profile-switch`.
- Smoke test garde-fou : "tous les chemins qui touchent `configuration.json` doivent passer par `safe-config-io.js`" (file-based grep enforced).

### Phase C — Couplage config ↔ assets

- Invariant : « une config référencée par un profil ne doit référencer que des assets dont `content_deployments` confirme la présence sur le Pi cible ».
- Implémentation : `updateProfileConfiguration` calcule les nouveaux paths référencés vs. anciens, et pour chaque ajout, déclenche `deploy_video`. Côté UI, indicateur « 3 vidéos en cours de déploiement » avant de pouvoir confirmer la sauvegarde.
- Fallback : warning UI quand un path n'a pas de deployment confirmé (« cette vidéo n'arrivera pas sur le Pi avant que tu cliques Déployer »).

## 11. Annexe — Glossaire & références

### Glossaire

- **Profil** : 1 row dans `config_profiles` = 1 configuration nommée (default/match/event...) pour un site Pi.
- **Configuration active** : sur le Pi, c'est `configuration.json`. Mergé via `applyProfile()` à partir de `profiles/{activeProfileId}.json` + `LOCAL_ONLY_SETTINGS`.
- **LOCAL_ONLY_SETTINGS** : `auth`, `siteId`, `apiKey`, `clubName`, `hotspot`, `localNetwork`, `localSponsors` (ADR-115). Préservés au merge profile.
- **Write-through** (ADR-114) : tout changement DB `sites.displays` côté cloud déclenche une commande Pi `receiver_assignment_updated` qui persiste dans `configuration.json.displays` (source de vérité pour captive.js).
- **Resolved config (SaaS)** : payload servi par `getSaasConfig` après enrichissement (analytics metadata, display variants, sponsor IDs, displays).

### ADR référencés

- **ADR-037** — SaaS mode (sites navigateur sans Pi)
- **ADR-058** — PIN profil pour validation offline remote
- **ADR-093** — Match sessions persistence (proposé, pas implémenté)
- **ADR-103** — Web pages & livestreams en boucles playback
- **ADR-114** — Write-through `configuration.json.displays` (incident 2026-05-08 Fire Stick)
- **ADR-115** — Auth preservation au sync (incident 2026-05-08 reboot)

### Specs cousines

- [docs/specs/services/sync-agent-displays-write-through.spec.md](docs/specs/services/sync-agent-displays-write-through.spec.md) (last_verified 2026-05-10)
- [docs/specs/services/sync-agent-auth-preservation.spec.md](docs/specs/services/sync-agent-auth-preservation.spec.md) (last_verified 2026-05-10)
- [docs/specs/features/saas-mode.spec.md](docs/specs/features/saas-mode.spec.md)

### Fichiers cités (pour navigation rapide)

- [central-server/src/controllers/config-profiles.controller.ts](central-server/src/controllers/config-profiles.controller.ts) — 3 endpoints distincts (369, 487, 605)
- [central-dashboard/src/app/features/sites/components/site-content-tab/deployment-status/deployment-status.component.ts](central-dashboard/src/app/features/sites/components/site-content-tab/deployment-status/deployment-status.component.ts) — `confirmDeployProfile` (575) vs `confirmDeployLegacy` (631)
- [raspberry/sync-agent/src/commands/sync-profiles.js](raspberry/sync-agent/src/commands/sync-profiles.js) — `applyProfile` (136-174), modèle multi-fichier
- [raspberry/sync-agent/src/command-dispatch.js](raspberry/sync-agent/src/command-dispatch.js) — write-through ADR-114
- [raspberry/sync-agent/src/utils/config-merge.js](raspberry/sync-agent/src/utils/config-merge.js) — `LOCAL_ONLY_SETTINGS`
- [raspberry/sync-agent/src/utils/safe-config-io.js](raspberry/sync-agent/src/utils/safe-config-io.js) — `atomicWriteJson` + `safeReadConfig`

---

**Décision attendue de Daisy** : valider le top 7 risques + arbitrer Phase A (versioning oui/non) avant de commencer la phase B (atomicité). Ne pas commencer la phase C sans avoir tranché la phase A — sinon on rejoue le pattern "pansement empilé sur pansement".
