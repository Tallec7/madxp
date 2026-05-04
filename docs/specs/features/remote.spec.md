---
tags: [remote, feature, v1, v2, telecommande]
updated: 2026-05-04
status: active
---

# Spec — Télécommande Remote (V1 + V2)

> Vue d'ensemble des dépendances entre V1, V2, auth, prefs, résilience et sunset.
> Source de vérité : ADR-058, ADR-059, ADR-060, ADR-061, ADR-062, ADR-092, ADR-102.

---

## Ce que c'est

La télécommande permet au staff d'un club de piloter la TV depuis un smartphone ou PC :
changer de profil, démarrer un match, mettre à jour le score, lancer une vidéo.

Elle existe en **deux versions coexistantes** depuis avril 2026, servies via un
dispatcher qui choisit V1 ou V2 selon un feature flag per-site.

---

## Architecture V1 vs V2

```
Route /remote
     │
     ▼
RemoteHostComponent          ← dispatcher 60 lignes (remote-host.component.ts)
     │
     ├── ?v2=0 ou localStorage override=0  ──► RemoteComponent (V1)
     ├── feature_overrides.remote_v2=true  ──► RemoteV2Component (V2)
     └── fallback                          ──► RemoteComponent (V1)
```

### Logique de sélection (ordre de priorité)

| Priorité | Source | Comment |
|---|---|---|
| 1 | `?v2=1` / `?v2=0` en URL | Override immédiat, persiste en localStorage |
| 2 | `localStorage neopro_remote_v2_override` | Persistance entre sessions |
| 3 | `sites.feature_overrides.remote_v2` (DB) | Piloté depuis dashboard super_admin |
| 4 | Fallback | V1 toujours |

### Rollback < 10 secondes

Dashboard → Site → Settings → Feature Overrides → décocher **Télécommande V2 (beta)** → le club rafraîchit.
Ou directement `?v2=0` dans l'URL si urgence terrain.

---

## Fichiers clés

### Pi (Angular frontend)

| Fichier | Rôle |
|---|---|
| `raspberry/src/app/components/remote/remote-host.component.ts` | Dispatcher V1/V2 |
| `raspberry/src/app/components/remote/remote.component.ts` | V1 (~942 lignes) — figé, bugfix seulement |
| `raspberry/src/app/components/remote-v2/remote-v2.component.ts` | V2 — UI hero-centric |
| `raspberry/src/app/components/remote/remote-score.service.ts` | Score live (partagé V1+V2) |
| `raspberry/src/app/components/remote/remote-timer.service.ts` | Chrono (partagé V1+V2) |
| `raspberry/src/app/components/remote/remote-preferences.service.ts` | Prefs UX (partagé V1+V2) |
| `raspberry/src/app/services/saas-config.service.ts` | Lit `featureOverrides`, expose `isFeatureEnabled('remote_v2')` |

### Central Server (API)

| Fichier | Rôle |
|---|---|
| `central-server/src/controllers/remote.controller.ts` | Commandes remote → Pi |
| `central-server/src/controllers/remote-auth.controller.ts` | Auth PIN + device tokens |
| `central-server/src/middleware/remote-pin.middleware.ts` | Validation JWT remote (profil + legacy site-scope) |
| `central-server/src/repositories/remote-preferences.repository.ts` | Prefs UX en DB |
| `central-server/src/repositories/remote-auth-events.repository.ts` | Tracking v1/v2 ratio + audit |
| `central-server/src/repositories/remote-command.repository.ts` | File de commandes remote |

### Dashboard (Angular)

| Fichier | Rôle |
|---|---|
| `central-dashboard/.../feature-gate.service.ts` | Expose le toggle `remote_v2` |
| `central-dashboard/.../site-settings-tab.component.ts` | UI toggle "Télécommande V2 (beta)" |
| `central-dashboard/.../remote-version-toggle.service.ts` | Coexistence V1/V2, sunset 2026-11-01 |
| `central-dashboard/.../transport-resilience.service.ts` | Probe LAN / cloud / offline |
| `central-dashboard/.../offline-queue.service.ts` | Buffer commandes hors-ligne |

---

## Auth — PIN par profil (ADR-058)

Chaque `config_profiles` peut avoir son propre PIN (hash bcrypt round=12).

```
Staff tape PIN
     │
     ▼
POST /api/remote/:siteId/auth/verify-pin
     │
     ├── Validation bcrypt
     ├── Émission JWT 30j (type: remote-profile-pin, tokenId uuid)
     └── INSERT profile_device_tokens (révocable individuellement)
```

