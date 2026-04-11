---
paths:
  - 'central-dashboard/src/app/**'
---

# Dashboard Angular — Règles de décomposition et UI

## Feature Gates (ADR-039)

- Gater une feature par tier d'abonnement avec un check en dur `site.subscription_plan === 'premium'` — TOUJOURS passer par `FeatureGateService.canAccess(feature, siteOrPlan)` côté dashboard et `requireSiteTier()` côté serveur, et ajouter la feature au map `FEATURE_TIERS` de `feature-gate.service.ts`. Les gates actuels (`image_to_video`, `multi_profiles`, `weighted_rotation`, `analytics_advanced`, `secondary_display`, `remote_diagnostic`, `white_label`, `watermark`, `hourly_schedule`, `sponsor_portal`) sont verrouillés par smoke test — tout retour arrière casse le build.
- Passer `subscriptionPlan` (string) seul à `FeatureGateService.canAccess()` quand le site a des `feature_overrides` — toujours passer l'objet `{ subscription_plan, feature_overrides }` pour que les overrides super_admin soient pris en compte (ADR-039 Phase 3 — smoke test enforced)

## Composants protégés (smoke test enforced)

- NE PAS supprimer le composant `club-diagnostic`, sa route `/club/diagnostic`, ou le lien sidebar dans `layout.component.ts` (vue read-only Premium ADR-039 Phase 2.11)
- NE PAS retirer `subscriptionPlan` / `canUseSecondaryDisplay` du `video-library` ou la modal variante du `video-manager` (Phase 2.10 ADR-039)
- NE PAS retirer les guards `canUseAnalyticsAdvanced` de `club-analytics.component.ts` sur l'option 90j et les boutons CSV/PDF (Phase 2.9 ADR-039)
- NE PAS revenir à `redirectTo: ''` sur la route wildcard `**` dans `app.routes.ts` (masque les erreurs de navigation — toujours charger `NotFoundComponent`)

## Décomposition existante — NE PAS REVERSER (smoke test enforced)

### Services extraits

- `SitesService` → décomposé en `SiteMetricsService`, `SiteCommandService`, `SiteSponsorService`
- `sites.controller.ts` → décomposé en `site-commands.controller.ts`, `site-debug.controller.ts`, `site-fleet.controller.ts`

### Composants décomposés

- `advertiser-detail.component.ts` → `sponsor-campaigns-tab`, `sponsor-videos-tab`, `sponsor-sites-tab`, `sponsor-info-tab`, `sponsor-quick-stats`, `sponsor-edit-modal`, `sponsor-delete-modal` + `AdvertiserDetailDataService` + `AdvertiserModalService` + `AdvertiserFormService`
- `analytics-traction.component.ts` → `TractionDataService` + 9 sous-composants dans `analytics/components/`
- `analytics.component.ts` → `engagement-chart`, `analytics-kpi-grid`, `top-clubs-card`, `dormant-clubs-card`, `sponsor-summary-card`, `fleet-health-card`
- `config-editor.component.ts` → `ConfigEditorDataService` + template/styles extraits en `.html`/`.scss`
- `site-settings-tab.component.ts` → `SiteSettingsDataService` + template/styles extraits
- `site-detail.component.ts` → template/styles extraits en `.html`/`.scss`
- `content-management.component.ts` → `ContentManagementDataService` + `VideoUploadService` + `ContentDeploymentService`
- `advertiser-videos.component.ts` → `SponsorVideoDataService` + `DragDropService<T>`
- `club-analytics.component.ts` → `ClubAnalyticsChartService` + `ClubExportService` + `club-analytics.utils.ts`
- `users-management.component.ts` → `UsersManagementDataService` + `UserFiltersService` + `UserValidationService` + sous-composants `users-table`, `users-filters`, `user-form-modal`, `user-delete-modal`
- `agencies-management.component.ts` → `AgenciesManagementDataService` + template/styles extraits
- `subscriptions-management.component.ts` → `SubscriptionsManagementDataService`
- `updates-management.component.ts` → `UpdatesManagementDataService`
- `site-sponsors-tab.component.ts` → `SiteSponsorsTabDataService` + `SiteSponsorsChartService`
- `video-upload-zone` et `remote-preview` → déplacés vers `shared/components/`

### Règles API dans les composants (smoke test enforced)

- NE PAS utiliser `fetch()` dans les composants dashboard (toujours `ApiService` Observable-based — `fetch()` bypasse l'intercepteur HTTP et les cookies HttpOnly)

## Vidéo Library

- NE PAS construire des chemins vidéo spéculatifs avec `videos/${category}/${filename}` (le Pi sanitize, déduplique et préfère `originalName` → mismatch — toujours utiliser `deployedPathsMap` alimenté par le feedback `deployed_path` de `content_deployments`)
- NE PAS utiliser `'UPLOADS'` comme fallback catégorie quand `cloud.category` est null (le Pi reçoit `'default'` via `deployment.service.ts` → toujours utiliser `'default'` comme fallback dans `site-content-tab.component.ts`)
- NE PAS calculer les stats de la barre `library-stats` sur `allVideos` dans `processVideos()` (toujours calculer sur `filteredVideos` dans `applyFilters()`)
- NE PAS calculer `isDuplicate` (badge DOUBLON) dans `processVideos()` sur `allVideos` (toujours calculer dans `applyFilters()` sur le set filtré visible)
- NE PAS revenir à `syncJsonFromConfig()` avec un subset de 4 champs dans `config-editor.component.ts` (le JSON editor doit montrer la config complète)

## OTA Dashboard

- NE PAS supprimer `data.error` du type cast dans `subscribeToDeploymentProgress()` de updates-management.component.ts
- NE PAS remettre `&& deployment.error_message` dans le `*ngIf` du bloc `.deployment-error` (toujours afficher un fallback explicatif)
- NE PAS supprimer `getDeploymentDuration()` / `getDeploymentElapsed()` / le bloc `.deployment-summary`
- NE PAS supprimer `countActiveForSite()` de `alert.repository.ts` (alimente `activeAlertsCount` du dashboard club)
- NE PAS supprimer `findLastForSite()` de `software-update.repository.ts` (alimente `lastOtaDeployment` du dashboard club Pi)
- NE PAS supprimer les OTA badges (`ota-badge`, `ota-ok`, `ota-err`, `ota-pending`) ou la card alertes actives de `club-dashboard.component.ts`
- NE PAS rendre `<app-club-saas-actions>` ou `<app-club-help-modal>` dans `club-loop.component.ts` (Ma boucle) — ces composants vivent uniquement sur `club-dashboard.component.ts` (Mon club)
