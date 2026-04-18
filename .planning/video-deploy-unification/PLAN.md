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

## Phase 2 — Unification du vocabulaire (✅ Done 2026-04-18 via ADR-065)

**Statut** : ✅ Fait — travail absorbé par ADR-065 (Video type canonisation)
**Durée réelle** : 0 jour (aucun travail supplémentaire)
**Objectif atteint** : base canonique `VideoView` + DTOs spécialisés par domaine

### Résultat de l'audit final (2026-04-18)

| Type               | Fichier                                                 | Rôle                             | Statut            |
| ------------------ | ------------------------------------------------------- | -------------------------------- | ----------------- |
| `Video`            | `core/models/video.model.ts:30`                         | Miroir DB snake_case (namespace) | ✅ 0 consommateur |
| `VideoView`        | `core/models/video.model.ts:53`                         | Base UI camelCase canonique      | ✅ Utilisée       |
| `VideoItem`        | `video-library/video-library.types.ts:22`               | `extends VideoView` (enrichi UI) | ✅ Canonisée      |
| `CloudVideo`       | `core/models/index.ts:247`                              | DTO wire format API centrale     | ✅ Renommé        |
| `ContentVideoRow`  | `content/content-management-data.service.ts:21`         | Row table Page Contenu           | ✅ Renommé        |
| `SponsorVideoRow`  | `advertisers/sponsor-video-data.service.ts:14`          | Row table sponsor                | ✅ Renommé        |
| `RemoteVideoEntry` | `remote/services/cloud-remote-navigation.service.ts:24` | Entry remote cloud               | ✅ Renommé        |

Les 4 interfaces `Video` parallèles de l'audit initial ont été renommées en DTOs domaine-spécifiques, éliminant toute ambiguïté nominale.

**Note** : `CloudVideo.thumbnail_url` reste en snake_case car c'est le format wire du backend (`content.controller.ts:260`). Le renommer forcerait un mapper. Décision : on garde.

### Non-goals (toujours valides)

- ❌ Rename `content_deployments` en DB — trop risqué, gain nul
- ❌ Alias `/api/deployments` ↔ `/api/content/deployments` — pas de consommateur externe
- ❌ Rename `ContentDeployment` → `Deployment` backend — cohérent avec la table
- ❌ ADR dédié — absorbé par ADR-065

### Critères d'acceptation (tous remplis)

- ✅ Base canonique `VideoView` unique, DTOs domaine clairement nommés
- ✅ `VideoItem extends VideoView` (video-library)
- ✅ Karma 520 tests pass, smoke pass, lint pass

---

## Phase 3 — Extraction primitives vidéo partagées (ADR-067)

**Statut** : ✅ Done 2026-04-18 — scope respecté : `VideoCardComponent` extrait, audit des autres primitives conclut à la non-extraction justifiée (voir [ADR-067](../../docs/adr/ADR-067-video-manager-two-consumers.md))
**Durée réelle** : 1 jour (au lieu du sprint estimé — audit a révélé moins de duplication que prévu)
**Owner** : Lead frontend
**Objectif** : extraire les primitives présentationnelles dupliquées entre Page Contenu et VideoLibrary — **SANS** unifier en composant monolithique

### Décision ADR-067 (rappel)

- 2 consumers conservés : Page Contenu (fleet) + VideoLibrary (per-site). Club-portal délègue à `site-content-tab`.
- Shapes et UX fondamentalement différentes ; un flag `scope` ajouterait ~20 branches pour zéro gain.
- ~80 règles smoke-enforced verrouillent les comportements par siteType.
- Stratégie : extraire les primitives présentationnelles, garder les 2 shells distincts.

### Architecture cible

```
shared/components/
  video-card/          ✅ extrait (slot-based: card-badges, card-actions, card-extras)
  video-upload-zone/   ✅ déjà extrait
features/
  content/             ← shell fleet-wide, consomme video-card
  sites/components/video-library/  ← shell per-site, template custom inline (reverted 2026-04-18)
```

### Tâches

**3.1 `VideoCardComponent`** — ✅ Done 2026-04-18 (commit 2eb609a1)

- [x] Créer `shared/components/video-card/` (57L TS + 124L SCSS)
- [x] Content projection : `[card-badges]`, `[card-actions]`, `[card-extras]`
- [x] Migration Page Contenu (`content-management.component.html`)
- [~] Migration VideoLibrary grid view — tentée puis revertée (commit bb5dc487 revert) : le template custom a trop de branches contextuelles (club-locked, isUploadedForThisSite, deploy states, variant badges) qui ne passent pas naturellement par slots sans alourdir l'API du card

**3.2 Audit des primitives restantes** — ✅ Done 2026-04-18

Audit code effectué sur `content-management.component.html` (651L) vs `video-library-list.component.html` (395L) :