- **Token révocable** : super_admin → Dashboard → Devices → révoquer par device
- **Offline** : le Pi peut valider le PIN localement via `profile-pin.service.js` (bcrypt.compare, prefs sync dans `sync_profiles`)
- **Rétro-compat** : l'ancien token site-scope est accepté en parallèle (pas de coupure)

Tables DB : `profile_device_tokens`, `remote_auth_events`

---

## Options — 3 familles (ADR-062, amend ADR-102)

| Famille | Qui | Où stocké | Exemples |
|---|---|---|---|
| **Sécurité** | super_admin | DB (`profile_device_tokens`) | PIN profil, device tokens, révocation |
| **Features** | admin club | DB (`sites.feature_overrides`) | Activation profils, modes match |
| **UX / Prefs** | staff (utilisateur) | DB `remote_preferences` (site, profile) | Haptics, contraste, layout, widgets |

> **Note ADR-102** : les prefs UX étaient localStorage-only jusqu'en avril 2026.
> Elles sont maintenant persistées en DB par `(site_id, profile_id)` pour survivre
> entre devices. Les "recents" (vidéos récentes) restent localStorage (privacy).

---

## Résilience — 3 couches (ADR-060)

En cas de réseau dégradé, le transport bascule automatiquement :

```
cloud WebSocket (Railway)
     │ KO ?
     ▼
LAN auto — découverte neopro.local (mDNS) < 3s
     │ KO ?
     ▼
Hotspot QR — TV affiche QR, staff scanne, bascule hotspot WiFi Pi
     │ KO ?
     ▼
PWA offline queue — commandes bufferisées IndexedDB, rejouées à la reconnexion
```

Bandeau statut visible sur le remote : `cloud` / `LAN` / `hotspot` / `offline`

Tests terrain documentés : [REMOTE_FIELD_TESTS_T1-T15.md](../../technical/REMOTE_FIELD_TESTS_T1-T15.md)

---

## Coexistence V1/V2 et sunset (ADR-061)

- **Durée** : 6 mois après mise en prod V2
- **Date de sunset V1** : **2026-11-01** (gravé dans `LEGACY_SUNSET_DATE`)
- **Toggle** : `remote-version-toggle.service.ts` — se désactive automatiquement à la date sunset
- **Tracking** : `remote_auth_events.client_version` → ratio v1/v2 par club
- **Alerte Prometheus** : `RemoteLegacyAdoptionLow` si V2 < 70% sur 7j pendant 24h

Aujourd'hui : V1 figée (bugfix critiques seulement), V2 reçoit les nouvelles features.

---

## Smoke tests associés

| Suite | Ce qu'elle protège |
|---|---|
| `smoke-adr-refactoring` | Dispatcher non retiré, feature flag exposé, toggle dashboard présent |
| `smoke-wiring` | `remote-pin.middleware`, repositories remote câblés |
| `smoke-server-core` | Routes auth remote, rate-limit |

---

## Index ADR Remote

| ADR | Sujet | Statut |
|---|---|---|
| [ADR-007](../../adr/ADR-007-public-remote-api.md) | API Remote publique (UUID site) | Actif |
| [ADR-058](../../adr/ADR-058-remote-auth-per-profile.md) | PIN par profil + device tokens | Actif |
| [ADR-059](../../adr/ADR-059-remote-match-state-pubsub.md) | Match state pub/sub | Actif |
| [ADR-060](../../adr/ADR-060-remote-resilience-fallback-layers.md) | Résilience 3 couches | Actif |
| [ADR-061](../../adr/ADR-061-remote-legacy-coexistence-sunset.md) | Coexistence V1/V2 + sunset 2026-11-01 | Actif |
| [ADR-062](../../adr/ADR-062-remote-options-governance.md) | Gouvernance 3 familles d'options | Actif (amend ADR-102) |
| [ADR-090](../../adr/ADR-090-unified-scoreboard-state-remote-sync.md) | Scoreboard state sync | Actif |
| [ADR-092](../../adr/ADR-092-remote-v2-feature-flag-rollout.md) | Feature flag per-site V2 + dispatcher | Actif |
| [ADR-102](../../adr/ADR-102-remote-preferences-db-persistence.md) | Prefs UX → DB (amend ADR-062) | Actif |

---

## Cas d'edge connus

- `displayIndex` sur payload `command` est ignoré — `tv.component.ts:918` filtre uniquement sur `target: number[]`
- Pi natif (`siteId` vide) : `RemotePreferencesService` court-circuite tous les appels API → localStorage-only
- Prefs SaaS scopées par `(site, profile)` depuis PR #688 — avant : partagées entre tous les clubs (bug)
