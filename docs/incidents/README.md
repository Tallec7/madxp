# Incidents MadXP

> **Statut** : ACTIF | **Owner** : ops / lead-dev

Dossier des post-mortems et rapports d'incident production.

## Convention de nommage

```
YYYY-MM-DD-slug-description.md
```

Exemples :

- `2026-04-28-saas-tv-loop-web_page-crash.md`
- `2026-03-15-hotspot-psk-rotation-failure.md`

## Structure d'un rapport d'incident

```markdown
# Incident YYYY-MM-DD — Titre court

**Sévérité** : P0 / P1 / P2
**Durée** : HH:MM → HH:MM (timezone)
**Impact** : X sites affectés / Y utilisateurs

## Timeline

- HH:MM — Détection
- HH:MM — Cause identifiée
- HH:MM — Fix déployé
- HH:MM — Résolution confirmée

## Cause racine

...

## Fix appliqué

...

## Actions préventives

- [ ] Action 1
- [ ] Action 2
```

## Voir aussi

- [Runbook d'urgence](../modops/RUNBOOK_URGENCE.md) — procédure de réponse immédiate
- [INCIDENT-LOG.md](../runbooks/INCIDENT-LOG.md) — journal synthétique de tous les incidents
