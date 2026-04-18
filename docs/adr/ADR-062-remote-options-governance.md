# ADR-062: Gouvernance des options remote — 3 familles distinctes

**Date** : 2026-04-18
**Statut** : Proposé
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

## Fichiers impactés

- `central-dashboard/src/app/features/sites/components/site-settings-tab/remote-auth-section/` — existe déjà (ADR-058).
- `central-dashboard/src/app/features/sites/components/site-settings-tab/remote-features-section/` (nouveau).
- `central-dashboard/src/app/features/remote/preferences-menu.component.ts` (nouveau) — menu ⚙️.
- `docs/technical/REMOTE_AUTH.md` + `REMOTE_FEATURES.md` + `REMOTE_USER_GUIDE.md` (nouveaux).

## Garde-fous anti-régression

- Smoke test dashboard : sections "Remote & sécurité" gated `super_admin`, "Features" gated `admin`.
- Lint rule custom : interdire `localStorage.setItem` sur clés `remote_pin_*` ou `device_token_*`.
