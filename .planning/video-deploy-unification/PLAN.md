# Plan — Unification Upload & Déploiement Vidéo

**Date de création** : 2026-04-17
**Dernière révision** : 2026-04-18 (après lecture des règles domaine `.claude/rules/saas.md` + `dashboard.md`)
**Note actuelle** : 62/100
**Note cible** : 82/100
**Durée estimée totale** : 4-5 sprints

---

## ⚠️ Révision 2026-04-18 — Correction du diagnostic initial

Après lecture des règles domaine enforced par smoke tests, le diagnostic initial était **partiellement erroné**. La réalité ADR-037 :

**Les sites Pi et SaaS ont des modèles fondamentalement différents** :

| Action utilisateur        | Site Pi                                             | Site SaaS                                                                              |
| ------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Ajouter une vidéo au site | `deploy_video` Socket.IO → Pi télécharge le fichier | Update `config_profiles.configuration` via `mergeDefaultProfileConfig()` (JSONB merge) |
| Bouton UI                 | "Déployer 🚀"                                       | "Enregistrer"                                                                          |
| Backend                   | Ligne dans `content_deployments` + commande Pi      | Update JSONB profil par défaut                                                         |
| Vocabulaire               | "Déploiement"                                       | "Configuration" / "Enregistrement"                                                     |

**`onVideoDeploy()` dans `site-content-tab.component.ts:625` return early en SaaS par design (smoke test enforced)**. Ce n'est pas un bug.

**Le vrai problème** : la page Contenu peut "déployer" sur un SaaS via `createDeployment()` qui marque `completed` immédiatement — mais sans mettre à jour `config_profiles`, donc la TV SaaS ne joue pas la vidéo. **C'est la page Contenu qui est partiellement cassée en SaaS, pas l'onglet site.**

---

## Contexte & problème (révisé)

Trois points d'entrée Angular gèrent la gestion vidéo :

1. **Page Contenu** (`/content`) — admin fleet-wide — crée des `content_deployments` mais **ne met pas à jour `config_profiles`** pour les sites SaaS → vidéo enregistrée en audit mais jamais jouée sur TV SaaS
2. **Onglet site** (`/sites/:id` → tab content) — bloque SaaS avec un warning, route vers `mergeDefaultProfileConfig` pour la config SaaS (comportement correct ADR-037, mais UX confuse : le bouton "Déployer" reste visible)
3. **Portail club** (`/club-portal`) — principalement lecture

**Vrais problèmes identifiés** :

- **Page Contenu ne sait pas mettre à jour un profil SaaS** → déploiement "fantôme" (marqué done, vidéo invisible)
- **Onglet site affiche "Déployer" puis bloque** au lieu d'afficher "Enregistrer" et de router vers le bon flow
- **Duplication ~3000L** entre `features/content/` (4400L) et `features/sites/components/video-manager+video-library/` (~1500L)
- **Nommage flou** : `video`/`content`/`asset`/`site_video`/`deployment`/`config_profile`
- **Fichiers >400L** violant la règle repo (`deployment.service.ts` 786L, `club-dashboard.component.ts` 837L, etc.)

---

## Personas cibles

| Persona                | Besoin principal                                  | Page         |
| ---------------------- | ------------------------------------------------- | ------------ |
| Opérateur Neopro       | Gestion de flotte, déploiement en lot, historique | Page Contenu |
| Club (responsable com) | Upload rapide sur SON site + feedback temps réel  | Onglet site  |
| Club SaaS (ADR-037)    | Idem club, mais sans Pi (browser direct)          | Onglet site  |

Les deux pages resteront. Ce qu'on unifie, c'est **le pipeline backend** et les **composants Angular**.

---

## Phase 1 — Corriger la page Contenu pour les sites SaaS

**Statut** : ✅ **Done by design** (2026-04-18) — misdiagnosis initial, voir note ci-dessous
**Durée** : 2-3 jours
**Owner** : Dev fullstack
**Objectif** : quand un admin "déploie" une vidéo sur un site SaaS depuis la page Contenu, la vidéo doit **réellement apparaître** sur la TV SaaS (pas juste une ligne `completed` en DB)

### 🟢 Résolution 2026-04-18 — Pas de bug, le mental model du plan était faux

Après audit schéma + code :

