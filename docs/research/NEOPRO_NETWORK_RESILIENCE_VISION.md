# Vision Produit : Neopro Network Resilience

> **Document stratégique** - Janvier 2026
>
> Comment transformer un problème industrie en avantage concurrentiel

---

## 1. Contexte : Un Problème Industrie, Une Opportunité Produit

### 1.1 Le Constat

Après analyse de l'industrie du digital signage, nous avons identifié que :

| Fait                                                      | Implication                                                |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| **Tous les concurrents Pi ont des problèmes WiFi**        | Ce n'est pas un bug Neopro, c'est un défi technique commun |
| **Le driver brcmfmac a des bugs documentés**              | Certains problèmes sont hors de notre contrôle             |
| **L'architecture dual-WiFi est unique à Neopro**          | Plus de fonctionnalités = plus de complexité               |
| **Aucun concurrent ne gère bien les environnements mesh** | Opportunité de différenciation                             |

### 1.2 L'Opportunité

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ÉTAT ACTUEL DE L'INDUSTRIE                                               │
│   ══════════════════════════                                                │
│                                                                             │
│   "Si ça ne marche pas en WiFi, utilisez Ethernet"                         │
│   "Contactez votre IT pour configurer un SSID dédié"                       │
│   "Désactivez le WiFi interne et utilisez un dongle"                       │
│                                                                             │
│   → L'industrie ÉVITE le problème au lieu de le RÉSOUDRE                   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   VISION NEOPRO                                                            │
│   ═════════════                                                             │
│                                                                             │
│   "Neopro s'adapte automatiquement à votre réseau"                         │
│   "Détection intelligente des environnements complexes"                    │
│   "Récupération automatique en cas de problème"                            │
│                                                                             │
│   → Neopro RÉSOUT le problème de manière TRANSPARENTE                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Positionnement : "Network-Resilient Digital Signage"

### 2.1 Proposition de Valeur Unique

> **"Neopro fonctionne dans tous les environnements réseau, même les plus complexes, sans intervention IT."**

### 2.2 Différenciateurs Clés

| Fonctionnalité                            | Neopro                  | Concurrents               |
| ----------------------------------------- | ----------------------- | ------------------------- |
| **Détection automatique mesh/enterprise** | ✅ Automatique          | ❌ Manuel ou inexistant   |
| **Adaptation comportement selon réseau**  | ✅ Dynamique            | ❌ Configuration statique |
| **Télécommande locale ET cloud**          | ✅ Les deux             | ❌ Cloud uniquement       |
| **Auto-recovery réseau**                  | ✅ Watchdog intelligent | ❌ Reboot manuel          |
| **Fonctionne avec isolation client**      | ✅ Remote Cloud         | ❌ Bloqué                 |

### 2.3 Message Marketing

**Pour les commerciaux** :

> "Contrairement à nos concurrents qui vous demandent de changer votre infrastructure réseau, Neopro s'adapte à VOTRE réseau existant."

**Pour les techniciens IT** :

> "Neopro détecte automatiquement les environnements mesh et enterprise, et ajuste son comportement pour garantir une connectivité stable sans configuration manuelle."

---

