# Rapport de valorisation technique – NEOPRO

> Rapport généré le 13 avril 2026 à partir de l'analyse du dépôt Git.
> Ce document fournit les données brutes nécessaires à la valorisation du logiciel pour apport en société.
> Il ne constitue pas une évaluation financière.

---

## 1. Identité du logiciel

| Champ                             | Valeur                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nom**                           | NEOPRO                                                                                                                                          |
| **Description**                   | Système de TV interactive pour clubs sportifs. Architecture 3-tiers : Dashboard Angular → Central Server Express/PostgreSQL → Raspberry Pi Edge |
| **Date de création (1er commit)** | 3 décembre 2025                                                                                                                                 |
| **Dernière mise à jour**          | 13 avril 2026                                                                                                                                   |
| **Version courante**              | v3.164.2                                                                                                                                        |
| **Licence**                       | Propriétaire (Copyright 2024 NEOPRO / Kalon Partners)                                                                                           |

### Stack technique

| Composant                 | Technologies                                        |
| ------------------------- | --------------------------------------------------- |
| Backend API               | Node.js 20+, Express 4.18, TypeScript strict        |
| Frontend Dashboard        | Angular 20, Chart.js, Leaflet                       |
| Frontend Raspberry (edge) | Angular 20, Socket.IO client                        |
| Base de données           | PostgreSQL 15 (Supabase)                            |
| Stockage                  | FTP Hostinger                                       |
| Auth                      | JWT HttpOnly + Bearer + MFA (TOTP)                  |
| Hébergement               | Railway (API), Hostinger (Dashboard)                |
| Tests                     | Jest, Karma, Playwright                             |
| Monitoring                | Prometheus, Grafana, Alertmanager, Winston, Logtail |

---

## 2. Effort de développement (proxy du coût)

### Commits et contributeurs

| Métrique                          | Valeur                                 |
| --------------------------------- | -------------------------------------- |
| **Commits totaux**                | 2 640                                  |
| **Commits humains (hors bot/CI)** | 1 727                                  |
| **Durée du projet**               | ~4,5 mois (3 déc. 2025 → 13 avr. 2026) |

| Contributeur                               | Commits | Type                              |
| ------------------------------------------ | ------- | --------------------------------- |
| **Tallec7** (letallec.gwenvael@hotmail.fr) | 1 708   | Développeur principal / fondateur |
| semantic-release-bot                       | 866     | Bot CI (release automatique)      |
| Claude (noreply@anthropic.com)             | 19      | Assistant IA (co-auteur)          |
| NEOPRO-COMMUNICATION                       | 7       | Compte organisation               |

> **Observation** : développement essentiellement **solo** (99 % des commits humains par Tallec7).

### Releases / Tags

| Métrique                 | Valeur                                                     |
| ------------------------ | ---------------------------------------------------------- |
| **Nombre total de tags** | 797                                                        |
| **Première release**     | v2.0.0 — 2 janvier 2026                                    |
| **Dernière release**     | v3.164.2 — 13 avril 2026                                   |
| **Cadence**              | ~7 releases/jour en moyenne (semantic-release automatique) |

### Volumétrie de code

| Langage                   | Lignes de code      | Détail                            |
| ------------------------- | ------------------- | --------------------------------- |
| **TypeScript** (source)   | ~64 400             | Code applicatif hors tests        |
| **TypeScript** (tests)    | ~46 600             | Fichiers .spec.ts / .test.ts      |
| **TypeScript** total      | **~111 000**        |                                   |
| SQL (migrations + schéma) | ~11 000             | 88 fichiers, 75 migrations        |
| HTML (templates)          | ~655                | Templates serveur                 |
| Shell (scripts)           | ~88                 | Scripts d'exploitation            |
| **Total estimé**          | **~123 000 lignes** | Hors node_modules, dist, coverage |

> **Note** : le dépôt analysé est le **central-server** (backend + templates). Les frontends Angular (Dashboard, Raspberry) sont référencés dans l'architecture mais hébergés séparément ou dans des sous-dossiers non présents dans ce repo. Le volume réel total du système est donc **supérieur** à ces chiffres.

