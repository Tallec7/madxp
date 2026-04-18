# ADR-058: PIN distant par profil (authentification télécommande cloud)

**Date** : 2026-04-18
**Statut** : Accepté
**Format** : Complet
**Phase** : 1 (implémentée) — propagation Pi offline + dashboard super_admin

---

## Contexte

Avant cette décision, la télécommande cloud (`/api/remote/:siteId/*`) était protégée par :

1. Un UUID de site (128 bits d'entropie) dans l'URL.
2. Un rate-limit 60 req/min par IP.
3. Un PIN site-global optionnel (`sites.remote_pin_hash`) validé côté central avec émission d'un JWT 24h.

Ce modèle posait trois problèmes :

- **Granularité** : un club avec plusieurs profils (saison normale, mode match, coupe, tournoi) partageait le même PIN → impossible d'autoriser le staff à piloter un profil sans donner accès aux autres.
- **Révocation** : le JWT était opaque, non révocable, et la seule contre-mesure était de rotate le PIN — ce qui déconnectait tout le monde.
- **Offline** : le Pi n'avait aucune connaissance du PIN et déléguait la validation au cloud → une télécommande locale sans internet ne pouvait pas être authentifiée.

## Décision

Adopter un modèle **PIN par profil** avec **tokens par appareil révocables** :

- Chaque `config_profiles.id` peut avoir un PIN indépendant (hash bcrypt rounds=12 dans `remote_pin_hash`, flag `remote_pin_required`).
- Après validation du PIN, un JWT **30 jours** (`type: 'remote-profile-pin'`) est émis avec un `tokenId` unique (uuidv4), et une ligne `profile_device_tokens` est insérée (`id = tokenId`, `token_hash` SHA-256).
- Le middleware `remote-pin.middleware.ts` accepte les deux formats : nouveau token profil (validé via lookup DB du `tokenId`) et legacy token site-scope (conservé pour rétro-compatibilité — les deux coexistent sans coupure de service).
- La gestion PIN et devices est **super_admin only** (UI + middleware).
- Le Pi reçoit les métadonnées PIN (`remote_pin_hash`, `remote_pin_required`, `remote_pin_updated_at`) via `sync_profiles` — un service local Pi (`profile-pin.service.js`) peut valider les PINs **hors-ligne** via `bcrypt.compare`, avec le même rate-limit que le cloud (5 tentatives / 10 min par IP).

## Alternatives rejetées

- **MFA TOTP côté remote** : rejeté car les staff des clubs n'ont pas de compte dashboard et le setup TOTP est incompatible avec une télécommande ad-hoc dans un club le samedi matin.
- **Magic link par email** : rejeté car latence réseau + besoin d'email du staff + dépendance mail provider.
- **PIN unique par site avec ACL profil** : rejeté car ne résout pas la révocation granulaire et reste un secret partagé.
- **Remplacer purement le PIN site-scope** : rejeté pour préserver les déploiements existants (rétro-compatibilité lors du roll-out).

## Conséquences

### Positives

- Granularité : chaque profil (entraînement, match, cérémonie) a son propre PIN.
- Révocation : un staff qui quitte le club → super_admin révoque son device token (ou tous les tokens du profil) sans impact sur les autres.
- Offline : un Pi coupé d'internet peut toujours valider la télécommande locale.
- Audit : `profile_device_tokens.revoked_reason` + logs Winston (`Profile PIN verified/failed`).
- Monitoring : Prometheus counters `neopro_profile_pin_verifications_total{status}` (success/failure/lockout/misconfigured) + gauge `neopro_profile_device_tokens_active`.
- Purge automatique : daily cleanup des tokens révoqués/expirés > 30j.

### Négatives / Risques

- **Surface d'attaque** augmentée : une nouvelle route publique (`verify-pin`) — mitigé par rate-limit remote (60/min) + lockout brute-force (5/10min par `ip:profileId`).
- **Latence bcrypt** : bcrypt rounds=12 = ~250ms par `compare` → acceptable pour un PIN, inacceptable pour une auth fréquente (le token 30j évite l'hot-path).
- **Dérive PIN Pi ↔ Cloud** : si le sync profil échoue, le Pi peut avoir un PIN stale. Mitigé par `remote_pin_updated_at` + refus des PINs expirés côté Pi.
- **Cache mémoire lockout** : perd son état au restart. Acceptable car un attaquant qui force un redeploy doit aussi rate-limiter ses requêtes (60/min par IP), et le lockout n'est qu'une couche de défense secondaire.

## Fichiers impactés

### Central-server

- `src/scripts/add-profile-remote-auth.sql` — migration (colonnes PIN + table `profile_device_tokens`).
- `src/repositories/config-profile.repository.ts` — `findPin`, `setPin`, `profileDeviceTokenRepository` (create avec `id` explicite, findByHash, revoke, cleanupExpired, countActive).
- `src/controllers/remote-auth.controller.ts` — 5 endpoints (setPin, listDevices, revokeDevice, revokeAllDevices, verifyPin) + métriques Prometheus.
- `src/middleware/remote-pin.middleware.ts` — dual support profile/legacy, `generateRemoteProfilePinToken`, `hashDeviceToken`.
- `src/middleware/validation.ts` — schemas `setProfileRemotePin`, `verifyProfilePin`, `revokeAllDevices`, paramSchema `siteIdProfileIdTokenId`.
- `src/routes/config-profiles.routes.ts` — 4 routes super_admin (PUT /remote-pin + GET/POST /remote-devices\*).
- `src/routes/remote.routes.ts` — route publique `POST /:siteId/profiles/:profileId/verify-pin`.
- `src/controllers/config-profiles.controller.ts` — propagation PIN dans `deployProfile` et `syncProfiles` (enrichissement config envoyée au Pi).
- `src/services/profile-sync.service.ts` — inclut les métadonnées PIN dans la payload `sync_profiles`.
- `src/services/metrics.service.ts` — Counter `neopro_profile_pin_verifications_total` + Gauge `neopro_profile_device_tokens_active` + méthodes `recordProfilePinVerification`, `recordProfileDeviceTokensActive`.
- `src/server.ts` — daily cleanup cron (30j de rétention post-révocation/expiration) + refresh gauge.

### Raspberry Pi

- `raspberry/sync-agent/src/commands/sync-profiles.js` — écrit `profiles/{id}.pin.json` (chmod 600) + nettoie les entrées stale.
- `raspberry/server/services/profile-pin.service.js` — validation offline via bcrypt + lockout 5/10min.
- `raspberry/server/routes/profile-pin.js` — route Pi locale `/profile-pin/:profileId/verify`.
- `raspberry/server/server.js` — wiring ProfilePinService + router.
- `raspberry/server/env-config.js` — export `PROFILES_DIR`.
- `raspberry/server/package.json` — dépendance `bcryptjs`.

### Dashboard

- `src/app/core/services/remote-auth.service.ts` — 4 méthodes (setPin, listDevices, revokeDevice, revokeAllDevices).
- `src/app/core/services/remote.service.ts` — `verifyProfilePin`, device-ID persistant (localStorage), tokens scoped par profil, map `currentProfileBySite` + fallback dans `getHeaders` pour que les commandes existantes (playVideo, resetScore…) portent automatiquement le token profil après vérification PIN.
- `src/app/core/models/config-profile.model.ts` — champ `remote_pin_required?: boolean`.
- `src/app/features/sites/components/site-settings-tab/remote-auth-section/` — composant standalone super_admin (liste profils, PIN input, appareils révocables).
- `src/app/features/sites/components/site-settings-tab/site-settings-tab.component.{ts,html}` — intégration avec guard `*ngIf="isSuperAdmin"`.

### Phase 1.1 — Cloud Remote UI (intégration côté télécommande)

- `central-server/src/controllers/remote.controller.ts` — `getRemoteState` expose `profiles[]`, `activeProfileId` et `authenticatedProfileId` ; agrégation `pinRequired = legacy || anyProfilePinRequired` ; décodage dual legacy/profile du `x-remote-token`.
- `central-server/src/repositories/config-profile.repository.ts` — `findProfilesMetadata` ajoute `COALESCE(remote_pin_required, false)` pour exposer le flag PIN par profil.
- `central-dashboard/src/app/features/remote/cloud-remote.component.{ts,html}` — sélecteur de profil visible quand ≥2 profils ; dispatche vers `verifyProfilePin(siteId, profileId, pin)` quand le profil sélectionné requiert un PIN, sinon fallback legacy `verifyPin(siteId, pin)` ; sync automatique du profil sélectionné via `syncProfilesFromState` (priorité : authenticated → active → premier-avec-PIN → premier) ; `setCurrentProfileContext` après succès pour que les commandes suivantes héritent du token.

### Tests

- 25 tests dans `central-server/src/__tests__/smoke/smoke-adr-refactoring.test.ts` → describe `ADR-058 Phase 1` (16 Phase 1 + 5 Phase 1.1 guards UI Cloud Remote + 4 supervision).
- `central-server/src/controllers/remote-auth.controller.test.ts` — 15 unit tests (super_admin gate, setPin bcrypt rounds=12, verifyPin 200/401/429 lockout, revoke).
- `central-server/src/middleware/remote-pin.middleware.test.ts` — 11 unit tests (passthrough, profile-scoped token, legacy site token, fallback pré-migration).
- `central-dashboard/src/app/features/sites/components/site-settings-tab/remote-auth-section/remote-auth-section.component.spec.ts` — 13 Karma tests (setPin / clearPin / revokeDevice / revokeAll / toggleDevices / loadProfiles).
- `raspberry/server/__tests__/profile-pin.service.test.js` → unit tests service Pi.

## Monitoring et supervision

### Métriques Prometheus

| Métrique                                 | Type    | Labels                                           | Signification                                  |
| ---------------------------------------- | ------- | ------------------------------------------------ | ---------------------------------------------- |
| `neopro_profile_pin_verifications_total` | Counter | `status` (success/failure/lockout/misconfigured) | Toutes les tentatives de validation PIN        |
| `neopro_profile_device_tokens_active`    | Gauge   | —                                                | Nb de device tokens actifs (refresh quotidien) |

### Logs Winston (structured)

- `'Profile remote PIN updated'` — niveau info, toute modif/suppression PIN (actor, siteId, profileId, revokedTokens).
- `'Profile PIN verified successfully'` — niveau info (ip, deviceId).
- `'Profile PIN verification failed'` — niveau warn (ip, attempts).
- `'Profile device token revoked'` / `'All profile device tokens revoked'` — niveau info (actor).
- `'profile_device_tokens purged'` — niveau info (deleted, active) — daily cleanup.

### Alertes suggérées (Grafana/Alertmanager)

```yaml
# Ratio failures > 50% sur 15 min → possible brute-force
- alert: ProfilePinBruteForce
  expr: |
    rate(neopro_profile_pin_verifications_total{status="failure"}[15m])
      / rate(neopro_profile_pin_verifications_total[15m]) > 0.5

# Lockouts anormalement élevés
- alert: ProfilePinHighLockoutRate
  expr: rate(neopro_profile_pin_verifications_total{status="lockout"}[5m]) > 1
```

## Garde-fous anti-régression

Les invariants suivants sont verrouillés par `smoke-adr-refactoring.test.ts` (describe `ADR-058 Phase 1`) :

- Migration SQL présente (`remote_pin_hash`, table `profile_device_tokens`).
- Repository expose `findPin`, `setPin`, `cleanupExpired`, `countActive`, et le sous-repo `profileDeviceTokenRepository`.
- Controller `remote-auth.controller.ts` enregistre les 4 statuts de métrique (`success`, `failure`, `lockout`, `misconfigured`).
- `remote-pin.middleware.ts` supporte les deux payloads (profile + legacy).
- Routes `config-profiles.routes.ts` sont gated `requireRole('super_admin', 'club')` (le bypass middleware `requireRole` limite déjà `club` à son propre site ; Phase 2B).
- Controller `remote-auth.controller.ts` applique `requireSuperAdminOrOwnClub` (defense-in-depth au-delà du middleware) sur setPin/list/revoke (Phase 2B).
- Composant dashboard `<app-remote-auth-section>` est monté dans `club-dashboard.component.ts` (Phase 2B) en plus du `site-settings-tab` super_admin.
- `server.ts` wire la purge quotidienne avec `.unref()` (pas de fuite de handler).
- `getRemoteState` expose `profiles[]`, `activeProfileId`, `authenticatedProfileId` (Phase 1.1).
- `findProfilesMetadata` inclut `COALESCE(remote_pin_required, false)` pour alimenter le sélecteur de profil côté Cloud Remote.
- `cloud-remote.component` rend le sélecteur de profil (`.pin-profile-selector`) dès qu'il y a ≥2 profils et dispatche vers `verifyProfilePin` quand le profil sélectionné requiert un PIN.
- `RemoteService` expose `setCurrentProfileContext` / `clearCurrentProfileContext` / `getCurrentProfileContext` pour que les commandes héritent du profil authentifié sans modifier leurs signatures.

## Phase 2B — Portail club (implémenté)

- Le rôle `club` peut maintenant gérer les PIN de SON site (défini par `user.site_id`).
- Routes `config-profiles.routes.ts` : `requireRole('super_admin', 'club')` — le bypass middleware de `requireRole` cantonne déjà les users club à leur propre site via la comparaison `user.site_id === req.params.siteId`.
- Controller `remote-auth.controller.ts` : `requireSuperAdmin` → `requireSuperAdminOrOwnClub` (vérifie `user.role === 'club' && user.site_id === req.params.siteId`) en defense-in-depth.
- Dashboard `club-dashboard.component.ts` : monte `<app-remote-auth-section [siteId]="...">` — même composant que super_admin, pas de duplication.
- Tests : 2 nouveaux unit tests controller (`setProfilePin` + `listProfileDevices` club-on-own-site), 3 nouveaux smoke guards dans `smoke-adr-refactoring.test.ts`.

## Phase 2C — Alertes email burst failures (implémenté)

- 3 règles Prometheus dans `docker/prometheus/rules.yml` (groupe `remote_auth_security`), toutes taguées `category: security` :
  - `ProfilePinBurstFailures` : `increase(neopro_profile_pin_verifications_total{status="failure"}[1h]) > 20` (critical) — ciblage attaque probable.
  - `ProfilePinBruteForce` : ratio failures > 50% sur 15 min (warning).
  - `ProfilePinHighLockoutRate` : `rate(lockout) > 1/s` sur 5 min (warning).
- Nouveau receiver Alertmanager `security-email-slack` (SMTP via env : `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM`) — email HTML au super_admin + duplicata Slack `#neopro-alerts` avec préfixe `:lock:`.
- Route Alertmanager : `match: { category: security }` → `security-email-slack`, `group_wait: 20s`, `repeat_interval: 1h`.
- Variables ajoutées à `central-server/.env.example` (`ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM`).
- 2 nouveaux smoke guards (`rules.yml` + `alertmanager.yml`).

## Phase 2A — Migration opportuniste legacy → default profile (implémenté)

- `central-server/src/services/pin-migration.service.ts` : helper `migrateLegacyPinToDefaultProfile(siteId, plainPin)` :
  1. cherche le profil `is_default = true` du site
  2. si le profil a déjà un PIN → skip (`skipped_already_set`)
  3. sinon : `bcrypt.hash(plainPin, 12)` → `configProfileRepository.setPin()` → `siteRepository.clearRemotePin()`
  4. log Winston + métrique Prometheus
- Appelé depuis `remote.controller.verifyPin` en **fire-and-forget** (`void migrateLegacyPinToDefaultProfile(...)`) après un succès SHA-256 legacy — non-bloquant, 0 impact sur la réponse HTTP.
- Nouveau counter `neopro_legacy_pin_migrations_total{status}` (4 statuts : `success`, `skipped_no_default`, `skipped_already_set`, `failed`).
- Tests : 4 unit tests dans `pin-migration.service.test.ts` (success / no-default / already-set / failure non-fatal) + 3 smoke guards.
- Résultat : après la première connexion télécommande réussie avec PIN legacy, le site passe automatiquement sur le nouveau schéma profil (plus besoin de manip manuelle super_admin).

---

_Dernière mise à jour : 18 avril 2026 (Phase 2A — migration opportuniste legacy → default profile PIN)_
