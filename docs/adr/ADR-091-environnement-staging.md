# ADR-091: Environnement Staging (3-tier : dev / staging / prod)

**Date** : 2026-04-23
**Statut** : Accepté
**Format** : Complet
**Décideurs** : Guillaume (CTO)

---

## Contexte

Aujourd'hui MadXP n'a que **2 environnements** : `dev` (machine locale) et `prod` (Railway + Hostinger + 50 Pi clients). Tout merge sur `main` déclenche `release.yml` → semantic-release → tag → build & deploy Hostinger FTP **direct prod**.

Conséquences :

- Aucun lieu pour tester du code avec un volume/structure réaliste avant d'exposer les clients.
- Les migrations SQL partent en prod sans répétition.
- Les Pi physiques en club subissent les régressions d'OTA.
- Impossible de faire une démo "comme en prod" à un futur CTO/dev (Gabin, arrivée imminente) sans risque.

Le projet atteint ~50 sites, une DB PostgreSQL Railway (cf. [ADR-070](ADR-070-postgresql-railway-migration.md)), un dashboard Angular 20 et un back Express. Le coût de l'absence de staging dépasse maintenant son coût d'infra.

## Décision

Créer un **3ᵉ environnement `staging`** qui est une **réplique structurelle de prod** avec des données anonymisées.

### Composition

| Couche       | Staging                                                             | Source                                   |
| ------------ | ------------------------------------------------------------------- | ---------------------------------------- |
| API          | Railway service `central-server-staging` (Dockerfile)               | Clone du service prod, mêmes builds      |
| DB           | Postgres Railway `neopro-staging`                                   | Dump prod anonymisé, rafraîchi hebdo     |
| Dashboard    | `neopro-staging.kalonpartners.bzh` via Cloudflare Pages             | Branche `main` auto-deploy               |
| Stockage FTP | Hostinger bucket `neopro-video-staging`                             | Dossier séparé, pas de copie vidéos prod |
| Pi canary    | 1 boîtier physique dédié (non-client)                               | api_key pointant vers staging            |
| Domaine      | `api-staging.kalonpartners.bzh`, `neopro-staging.kalonpartners.bzh` | Cloudflare DNS                           |

### Flux de code

```
[DEV local]
    │ git push + PR
    ▼
[PR Preview Cloudflare Pages]  — URL unique éphémère par PR
    │ merge main
    ▼
[STAGING]  — auto-deploy sur merge main (Railway + Cloudflare branche main)
    │ validation humaine + Pi canary ≥ 24h
    │ tag v3.x.y (manuel ou semantic-release)
    ▼
[PROD]     — deploy uniquement sur tag
```

**Point clé** : `main` → staging (automatique). **Tag** → prod (explicite). Le déclencheur prod actuel (`release.yml` sur push main) doit être scindé.

### Règles de données

| Direction                  | Autorisé                          |
| -------------------------- | --------------------------------- |
| PROD → STAGING (anonymisé) | ✅ oui                            |
| PROD → DEV                 | ❌ jamais (RGPD, fuite secrets)   |
| STAGING → PROD             | ❌ jamais (pollution)             |
| DEV → STAGING              | ❌ jamais (code voyage, pas data) |

Le script d'anonymisation **doit** nullifier/regénérer : `users.email` (→ `user-XXX@staging.local`), `users.mfa_secret`, `sites.wifi_psk_encrypted`, `sites.api_key`, `clubs.phone/email/adresse`. La structure et le volume sont conservés.

### Migrations SQL

Elles voyagent avec le code : écrites en dev, appliquées auto en staging au merge, en prod au tag. **Jamais à la main sur prod.**

## Alternatives rejetées

- **Branche `staging` Git** : rejeté, double la charge de rebase et complexifie `release.yml`. Un simple "main → staging auto / tag → prod" est suffisant.
- **Staging uniquement DB (sans Pi canary)** : rejeté, ne couvre pas les régressions OTA qui sont les plus coûteuses (déplacement physique).
- **Fly.io / Render comme hébergeur staging** : rejeté, Railway déjà en place, pas de valeur à multiplier les fournisseurs.
- **Feature flags uniquement (sans staging)** : rejeté, utile en complément mais ne remplace pas un environnement isolé pour migrations/infra.

## Conséquences

### Positives

- Filet de sécurité avant prod, démo safe pour onboarding Gabin.
- Migrations SQL répétées avant d'atteindre les clients.
- Pi canary détecte les régressions OTA 24h avant la flotte.
- `main` peut être mergé plus librement (ce n'est plus du prod direct).

### Négatives / coûts

- **Coût Railway** : ~15-25 €/mois (service API + Postgres staging, tier Hobby).
- **Cloudflare Pages** : gratuit jusqu'à 500 builds/mois, largement suffisant.
- **Pi canary** : 1 Raspberry 4 + écran (~80 € one-shot) posé chez Guillaume.
- **Complexité CI** : `release.yml` à scinder en `staging-deploy.yml` (sur push main) et `prod-deploy.yml` (sur tag).
- **Script anonymisation** à écrire et maintenir.

### Risques

- **Dérive staging vs prod** : si les migrations staging ne sont pas jouées en prod dans les mêmes conditions, divergence. Mitigation : script unique `db:migrate:staging` + `db:migrate:prod` partagent la même source (`migrations/` versionnée).
- **Fuite données prod via dump** : si le script d'anonymisation est cassé, secrets partent en staging. Mitigation : tests automatisés sur le dump (grep `@gmail.com`, `u406531085`, etc.) avant restore.

## Mise en œuvre (Plan NOW J1-J5)

- **J1** : créer services Railway staging, domaines Cloudflare — [runbook J1](../runbooks/J1-staging-setup.md)
- **J2** : migrer dashboard vers Cloudflare Pages (cf. [ADR-071](ADR-071-cloudflare-pages-migration.md)) + PR previews
- **J3** : script anonymisation + restore staging + Pi canary
- **J4** : scinder `release.yml` en `staging-deploy.yml` + `prod-deploy.yml` (tag-based) + protéger `main`
- **J5** : onboarding Gabin (docs, accès, TEAM.md)

## Fichiers impactés

- `railway.staging.json` — config Railway service staging (créé dans ce commit)
- `.github/workflows/staging-deploy.yml` — auto-deploy sur merge main (à créer J4)
- `.github/workflows/release.yml` — à restreindre aux tags prod uniquement (modifié J4)
- `central-server/src/scripts/anonymize-dump.sh` — script dump + anonymize (créé J3)
- `docs/runbooks/J1-staging-setup.md` — pas-à-pas console Railway (créé dans ce commit)
- `docs/runbooks/restore-staging-db.md` — procédure hebdo (créé J3)

## Références

- [ADR-070](ADR-070-postgresql-railway-migration.md) — Migration Postgres vers Railway
- [ADR-071](ADR-071-cloudflare-pages-migration.md) — Cloudflare Pages pour le dashboard
- [ADR-085](ADR-085-simplification-2026.md) — Dégraissage outillage non-core (pré-requis conceptuel)
