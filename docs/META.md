# META — Charte documentaire MadXP

> **Statut** : ACTIF | **Créé** : 2026-05-01 | **Owner** : Daisy (Lead Dev)
>
> Ce fichier définit les règles de gouvernance de la documentation `docs/`. Il est la source de vérité pour toute question de format, cycle de vie ou organisation.

---

## 1. Statuts de document

Tout document `docs/` appartient à l'un de ces quatre états :

| Statut      | Signification                                | Bandeau à ajouter                                   |
| ----------- | -------------------------------------------- | --------------------------------------------------- |
| **ACTIF**   | Contenu à jour, maintenu activement          | _(aucun)_                                           |
| **STALE**   | Contenu potentiellement périmé, non invalidé | `> ⚠️ **STALE** — Dernière révision : YYYY-MM-DD.`  |
| **DRAFT**   | En cours de rédaction, incomplet             | `> 🚧 **DRAFT** — Ne pas utiliser comme référence.` |
| **ARCHIVÉ** | Obsolète, conservé pour l'historique         | Déplacer dans `docs/archive/`                       |

**Règle** : un document sans statut explicite est présumé ACTIF. Ajouter le bandeau dès qu'un doute existe.

---

## 2. Frontmatter recommandé (nouveaux documents)

```yaml
---
title: 'Titre lisible'
status: ACTIF # ACTIF | STALE | DRAFT | ARCHIVÉ
owner: lead-dev # lead-dev | ops | product | daisy
last_reviewed: YYYY-MM-DD
---
```

**Non obligatoire rétroactivement** — uniquement sur les documents créés ou modifiés après le 2026-05-01.

---

## 3. Nommage et numérotation ADR

- Format : `ADR-NNN-slug-kebab-case.md` (NNN sur 3 chiffres, zéro-padded)
- **Prochain ADR disponible : ADR-110**
- Les numéros ne se réutilisent pas. Les trous sont documentés dans la section 7 ci-dessous.
- En cas de conflit entre sessions parallèles : vérifier `docs/adr/README.md` avant de créer.
- Tout nouvel ADR doit être ajouté dans l'index `docs/adr/README.md` dans la même PR.

---

## 4. Règle de création de dossier

> Un dossier se crée quand on a **3 documents ou plus** du même type ou domaine.

Ne pas créer de dossier vide en anticipation. Si un dossier existe mais est vide, y ajouter un `README.md` de stub ou le supprimer.

---

## 5. Durées de vie recommandées par type

| Type                         | Revue recommandée                                                 | Owner par défaut |
| ---------------------------- | ----------------------------------------------------------------- | ---------------- |
| ADR                          | Permanente (pas de revue — remplacer par un nouvel ADR si besoin) | lead-dev         |
| Specs métier (`docs/specs/`) | Chaque PR qui change un comportement                              | lead-dev         |
| Guides opérateurs            | Semestrielle                                                      | ops              |
| Runbooks d'incident          | Annuelle ou post-incident                                         | ops              |
| ROADMAP, KPIS, RISKS         | Mensuelle                                                         | daisy / product  |
| TECH-DEBT                    | Trimestrielle                                                     | lead-dev         |
| Business Changelog           | Hebdomadaire (par sprint)                                         | daisy            |
| Archive                      | Pas de revue                                                      | —                |

---

## 6. Organisation des runbooks

| Préfixe   | Type                                       | Exemple                 |
| --------- | ------------------------------------------ | ----------------------- |
| `OPS-NN-` | Runbook technique (infra, DB, déploiement) | `OPS-01-rollback.md`    |
| `INC-NN-` | Runbook d'incident (résolution d'urgence)  | `INC-01-hotspot-psk.md` |
| `J-NN-`   | Runbook d'onboarding                       | `J1-onboarding-dev.md`  |

Les deux dossiers `runbooks/` et `modops/` coexistent en phase 2. La consolidation est planifiée.

---

## 7. Trous de numérotation ADR (intentionnels)

Ces numéros sont **vides et non réutilisables** :

| Numéro(s)         | Raison                                                              |
| ----------------- | ------------------------------------------------------------------- |
| ADR-016 à ADR-020 | Créés hors séquence, slots jamais utilisés                          |
| ADR-023           | Slot jamais utilisé                                                 |
| ADR-101           | Remplacé lors d'une collision entre sessions parallèles (→ ADR-102) |
| ADR-104           | Remplacé par ADR-105 lors de la refonte preview TV                  |
| ADR-107           | Slot jamais utilisé                                                 |

> **Note** : ADR-016 est désormais utilisé par `ADR-016-double-buffer-video.md` (renommé depuis ADR-006 le 2026-05-01 — doublon résolu).

---

## 8. Santé documentation (indicateurs)

Tableau de bord mis à jour manuellement lors des revues documentaires.

| Indicateur                    | Cible | Mesuré le  | Valeur                          |
| ----------------------------- | ----- | ---------- | ------------------------------- |
| Liens internes cassés         | 0     | 2026-05-01 | 0 (traité en phase 2)           |
| ADR sans trou de numérotation | ✓     | 2026-05-01 | 8 trous (dont ADR-016 résolu)   |
| Répertoires vides             | 0     | 2026-05-01 | 2 (`api/`, `Charte graphique/`) |
| Fichiers STALE non banderolés | <5    | 2026-05-01 | 0 (traité en phase 1)           |
| Documents sans owner          | <20   | —          | non mesuré                      |

---

## 9. Ce que l'on ne met PAS dans `docs/`

- Code source ou snippets exécutables (→ `central-server/src/scripts/`)
- Secrets, `.env`, credentials (→ jamais committé)
- Build artifacts (→ `.gitignore`)
- Plans de session Claude en cours (→ conversation ou `.planning/`)

---

## 10. Références

- [00-INDEX.md](./00-INDEX.md) — Index navigable de toute la doc
- [01-START-HERE.md](./01-START-HERE.md) — Point d'entrée pour les nouveaux
- [adr/README.md](./adr/README.md) — Index de tous les ADRs
- [specs/README.md](./specs/README.md) — Index et gabarit des specs métier

---

_Créé le 2026-05-01 — Phase 1 GED Neopro_
