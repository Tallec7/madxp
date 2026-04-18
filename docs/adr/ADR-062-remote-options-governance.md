# ADR-062: Gouvernance des options remote — 3 familles distinctes

**Date** : 2026-04-18
**Statut** : Accepté
**Format** : Léger
**Phase** : 5 du plan refonte télécommande (transverse)

---

## Contexte

Les options de la télécommande actuelle sont **mélangées dans un seul menu** : PIN (sécurité), activer haptique (UX), mode contraste (accessibilité), activation PWA (résilience), nom du profil (feature métier). Résultat : le staff club change par mégarde une option de sécurité ; le super_admin ne sait pas où un réglage a été fait. Aucune séparation claire des responsabilités.

## Décision

Séparer les options en **3 familles** avec gouvernance et localisation UI distinctes :

| Famille              | Responsable            | Où                                                          | Exemples                                                   |
| -------------------- | ---------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| **Sécurité**         | `super_admin`          | Dashboard → onglet site → "Remote & sécurité" (ADR-058)     | PIN profil, device tokens, révocation, audit log           |
| **Features**         | `admin` (du site/club) | Dashboard → onglet site → "Features"                        | activation profils, modes match, boucles vidéo             |
| **UX / Préférences** | utilisateur du remote  | Remote → menu ⚙️ "Préférences" (per-device, `localStorage`) | haptique on/off, dark mode, contraste élevé, lock rotation |

Règle : **aucune option sécurité n'est éditable depuis le remote**. Aucune option UX n'est stockée en base. Aucune feature métier n'est stockée par client.

## Alternatives rejetées

- **Un seul menu unifié avec sections** : rejeté — la confusion persiste sur la gouvernance (qui a le droit de changer quoi ?).
- **Tout en base côté super_admin** : rejeté — empêche un staff de mettre son remote en dark mode sans ticket.
- **Tout côté client `localStorage`** : rejeté — le PIN doit être auditable et propagé à tous les devices.

## Conséquences

- Clarté mentale : chaque acteur (super_admin, admin club, staff remote) sait où chercher.
- Audit log ciblé : `remote_auth_events` trace uniquement les modifs **sécurité** (pas le dark mode).
- Migration : les options existantes doivent être classées → script one-shot qui déplace les clés `localStorage` historiques vers leur famille.
- Docs dédiées : `REMOTE_AUTH.md` (super_admin), `REMOTE_FEATURES.md` (admin), `REMOTE_USER_GUIDE.md` (staff).

## Fichiers implémentés

- `central-dashboard/src/app/features/remote/services/remote-preferences.service.ts` (nouveau) — famille UX, localStorage pur, `haptics`/`highContrast`/`lockRotation`/`fontSize`, sans HttpClient.
- `central-dashboard/src/app/features/remote/preferences-menu.component.ts` (nouveau) — menu ⚙️, zéro option sécurité, zéro appel serveur.
- `central-dashboard/src/app/features/sites/components/site-settings-tab/remote-features-section/remote-features-section.component.ts` (nouveau) — famille Features, gated admin, `RemoteFeatureFlags`, zéro localStorage.
- `central-dashboard/src/app/features/sites/components/site-settings-tab/remote-auth-section/` — famille Sécurité, existe depuis ADR-058, gated `super_admin`.

## Garde-fous anti-régression

- Smoke test (4 tests) : séparation des familles vérifiée structurellement (no localStorage dans Features, no HttpClient dans Prefs, no PIN dans Prefs).
- Règle implicite : `RemotePreferencesService` n'importe jamais `HttpClient` — testé par smoke `noHttpClient`.
