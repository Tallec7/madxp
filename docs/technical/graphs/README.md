---
tags: [architecture, graphs, dependency-cruiser]
---

# Graphes de dépendances code

Générés par [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) depuis `central-server/src/`.

> Ouvrir les `.svg` dans un navigateur (pas dans Obsidian) pour la navigation interactive.

## Graphes disponibles

| Fichier | Périmètre | Commande |
|---|---|---|
| [central-server-archi.svg](central-server-archi.svg) | Vue macro — modules par couche | `npm run graph:archi` |
| [remote.svg](remote.svg) | Domaine Remote — controllers + middleware + repos | voir ci-dessous |

## Légende des couleurs

| Couleur | Couche |
|---|---|
| Violet | `controllers/` |
| Vert | `services/` |
| Orange | `repositories/` |
| Jaune | `middleware/` |
| Cyan | `routes/` |

## Générer un graph par domaine

```bash
cd central-server

# Graph d'un domaine spécifique (ex: match)
npx depcruise \
  src/controllers/match.controller.ts \
  src/services/cron-scheduler.service.ts \
  --config .dependency-cruiser.cjs \
  --output-type dot | dot -T svg > ../docs/technical/graphs/match.svg

# Graph complet vue macro
npm run graph:archi

# Graph complet détaillé (lourd)
npm run graph
```

## Fréquence de mise à jour

Ces SVGs ne sont **pas auto-régénérés** — regénérer à la demande après un refactor majeur.
Ils ne sont pas source de vérité, juste un outil de navigation ponctuel.