## 3. Architecture Technique : Les 4 Couches de Résilience

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                        NEOPRO NETWORK RESILIENCE STACK                      │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  COUCHE 4: DASHBOARD INTELLIGENT                                      │ │
│  │  ─────────────────────────────────                                    │ │
│  │  • Affichage du profil réseau détecté                                │ │
│  │  • Alertes proactives si configuration à risque                       │ │
│  │  • Blocage des opérations dangereuses selon le contexte              │ │
│  │  • Suggestions contextuelles (ex: "Utilisez Remote Cloud")           │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    ▲                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  COUCHE 3: OPÉRATIONS SÉCURISÉES                                      │ │
│  │  ───────────────────────────────                                      │ │
│  │  • BSSID lock bloqué en environnement mesh                           │ │
│  │  • Restart hostapd différé (appliqué au reboot)                      │ │
│  │  • Rollback automatique si perte de connexion après changement       │ │
│  │  • Confirmation requise pour opérations critiques                     │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    ▲                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  COUCHE 2: WATCHDOGS & AUTO-RECOVERY                                  │ │
│  │  ───────────────────────────────────                                  │ │
│  │  • Surveillance hotspot (wlan0) toutes les 30s                       │ │
│  │  • Surveillance Internet (wlan1) toutes les 60s                      │ │
│  │  • Surveillance connexion cloud (Socket.IO)                          │ │
│  │  • Auto-recovery avec max 3 tentatives avant alerte                  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    ▲                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  COUCHE 1: DÉTECTION ENVIRONNEMENT                                    │ │
│  │  ─────────────────────────────────                                    │ │
│  │  • Scan WiFi → Comptage APs du même SSID                             │ │
│  │  • Test isolation client (ARP, ping autres clients)                  │ │
│  │  • Détection 802.1X/Enterprise                                       │ │
│  │  • Score de stabilité (déconnexions/heure)                           │ │
│  │  • Classification: simple | mesh | mesh_isolated | enterprise        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Profils Réseau : Comportements Adaptatifs

### 4.1 Profil "Simple" (Défaut)

**Environnement** : Routeur box standard, 1 seul AP, pas d'isolation

| Fonctionnalité  | Comportement                         |
| --------------- | ------------------------------------ |
| BSSID Lock      | ✅ Autorisé (utile si signal faible) |
| Restart hostapd | ✅ Immédiat                          |
| QR Code défaut  | Local (`http://neopro.local/remote`) |
| SSH/Admin       | Accessible via WiFi du lieu          |
| Alertes         | Standard                             |

### 4.2 Profil "Mesh"

**Environnement** : Plusieurs APs (répéteurs, mesh), roaming actif, pas d'isolation

| Fonctionnalité  | Comportement                    |
| --------------- | ------------------------------- |
| BSSID Lock      | ❌ **Bloqué** (empêche roaming) |
| bgscan          | ✅ Activé automatiquement       |
| Restart hostapd | ⚠️ Différé au reboot            |
| QR Code défaut  | Local                           |
| SSH/Admin       | Accessible via WiFi du lieu     |
| Alertes         | Warning si BSSID lock détecté   |

### 4.3 Profil "Mesh Isolé" (NLF)

**Environnement** : Mesh + isolation client (AP isolation activée)

| Fonctionnalité  | Comportement                                         |
| --------------- | ---------------------------------------------------- |
| BSSID Lock      | ❌ **Bloqué**                                        |
| bgscan          | ✅ Activé automatiquement                            |
| Restart hostapd | ⚠️ Différé au reboot                                 |
| QR Code défaut  | **Cloud** (`https://dashboard.neopro.tv/remote/...`) |
| SSH/Admin       | ❌ Bloqué par isolation → Ethernet ou Cloud          |
| Alertes         | Warning permanent "Environnement isolé"              |
| Remote Cloud    | ✅ Recommandé par défaut                             |

### 4.4 Profil "Enterprise"

**Environnement** : Réseau d'entreprise avec 802.1X, certificats, politiques IT

| Fonctionnalité | Comportement                       |
| -------------- | ---------------------------------- |
| Configuration  | Requiert intervention IT           |
| BSSID Lock     | ❌ **Bloqué**                      |
| QR Code défaut | **Cloud**                          |
| SSH/Admin      | Selon politique IT                 |
| Alertes        | "Configuration enterprise requise" |

---

## 5. Fonctionnalités Détaillées

### 5.1 Network Detector (Couche 1)

**Fréquence** : Au boot + toutes les heures

**Données collectées** :

```javascript
{
  profile: 'mesh_isolated',
  meshInfo: {
    currentSSID: 'NLFH',
    apCount: 3,
    isMesh: true,
    aps: [
      { bssid: '34:3A:20:15:02:40', channel: 1, signal: -65 },
      { bssid: '34:3A:20:16:B3:E0', channel: 6, signal: -72 },
      { bssid: '34:8A:12:30:0B:00', channel: 11, signal: -78 }
    ]
  },
  isolationInfo: {
    gatewayReachable: true,
    otherClientsVisible: false,  // Isolation détectée
    hasIsolation: true
  },
  stabilityInfo: {
    disconnectsLastHour: 2,
    isStable: true,
    score: 80
  },
  detectedAt: '2026-01-18T14:30:00Z'
}
```

