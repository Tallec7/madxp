# Guide : Environnements WiFi Mesh (Cas NLF et similaires)

> Documentation issue de l'incident NLF du 18 janvier 2026 et des solutions mises en place.

## Sommaire

1. [Contexte et définition](#contexte-et-définition)
2. [Symptômes typiques](#symptômes-typiques)
3. [Diagnostic](#diagnostic)
4. [Solutions](#solutions)
5. [Prévention](#prévention)
6. [Checklist nouveau client](#checklist-nouveau-client)
7. [Clients identifiés comme "mesh"](#clients-identifiés-comme-mesh)

---

## Contexte et définition

### Qu'est-ce qu'un environnement mesh WiFi ?

Un réseau **mesh WiFi** (ou WiFi maillé) utilise plusieurs points d'accès (APs) partageant le **même SSID** pour couvrir une grande surface. Les appareils peuvent passer d'un AP à l'autre ("roaming") de manière transparente.

**Exemples courants :**

- Répéteurs WiFi (Netgear, TP-Link, etc.)
- Systèmes mesh grand public (Google Nest WiFi, Eero, Orbi, Deco)
- Réseaux d'entreprise avec contrôleur (Ubiquiti UniFi, Cisco Meraki, Aruba)
- Bornes Livebox/Freebox avec répéteurs

### Pourquoi c'est problématique pour Neopro ?

Le Raspberry Pi utilise **deux interfaces WiFi** :

| Interface | Matériel           | Rôle                                                   | Configuration  |
| --------- | ------------------ | ------------------------------------------------------ | -------------- |
| **wlan0** | WiFi intégré au Pi | Hotspot (`NEOPRO-xxx`) pour `/remote` et admin `:8080` | hostapd        |
| **wlan1** | Dongle USB externe | Connexion Internet du lieu → cloud central             | wpa_supplicant |

**Le problème** : Si on verrouille `wlan1` sur un BSSID spécifique (une borne en particulier) et que cette borne devient inaccessible (saturation, panne, distance), le Pi perd sa connexion Internet et devient inaccessible depuis le dashboard.

---

## Symptômes typiques

### Symptômes observés lors de l'incident NLF

1. **Site passe Hors Ligne après un déploiement** (même si le Pi fonctionne localement)
2. **Déconnexions intermittentes** : le site oscille entre "En ligne" et "Hors ligne"
3. **Dashboard affiche "Connexion instable"** (orange) malgré des heartbeats récents
4. **Après reboot du Pi** : le site ne revient pas en ligne (il était verrouillé sur une borne qui n'est plus accessible)
5. **Le hotspot fonctionne** : `/remote` accessible localement via `192.168.4.1`

### Indicateurs dans les logs

```bash
# Sur le Pi, vérifier les reconnexions fréquentes
sudo journalctl -u wpa_supplicant@wlan1 --since "1 hour ago" | grep -i "associated\|disassociated"

# Vérifier si un BSSID est verrouillé
grep "bssid=" /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
```

---

## Diagnostic

### 1. Depuis le Dashboard Central (v2.33+)

1. Aller dans **Onglet Debug** du site
2. Ouvrir la section **WiFi Client (wlan1)**
3. Cliquer **Charger l'état WiFi**

**Indicateurs à vérifier :**

- **Badge "🔀 Mesh (N APs)"** : Environnement mesh détecté
- **Badge "🔒 BSSID verrouillé"** : DANGER en mesh
- **Bannière jaune** : Avertissement si lock + mesh

### 2. Depuis l'Admin Panel (:8080)

1. Accéder à `http://neopro.local:8080` ou `http://192.168.4.1:8080`
2. Onglet **Réseau** → Section **Scanner WiFi**
3. Observer si plusieurs lignes ont le même SSID

**Exemple d'environnement mesh :**

```
SSID: NLFH
├── BSSID: 34:3A:20:15:02:40  Channel: 1   Signal: -58 dBm ✅
├── BSSID: 34:3A:20:16:B3:E0  Channel: 6   Signal: -72 dBm
└── BSSID: 34:8A:12:30:0B:00  Channel: 11  Signal: -64 dBm
```

### 3. Via SSH

```bash
# Scanner les réseaux et détecter le mesh
sudo iwlist wlan1 scan | grep -E "ESSID|Address|Channel|Signal" | head -30

# Vérifier la connexion actuelle
iwconfig wlan1

# Vérifier si BSSID verrouillé
grep "bssid=" /etc/wpa_supplicant/wpa_supplicant-wlan1.conf

# Compter les APs pour le SSID actuel
SSID=$(iwconfig wlan1 2>/dev/null | grep ESSID | sed 's/.*ESSID:"\([^"]*\)".*/\1/')
sudo iwlist wlan1 scan 2>/dev/null | grep -c "ESSID:\"$SSID\""
```

---

## Solutions

### Solution immédiate : Supprimer le verrouillage BSSID

**Depuis le Dashboard Central :**

1. Onglet Debug → WiFi Client (wlan1)
2. Cliquer **🔓 Supprimer le verrouillage BSSID**

**Depuis l'Admin Panel (:8080) :**

1. Onglet Réseau → État WiFi actuel
2. Cliquer **🔓 Supprimer le verrouillage BSSID**

**Via SSH :**

```bash
# Supprimer la ligne bssid= de la config
sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant.conf

# Reconfigurer sans reboot
sudo wpa_cli -i wlan1 reconfigure

# Vérifier que c'est supprimé
grep "bssid=" /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
# (aucun résultat = OK)
```

### Solution long terme : Optimiser pour mesh

**Depuis le Dashboard Central :**

1. Onglet Debug → WiFi Client (wlan1)
2. Cliquer **🔧 Optimiser pour mesh**

**Via SSH :**

```bash
# Éditer la configuration
sudo nano /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
```

**Configuration optimisée :**

```
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=FR

network={
    ssid="NOM_DU_RESEAU"
    psk="MOT_DE_PASSE"
    priority=10
    id_str="club_wifi"
    bgscan="simple:30:-70:300"
    scan_ssid=0
}
```

**Explication des paramètres :**

| Paramètre           | Valeur              | Effet                                                                            |
| ------------------- | ------------------- | -------------------------------------------------------------------------------- |
| `bgscan`            | `simple:30:-70:300` | Scan background : toutes les 300s si signal > -70dBm, toutes les 30s si < -70dBm |
| `scan_ssid=0`       | Désactivé           | Pas de probe actif (optimisation, le SSID n'est pas caché)                       |
| **PAS de `bssid=`** | -                   | Permet le roaming entre APs                                                      |

```bash
# Appliquer sans reboot
sudo wpa_cli -i wlan1 reconfigure
```

### Si le signal est faible (< -75 dBm)

1. **Améliorer le dongle USB** : Utiliser un dongle avec antenne externe (gain 5dBi+)
   - Recommandé : TP-Link Archer T2U Plus (chipset Realtek RTL8812AU)
   - Alternative : Alfa AWUS036ACH (plus puissant mais plus cher)

2. **Rapprocher le Pi** d'un des points d'accès mesh

3. **Envisager l'Ethernet** si disponible (solution la plus fiable)

---

## Prévention

### Règles à suivre pour les environnements mesh

1. **JAMAIS verrouiller le BSSID** sur un client mesh identifié
2. **Tester avant déploiement** : Scanner les réseaux pour détecter le mesh
3. **Documenter** : Ajouter le client à la liste des "clients mesh" (voir ci-dessous)
4. **Configurer bgscan** dès l'installation si mesh détecté

### Ce qui est automatisé (v2.33+)

| Fonctionnalité          | Où                      | Comportement                                             |
| ----------------------- | ----------------------- | -------------------------------------------------------- |
| **Détection mesh**      | Admin Panel             | Scanne et compte les APs par SSID                        |
| **Warning BSSID lock**  | Admin Panel + Dashboard | Alerte si lock + mesh                                    |
| **Checkbox désactivée** | Admin Panel             | En mesh, "Fixer ce point d'accès" est décoché par défaut |
| **Diagnostic distant**  | Dashboard Debug tab     | Boutons pour voir l'état et corriger                     |

### Ce qui est automatisé (v2.34+)

| Fonctionnalité               | Où                     | Comportement                                                    |
| ---------------------------- | ---------------------- | --------------------------------------------------------------- |
| **⛔ Blocage BSSID lock**    | Admin Panel + Serveur  | Checkbox désactivé ET validation serveur refuse la requête      |
| **🐕 Hotspot Watchdog**      | Service systemd        | Surveillance hotspot 30s, récupération auto (max 3 tentatives)  |
| **📡 Détection profil**      | Sync-Agent → Dashboard | Type de réseau (simple/mesh), BSSID lock, nombre d'APs remontés |
| **⚠️ Avertissement central** | Dashboard Debug tab    | Warning si BSSID lock détecté en mesh                           |

### Ce qui est automatisé (v2.35+)

| Fonctionnalité                    | Où               | Comportement                                                       |
| --------------------------------- | ---------------- | ------------------------------------------------------------------ |
| **🔍 NetworkDetector complet**    | Sync-Agent       | Détection mesh, isolation client, stabilité, enterprise (802.1X)   |
| **🏷️ Badge profil réseau**        | Dashboard Header | Simple (vert), Mesh (jaune), Mesh Isolé (rouge), Enterprise (bleu) |
| **📊 Colonne network_profile**    | DB sites         | Stockage JSONB pour analytics et requêtes                          |
| **⚡ Détection périodique**       | Sync-Agent       | Au boot (30s délai) puis toutes les heures                         |
| **🔒 Détection isolation client** | NetworkDetector  | Test ARP + ping broadcast pour détecter l'isolation                |
| **📈 Score de stabilité**         | NetworkDetector  | 0-100 basé sur les déconnexions/heure (seuil: 3)                   |

**Types de profils détectés :**

| Type            | Conditions                       | Comportement recommandé               |
| --------------- | -------------------------------- | ------------------------------------- |
| `simple`        | 1 AP, pas d'isolation            | BSSID lock autorisé                   |
| `mesh`          | >1 AP même SSID, pas d'isolation | BSSID lock bloqué, bgscan activé      |
| `mesh_isolated` | >1 AP, isolation client détectée | Remote Cloud recommandé, SSH Ethernet |
| `enterprise`    | 802.1X détecté                   | Configuration IT requise              |

### Ce qui est automatisé (v2.36+)

| Fonctionnalité                     | Où                     | Comportement                                                           |
| ---------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| **🛡️ SafeNetworkOperations**       | Sync-Agent             | Encapsule les opérations risquées, bloque celles dangereuses en mesh   |
| **⏳ Defer hostapd restart**       | Hotspot commands       | En mesh, les changements de config nécessitent un reboot (pas restart) |
| **☁️ QR Code Cloud par défaut**    | Dashboard Settings tab | Si mesh_isolated, le QR s'ouvre en mode Cloud automatiquement          |
| **⚠️ Bannière d'alerte réseau**    | Dashboard Site Detail  | Warning contextuel pour sites mesh/isolated/enterprise                 |
| **🔧 Auto-configuration bgscan**   | Sync-Agent (boot)      | Si mesh détecté et bgscan absent → configure automatiquement           |
| **🔓 Auto-suppression BSSID lock** | Sync-Agent (boot)      | Si mesh et BSSID lock → supprime automatiquement                       |

**Matrice des opérations sécurisées (SafeNetworkOperations)** :

| Opération           | Simple     | Mesh      | Mesh Isolé | Enterprise |
| ------------------- | ---------- | --------- | ---------- | ---------- |
| `set_bssid_lock`    | ✅ Direct  | ❌ Bloqué | ❌ Bloqué  | ❌ Bloqué  |
| `remove_bssid_lock` | ✅ Direct  | ✅ Direct | ✅ Direct  | ✅ Direct  |
| `update_hotspot_*`  | ✅ Restart | ⚠️ Reboot | ⚠️ Reboot  | ⚠️ Reboot  |
| `fix_hotspot`       | ✅ Direct  | ⚠️ Reboot | ⚠️ Reboot  | ⚠️ Reboot  |
| `restart_hostapd`   | ✅ Direct  | ❌ Bloqué | ❌ Bloqué  | ❌ Bloqué  |
| `configure_bgscan`  | ✅ Direct  | ✅ Direct | ✅ Direct  | ✅ Direct  |

### Ce qui est automatisé (v2.37+)

| Fonctionnalité                     | Où                   | Comportement                                                                      |
| ---------------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| **🐕 NetworkWatchdog**             | Sync-Agent           | Surveillance continue hotspot (30s) et internet (60s) avec auto-recovery          |
| **🔄 Auto-recovery hotspot**       | NetworkWatchdog      | rfkill unblock → IP config → restart hostapd → restart dnsmasq (max 3 tentatives) |
| **🌐 Auto-recovery internet**      | NetworkWatchdog      | wpa_cli reconfigure → dhclient (max 3 tentatives)                                 |
| **↩️ Rollback automatique**        | NetworkWatchdog      | Si perte connexion 30s après changement config → restaure config précédente       |
| **📢 Alertes proactives**          | Central Server       | Check toutes les 4h : BSSID lock mesh, isolation, stabilité faible, offline > 24h |
| **🔔 network_alert events**        | Socket.IO            | Pi envoie alerte si recovery échoue après 3 tentatives → stocké en DB + dashboard |
| **📊 Statistiques risques réseau** | NetworkAlertsService | Agrégation profils, isolation, stabilité moyenne pour analytics                   |

**Critères d'alertes proactives** :

| Risque                    | Sévérité    | Condition                               |
| ------------------------- | ----------- | --------------------------------------- |
| `bssid_lock_in_mesh`      | 🔴 critical | BSSID lock activé en mesh               |
| `client_isolation`        | 🟡 warning  | Isolation client détectée               |
| `low_stability`           | 🟡/🔴       | Score stabilité < 50 (critical si < 25) |
| `enterprise_unconfigured` | 🟡 warning  | Réseau 802.1X détecté                   |
| `mesh_offline_extended`   | 🔴 critical | Offline > 24h en environnement mesh     |
| `multiple_warnings`       | 🟡 warning  | 3+ warnings dans le profil réseau       |

---

## Checklist nouveau client

### Avant l'installation

- [ ] Demander au client : "Avez-vous des répéteurs WiFi ou un système mesh ?"
- [ ] Demander : "Comment s'appelle votre réseau WiFi ?" (un seul nom = potentiel mesh)
- [ ] Identifier le type de lieu :
  - Gymnase/salle de sport → Souvent mesh (grande surface)
  - Salle des fêtes → Parfois mesh
  - Bar/restaurant → Rarement mesh (sauf grande surface)
  - Stade/aréna → Presque toujours mesh (Ubiquiti, Cisco, etc.)

### Pendant l'installation

- [ ] Scanner les réseaux via l'admin panel `:8080`
- [ ] Si > 1 BSSID pour le même SSID → **marquer comme mesh**
- [ ] Ne PAS cocher "Fixer ce point d'accès"
- [ ] Configurer `bgscan` si mesh détecté
- [ ] Tester la connexion pendant 10 minutes (surveiller les déconnexions)

### Après l'installation

- [ ] Ajouter le client à la liste "Clients mesh" ci-dessous si applicable
- [ ] Documenter dans la fiche du site (champ notes ou description)
- [ ] Surveiller les 24 premières heures

---

## Clients identifiés comme "mesh"

| Client  | Lieu         | SSID | Nombre d'APs | Notes                                      |
| ------- | ------------ | ---- | ------------ | ------------------------------------------ |
| **NLF** | Gymnase Nord | NLFH | 3+           | Incident 18/01/2026 - Ne JAMAIS lock BSSID |
|         |              |      |              |                                            |

> **Comment ajouter un client :**
> Éditer ce fichier et ajouter une ligne au tableau ci-dessus.

---

## Historique des incidents

### NLF - 7 février 2026 (Diagnostic coupures WiFi USB)

**Contexte :** Signalement de déconnexions fréquentes de wlan1.

**Diagnostic réalisé :**

- Signal : **-73 dBm** (Link Quality 37/70) — zone limite
- Alimentation : OK (`throttled=0x0`)
- Power Management : OFF
- bgscan : Configuré (`simple:30:-70:300`)
- BSSID lock : Aucun (correct)
- Canal 6 saturé : 5 réseaux concurrents

**Logs wpa_supplicant :**

```
17:31:33 CONNECTED    → 34:8a:12:30:0b:00
17:50:54 DISCONNECTED → reason=3 locally_generated=1
17:50:56 CONNECTED    → 34:8a:12:30:0b:00 (même borne, 2s après)
```

**Analyse :** `reason=3` (`DEAUTH_LEAVING`) + `locally_generated=1` = le Pi cherche un meilleur AP via bgscan (signal oscillant autour du seuil -70 dBm), ne trouve pas mieux, se reconnecte à la même borne en 2s. Impact nul sur la TV (vidéos locales), micro-interruption imperceptible sur la télécommande cloud.

**Conclusion :** Problème purement physique (signal limite). Logiciel correctement configuré. Ethernet recommandé.

### NLF - 18 janvier 2026 (Perte de connexion après déploiement)

**Contexte :** Déploiement d'une mise à jour hotspot optimizer via le dashboard central.

**Cause racine :**

1. Le scanner WiFi de l'admin panel avait verrouillé le BSSID lors d'une configuration précédente
2. La mise à jour a redémarré hostapd, ce qui a perturbé wlan1
3. wlan1 a tenté de se reconnecter mais le BSSID verrouillé n'était plus le meilleur AP
4. Échec DHCP → pas d'IP → pas de connexion cloud

**Résolution :**

1. Connexion SSH via Ethernet
2. Suppression du BSSID lock : `sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant-wlan1.conf`
3. Reconfiguration : `sudo wpa_cli -i wlan1 reconfigure`
4. Demande manuelle DHCP : `sudo dhclient wlan1`

**Leçons apprises :**

- Toujours vérifier l'environnement mesh avant déploiement
- Le script `fix-hotspot.sh` ne doit plus redémarrer hostapd (risque wlan1)
- Ajouter détection mesh et protection anti-lock dans l'UI

**Corrections implémentées :**

- `fix-hotspot.sh` : Ne redémarre plus hostapd, demande reboot pour appliquer
- Admin Panel : Détection mesh, warning, bouton suppression BSSID
- Dashboard : Section WiFi Client avec diagnostic mesh
- Sync-Agent : Commandes `get_wifi_bssid_status`, `remove_bssid_lock`, `optimize_for_mesh`

---

## Références

- [TROUBLESHOOTING.md - Section 5b](./TROUBLESHOOTING.md#5b-connexion-wlan1-instable-en-environnement-mesh-wifi-répéteurs)
- [Changelog fix-hotspot preservation](../changelog/2026-01-18_fix-hotspot-wlan1-preservation.md)
- [hostapd documentation](https://w1.fi/hostapd/)
- [wpa_supplicant bgscan](https://w1.fi/cgit/hostap/plain/wpa_supplicant/wpa_supplicant.conf)

---

## Études et recherches

- **Analyse industrie** : [NETWORK_CHALLENGES_INDUSTRY_ANALYSIS.md](../research/NETWORK_CHALLENGES_INDUSTRY_ANALYSIS.md)
  - Comparaison avec PiSignage, Screenly, BrightSign, ScreenCloud, Yodeck
  - Bugs documentés du driver brcmfmac Raspberry Pi
  - Conclusion : Neopro n'est pas seul, mais peut se différencier par la gestion automatique

- **Vision produit** : [NEOPRO_NETWORK_RESILIENCE_VISION.md](../research/NEOPRO_NETWORK_RESILIENCE_VISION.md)
  - 4 profils réseau : simple, mesh, mesh_isolated, enterprise
  - Architecture de résilience à 4 couches
  - Roadmap d'implémentation

---

**Dernière mise à jour :** 7 février 2026 (Diagnostic NLF WiFi USB - reason codes, signal -73 dBm)
