# Architecture Decision Records (ADR)

> Ce dossier contient les décisions architecturales majeures du projet Neopro.

## Qu'est-ce qu'un ADR ?

Un ADR documente une décision technique importante avec :
- **Contexte** : Pourquoi cette décision était nécessaire
- **Alternatives** : Options considérées avec avantages/inconvénients
- **Décision** : Choix final et justification
- **Conséquences** : Impact positif et négatif

## Liste des ADR

### Fondations (Oct-Nov 2024)

| ID | Titre | Statut | Date |
|----|-------|--------|------|
| [ADR-001](ADR-001-edge-cloud-architecture.md) | Architecture Edge + Cloud | Accepté | Oct 2024 |
| [ADR-002](ADR-002-socketio-realtime.md) | Socket.IO pour temps réel | Accepté | Oct 2024 |
| [ADR-003](ADR-003-postgresql-supabase.md) | PostgreSQL + Supabase | Accepté | Oct 2024 |
| [ADR-004](ADR-004-jwt-httponly-cookies.md) | JWT avec HttpOnly Cookies | Accepté | Nov 2024 |
| [ADR-005](ADR-005-multitenant-rls.md) | Multi-tenant avec RLS | Accepté | Nov 2024 |

### Décisions terrain (2025-2026)

| ID | Titre | Statut | Date |
|----|-------|--------|------|
| [ADR-006](ADR-006-double-buffer-video.md) | Double-buffer vidéo sans préchargement | Accepté | Jan 2026 |
| [ADR-007](ADR-007-public-remote-api.md) | API Remote publique (sans auth JWT) | Accepté | Jan 2026 |
| [ADR-008](ADR-008-dual-storage-ftp-supabase.md) | Double backend stockage FTP + Supabase | Accepté | Déc 2024 |
| [ADR-009](ADR-009-analytics-removal.md) | Suppression des pages Analytics dashboard | Accepté | Fév 2026 |
| [ADR-010](ADR-010-hdmi-cec-analytics.md) | Détection HDMI-CEC pour analytics fiables | Accepté | Fév 2026 |
| [ADR-011](ADR-011-bssid-lock-mesh-prohibition.md) | Interdiction BSSID lock en mesh | Accepté | Jan 2026 |
| [ADR-012](ADR-012-sync-agent-vanilla-js.md) | Sync-agent en JS vanilla (pas TypeScript) | Accepté | Oct 2024 |
| [ADR-013](ADR-013-config-merge-strategy.md) | Merge intelligent de configuration | Accepté | Déc 2025 |
| [ADR-014](ADR-014-guardian-bash-independent.md) | Guardian bash indépendant | Accepté | Jan 2026 |
| [ADR-015](ADR-015-railway-hobby-constraints.md) | Contraintes Railway Hobby plan | Accepté | Jan 2026 |

### Roadmap (proposés)

| ID | Titre | Statut | Date |
|----|-------|--------|------|
| [ADR-016](ADR-016-video-template-engine.md) | Moteur de templates vidéo | Proposé | Fév 2026 |
| [ADR-017](ADR-017-scheduling-local-vs-server.md) | Planification horaire (local vs serveur) | Proposé | Fév 2026 |
| [ADR-018](ADR-018-sponsor-self-service-portal.md) | Portail sponsor self-service | Proposé | Fév 2026 |
| [ADR-019](ADR-019-sponsor-rotation-algorithm.md) | Rotation équitable des sponsors | Proposé | Fév 2026 |
| [ADR-020](ADR-020-content-expiration.md) | Expiration automatique de contenu | Proposé | Fév 2026 |

## Statuts

- **Proposé** : En discussion, décision à prendre
- **Accepté** : Implémenté et en production
- **Déprécié** : Remplacé par une autre décision
- **Rejeté** : Non retenu

## Créer un nouvel ADR

1. Copier un ADR existant ou utiliser le template ci-dessous
2. Numéroter séquentiellement (ADR-021, ADR-022, etc.)
3. Remplir les sections
4. Soumettre une PR pour review
5. Mettre à jour ce README après merge

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

*Dernière mise à jour : 11 février 2026*
