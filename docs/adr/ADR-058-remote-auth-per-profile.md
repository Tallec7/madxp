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
- `src/app/core/services/remote.service.ts` — `verifyProfilePin`, device-ID persistant (localStorage), tokens scoped par profil.
- `src/app/core/models/config-profile.model.ts` — champ `remote_pin_required?: boolean`.
- `src/app/features/sites/components/site-settings-tab/remote-auth-section/` — composant standalone super_admin (liste profils, PIN input, appareils révocables).
- `src/app/features/sites/components/site-settings-tab/site-settings-tab.component.{ts,html}` — intégration avec guard `*ngIf="isSuperAdmin"`.

### Tests

- 16 tests dans `central-server/src/__tests__/smoke/smoke-adr-refactoring.test.ts` → describe `ADR-058 Phase 1`.
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
- Routes `config-profiles.routes.ts` sont gated `requireRole('super_admin')`.
- Composant dashboard `<app-remote-auth-section>` est gated `*ngIf="isSuperAdmin"`.
- `server.ts` wire la purge quotidienne avec `.unref()` (pas de fuite de handler).

## Phase 2 (prévu — hors scope ADR-058)

- Remplacement progressif du PIN site-scope legacy par migration opportuniste (tous les PINs site → PIN profil par défaut).
- UI de gestion PIN dans le portail club (rôle `club`) pour leur propre site — aujourd'hui super_admin only.
- Notifications email au super_admin lors d'un burst de failures (>20/h sur un profil).

---

_Dernière mise à jour : 18 avril 2026_
