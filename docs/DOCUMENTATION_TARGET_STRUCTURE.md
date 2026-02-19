# Documentation cible (canonique) — NEOPRO

## Objectif

Définir une documentation **exploitable sans contexte préalable** par :

- un développeur junior,
- une agence externe.

Cette structure réduit les doublons, fixe une source de vérité par sujet, et rend les incohérences détectables.

---

## Principes de gouvernance

1. Une seule source de vérité par sujet.
2. Les documents historiques restent en archive et ne sont plus référencés depuis les parcours d'onboarding.
3. Toute décision d'architecture structurante doit avoir un ADR.
4. Les guides opérationnels (runbooks) décrivent uniquement l'exécution, pas les décisions.
5. Les documents canoniques ont un en-tête standard :
   - statut (`draft`/`active`/`deprecated`)
   - owner
   - dernière revue
   - version
   - dépendances

---

## Arborescence cible

```text
docs/
  00-START-HERE.md                 # Entrée unique par profil
  01-SYSTEM-OVERVIEW.md            # Vue globale stable (C4 L1/L2)

  architecture/
    README.md                      # Cartographie architecture
    bricks/
      edge-raspberry.md
      cloud-api.md
      cloud-dashboard.md
      sync-agent.md
      local-admin.md
    cross-cutting/
      auth-and-roles.md
      network-resilience.md
      error-handling-observability.md
      multi-tenancy-rls.md
      storage-and-media.md
    diagrams/
      context.mmd
      container.mmd
      sequences/
        auth-sequence.md
        sync-sequence.md
        deployment-sequence.md

  api/
    README.md                      # Contrat API + conventions
    openapi/                       # Sources OpenAPI versionnées
      openapi.yaml
    changelog.md                   # Breaking/non-breaking API changes

  data/
    README.md                      # Modèle de données global
    schema/
      logical-model.md
      rls-policies.md
    migrations/
      strategy.md

  operations/
    README.md
    runbooks/
      incident-network.md
      deploy-central.md
      backup-restore.md
      ota-deployment.md
    sre/
      slis-slos.md
      alert-catalog.md

  onboarding/
    README.md
    junior-developer.md
    external-agency.md
    first-week-checklist.md

  adr/
    README.md
    ADR-*.md

  archive/
    ...

  templates/
    TEMPLATE_ARCHITECTURE_BRICK.md
    TEMPLATE_RUNBOOK.md
    TEMPLATE_API_MODULE.md
    TEMPLATE_ONBOARDING_PATH.md
```

---

## Source de vérité (matrice)

| Sujet                    | Source canonique                            | Documents secondaires autorisés |
| ------------------------ | ------------------------------------------- | ------------------------------- |
| Vue système globale      | `docs/01-SYSTEM-OVERVIEW.md`                | `README.md` (résumé)            |
| Architecture par brique  | `docs/architecture/bricks/*.md`             | `docs/architecture/README.md`   |
| Séquences critiques      | `docs/architecture/diagrams/sequences/*.md` | liens depuis briques            |
| Contrat API              | `docs/api/openapi/openapi.yaml`             | `docs/api/README.md`            |
| Modèle données / RLS     | `docs/data/schema/*.md`                     | ADR dédiés                      |
| Exploitation / incidents | `docs/operations/runbooks/*.md`             | `docs/operations/README.md`     |
| Onboarding               | `docs/onboarding/*.md`                      | `docs/00-START-HERE.md`         |
| Décisions archi          | `docs/adr/*.md`                             | aucune                          |

---

## Plan de migration documentaire

## Lot 1 (immédiat)

1. Geler les points d'entrée :
   - `docs/00-INDEX.md`
   - `docs/01-START-HERE.md`
2. Corriger tous les liens cassés de navigation.
3. Publier `docs/00-START-HERE.md` avec parcours validés.
4. Fixer une terminologie unique (`advertiser` vs `sponsor`) et documenter la rétrocompatibilité.

## Lot 2 (court terme)

1. Extraire la connaissance canonique vers :
   - `docs/architecture/`
   - `docs/api/`
   - `docs/data/`
2. Déplacer les contenus obsolètes/non canoniques vers `docs/archive/`.
3. Ajouter un changelog documentaire (`docs/CHANGELOG_DOCS.md`).

## Lot 3 (moyen terme)

1. Ajouter des contrôles CI :
   - liens markdown valides,
   - fichiers référencés existants,
   - en-têtes obligatoires,
   - unicité de source de vérité.
2. Revue trimestrielle des docs (owner + date).

---

## Règles minimales de qualité

1. Chaque brique répond explicitement à : rôle, responsabilités, interfaces, dépendances entrantes/sortantes, SLA attendu, modes de panne.
2. Toute API documentée doit exister dans OpenAPI.
3. Toute table/document data doit préciser ownership et contraintes d'accès (RLS/roles).
4. Chaque runbook contient : déclencheur, prérequis, procédure, rollback, vérification post-action.
5. Tout onboarding inclut une checklist de validation exécutable.

---

## Critères d'acceptation (documentation exploitable)

La documentation est jugée exploitable si :

1. Un junior lance l'environnement et exécute un premier fix en < 1 jour.
2. Une agence externe livre un changement non trivial en < 3 jours sans support synchrone.
3. 0 lien cassé sur les parcours d'entrée.
4. 100% des endpoints publics présents dans OpenAPI.
5. 100% des briques critiques ont un owner et une date de revue.