### Activité de développement (derniers mois)

| Mois                | Commits |
| ------------------- | ------- |
| Déc. 2025           | 492     |
| Janv. 2026          | 466     |
| Fév. 2026           | 713     |
| Mars 2026           | 327     |
| Avr. 2026 (partiel) | 595     |

---

## 3. Qualité et maturité du code

### Tests

| Suite de tests               | Nombre de tests       | Framework        |
| ---------------------------- | --------------------- | ---------------- |
| API central-server           | **2 728**             | Jest + Supertest |
| Smoke tests (régressions)    | **1 221** (12 suites) | Jest             |
| Dashboard Angular            | **520**               | Karma            |
| Raspberry Server (Socket.IO) | **71**                | Jest             |
| Raspberry Admin              | **194**               | Jest             |
| E2E                          | Présents              | Playwright       |
| **Total**                    | **~4 734 tests**      |                  |

Fichiers de test : **995 fichiers** (.spec.ts / .test.ts)

### Documentation

| Élément                             | Présent | Détail                                              |
| ----------------------------------- | ------- | --------------------------------------------------- |
| README / docs/                      | ✅      | **274 fichiers** de documentation                   |
| Architecture technique              | ✅      | ARCHITECTURE.md, REFERENCE.md, SYNC_ARCHITECTURE.md |
| ADR (Architecture Decision Records) | ✅      | Dossier docs/adr/                                   |
| Glossaire métier                    | ✅      | GLOSSARY.md                                         |
| Guides d'exploitation               | ✅      | Troubleshooting, WiFi, Onboarding                   |
| SAFe (pilotage produit)             | ✅      | Epics, Features, User Stories, Sprint Tracker       |
| Changelog                           | ✅      | docs/changelog/CHANGELOG.md                         |
| API Swagger                         | ✅      | swagger-ui-express en dépendance                    |

### CI/CD

| Pipeline        | Fichier                                         | Rôle                         |
| --------------- | ----------------------------------------------- | ---------------------------- |
| CI              | `.github/workflows/ci.yml`                      | Tests, lint                  |
| Release         | `.github/workflows/release.yml`                 | Semantic-release automatique |
| Deploy scripts  | `.github/workflows/publish-install-scripts.yml` | Scripts d'installation Pi    |
| Railway restart | `.github/workflows/railway-restart.yml`         | Redémarrage production       |

### Qualité de code

- **TypeScript strict** : aucun `any` autorisé (ESLint enforced)
- **Repository pattern** : architecture en couches avec interdiction d'accès direct à la DB
- **Validation Joi** systématique des inputs
- **Helmet + rate-limiting** pour la sécurité
- **ESLint** configuré avec règles métier

---

## 4. Propriété intellectuelle

### Titulaires des droits

| Contributeur         | Email                           | Statut                                   |
| -------------------- | ------------------------------- | ---------------------------------------- |
| **Tallec7**          | letallec.gwenvael@hotmail.fr    | Développeur principal (99 % des commits) |
| NEOPRO-COMMUNICATION | contact@neopro-communication.fr | Compte organisation (7 commits)          |

> Les commits de `semantic-release-bot` et `Claude` (IA) ne génèrent pas de droits d'auteur.

### Licence du logiciel

```
Copyright (c) 2024 NEOPRO / Kalon Partners — Tous droits réservés.
Ce logiciel est propriétaire et confidentiel.
```

**Type** : Licence propriétaire — aucune licence open source appliquée au code source.

### Dépendances open source et leurs licences

**59 dépendances runtime** (central-server + root), **58 dev dependencies**.

| Licence                                             | Nombre de packages |
| --------------------------------------------------- | ------------------ |
| MIT                                                 | 636                |
| Apache-2.0                                          | 116                |
| ISC                                                 | 58                 |
| BSD-3-Clause                                        | 26                 |
| BSD-2-Clause                                        | 11                 |
| Autres (MIT\*, CC-BY-4.0, 0BSD, BlueOak, Unlicense) | ~15                |
| **(MIT OR GPL-3.0-or-later)**                       | **1**              |

