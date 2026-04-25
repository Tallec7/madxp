# Incident Log

> Tracking des incidents prod (cf. [OPS-04](OPS-04-pi-offline-massif.md), [OPS-01](OPS-01-rollback-prod.md)).
> Format : 1 ligne par incident, lien vers postmortem si disponible.

## Format

```
| Date       | Sévérité | Durée | % flotte | Cause              | Postmortem |
| ---------- | -------- | ----- | -------- | ------------------ | ---------- |
| YYYY-MM-DD | P1       | 25min | 30%      | OTA cassé v3.X.Y   | [link]     |
```

---

## Historique

| Date                        | Sévérité | Durée | % flotte | Cause | Postmortem |
| --------------------------- | -------- | ----- | -------- | ----- | ---------- |
| (aucun incident enregistré) |          |       |          |       |            |

## Sévérités

- **P0** : prod totalement down, > 50% flotte
- **P1** : prod dégradée, 10-50% flotte impactée
- **P2** : feature spécifique cassée, < 10% flotte
- **P3** : bug visible mais sans impact bloquant
