# Prompt — Phase 2 : Unification des interfaces `Video` (frontend)

> Copie ce bloc entier comme premier message dans une nouvelle session Claude Code.

---

## Contexte

Repo : `Neopro` — système de TV interactive pour clubs sportifs. Architecture 3-tiers (Dashboard Angular 20 → Express/PG → Raspberry Pi).

Tu reprends un chantier multi-phases documenté dans `.planning/video-deploy-unification/PLAN.md`. **Phase 1 est déjà mergée** (PR [#463](https://github.com/Tallec7/neopro/pull/463) — filtre club SaaS étendu avec `content_deployments`).

**Ta mission** : exécuter Phase 2 (version révisée 2026-04-18, frontend uniquement, 1-2 jours).

## Problème chiffré

Le dashboard Angular a **5 interfaces `Video` parallèles** qui se chevauchent sans cohérence :

| Fichier                                                                                       | Nom                     | Champs       | Consommateurs |
| --------------------------------------------------------------------------------------------- | ----------------------- | ------------ | ------------- |
| `central-dashboard/src/app/core/models/index.ts:224`                                          | `Video` (snake_case DB) | 15           | **0** 🚨      |
| `central-dashboard/src/app/features/content/content-management-data.service.ts:14`            | `Video`                 | 7            | 3             |
| `central-dashboard/src/app/features/advertisers/sponsor-video-data.service.ts:6`              | `Video`                 | 6            | 1             |
| `central-dashboard/src/app/features/remote/services/cloud-remote-navigation.service.ts:16`    | `Video`                 | 5            | 2             |
| `central-dashboard/src/app/features/sites/components/video-library/video-library.types.ts:15` | `VideoItem`             | 23 camelCase | 9             |

Le modèle DB canonique n'est utilisé par personne. `VideoItem` est la définition de fait la plus riche. `sponsor-video-data` et `content-management-data` dupliquent des sous-ensembles arbitraires.

## Approche imposée (ne pas improviser)

**NE PAS** fusionner les 5 interfaces en une seule — elles ne sont pas compatibles (snake_case DB vs camelCase UI vs minimal remote). Un monstre avec 30+ champs optionnels serait pire que la dette actuelle.

**Approche correcte : composition / hiérarchie de view models.**

```
core/models/video.model.ts
├── Video           (canonique DB, snake_case, miroir exact de la row Postgres)
├── VideoView       (camelCase, champs UI de base : id, filename, displayName, duration, size)
└── (view models feature-specific étendent VideoView quand besoin)

features/sites/.../video-library.types.ts
└── VideoItem       (extends VideoView, ajoute isOnPi, configRoles, owner, etc.)

features/advertisers/sponsor-video-data.service.ts
└── SponsorVideoRow (extends VideoView, ajoute advertiserName, campaignId)

features/remote/services/cloud-remote-navigation.service.ts
└── RemoteVideoEntry (minimal, pas forcément lié — reste autonome si pertinent)
```

Chaque transformation API → view model vit dans un `mapXxxToView(row: Video): VideoView` unique, réutilisable.

## Tâches

### 2.1 Créer la hiérarchie canonique

- [ ] Créer `central-dashboard/src/app/core/models/video.model.ts`
  - Exporter `Video` (snake_case, identique à la row DB — 15 champs actuels de `core/models/index.ts:224`)
  - Exporter `VideoView` (camelCase, ~10 champs essentiels UI)
  - Exporter fonction `mapVideoRowToView(row: Video): VideoView`
- [ ] Supprimer l'ancien `Video` de `core/models/index.ts` (réexporter depuis `video.model.ts` pour compat)
- [ ] Ajouter commentaire `@deprecated — use VideoView` sur les 3 petits `Video` locaux

### 2.2 Migration `VideoItem` → `extends VideoView`

- [ ] Dans `video-library.types.ts`, faire `interface VideoItem extends VideoView { ... champs spécifiques }`
- [ ] Vérifier que les 9 consommateurs compilent sans modif
- [ ] `npm run test:central` — 520 Karma tests doivent passer

### 2.3 Migration `sponsor-video-data` et `content-management-data`

- [ ] Remplacer le `Video` local par `VideoRow` (alias du canonique) ou `VideoView`
- [ ] Adapter les 4 consommateurs (3 content + 1 sponsor)
- [ ] Un seul mapping d'API (supprimer les champs inventés ad-hoc)

### 2.4 `cloud-remote-navigation.service.ts`

- [ ] Évaluer si `Video` minimal reste pertinent → **renommer en `RemoteVideoEntry`** (ce n'est pas une Video au sens métier, c'est une entrée de navigation)
- [ ] Propager aux 2 consommateurs

### 2.5 Smoke + validation

- [ ] `npm run test:smoke:smart` — 0 régression
- [ ] `npm run lint`
- [ ] `cd central-dashboard && ng build --configuration production` (pour attraper les erreurs de types en prod)

## Contraintes absolues (smoke-enforced)

- **~30 règles SaaS** dans `.claude/rules/saas.md` — le moindre changement sur `video-library.types.ts`, `site-content-tab.component.ts`, `video-manager.component.ts` peut casser un smoke test
- Lis **toutes** les règles `.claude/rules/dashboard.md` et `.claude/rules/saas.md` avant de modifier ces zones
- **Pas de push direct sur main** — PR obligatoire (CLAUDE.md)
- **TypeScript strict** — 0 `any`
- **Commits conventionnels** : `refactor(types):`

## Git workflow

```bash
git checkout main && git pull
git checkout -b refactor/video-interface-unification
# ... travail + commits atomiques par tâche (2.1, 2.2, 2.3, 2.4) ...
git push -u origin refactor/video-interface-unification
gh pr create --title "refactor(types): canonical Video + VideoView composition hierarchy"
```

## Critères d'acceptation

- ✅ Une seule source de vérité pour le shape DB (`Video` canonique)
- ✅ Une `VideoView` UI dont tout le monde descend (via composition)
- ✅ 4 des 5 interfaces actuelles supprimées ou devenues `extends`
- ✅ `cloud-remote-navigation.service` → renommé pour clarté (pas forcé à hériter)
- ✅ 520 tests Karma + 1221 smoke tests passent
- ✅ Build prod OK

## Pièges connus

- **Ne pas fusionner aveuglément** — l'erreur de débutant est de vouloir un seul `Video` monolithique.
- **Ne pas toucher le backend** — audit a montré que `central-server` est déjà propre (1 type `ContentDeployment` central). Phase 2 est **frontend-only**.
- **Le mapping snake_case ↔ camelCase est là où les bugs vivent** — concentre `mapVideoRowToView()` à un seul endroit, teste-le.
- Si un test smoke casse, **ne pas le modifier pour qu'il passe** — il signale probablement une régression UX enforcée (labels SaaS, etc.).

## Non-goals (explicitement hors scope)

- ❌ Rename `content_deployments` en DB
- ❌ Alias API `/api/deployments`
- ❌ Rename `ContentDeployment` backend
- ❌ Refonte `video-library` ou `site-content-tab` (ça c'est Phase 3)

## Livrables attendus

1. PR `refactor/video-interface-unification` avec CI verte
2. Commit final mettant à jour `.planning/video-deploy-unification/PLAN.md` (Phase 2 cochée)
3. Un bref résumé en fin de session : nombre de fichiers touchés, tests passés, liens PR

Bon courage. Lis `PLAN.md` et `.claude/rules/saas.md` avant de commencer.
