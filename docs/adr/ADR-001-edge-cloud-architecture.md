# ADR-001: Architecture Edge + Cloud

**Date** : Octobre 2024
**Statut** : Accepté
**Décideurs** : Équipe fondatrice Neopro

---

## Contexte

Neopro doit diffuser du contenu vidéo sur des télévisions dans des clubs sportifs. Ces clubs ont des contraintes spécifiques :

1. **Connexion Internet variable** : WiFi instable, parfois coupure pendant les matchs
2. **Latence critique** : La télécommande doit répondre instantanément
3. **50+ installations** : Besoin de gérer une flotte de dispositifs à distance
4. **Contenu local** : Vidéos personnalisées par club (sponsors locaux, jingles)

## Décision

Adopter une **architecture Edge + Cloud** avec :

- **Edge (Raspberry Pi)** : Application autonome capable de fonctionner sans Internet
- **Cloud (Central Server)** : Dashboard d'administration et synchronisation

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Dashboard     │ ──API── │  Central Server  │ ──WS──  │  Raspberry Pi   │
│   (Angular)     │         │  (Express/PG)    │         │  dans le club   │
└─────────────────┘         └──────────────────┘         └─────────────────┘
     Admin                       Cloud                        Edge
```

## Alternatives Considérées

### 1. Full Cloud (streaming)

**Avantages** :
- Pas de matériel à déployer
- Mise à jour instantanée

**Inconvénients** :
- Dépendance Internet totale
- Latence télécommande inacceptable (>500ms)
- Coûts de bande passante élevés (streaming 1080p × 50 clubs)

**Verdict** : Rejeté - La fiabilité Internet des gymnases est insuffisante.

### 2. Full Edge (autonome)

**Avantages** :
- Aucune dépendance Internet
- Latence nulle

**Inconvénients** :
- Pas de visibilité centrale sur la flotte
- Mise à jour manuelle site par site
- Pas d'analytics centralisées

**Verdict** : Rejeté - Ingérable à 50+ sites.

### 3. Edge + Cloud (hybride) ✅

**Avantages** :
- Autonomie locale (fonctionne offline)
- Latence nulle pour la télécommande
- Gestion centralisée de la flotte
- Analytics et déploiements à distance

**Inconvénients** :
- Complexité de synchronisation
- Deux codebases à maintenir

**Verdict** : Accepté - Meilleur compromis fiabilité/fonctionnalités.

## Conséquences

### Positives

1. **Résilience** : Les clubs fonctionnent même sans Internet
2. **Performance** : Latence télécommande <50ms (locale)
3. **Scalabilité** : Ajout de nouveaux clubs sans impact serveur
4. **Maintenance** : Mise à jour OTA possible

### Négatives

1. **Complexité** : Gestion de l'état distribué (conflits de sync)
2. **Double codebase** : Angular dashboard + Angular Raspberry
3. **DevOps** : Deux pipelines de déploiement différents

### Risques Mitigés

| Risque | Mitigation |
|--------|------------|
| Perte de sync | Command Queue stocke les commandes pour sites offline |
| État incohérent | Config Mirror reflète l'état réel du Pi dans le cloud |
| Mise à jour bloquée | Rollback automatique si échec, accès SSH fallback |

## Références

- [SYNC_ARCHITECTURE.md](../technical/SYNC_ARCHITECTURE.md) - Détails du protocole de synchronisation
- [COMMAND_QUEUE.md](../technical/COMMAND_QUEUE.md) - Gestion des sites offline

---

*Créé le 9 janvier 2026*
