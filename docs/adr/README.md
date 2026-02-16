# Architecture Decision Records (ADR)

> Ce dossier contient les décisions architecturales majeures du projet Neopro.
> Les propositions non encore décidées sont dans [`../proposals/`](../proposals/).

## Qu'est-ce qu'un ADR ?

Un ADR documente une décision technique importante avec :

- **Contexte** : Pourquoi cette décision était nécessaire
- **Alternatives** : Options considérées avec avantages/inconvénients
- **Décision** : Choix final et justification
- **Conséquences** : Impact positif et négatif

## Liste des ADR

### Fondations (Oct-Nov 2024)

| ID                                            | Titre                     | Statut  | Date     |
| --------------------------------------------- | ------------------------- | ------- | -------- |
| [ADR-001](ADR-001-edge-cloud-architecture.md) | Architecture Edge + Cloud | Accepté | Oct 2024 |
| [ADR-002](ADR-002-socketio-realtime.md)       | Socket.IO pour temps réel | Accepté | Oct 2024 |
| [ADR-003](ADR-003-postgresql-supabase.md)     | PostgreSQL + Supabase     | Accepté | Oct 2024 |
| [ADR-004](ADR-004-jwt-httponly-cookies.md)    | JWT avec HttpOnly Cookies | Accepté | Nov 2024 |
| [ADR-005](ADR-005-multitenant-rls.md)         | Multi-tenant avec RLS     | Accepté | Nov 2024 |

### Décisions terrain (2025-2026)

| ID                                                   | Titre                                     | Statut                   | Date     |
| ---------------------------------------------------- | ----------------------------------------- | ------------------------ | -------- |
| [ADR-006](ADR-006-subscription-license-system.md)    | Système d'abonnement et licence offline   | Accepté                  | Jan 2026 |
| [ADR-007](ADR-007-public-remote-api.md)              | API Remote publique (sans auth JWT)       | Accepté                  | Jan 2026 |
| [ADR-008](ADR-008-double-buffer-video-pi.md)         | Double-buffer vidéo avec freeze-frame     | Accepté                  | Jan 2026 |
| [ADR-009](ADR-009-analytics-removal.md)              | Suppression des pages Analytics dashboard | ⚠️ Supersédé par ADR-027 | Fév 2026 |
| [ADR-010](ADR-010-hdmi-cec-analytics.md)             | Détection HDMI-CEC pour analytics fiables | Accepté                  | Fév 2026 |
| [ADR-011](ADR-011-bssid-lock-mesh-prohibition.md)    | Interdiction BSSID lock en mesh           | Accepté                  | Jan 2026 |
| [ADR-012](ADR-012-sync-agent-vanilla-js.md)          | Sync-agent en JS vanilla (pas TypeScript) | Accepté                  | Oct 2024 |
| [ADR-013](ADR-013-config-merge-strategy.md)          | Merge intelligent de configuration        | Accepté                  | Déc 2025 |
| [ADR-014](ADR-014-guardian-bash-independent.md)      | Guardian bash indépendant                 | Accepté                  | Jan 2026 |
| [ADR-015](ADR-015-railway-hobby-constraints.md)      | Contraintes Railway Hobby plan            | Accepté                  | Jan 2026 |
| [ADR-021](ADR-021-recording-inactivity-timer.md)     | Timer d'inactivité recording              | Accepté                  | Fév 2026 |
| [ADR-022](ADR-022-content-tab-ux-restructuration.md) | Restructuration UX onglet Contenu         | Accepté                  | Fév 2026 |
| [ADR-024](ADR-024-network-resilience-layers.md)      | Résilience réseau multi-couches           | Accepté                  | Jan 2026 |
| [ADR-025](ADR-025-dual-storage-ftp-supabase.md)      | Double backend stockage FTP + Supabase    | Accepté                  | Déc 2024 |
| [ADR-026](ADR-026-predictive-alerts.md)              | Alertes prédictives multi-métriques       | Accepté                  | Fév 2026 |
| [ADR-027](ADR-027-analytics-ui-removal.md)           | Suppression de l'UI Analytics dashboard   | Accepté                  | Fév 2026 |
| [ADR-028](ADR-028-atomic-config-write.md)            | Écriture atomique de configuration.json   | Accepté                  | Fév 2026 |

