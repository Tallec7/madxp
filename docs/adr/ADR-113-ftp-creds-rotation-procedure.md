# ADR-113 — FTP Credentials Rotation Procedure

> **Date** : 2026-05-07
> **Statut** : Accepté
> **Auteurs** : Lead Dev (audit phase C, P0 #2)

## Contexte

Le central-server lit `process.env.FTP_PASSWORD` directement (`central-server/src/config/ftp-storage.ts`) pour pousser les vidéos templates et assets vers Hostinger. Aucune procédure documentée n'existait pour roter ce secret en cas de leak (exemple : commit accidentel, build leak Railway, ex-collaborateur).

**Conséquence d'un leak sans procédure** : full write access sur `https://kalonpartners.bzh/neopro-*` — un attaquant peut remplacer une vidéo NLF par n'importe quoi (incident client critique).

L'audit Template Studio du 2026-05-07 (`docs/audits/templates-remotion-audit-2026-05-07.md`, item P0 #2) a flaggé ce risque comme prioritaire.

## Décision

**Rotation manuelle tous les 90 jours** via une procédure step-by-step encodée dans `central-server/src/scripts/rotate-ftp-creds.ts` :

```bash
npm run rotate:ftp-creds                              # imprime la procédure
npm run rotate:ftp-creds -- --test-connection <pw>    # teste un nouveau mdp en local
```

Le script ne change PAS les credentials (Hostinger n'expose pas d'API pour ça). Il sert :

1. À documenter la procédure exacte (7 steps).
2. À tester un nouveau mot de passe via `basic-ftp` avant de le pousser sur Railway.

L'historique des rotations est consigné dans la section "Historique des rotations" en bas de cet ADR.

## Alternatives rejetées

| Alternative                              | Raison du rejet                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Rotation automatique via CRON            | Hostinger ne fournit pas d'API pour changer le mot de passe FTP (manuel uniquement via cPanel). Bloqué upstream.               |
| HashiCorp Vault / AWS Secrets Manager    | Sur-engineering pour la flotte actuelle (1 secret, 1 service). À reconsidérer si la flotte de secrets dépasse 5+.              |
| Service account dédié par environnement  | Hostinger plan actuel limite à 3 comptes FTP simultanés ; déjà saturé (vidéos, updates, backup).                               |
| Rotation à chaque deploy Railway         | Le mdp est partagé avec d'autres consommateurs internes (scripts ops, monitoring) ; rotation chaque deploy = friction inutile. |

## Conséquences

**Positif**

- Procédure reproductible, traçable, testée (test-connection avant push prod).
- Cadence 90j compatible avec la cadence des audits sécu trimestriels.
- Coût zéro (pas de service externe).
- Le hash partiel (sha256 8 chars) dans l'historique permet de détecter une réutilisation accidentelle d'un ancien mdp sans stocker le secret.

**Négatif**

- Étape manuelle 90j → ajouter au calendrier ops (next : ~ 2026-08-07).
- En cas de fenêtre de rotation oubliée, pas d'alerte automatique aujourd'hui (à ajouter en Phase 2).
- Le script `--test-connection` accepte le mdp en argv → visible dans `ps aux` pendant l'exécution. Acceptable (machine de l'opérateur uniquement, hors prod).

## Fichiers impactés

- `central-server/src/scripts/rotate-ftp-creds.ts` — script CLI
- `central-server/package.json` — script `rotate:ftp-creds`
- `docs/adr/ADR-113-ftp-creds-rotation-procedure.md` — cet ADR
- `docs/adr/README.md` — index ADR
- `.claude/rules/templates.md` — invariants smoke-enforced

Aucun changement runtime — c'est un outillage de **procédure**, pas de comportement.

## Procédure de rotation (détaillée)

1. Générer nouveau mot de passe FTP via UI Hostinger (cPanel → FTP Accounts → Edit user → Change password). Garder l'ancien dans 1Password en cas de rollback.
2. Tester en local : `npm run rotate:ftp-creds -- --test-connection <newPassword>`
3. Mettre à jour Railway production : `railway variables set FTP_PASSWORD=<newPassword>`
4. Redeploy Railway : `railway up` (ou push d'un commit vide).
5. Smoke test post-deploy : un test upload via dashboard Template Studio (vérifier qu'un nouvel asset s'écrit sur FTP).
6. Archiver l'ancien mot de passe en coffre 1Password (entrée "FTP Hostinger / rotation history").
7. Mettre à jour la table "Historique des rotations" ci-dessous.

## Historique des rotations

> Mettre à jour à chaque rotation. Hash sha256 partiel (8 premiers chars) pour permettre de détecter une réutilisation accidentelle, sans stocker le secret.

| Date       | Opérateur | Hash ancien (sha256:8) | Hash nouveau (sha256:8) | Notes                          |
| ---------- | --------- | ---------------------- | ----------------------- | ------------------------------ |
| _aucune_   | _aucune_  | _aucune_               | _aucune_                | Rotation initiale planifiée ~2026-08-07 |

## Références

- Audit phase C : `docs/audits/templates-remotion-audit-2026-05-07.md`
- Config consommatrice : `central-server/src/config/ftp-storage.ts`
- ADR connexes : ADR-074 (rotation PSK hotspot — pattern similaire mais automatisé)