**Remontée cloud** : Via `sync_local_state` → stocké dans `sites.network_environment`

### 5.2 Network Watchdog (Couche 2)

**Surveillance Hotspot (wlan0)** :

```
Toutes les 30 secondes :
├── Vérifier iw dev wlan0 info → type AP ?
├── Vérifier systemctl is-active hostapd
└── Si problème → Tentative recovery (max 3)
    ├── rfkill unblock wifi
    ├── systemctl restart hostapd
    └── Attendre 5s et revérifier
```

**Surveillance Internet (wlan1)** :

```
Toutes les 60 secondes :
├── Vérifier IP assignée (pas 169.254.x.x)
├── Ping 8.8.8.8 (timeout 3s)
└── Si problème → Tentative recovery (max 3)
    ├── wpa_cli reconfigure
    ├── Attendre 5s
    ├── Si toujours pas d'IP → dhclient wlan1
    └── Attendre 3s et revérifier
```

**Surveillance Cloud (Socket.IO)** :

```
Toutes les 30 secondes :
├── Vérifier socket.connected === true
├── Vérifier dernier pong reçu < 60s
└── Si zombie → Forcer reconnexion
```

### 5.3 Safe Operations (Couche 3)

**Matrice des opérations** :

| Opération                   | Simple     | Mesh      | Mesh Isolé | Enterprise |
| --------------------------- | ---------- | --------- | ---------- | ---------- |
| `set_bssid_lock`            | ✅ Direct  | ❌ Bloqué | ❌ Bloqué  | ❌ Bloqué  |
| `remove_bssid_lock`         | ✅ Direct  | ✅ Direct | ✅ Direct  | ✅ Direct  |
| `update_hotspot` (SSID)     | ✅ Restart | ⚠️ Reboot | ⚠️ Reboot  | ⚠️ Reboot  |
| `update_hotspot` (password) | ✅ Restart | ⚠️ Reboot | ⚠️ Reboot  | ⚠️ Reboot  |
| `fix_hotspot`               | ✅ Direct  | ⚠️ Reboot | ⚠️ Reboot  | ⚠️ Reboot  |
| `update_software`           | ✅ Direct  | ✅ Direct | ✅ Direct  | ⚠️ Fenêtre |

### 5.4 Dashboard Intelligent (Couche 4)

**Éléments visuels** :