- **Page Contenu "déployer sur SaaS"** = rendre la vidéo **disponible dans le pool** du site. C'est tout.
  Le `continue;` ligne 117 qui marque `content_deployments.status='completed'` est **la source de vérité** pour la visibilité : `getSiteLocalContent` (`site-fleet.controller.ts:413-454`) élargit le filtre club via `findCompletedVideoIdsForSite()` → la vidéo apparaît dans le pool.
- **Onglet site** = placer une vidéo du pool dans des catégories/sponsors/loops (via `mergeDefaultProfileConfig`). Action distincte et complémentaire.
- Aucune injection `config_profiles` n'est requise depuis la page Contenu — cela écraserait le travail de configuration fait depuis l'onglet site.

**Smoke guard ajouté** : `smoke-saas.test.ts` — "deployment.service.ts must short-circuit SaaS targets with successCount++ and continue" verrouille le comportement `continue` pour éviter qu'une future refacto le casse.

Les tâches 1.1 et 1.2 ci-dessous sont **annulées**. La tâche 1.3 est partiellement couverte (pool visibility). La clarification UX onglet site (label "Enregistrer" vs "Déployer") est repoussée à Phase 3 (VideoManager unifié) où elle a plus de sens.

### Problème concret

Aujourd'hui, `deployment.service.ts:117-127` fait pour un site SaaS :

```typescript
if (target.siteType === 'saas') {
  logger.info('SaaS site: video deployment completed immediately (no Pi)');
  successCount++;
  continue; // ← pas d'update config_profiles → TV SaaS ignore la vidéo
}
```

**Manque** : l'appel à `mergeDefaultProfileConfig()` pour ajouter la vidéo au profil par défaut du site SaaS + émission `saas-config-updated` pour reload client.

### Tâches

**1.1 Backend — brancher la page Contenu sur le flow SaaS correct**

- [ ] Dans `deployment.service.ts`, quand `target.siteType === 'saas'`, avant de `continue`, appeler :
  - Récupérer/créer le profil par défaut du site (`configProfileRepository.findDefaultForSite()`)
  - Ajouter la vidéo à `configuration.videos` ou `configuration.sponsors[].videos` selon le contexte (à clarifier avec le PO)
  - `mergeDefaultProfileConfig(siteId, {videos: [...]})` (JSONB merge)
  - Émettre `socketService.emitSaasConfigUpdated(siteId)` pour reload des clients TV SaaS connectés
- [ ] Ajouter `enrichConfigWithAnalyticsMetadata()` si la config inclut des vidéos sponsors (règle smoke enforced)
- [ ] Créer repository/service helper `saasDeploymentService` si la logique dépasse 30 lignes

**1.2 Frontend — onglet site : clarifier l'UX SaaS**

- [ ] Dans `site-content-tab.component.ts`, quand `siteType === 'saas'` :
  - Remplacer le bouton "Déployer 🚀" par "Enregistrer" sur chaque vidéo cloud (via propagation `[siteType]`)
  - Au clic, appeler `mergeDefaultProfileConfig` au lieu de `sendCommand('deploy_video')`
  - Label notification : "Vidéo enregistrée" (pas "Déployée")
- [ ] Respecter les règles existantes ADR-037 (plusieurs smoke tests enforced déjà listent ces labels)

**1.3 Tests**

- [ ] Smoke test nouveau : `smoke-saas` — "ajouter une vidéo via page Contenu sur site SaaS → vidéo présente dans `config_profiles.configuration.videos`"
- [ ] Smoke test nouveau : `smoke-saas` — "ajouter une vidéo via onglet site sur site SaaS → vidéo présente dans `config_profiles.configuration.videos`"
- [ ] Smoke test existant `smoke-deploy-ota` : 0 régression sur les sites Pi

### Critères d'acceptation

- ✅ Admin ajoute une vidéo à un site SaaS via page Contenu → vidéo joue sur la TV SaaS (test manuel + smoke)
- ✅ Club SaaS ajoute une vidéo via son onglet site → vidéo joue sur sa TV
- ✅ UI affiche "Enregistrer" pour SaaS, "Déployer" pour Pi
- ✅ Aucune ligne "fantôme" dans `content_deployments` (completed mais vidéo absente config)
- ✅ Événement `saas-config-updated` émis → TV SaaS connectée recharge automatiquement
- ✅ 0 régression smoke (13 suites)

### Risques

- Ne pas casser les flows Pi existants (tester Pi online + offline)
- Les règles `.claude/rules/saas.md` listent ~30 pièges SaaS — relecture obligatoire avant chaque modif
- Le JSONB merge doit être idempotent (ajouter la même vidéo 2x ne doit pas créer de doublon)
- `enrichConfigWithAnalyticsMetadata()` doit être appelé sinon analytics sponsors SaaS perdues