| Candidat            | Présent dans les 2 ? | Similarité | Décision       | Raison                                                                                                                                       |
| ------------------- | -------------------- | ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `VideoFilterBar`    | Partiellement        | ~70%       | ❌ Non extrait | CM : upload+search combo ; VLL : filtres délégués au parent via sub-components — surfaces divergentes                                        |
| `VideoSortHeader`   | VLL only             | N/A        | ❌ Non extrait | CM est une grille de cartes sans tri table ; pas de duplication                                                                              |
| `VideoDeployBadge`  | VLL only             | N/A        | ❌ Non extrait | CM utilise un wizard fleet-wide (`deploy-wizard` multi-select) ; VLL bouton inline avec progress per-video — UX fondamentalement différentes |
| `VideoStatsBar`     | Partiellement        | ~50%       | ❌ Non extrait | VLL stats sur `filteredVideos` (règle smoke enforced `dashboard.md`) ; CM pagination fleet — calculs incompatibles                           |
| `VideoPreviewModal` | Oui                  | ~65%       | ❌ Non extrait | CM possède le modal inline ; VLL émet `preview` au parent — ownership de state divergent                                                     |

**Conclusion** : aucune primitive supplémentaire ne justifie l'extraction. `VideoCardComponent` était le seul vrai doublon. Le reste diverge par design parce que les 2 shells ont des modèles mentaux différents (fleet-wide vs per-site) — c'est exactement ce qu'ADR-067 anticipait.

Le revert du migrate `video-library-list` → `VideoCardComponent` est cohérent avec cette conclusion : même sur la primitive la plus évidente, la version per-site a trop de branches contextuelles (club-locked, deploy states, variants, isUploadedForThisSite) pour passer proprement par slots sans alourdir l'API partagée.

**3.3 Tests & non-régression** — ✅ Done 2026-04-18

- ✅ `video-card.component.spec.ts` créé — 9 tests (title/subtitle/meta, thumbnail, overlays, selected, click emit gated by clickable, tooltip fallback)
- ✅ Karma `test:central` pass (9/9 sur video-card)
- ✅ Smoke `test:smoke:smart` pass (0 régression sur ADR-068)

### Critères d'acceptation

- ✅ `VideoCardComponent` extrait et utilisé par au moins 1 consumer
- ⏳ ≥1 primitive supplémentaire extraite OU décision documentée que les autres blocs divergent trop
- ⏳ Aucun nouveau fichier >400L (règle feedback utilisateur)
- ⏳ Karma + smoke pass

### Risques

- Sur-extraction : ajouter des slots pour couvrir tous les edge cases de VideoLibrary complique l'API de VideoCard sans bénéfice
- Règles smoke-enforced (`.claude/rules/dashboard.md` Vidéo Library) verrouillent des comportements précis (stats sur filtered, pas allVideos) — toute primitive partagée doit les respecter

---

## Phase 4 — Signed URLs & sécurité SaaS

**Statut** : ✅ Done 2026-04-18 via [ADR-068](../../docs/adr/ADR-068-signed-urls-saas-video-proxy.md)
**Implémenté par** : commits `c89e2d58` (ADR), `34ad7259` (code), `c29dda5d` (fix route order)

### Réalisé

**4.1 Proxy vidéo signé** — ✅ Done

- ✅ Endpoint `GET /api/videos/stream?token=xxx` : valide JWT, proxie FTP streaming, forward Range
- ✅ JWT type `video-stream` (≠ auth) — payload : `path`, `siteId`, `exp` (2h TTL)
- ✅ Cache-Control `private, max-age=300`
- ❌ S3/R2 migration : rejetée (cf. ADR-068 — trop lourde, FTP suffit)

**4.2 Émission des tokens** — ✅ Done (approche simplifiée)

- ✅ Tokens embarqués directement dans les URLs `resolveVideoUrls()` de `saas.controller.ts` (helper `buildPublicVideoUrl`)
- ⏩ Endpoint `/url` séparé non nécessaire : la config SaaS contient déjà les URLs signées
- ⏩ Rotation client : pas nécessaire en MVP (reload config SaaS quand token expire)

**4.3 CDN** — ⏩ Reporté (pas critique)

- ⏩ Cloudflare pas nécessaire en MVP (Railway edge suffit pour le trafic SaaS actuel)
- 🔜 À rouvrir si latence première frame >500ms observée en prod

**4.4 Migration progressive** — ✅ Done

- ✅ Feature flag `VIDEO_STREAM_PROXY_ENABLED` (default OFF en code, activé sur Railway)
- ✅ Activation immédiate sur prod 2026-04-18 (rollout simple car proxy isolé)
- ✅ Rollback instant : set `VIDEO_STREAM_PROXY_ENABLED=false` → retour direct FTP

### Critères d'acceptation

- ✅ URLs FTP publiques ne sont plus exposées aux clients SaaS (quand flag ON)
- ✅ TTL respecté (2h, testé via `jwt.verify` avec `ExpiredError`)
- ✅ Tests smoke : 4 nouveaux dans `smoke-saas.test.ts` (sign/verify, controller, routes, flag)
- 🔜 Mesure latence première frame en prod (Grafana — à ajouter dashboard si besoin)

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
