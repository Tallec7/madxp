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

---

## Évolutions (2025-2026)

L'architecture edge a été significativement renforcée pour gérer les réalités terrain.

### Résilience Edge multi-couches (v2.24 → v2.40)

L'expérience de production a montré que le Pi doit survivre à des conditions hostiles : coupures réseau, surchauffes GPU, fichiers corrompus, hotspot instable. Plusieurs couches de protection ont été ajoutées :

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Raspberry Pi                                  │
│                                                                      │
│  Couche 4 : sync-agent-guardian (bash, indépendant)                 │
│    → Surveille le sync-agent, restaure depuis golden si 3+ crashs   │
│    → Voir ADR-014                                                    │
│                                                                      │
│  Couche 3 : kiosk-watchdog (bash)                                   │
│    → Détecte crashs Chromium "Aw, Snap!", relance avec cooldown GPU │
│    → Anti-boucle : 3 crashs/5min → pause 60s                        │
│                                                                      │
│  Couche 2 : network-watchdog (Node.js, dans sync-agent)             │
│    → Surveille hotspot (30s), internet (60s), cloud (30s)            │
│    → Auto-recovery avec rollback si perte connexion                  │
│                                                                      │
│  Couche 1 : error-recovery vidéo (Angular, dans tv.component)       │
│    → Skip vidéo corrompue, full reset après 3 erreurs GPU           │
│    → Watchdog playback 10s, cleanup mémoire préventif 30min         │
│    → Voir ADR-006                                                    │
│                                                                      │
│  Couche 0 : systemd restart policies                                 │
│    → Restart=always sur tous les services neopro-*                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Détection et adaptation réseau (v2.35 → v2.37)

Le réseau des clubs sportifs est rarement un simple WiFi domestique. Détection automatique du profil réseau :

| Profil | Comportement adapté |
|--------|--------------------|
| `simple` | BSSID lock autorisé, restart hotspot direct |
| `mesh` | BSSID lock interdit, bgscan auto, reboot pour hotspot (voir ADR-011) |
| `mesh_isolated` | Cloud Remote recommandé (voir ADR-007) |
| `enterprise` | Configuration IT requise |
| `ethernet` | Connexion stable, pas de surveillance WiFi |

### Cloud Remote comme fallback réseau (v2.33)

Nouveau chemin de communication pour les réseaux avec isolation client :

```
Téléphone → Internet → Central Server → Socket.IO → sync-agent → localhost:3000 → TV
```

Latence 100-300ms, acceptable pour une télécommande. Voir ADR-007.

### Configuration Mirror améliorée (v2.42)

Le mécanisme de Config Mirror a été renforcé pour éviter les race conditions :
- Blocage temporaire (60s) du `sync_local_state` après un `update_config` (voir ADR-013)
- Le Pi envoie l'ancienne config avant de traiter la nouvelle → le cloud la rejetait et écrasait la nouvelle

## Références

- [SYNC_ARCHITECTURE.md](../technical/SYNC_ARCHITECTURE.md) - Détails du protocole de synchronisation
- [COMMAND_QUEUE.md](../technical/COMMAND_QUEUE.md) - Gestion des sites offline
- ADR-006 : Double-buffer vidéo
- ADR-007 : API Remote publique
- ADR-011 : Interdiction BSSID lock en mesh
- ADR-013 : Merge intelligent de configuration
- ADR-014 : Guardian bash indépendant

---

*Créé le 9 janvier 2026 — Mis à jour le 11 février 2026*
