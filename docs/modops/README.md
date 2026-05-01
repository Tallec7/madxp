# Modops — Procédures opérationnelles

> **Statut** : ACTIF | **Owner** : ops

## Périmètre de ce dossier

Ce dossier contient les **procédures opérationnelles métier** : onboarding client, configuration, déploiement terrain, monitoring et diagnostic à distance.

## Relation avec `docs/runbooks/`

| Dossier | Contenu | Audience |
|---------|---------|----------|
| `docs/modops/` | Procédures terrain (MODOP) + runbooks d'incident | Opérateurs, support client |
| `docs/runbooks/` | Runbooks techniques (infra, DB, CI/CD) + onboarding dev | Développeurs, SRE |

Les deux dossiers coexistent. Quand une procédure croise les deux périmètres (ex : incident hotspot = infra + terrain), elle est dans `modops/` avec un lien depuis `runbooks/`.

## Index

| Fichier | Sujet |
|---------|-------|
| [MODOP-C01-06-Onboarding-Client.md](./MODOP-C01-06-Onboarding-Client.md) | Onboarding d'un nouveau club |
| [MODOP-C07-11-Configuration-Parametrage.md](./MODOP-C07-11-Configuration-Parametrage.md) | Configuration et paramétrage terrain |
| [MODOP-C12-15-Deploiement-MAJ.md](./MODOP-C12-15-Deploiement-MAJ.md) | Déploiement et mises à jour |
| [MODOP-O05-08-Monitoring-Proactif.md](./MODOP-O05-08-Monitoring-Proactif.md) | Monitoring proactif |
| [MODOP-S04-05-Diagnostic-Distance.md](./MODOP-S04-05-Diagnostic-Distance.md) | Diagnostic à distance |
| [MODOP-S11-15-Monitoring-Alertes.md](./MODOP-S11-15-Monitoring-Alertes.md) | Monitoring et alertes |
| [RUNBOOK_HOTSPOT_PSK_INCIDENT.md](./RUNBOOK_HOTSPOT_PSK_INCIDENT.md) | Incident PSK hotspot |
| [RUNBOOK_URGENCE.md](./RUNBOOK_URGENCE.md) | Procédure d'urgence générique |
| [MIGRATION_PSK_LEGACY.md](./MIGRATION_PSK_LEGACY.md) | Migration PSK legacy → ADR-074 |

## Voir aussi

- [docs/runbooks/](../runbooks/README.md) — runbooks techniques
- [docs/incidents/](../incidents/README.md) — post-mortems