```
┌─────────────────────────────────────────────────────────────────┐
│  Site: NLF - Nord Ligue de Football                             │
│                                                                  │
│  [🔒 Mesh Isolé]  [🟢 En ligne]  [📶 Signal: -68 dBm]           │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ⚠️ ENVIRONNEMENT RÉSEAU COMPLEXE                            ││
│  │                                                              ││
│  │ Ce site est dans un réseau mesh avec isolation client.      ││
│  │                                                              ││
│  │ • Télécommande : Utilisez Remote Cloud                      ││
│  │ • Maintenance : SSH via Ethernet uniquement                 ││
│  │ • BSSID Lock : Désactivé (incompatible mesh)                ││
│  │                                                              ││
│  │ [Voir les détails réseau]                                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Onglets: [État] [Contenu] [Paramètres] [Debug]                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Roadmap d'Implémentation

### Phase 1 : Stabilisation Immédiate (v2.34) - 1 semaine

| Tâche                                | Priorité     | Effort |
| ------------------------------------ | ------------ | ------ |
| Watchdog hotspot basique             | 🔴 Critique  | 4h     |
| Bloquer BSSID lock si >1 AP détecté  | 🔴 Critique  | 2h     |
| Documenter profil NLF dans dashboard | 🟡 Important | 2h     |

**Objectif** : Stabiliser NLF et les sites mesh existants

### Phase 2 : Détection Automatique (v2.35) - 1 semaine

| Tâche                                 | Priorité     | Effort |
| ------------------------------------- | ------------ | ------ |
| NetworkDetector service complet       | 🔴 Critique  | 8h     |
| Migration DB `network_profile`        | 🟡 Important | 2h     |
| Remontée profil dans sync_local_state | 🟡 Important | 4h     |
| Affichage badge profil dans dashboard | 🟢 Normal    | 4h     |

**Objectif** : Tous les sites ont un profil réseau détecté

### Phase 3 : Comportement Adaptatif (v2.36) - 2 semaines

| Tâche                             | Priorité     | Effort |
| --------------------------------- | ------------ | ------ |
| SafeNetworkOperations service     | 🔴 Critique  | 12h    |
| Différer restart hostapd en mesh  | 🔴 Critique  | 4h     |
| QR Code cloud par défaut si isolé | 🟡 Important | 2h     |
| Alertes contextuelles dashboard   | 🟡 Important | 6h     |
| Configuration bgscan automatique  | 🟢 Normal    | 4h     |

**Objectif** : Le système s'adapte automatiquement au profil

### Phase 4 : Résilience Complète (v2.37) - 2 semaines

| Tâche                            | Priorité     | Effort |
| -------------------------------- | ------------ | ------ |
| NetworkWatchdog complet          | 🔴 Critique  | 12h    |
| Auto-recovery hotspot + internet | 🔴 Critique  | 8h     |
| Rollback si perte connexion      | 🟡 Important | 6h     |
| Cron alertes sites à risque      | 🟡 Important | 4h     |
| Documentation utilisateur        | 🟢 Normal    | 4h     |

**Objectif** : Zéro intervention manuelle pour les problèmes réseau courants

---

## 7. Métriques de Succès

### 7.1 KPIs Techniques

| Métrique                  | Objectif | Mesure                |
| ------------------------- | -------- | --------------------- |
| Incidents réseau NLF      | < 1/mois | Alertes dashboard     |
| Temps de recovery auto    | < 2 min  | Logs watchdog         |
| Sites avec profil détecté | 100%     | Query DB              |
| Faux positifs détection   | < 5%     | Feedback utilisateurs |

### 7.2 KPIs Business

| Métrique                  | Objectif | Mesure            |
| ------------------------- | -------- | ----------------- |
| Interventions physiques   | -80%     | Tickets support   |
| Temps de déploiement mesh | -50%     | Temps moyen setup |
| Satisfaction client mesh  | > 4/5    | NPS segment       |

---

## 8. Risques et Mitigations

| Risque                              | Probabilité | Impact | Mitigation                                   |
| ----------------------------------- | ----------- | ------ | -------------------------------------------- |
| Fausse détection mesh               | Moyenne     | Moyen  | Seuil conservateur (>1 AP) + override manuel |
| Bug watchdog cause boucle restart   | Faible      | Élevé  | Max 3 tentatives + cooldown                  |
| Détection isolation fausse positive | Moyenne     | Faible | Test multiple (ARP + ping)                   |
| Overhead CPU détection              | Faible      | Faible | Fréquence 1h, scan async                     |

---

## 9. Conclusion

### Le Problème

Les environnements réseau complexes (mesh, enterprise, isolation client) causent des problèmes à **toute l'industrie du digital signage**. Les concurrents évitent le problème en recommandant Ethernet ou des configurations manuelles.

### L'Opportunité

Neopro peut se différencier en étant la **première solution qui s'adapte automatiquement** aux environnements réseau complexes.

### La Vision

> **"Branchez, allumez, ça marche. Partout."**

Que le client soit dans un petit club avec un routeur box ou dans un gymnase avec un réseau mesh enterprise avec isolation client, Neopro doit fonctionner sans intervention manuelle.

---

**Document créé** : 18 janvier 2026
**Auteur** : Équipe Produit Neopro
**Statut** : Phases 1-4 implémentées (v2.34-v2.37, janvier-février 2026)
**Prochaine étape** : Monitoring et optimisation continue
**Voir aussi** : [ADR-024 — Network Resilience 4-Layer](../adr/ADR-024-network-resilience-layers.md)