### ⚠️ Décisions produit à valider avant implémentation

1. **Où va la vidéo dans le profil SaaS** ? `configuration.videos[]` générique ou ventilée par catégorie (`sponsors`, `club_content`, etc.) ?
2. **Comportement désinstall** : si admin "retire" une vidéo d'un site SaaS, on la retire du profil ET du FTP, ou juste du profil ?
3. **Conflit** : si admin ajoute vidéo X sur site SaaS Y et le club Y avait déjà enregistré vidéo X, on dédoublonne comment ?

---

## Phase 2 — Unification du vocabulaire (révisé 2026-04-18 après audit)

**Durée révisée** : 1-2 jours (frontend uniquement — backend déjà propre)
**Owner** : Lead frontend
**Objectif** : un seul `Video` dans tout le frontend

### Audit chiffré (fait le 2026-04-18)

**Backend — OK, pas de chantier nécessaire** :

- 1 interface `ContentDeployment` centrale dans `central-server/src/types/index.ts`
- 3 variantes enrichies légitimes dans `deployment.repository.ts` (JOINs différents)
- 28 fichiers référencent `content_deployments` — stable, pas de doublon
- 171 occurrences de `content|asset|media` mais ce sont des colonnes SQL / URLs, pas du vocabulaire dupliqué

**Frontend — 5 interfaces `Video` parallèles** :

| Source                                                                     | Champs           | Consommateurs     |
| -------------------------------------------------------------------------- | ---------------- | ----------------- |
| `core/models/index.ts:224` — `Video` (canonique DB)                        | 15 snake_case    | **0 fichiers** 🚨 |
| `features/content/content-management-data.service.ts:14` — `Video`         | 7 champs         | 3 fichiers        |
| `features/advertisers/sponsor-video-data.service.ts:6` — `Video`           | 6 champs         | 1 fichier         |
| `features/remote/services/cloud-remote-navigation.service.ts:16` — `Video` | 5 champs         | 2 fichiers        |
| `features/sites/.../video-library.types.ts:15` — `VideoItem`               | **23 camelCase** | 9 fichiers        |

Le modèle canonique DB n'est utilisé par personne. `VideoItem` est la définition de fait la plus riche.

### Tâches (frontend only)

**2.1 Canoniser `Video` dans `core/models/video.model.ts`**

- [ ] Créer `core/models/video.model.ts` qui exporte `Video` (camelCase, basé sur `VideoItem`)
- [ ] Déprécier (commentaire `@deprecated`) les 4 autres interfaces

**2.2 Migration progressive des 15 fichiers consommateurs**

- [ ] Remplacer `import { Video } from '.../content-management-data.service'` par `core/models/video.model`
- [ ] Remplacer `VideoItem` par `Video` dans video-library et ses 9 consommateurs
- [ ] Supprimer les 4 interfaces dupliquées une fois tous les imports migrés

**2.3 Tests**

- [ ] `npm run test:central` — 520 Karma tests doivent passer
- [ ] `npm run test:smoke:smart` — 0 régression

### Non-goals (reportés ou abandonnés)

- ❌ Rename `content_deployments` en DB — trop risqué, gain nul
- ❌ Alias `/api/deployments` ↔ `/api/content/deployments` — pas de consommateur externe, YAGNI
- ❌ Rename `ContentDeployment` → `Deployment` backend — cohérent avec le nom de table, pas de valeur
- ❌ ADR dédié — pas de décision structurante, c'est juste du rename frontend

### Critères d'acceptation

- ✅ Une seule interface `Video` dans tout le frontend
- ✅ Glossaire à jour dans `docs/GLOSSARY.md`
- ✅ Tests passent (2728 server + karma)
- ✅ Lint pass

---

## Phase 3 — Extraction primitives vidéo partagées (scope révisé ADR-067)

**Statut** : 📝 Scope révisé 2026-04-18 — voir [ADR-067](../../docs/adr/ADR-067-video-manager-two-consumers.md)
**Durée** : 1 sprint (estimation ~400-600L récupérables, pas 3000L)
**Owner** : Lead frontend
**Objectif** : extraire les primitives présentationnelles dupliquées entre Page Contenu et VideoLibrary — **SANS** unifier en composant monolithique

### 🟡 Révision 2026-04-18 — Refus d'unification monolithique

