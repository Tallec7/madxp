---
tags: [remote, feature, v1, v2, telecommande]
updated: 2026-05-04
---

# SPEC : Remote (Télécommande)

> **Owner** : Daisy
> **Statut** : Live
> **Dernière revue** : 2026-05-04

## En une phrase

Permettre au staff d'un club de piloter la TV en temps réel depuis un smartphone ou PC — changer de profil, démarrer un match, mettre à jour le score — même sans connexion internet.

## Acteurs impliqués

- **Club Staff** : utilise la télécommande (téléphone, PC régie)
- **Super Admin** : gère les PINs, tokens devices, active V2 per-site
- **Admin club** : active les features (profils, modes match)

## Périmètre (ce que ce domaine couvre)

- **Services backend** : `central-server/src/controllers/remote.controller.ts`, `remote-auth.controller.ts`
- **Middleware** : `central-server/src/middleware/remote-pin.middleware.ts`
- **Repositories** : `remote-preferences.repository.ts`, `remote-auth-events.repository.ts`, `remote-command.repository.ts`
- **Composants Pi** : `raspberry/src/app/components/remote/remote-host.component.ts` (dispatcher), `remote.component.ts` (V1), `remote-v2/remote-v2.component.ts` (V2)
- **Services Pi** : `remote-score.service.ts`, `remote-timer.service.ts`, `remote-preferences.service.ts`
- **Dashboard** : `feature-gate.service.ts` (toggle remote_v2), `remote-version-toggle.service.ts`, `transport-resilience.service.ts`, `offline-queue.service.ts`
- **Tables DB** : `profile_device_tokens`, `remote_auth_events`, `remote_preferences`
- **ADR** : ADR-007, ADR-058, ADR-059, ADR-060, ADR-061, ADR-062, ADR-090, ADR-092, ADR-102
- **Smoke tests** : `smoke-adr-refactoring`, `smoke-wiring`, `smoke-server-core`
- **`.claude/rules/`** : aucune règle dédiée (contraintes dans ADRs)

## Règles métier

- Un staff peut piloter son profil **sans compte dashboard** — seul un PIN profil suffit (ADR-058)
- Le PIN est **par profil**, pas par site — révocable par device individuellement
- Le Pi peut valider un PIN **hors-ligne** (bcrypt local, sync via `sync_profiles`)
- V1 et V2 coexistent jusqu'au **2026-11-01** — rollback en < 10 secondes via toggle dashboard ou `?v2=0` en URL
- La sélection V1/V2 suit la priorité : URL param → localStorage → feature flag DB → fallback V1
- Les préférences UX survivent entre devices sur le même `(site, profile)` (ADR-102)
- En cas de perte internet, la télécommande bascule automatiquement : cloud → LAN (`neopro.local`) → hotspot QR → offline queue (ADR-060)

## Comportements observables

| Règle              | Comment on vérifie                                                     |
| ------------------ | ---------------------------------------------------------------------- |
| PIN par profil     | Dashboard → Site → Remote & Sécurité → liste des device tokens         |
| Rollback V1 < 10s  | Dashboard → Settings → décocher "Télécommande V2 (beta)" → reload club |
| Prefs cross-device | Changer layout sur mobile → vérifier sur PC même (site, profil)        |
| Fallback LAN       | Couper internet box → bandeau "LAN" visible sur remote < 3s            |
| Ratio V1/V2        | Prometheus `neopro_remote_client_version_total{version}`               |
| Adoption V2        | Alerte `RemoteLegacyAdoptionLow` si V2 < 70% sur 7j                    |

## Cas d'edge connus

- `displayIndex` sur payload `command` est ignoré — `tv.component.ts` filtre uniquement sur `target: number[]` (pas sur l'index display)
- Pi natif (`siteId` vide) : `RemotePreferencesService` court-circuite tous les appels API → localStorage-only, pas de sync DB
- Prefs SaaS scopées par `(site, profile)` depuis PR #688 — avant : partagées entre tous les clubs (bug silencieux)
- Cache lockout brute-force perdu au restart Pi — acceptable (rate-limit IP reste actif)

## Contraintes / NE PAS FAIRE

- Ne jamais exposer une option sécurité (PIN, tokens) depuis l'UI remote — super_admin uniquement via dashboard (ADR-062)
- Ne jamais stocker les "recents" vidéos en DB — device-local pour privacy (ADR-102)
- Ne jamais mettre en cache `/api/*` dans le Service Worker — network-only obligatoire (ADR-060)

## Ce qui n'est PAS dans ce domaine

- **Scoreboard / Match** → couvert par [match-sessions.spec.md](match-sessions.spec.md)
- **Hotspot PSK rotation** → couvert par [hotspot-psk.spec.md](hotspot-psk.spec.md)
- **Auth dashboard** (JWT cookie admin) → domaine Auth & Sécurité (SPEC #11, à créer)
- **Preview TV depuis dashboard** → [remote-v2-preview-sync.spec.md](remote-v2-preview-sync.spec.md)

## Évolutions possibles

- [ ] Sunset V1 le 2026-11-01 — retirer `RemoteComponent` et `remote-version-toggle.service.ts`
- [ ] Smoke test dédié pour le dispatcher V1/V2 (priorité des 4 niveaux)
- [ ] Ajouter compteur Prometheus `neopro_remote_variant_selected_total{variant=v1|v2}`
