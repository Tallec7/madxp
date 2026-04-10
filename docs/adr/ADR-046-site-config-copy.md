# ADR-046: Copie de configuration inter-sites

**Date** : 2026-04-10
**Statut** : Accepté
**Format** : Léger

---

## Contexte

Les opérateurs configurent les boucles vidéo, catégories et phases de match sur chaque site individuellement. Pour déployer un nouveau club avec une configuration similaire à un site existant, il fallait recréer chaque profil manuellement. Le dashboard affichait déjà une modal "Copier la configuration" mais le backend n'existait pas (endpoint retournait 400).

## Décision

Implémentation d'un endpoint `POST /api/sites/:id/copy-config` qui copie tous les profils de configuration (`config_profiles`) du site source vers un site cible. L'opération est destructive : les profils existants sur le site cible sont supprimés et remplacés par ceux du site source. Ceci évite les conflits de noms et les profils orphelins.

## Alternatives rejetées

- **Copie additive (merge)** : rejeté car les conflits de noms de profils et de `is_default` rendent le merge ambigu — plus simple de remplacer intégralement
- **Copie sélective par profil** : rejeté car l'usage principal est le clonage complet pour un nouveau site — la granularité par profil ajouterait de la complexité UI sans besoin immédiat

## Conséquences

- Les opérateurs peuvent configurer un "site template" et copier sa config vers de nouveaux clubs en 2 clics
- L'opération est irréversible (les profils cible sont supprimés) — un warning explicite est affiché dans la modal
- Audit trail complet via `CONFIG_COPIED` dans `audit_logs`

## Fichiers impactés

- `central-server/src/controllers/sites.controller.ts` — endpoint `copyConfig`
- `central-server/src/routes/sites.routes.ts` — route POST `/:id/copy-config`
- `central-server/src/middleware/validation.ts` — schema `copyConfig`
- `central-server/src/services/audit.service.ts` — action `CONFIG_COPIED`
- `central-dashboard/src/app/core/services/sites.service.ts` — méthode `copyConfig()`
- `central-dashboard/src/app/features/sites/components/copy-config-modal/` — composant modal
- `central-dashboard/src/app/features/sites/site-detail.component.*` — bouton + intégration modal