### Supersédés

| ID                                        | Titre                                       | Remplacé par                                 | Date     |
| ----------------------------------------- | ------------------------------------------- | -------------------------------------------- | -------- |
| [ADR-006](ADR-006-double-buffer-video.md) | Double-buffer vidéo sans préchargement (v1) | [ADR-008](ADR-008-double-buffer-video-pi.md) | Jan 2026 |
| [ADR-009](ADR-009-analytics-removal.md)   | Suppression Analytics (version initiale)    | [ADR-027](ADR-027-analytics-ui-removal.md)   | Fév 2026 |

### Propositions (décision à prendre)

> Déplacées dans [`../proposals/`](../proposals/) — ce ne sont pas des ADR tant que la décision n'est pas prise.

| ID                                                               | Titre                                  | Sujet                   |
| ---------------------------------------------------------------- | -------------------------------------- | ----------------------- |
| [PROP-001](../proposals/PROP-001-multi-tv-single-pi.md)          | Multi-TV depuis un seul Pi             | Hardware / Architecture |
| [PROP-002](../proposals/PROP-002-tv-led-dual-output.md)          | TV + LED dual output                   | Hardware / Architecture |
| [PROP-003](../proposals/PROP-003-stramatel-live-score.md)        | Score live multi-constructeurs         | Intégration hardware    |
| [PROP-004](../proposals/PROP-004-video-template-engine.md)       | Moteur de templates vidéo              | Feature produit         |
| [PROP-005](../proposals/PROP-005-scheduling-local-vs-server.md)  | Planification horaire local vs serveur | Architecture            |
| [PROP-006](../proposals/PROP-006-sponsor-self-service-portal.md) | Portail sponsor self-service           | Feature produit         |
| [PROP-007](../proposals/PROP-007-sponsor-rotation-algorithm.md)  | Rotation équitable des sponsors        | Algorithme              |
| [PROP-008](../proposals/PROP-008-content-expiration.md)          | Expiration automatique de contenu      | Feature produit         |
| [PROP-009](../proposals/PROP-009-motion-design-personnalise.md)  | Motion design personnalisé             | Feature produit         |

## Statuts

- **Accepté** : Décision prise et implémentée
- **Proposé** : En discussion, décision à prendre
- **Supersédé** : Remplacé par un ADR plus récent (garder pour l'historique)
- **Déprécié** : Plus pertinent mais non remplacé
- **Rejeté** : Non retenu

## Créer un nouvel ADR

1. Décider du format avec la [grille de décision](BEST_PRACTICES.md#quand-créer-un-adr-)
2. Copier le template approprié (complet ou léger)
3. Numéroter séquentiellement (prochain : **ADR-029**)
4. Remplir les sections
5. Commiter avec le code dans la même PR
6. Mettre à jour ce README après merge

### Templates

| Format                        | Usage                                                          | Template                                                      |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| **Complet** (~100-175 lignes) | Décisions structurantes, irréversibles, cross-composant        | [`TEMPLATE_ADR.md`](../templates/TEMPLATE_ADR.md)             |
| **Léger** (~15-30 lignes)     | Choix avec trade-offs mais impact limité, décisions de session | [`TEMPLATE_ADR_LIGHT.md`](../templates/TEMPLATE_ADR_LIGHT.md) |

### Bonnes pratiques

Voir **[BEST_PRACTICES.md](BEST_PRACTICES.md)** pour :

- Quand créer un ADR vs. un commit enrichi
- Comment capturer les décisions de session
- Comment lier ADR et code
- Cycle de vie et revue trimestrielle

---

_Dernière mise à jour : 16 février 2026_