### Points d'attention PI

| Risque                                                              | Détail                                                                                                                                                           | Sévérité     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **1 package dual-licensé MIT/GPL-3**                                | Un package offre le choix MIT ou GPL-3. Si MIT est choisi → aucun problème. Vérifier qu'il n'est pas utilisé sous GPL.                                           | Faible       |
| **Pas de contributeur externe majeur**                              | Développement solo → pas de problème de cession de droits tiers                                                                                                  | OK           |
| **Commits Claude (IA)**                                             | 19 commits co-authored par Claude AI. Les outputs d'IA ne sont généralement pas protégeables par le droit d'auteur, mais la jurisprudence est encore incertaine. | A documenter |
| **Toutes les dépendances sont permissives** (MIT, Apache, BSD, ISC) | Compatible avec usage propriétaire                                                                                                                               | OK           |

---

## 5. Ce que GitHub ne peut PAS fournir

| Élément manquant                               | Pourquoi GitHub ne peut pas le fournir                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Chiffre d'affaires**                         | Donnée comptable externe au dépôt                                                                         |
| **Contrats clients**                           | Documents juridiques/commerciaux hors dépôt                                                               |
| **Nombre de clients actifs / flotte déployée** | Les "50+ boîtiers Pi" mentionnés dans les docs ne sont pas vérifiables via le code                        |
| **Coût réel de développement**                 | GitHub ne connaît pas les TJM, salaires ni charges                                                        |
| **Valorisation par DCF**                       | Nécessite prévisions financières, taux d'actualisation                                                    |
| **Preuve de cession de droits**                | Contrats RH/freelance non stockés sur GitHub                                                              |
| **Métriques d'usage réelles**                  | Nécessite accès analytics (le code intègre Prometheus/Grafana, mais les données ne sont pas dans le repo) |
| **Dépôt APP / INPI**                           | Registre externe (Agence pour la Protection des Programmes)                                               |
| **Valeur de la marque NEOPRO**                 | Évaluation marketing externe                                                                              |
| **Code des frontends Angular**                 | Dashboard et Raspberry frontend dans des repos/dossiers séparés — seul le backend est analysé ici         |
| **Revenus récurrents (MRR/ARR)**               | Données Stripe/facturation externes                                                                       |

---

## 6. Synthèse pour l'expert-comptable

### Ce que ce rapport prouve

1. **Un logiciel fonctionnel et mature** : 797 releases, v3.164, en production active depuis décembre 2025
2. **Un effort de développement significatif** : ~123 000 lignes de code (backend seul), 2 640 commits, ~4 734 tests automatisés
3. **Une qualité industrielle** : CI/CD, tests automatisés, documentation exhaustive (274 fichiers), architecture documentée par ADR, monitoring intégré
4. **Un développement quasi exclusivement solo** par Tallec7 — simplifie la question de la titularité des droits
5. **Aucun risque majeur de licence** : toutes les dépendances sont sous licences permissives (MIT, Apache, BSD), le logiciel est sous licence propriétaire
6. **Un système en production** : architecture multi-tiers déployée (Railway, Hostinger, flotte Raspberry Pi)

### Ce que ce rapport ne prouve pas

- La **valeur économique** (CA, clients, contrats)
- Le **coût réel** de développement (TJM × jours)
- La **propriété formelle** (acte de cession, dépôt INPI/APP)
- La **traction marché** (nombre de clubs utilisateurs, rétention)

### L'expert-comptable devra compléter

1. **Estimation du coût de reproduction** : appliquer un TJM marché (ex: 500-700 €/j senior full-stack) × nombre de jours-homme estimés
2. **Preuves de titularité** : contrat de travail ou statut du développeur vis-à-vis de la société
3. **Revenus et contrats** : CA généré, contrats d'abonnement, MRR
4. **Dépôt légal** : enregistrement APP/INPI pour horodater la création
5. **Statut des contributions IA** : documenter l'usage de Claude comme outil (19 commits co-authored)
6. **Volumétrie complète** : obtenir les métriques des frontends Angular (Dashboard + Raspberry) pour le volume total du système