Audit a révélé :

- Les 3 consumers initialement identifiés se réduisent à **2** (club-portal délègue à `site-content-tab` via propagation `[siteType]` smoke-enforced)
- Page Contenu (fleet-wide, pagination server-side, panier multi-sites) et `VideoLibraryComponent` (per-site, 14+ inputs contextuels, action directe) ont des UX et data shapes fondamentalement différentes
- Forcer un flag `scope: 'fleet' | 'site'` dans VideoLibrary ajouterait ~20 branches conditionnelles pour zéro gain net
- ~80 règles smoke-enforced (`.claude/rules/saas.md` + `dashboard.md`) verrouillent des comportements par siteType qu'un composant unifié ne peut pas gérer proprement

**Décision ADR-067** : garder les 2 consumers, extraire uniquement les primitives.

### Architecture cible révisée

```
shared/components/
  video-card/          ← à créer — tuile vidéo (thumbnail + actions menu)
  video-upload-zone/   ✅ déjà extrait
features/
  content/             ← garde sa structure (ContentManagementDataService + Upload + Deploy)
  sites/components/video-library/  ← garde sa structure (déjà décomposé en sub-components)
```

### Tâches

**3.1 Extraction composants partagés**

- [ ] Identifier les blocs identiques entre `content-management.component` et `video-manager.component`
- [ ] Extraire dans `shared/components/` :
  - `VideoGrid` (liste vidéos)
  - `VideoCard` (carte unitaire)
  - `DeploymentPanel` (panneau de déploiement)
  - `DeploymentHistoryTable`

**3.2 Service unifié**

- [ ] Fusionner `features/content/video-upload.service.ts` (220L) et `shared/components/video-upload-zone/` logic dans un seul `core/services/video-upload.service.ts`
- [ ] Fusionner `features/content/content-deployment.service.ts` (95L) et le flow custom de l'onglet site dans `core/services/deployment.service.ts`
- [ ] Supprimer `SiteCommandService.sendCommand('deploy_video', ...)` (plus utilisé)

**3.3 Composant `VideoManager`**

- [ ] Créer `shared/components/video-manager/video-manager.component.ts`
- [ ] Input `scope` + `permissions`
- [ ] Template qui compose `VideoUploadZone` + `VideoGrid` + `DeploymentPanel`

**3.4 Migration des 3 usages**

- [ ] Page Contenu utilise `<video-manager scope="{type: 'fleet'}">` → supprimer `features/content/content-management.component`
- [ ] Onglet site utilise `<video-manager scope="{type: 'site', siteId}">` → simplifier `site-content-tab`
- [ ] Portail club utilise `<video-manager scope="{type: 'club', clubSiteId}">`

**3.5 Nettoyage**

- [ ] Supprimer `features/content/content-management.component.*` (~1472L)
- [ ] Supprimer `features/sites/components/site-content-tab/video-manager/` (~328L) si fusionné
- [ ] Supprimer `features/content/video-upload.service.ts` (220L)
- [ ] Supprimer `features/content/content-deployment.service.ts` (95L)

### Critères d'acceptation

- ✅ ~3000L supprimées (mesure : `cloc` avant/après)
- ✅ Les 3 pages rendent visuellement identique à avant (screenshots diff)
- ✅ Tests Karma passent
- ✅ E2E Playwright : upload + déploiement depuis chaque page OK
- ✅ Aucun fichier >400 lignes dans le nouveau scope

### Risques

- Régressions UI visuelles : prévoir une batterie de screenshots Playwright avant/après
- Les permissions diffèrent subtilement entre admin et club — bien tester chaque combinaison

---

## Phase 4 — Signed URLs & sécurité SaaS

**Durée** : 1 sprint
**Owner** : Lead backend + devops
**Objectif** : plus d'URLs FTP publiques pour les vidéos SaaS

### Tâches

**4.1 Proxy vidéo signé**

- [ ] Créer endpoint `GET /api/videos/:id/stream?token=xxx` qui :
  - Valide le token JWT (payload : `videoId`, `siteId`, `exp`)
  - Proxie le flux FTP en streaming
  - Cache-Control adapté
- [ ] Alternative : migration vers S3-compatible (OVH Object Storage / Cloudflare R2) + signed URLs natives

**4.2 Émission des tokens**

- [ ] Endpoint `GET /api/saas/:siteId/videos/:videoId/url` retourne URL signée TTL 2h
- [ ] Rotation côté client SaaS : rafraîchir l'URL à 80% du TTL

