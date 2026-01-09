# Architecture Decision Records (ADR)

> Ce dossier contient les décisions architecturales majeures du projet Neopro.

## Qu'est-ce qu'un ADR ?

Un ADR documente une décision technique importante avec :
- **Contexte** : Pourquoi cette décision était nécessaire
- **Alternatives** : Options considérées avec avantages/inconvénients
- **Décision** : Choix final et justification
- **Conséquences** : Impact positif et négatif

## Liste des ADR

| ID | Titre | Statut | Date |
|----|-------|--------|------|
| [ADR-001](ADR-001-edge-cloud-architecture.md) | Architecture Edge + Cloud | Accepté | Oct 2024 |
| [ADR-002](ADR-002-socketio-realtime.md) | Socket.IO pour temps réel | Accepté | Oct 2024 |
| [ADR-003](ADR-003-postgresql-supabase.md) | PostgreSQL + Supabase | Accepté | Oct 2024 |
| [ADR-004](ADR-004-jwt-httponly-cookies.md) | JWT avec HttpOnly Cookies | Accepté | Nov 2024 |
| [ADR-005](ADR-005-multitenant-rls.md) | Multi-tenant avec RLS | Accepté | Nov 2024 |

## Statuts

- **Proposé** : En discussion
- **Accepté** : Implémenté et en production
- **Déprécié** : Remplacé par une autre décision
- **Rejeté** : Non retenu

## Créer un nouvel ADR

1. Copier le template : `cp ADR-000-template.md ADR-XXX-titre.md`
2. Remplir les sections
3. Soumettre une PR pour review
4. Mettre à jour ce README après merge

## Template

```markdown
# ADR-XXX: Titre

**Date** : [Date]
**Statut** : Proposé | Accepté | Déprécié | Rejeté
**Décideurs** : [Noms]

---

## Contexte

[Pourquoi cette décision est nécessaire]

## Décision

[Le choix retenu]

## Alternatives Considérées

### Option 1
**Avantages** : ...
**Inconvénients** : ...
**Verdict** : Rejeté - [raison]

### Option 2 (choisie) ✅
**Avantages** : ...
**Inconvénients** : ...
**Verdict** : Accepté - [raison]

## Conséquences

### Positives
1. ...

### Négatives
1. ...

## Références

- [Lien vers doc]
- [Lien vers code]
```

---

*Dernière mise à jour : 9 janvier 2026*
