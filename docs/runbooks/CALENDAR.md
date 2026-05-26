# Calendrier ops récurrentes

> Single source of truth pour les opérations à fréquence fixe.
> À synchroniser avec ton calendrier perso (Google Calendar, etc.).

## Fréquences

| Fréquence                 | Opération                                     | Runbook                                            | Effort |
| ------------------------- | --------------------------------------------- | -------------------------------------------------- | ------ |
| **Quotidien**             | Backup DB auto (03:00 UTC)                    | `.github/workflows/db-backup.yml`                  | auto   |
| **Quotidien**             | E2E nightly staging (04:00 UTC)               | `.github/workflows/e2e-staging.yml`                | auto   |
| **À chaque tag prod**     | Pre-prod checklist                            | `scripts/pre-prod-checklist.sh`                    | 30s    |
| **Mensuel** (1ʳᵉ semaine) | Test restore DB depuis backup                 | [OPS-02](OPS-02-restore-db-from-backup.md)         | 45 min |
| **Trimestriel**           | Rotate JWT_SECRET                             | [OPS-03](OPS-03-rotate-jwt-secret.md)              | 1h     |
| **Trimestriel**           | Audit secrets exposés (gh secret list, leaks) | manuel                                             | 30 min |
| **Semestriel**            | Audit ADR-091 staging vs réalité              | [ADR-091](../adr/ADR-091-environnement-staging.md) | 1h     |

## Prochaines échéances (rolling)

| Date           | Opération                                         | Statut      |
| -------------- | ------------------------------------------------- | ----------- |
| **2026-05-04** | 1er test restore DB                               | 🟡 à faire  |
| **2026-06-01** | 2ᵉ test restore DB                                | 🟡 planifié |
| **2026-07-01** | 3ᵉ test restore DB + rotate JWT                   | 🟡 planifié |
| **2026-06-15** | ADR-074 phase 5b (suppression `club-config.json`) | 🟡 planifié |
| **2026-07-01** | Audit secrets exposés Q3                          | 🟡 planifié |
| **2026-10-23** | Audit ADR-091 staging (6 mois)                    | 🟡 planifié |

## Comment activer les rappels

### Option A — Issues GitHub (recommandé)

Crée une issue par opération récurrente avec date dans le titre :

```bash
gh issue create \
  --title "🗓️ 2026-05-04 — Test restore DB mensuel (OPS-02)" \
  --body "Suivre [OPS-02](OPS-02-restore-db-from-backup.md). Logger résultat dans RESTORE-TEST-LOG.md." \
  --label "ops,calendrier" \
  --milestone "Ops récurrentes"

gh issue create \
  --title "🗓️ 2026-07-01 — Rotate JWT_SECRET trimestriel (OPS-03)" \
  --body "Suivre [OPS-03](OPS-03-rotate-jwt-secret.md). Coordonner avec un créneau low-traffic." \
  --label "ops,calendrier,security"
```

### Option B — Routine `/schedule` Claude

```
/schedule "Le 1er de chaque mois, lance OPS-02 (test restore DB depuis backup) et logge le résultat dans docs/runbooks/RESTORE-TEST-LOG.md"
```

Avantage : Claude prépare les commandes prêtes à coller le jour J.

### Option C — Calendrier perso (Google Calendar / Cal.com)

Créer 3 événements récurrents :

1. **"MadXP — Test restore DB"** — 1er du mois, 30 min, lien vers [OPS-02](OPS-02-restore-db-from-backup.md)
2. **"MadXP — Rotate JWT_SECRET"** — 1er janvier/avril/juillet/octobre, 1h, lien vers [OPS-03](OPS-03-rotate-jwt-secret.md)
3. **"MadXP — Audit ADR-091 staging"** — tous les 6 mois, 1h, lien vers ADR

## Référence

- Tous les runbooks ops : [README.md](README.md)
- Stratégie staging : [ADR-091](../adr/ADR-091-environnement-staging.md)