**4.3 CDN**

- [ ] Configurer Cloudflare devant le proxy (cache 5min sur signed URL)
- [ ] Vérifier que les signed URLs incluent un `v=<checksum>` pour invalidation cache

**4.4 Migration progressive**

- [ ] Feature flag : `SAAS_SIGNED_URLS_ENABLED`
- [ ] Rollout sur un site test (site interne Neopro)
- [ ] Rollout général après 1 semaine stable

### Critères d'acceptation

- ✅ Les URLs FTP publiques ne sont plus exposées aux clients SaaS
- ✅ TTL respecté (URL expire bien après 2h)
- ✅ Performance : latence première frame <500ms (mesure depuis Grafana)
- ✅ Tests smoke couvrent la signature + expiration

---

## Phase 5 — Split fichiers monstres (fil rouge)

**Durée** : en continu
**Owner** : tout le monde
**Objectif** : aucun fichier >400 lignes dans le scope vidéo/déploiement

### Fichiers à splitter

| Fichier                                                                       | Lignes | Cible                                                                                                                     |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `central-server/src/services/deployment.service.ts`                           | 786    | 3 fichiers : `deployment.service.ts` (core), `deployment-pi.strategy.ts`, `deployment-saas.strategy.ts`                   |
| `central-server/src/controllers/content.controller.ts`                        | 549    | Déjà partiellement splitté avec `content-deployment.controller.ts` — finir le split (video CRUD vs variants vs templates) |
| `central-dashboard/src/app/features/club-portal/club-dashboard.component.ts`  | 837    | Séparer template + styles + classe                                                                                        |
| `central-dashboard/src/app/features/content/lottie-templates.component.ts`    | 957    | Sous-composants par type de template                                                                                      |
| `central-dashboard/src/app/features/content/video-variant-panel.component.ts` | 606    | Extraire logique variants dans un service                                                                                 |

### Règle

Lors de toute PR touchant un de ces fichiers, le splitter ou au moins ne pas l'agrandir (pre-commit hook optionnel : warning si +lignes sur fichier >400L).

---

## Phase 6 — (Optionnel) Strategy pattern Pi/SaaS

**Durée** : 1 sprint
**Prérequis** : Phase 5 partielle (`deployment.service.ts` splitté)
**Déclencheur** : seulement si un 3ème mode de livraison arrive (Chromecast, Smart TV native)

### Architecture cible

```typescript
interface DeliveryStrategy {
  canHandle(site: Site): boolean;
  deliver(video: Video, site: Site): Promise<DeliveryResult>;
}

class PiSocketStrategy implements DeliveryStrategy { ... }
class SaasDirectStrategy implements DeliveryStrategy { ... }
// futur :
class ChromecastStrategy implements DeliveryStrategy { ... }
```

Le `deployment.service` ne contient plus de `if (siteType === 'saas')`, il itère sur les stratégies enregistrées.

---

## Gouvernance & tracking

### Métriques de succès

| Métrique                                      | Avant     | Cible            |
| --------------------------------------------- | --------- | ---------------- |
| Note globale (audit)                          | 62/100    | 82/100           |
| Lignes duplication vidéo/deploy               | ~3000     | <500             |
| Fichiers >400L dans le scope                  | 6         | 0                |
| Bugs déploiement SaaS depuis onglet site      | ∞ (cassé) | 0                |
| Couverture smoke scénarios Pi×SaaS×Admin×Club | partielle | complète (8 cas) |

### Points de validation

- Fin Phase 1 : démo à l'équipe, smoke pass, déployé prod
- Fin Phase 2 : revue PR + glossaire validé
- Fin Phase 3 : screenshots diff + E2E complet + démo produit
- Fin Phase 4 : test de charge + audit sécurité

### Rollback

Chaque phase doit pouvoir être rollbackée via `git revert` sans casser les autres. Les migrations SQL de Phase 2 sont **non-destructives** par design (on garde les noms de tables).

---

## TL;DR

1. **Semaine 1** : 1-ligne fix débloque le SaaS (ROI massif)
2. **Sprint suivant** : on unifie le vocabulaire
3. **2 sprints après** : composant unique, -3000 lignes
4. **Puis** : signed URLs pour la sécurité SaaS
5. **En continu** : split des gros fichiers
6. **Plus tard si besoin** : Strategy pattern

À valider avec l'équipe avant démarrage.
