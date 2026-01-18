# Client : NLF (Nord Ligue de Football)

> ⚠️ **CLIENT CRITIQUE** - Plus gros client, environnement mesh WiFi complexe

## Informations générales

| Champ            | Valeur                       |
| ---------------- | ---------------------------- |
| **Nom**          | NLF - Nord Ligue de Football |
| **Site ID**      | _(à compléter)_              |
| **Type de lieu** | Gymnase / Siège fédération   |
| **Réseau WiFi**  | NLFH (mesh, 3+ APs)          |
| **Contact**      | _(à compléter)_              |
| **Priorité**     | 🔴 Haute - Plus gros client  |

---

## Configuration réseau

### Environnement WiFi

| Paramètre      | Valeur              | Notes                          |
| -------------- | ------------------- | ------------------------------ |
| **SSID**       | NLFH                | Réseau mesh avec plusieurs APs |
| **Type**       | Mesh WiFi           | 3+ points d'accès détectés     |
| **BSSID lock** | ❌ INTERDIT         | Ne JAMAIS verrouiller          |
| **bgscan**     | `simple:30:-70:300` | Recommandé pour stabilité      |

### Points d'accès connus

```
SSID: NLFH
├── BSSID: 34:3A:20:15:02:40  Channel: 1   Signal: variable
├── BSSID: 34:3A:20:16:B3:E0  Channel: 6   Signal: variable
└── BSSID: 34:8A:12:30:0B:00  Channel: 11  Signal: variable
```

### Configuration wpa_supplicant recommandée

```
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=FR

network={
    ssid="NLFH"
    psk="[MOT_DE_PASSE]"
    priority=10
    id_str="nlfh_wifi"
    bgscan="simple:30:-70:300"
    scan_ssid=0
}
```

---

## Historique des incidents

### 18 janvier 2026 - Perte de connexion après déploiement

**Contexte :**

- Déploiement d'une mise à jour hotspot optimizer via dashboard
- Le Pi avait un BSSID lock configuré (erreur lors d'une config précédente)

**Symptômes :**

- Site passé "Hors ligne" immédiatement après déploiement
- Hotspot local fonctionnel (`/remote` accessible via 192.168.4.1)
- Aucune connexion cloud

**Cause racine :**

1. Le scanner WiFi admin panel avait verrouillé le BSSID
2. La mise à jour a redémarré hostapd → perturbé wlan1
3. wlan1 tentait de se reconnecter au BSSID verrouillé (devenu inaccessible)
4. Échec DHCP → pas d'IP → pas de cloud

**Résolution :**

```bash
# Connexion SSH via Ethernet
ssh pi@[IP_ETHERNET]

# Supprimer le BSSID lock
sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant.conf

# Reconfigurer wpa_supplicant
sudo wpa_cli -i wlan1 reconfigure

# Forcer DHCP si nécessaire
sudo dhclient wlan1

# Vérifier la connexion
ping -c 3 8.8.8.8
```

**Corrections apportées (v2.33) :**

- `fix-hotspot.sh` ne redémarre plus hostapd
- Détection mesh dans admin panel
- Warning si BSSID lock en environnement mesh
- Bouton suppression BSSID dans dashboard

**Corrections apportées (v2.34) :**

- ⛔ **BSSID lock complètement bloqué en environnement mesh** - Le checkbox est désactivé ET la validation côté serveur refuse la requête
- 🐕 **Hotspot Watchdog** - Service systemd surveillant la santé du hotspot (hostapd, dnsmasq, rfkill) avec récupération automatique
- 📡 Détection automatique du type de réseau (simple vs mesh) basée sur le nombre d'APs avec le même SSID

**Corrections apportées (v2.35) :**

- 🔍 **NetworkDetector complet** - Détection mesh, isolation client (ARP/broadcast), stabilité (déconnexions/heure), enterprise (802.1X)
- 🏷️ **Badge profil réseau** - Affichage visuel dans le dashboard : Simple (vert), Mesh (jaune), Mesh Isolé (rouge), Enterprise (bleu)
- 📊 **Stockage profil en DB** - Colonne `network_profile` JSONB pour analytics et requêtes
- ⚡ **Détection périodique** - Au boot (30s délai) puis toutes les heures

**Leçons apprises :**

- ⚠️ Ne JAMAIS déployer de mise à jour critique sur NLF sans test préalable
- ⚠️ Toujours vérifier l'état mesh/BSSID avant intervention
- ⚠️ Avoir un accès Ethernet de secours documenté

---

## Procédures spécifiques NLF

### Avant tout déploiement

1. **Vérifier l'état WiFi** :
   - Dashboard → Debug → WiFi Client (wlan1)
   - S'assurer qu'aucun BSSID n'est verrouillé

2. **Fenêtre de maintenance** :
   - Préférer les heures creuses (tôt le matin, tard le soir)
   - Avoir le contact NLF disponible si intervention physique requise

3. **Plan B** :
   - Connaître l'IP Ethernet si disponible
   - Avoir les identifiants SSH à portée

### En cas de perte de connexion

1. **Diagnostic rapide** (< 5 min) :

   ```
   Dashboard → Site NLF → Debug → connexion instable ?
   ```

2. **Si site offline** :
   - Contacter NLF pour accès physique OU
   - SSH via Ethernet si câble branché

3. **Commandes de récupération** :

   ```bash
   # Supprimer tout BSSID lock
   sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
   sudo wpa_cli -i wlan1 reconfigure

   # Forcer reconnexion
   sudo dhclient -r wlan1 && sudo dhclient wlan1

   # Vérifier
   iwconfig wlan1
   ping -c 3 8.8.8.8
   ```

### Mise à jour logicielle

**⚠️ Procédure spéciale pour NLF :**

1. **Tester sur un autre site mesh d'abord** (si possible)
2. **Prévenir le contact NLF** de la mise à jour prévue
3. **Avoir le plan de rollback prêt**
4. **Surveiller pendant 30 min après déploiement**

---

## Contacts

| Rôle              | Nom             | Contact         | Notes                 |
| ----------------- | --------------- | --------------- | --------------------- |
| Contact principal | _(à compléter)_ | _(à compléter)_ |                       |
| Contact technique | _(à compléter)_ | _(à compléter)_ | Accès salle technique |
| Backup            | _(à compléter)_ | _(à compléter)_ |                       |

---

## Accès physique

| Type               | Détails                                               |
| ------------------ | ----------------------------------------------------- |
| **Adresse**        | _(à compléter)_                                       |
| **Emplacement Pi** | _(à compléter - ex: salle technique, derrière la TV)_ |
| **Accès Ethernet** | _(à compléter - câble disponible ?)_                  |
| **Horaires accès** | _(à compléter)_                                       |

---

## Isolation Client WiFi

### Problème identifié (18 janvier 2026)

Le réseau NLFH a l'**isolation client** (AP Isolation) activée. Cela signifie que les appareils connectés au même SSID ne peuvent pas communiquer entre eux.

**Conséquences :**

| Depuis                       | Action        | Fonctionne ? |
| ---------------------------- | ------------- | ------------ |
| MacBook sur NLFH             | SSH vers Pi   | ❌ Non       |
| MacBook sur NLFH             | Admin `:8080` | ❌ Non       |
| Téléphone sur NLFH           | `/remote`     | ❌ Non       |
| Téléphone sur **hotspot Pi** | `/remote`     | ✅ Oui       |
| Ethernet                     | SSH vers Pi   | ✅ Oui       |

**Pour le staff NLF :** Obligation de se connecter au **hotspot du Pi** pour utiliser la télécommande. Le QR code affiché pointe vers le hotspot.

**Pour la maintenance :** Utiliser le hotspot ou un câble Ethernet.

### Solution : Remote via Cloud ✅ IMPLÉMENTÉ (v2.33)

La télécommande "cloud" permet de contrôler le Pi depuis n'importe quel réseau, sans avoir besoin du hotspot.

**Architecture :**

```
Téléphone (NLFH) → Internet → Central Server → WebSocket → Pi
```

**Latence :** 100-300ms (acceptable pour une télécommande)

**Avantages :**

- ✅ Fonctionne sur réseaux avec isolation client
- ✅ Fonctionne depuis n'importe où (debug à distance)
- ✅ Pas besoin de changer de WiFi
- ✅ Authentification via compte Neopro

**Comment utiliser :**

1. **Via QR Code** : Dashboard → Site → Paramètres → QR Code → Mode Cloud
2. **URL directe** : `https://dashboard.neopro.tv/remote/{siteId}`

**Pré-requis :**

- Pi connecté au cloud (status "Online")
- Utilisateur authentifié avec accès au site

---

## Remote Cloud - Documentation technique

### Contexte

Les réseaux professionnels (mesh, entreprise) activent souvent l'isolation client pour la sécurité. Cela empêche l'accès à `/remote` depuis le WiFi du lieu.

### Solution implémentée (v2.33)

Télécommande cloud accessible via `https://dashboard.neopro.tv/remote/{siteId}`.

### Endpoints API

```
GET  /api/remote/:siteId/state    → État du site (config, vidéos, connexion)
POST /api/remote/:siteId/command  → Envoyer une commande (score, phase, vidéo...)
GET  /api/remote/:siteId/videos   → Liste des vidéos disponibles
```

### Composants

1. **`CloudRemoteComponent`** (`central-dashboard/src/app/features/remote/`)
   - UI responsive avec mode sombre
   - Vues : accueil, score, vidéos par catégorie
   - Commandes supportées : score, phase, play-video, play-sponsors, timer, breaking-news

2. **`remote.controller.ts`** (`central-server/src/controllers/`)
   - Vérifie les permissions utilisateur
   - Broadcast via Socket.IO vers le Pi

3. **`remote.service.ts`** (`central-dashboard/src/app/core/services/`)
   - Service Angular avec types stricts

4. **`QrCodeGeneratorComponent`** - Mode local/cloud avec toggle

### Commandes supportées

| Type            | Payload                                      | Description                 |
| --------------- | -------------------------------------------- | --------------------------- | -------- | --------- | ------------------- |
| `score-update`  | `{homeTeam, awayTeam, homeScore, awayScore}` | Mise à jour du score        |
| `score-reset`   | `{}`                                         | Reset du score              |
| `phase-change`  | `{phase: 'neutral'                           | 'before'                    | 'during' | 'after'}` | Changement de phase |
| `play-video`    | `{video: {name, path}}`                      | Lecture d'une vidéo         |
| `play-sponsors` | `{}`                                         | Retour à la boucle sponsors |
| `timer-update`  | `{action: 'start'                            | 'pause'                     | 'reset'  | 'sync'}`  | Contrôle timer      |
| `breaking-news` | `{message, duration?, position?}`            | Message défilant            |
| `match-config`  | `{sessionId, matchDate, matchName}`          | Config match                |

### Limites

- ❌ Pi offline → télécommande cloud indisponible (fallback : hotspot local)
- ⚡ Latence ~200ms vs ~50ms en local

### Statut

✅ **IMPLÉMENTÉ** - Janvier 2026

---

## Incident : neopro.local inaccessible sur iPhone (18 janvier 2026)

### Symptôme

- Mac connecté au hotspot → `http://neopro.local/remote` ✅ fonctionne
- iPhone connecté au hotspot → `http://neopro.local/remote` ❌ ne fonctionne pas
- iPhone → `http://192.168.4.1/remote` ✅ fonctionne

### Diagnostic

1. **Avahi (mDNS) n'écoutait pas sur wlan0 (hotspot)**
   - Avahi publiait `neopro.local` uniquement sur wlan1 (interface cliente)
   - Les appareils connectés au hotspot (wlan0) ne recevaient pas les annonces mDNS
   - Le Mac résolvait via son cache Bonjour, l'iPhone non

2. **dnsmasq ne répondait pas pour neopro.local**
   - iOS utilise DNS classique, pas seulement mDNS
   - `neopro.local` n'était pas configuré dans dnsmasq

### Corrections appliquées

**1. Configurer Avahi pour écouter sur wlan0 :**

```bash
sudo sed -i 's/^#allow-interfaces=.*/allow-interfaces=wlan0,wlan1/' /etc/avahi/avahi-daemon.conf
sudo systemctl restart avahi-daemon
```

**2. Ajouter neopro.local dans dnsmasq :**

```bash
echo "address=/neopro.local/192.168.4.1" | sudo tee -a /etc/dnsmasq.conf
sudo systemctl restart dnsmasq
```

### Vérification

```bash
# Vérifier Avahi sur wlan0
sudo journalctl -u avahi-daemon -n 20 | grep wlan0
# Doit afficher : "Joining mDNS multicast group on interface wlan0.IPv4"

# Vérifier dnsmasq
grep neopro /etc/dnsmasq.conf
# Doit afficher : address=/neopro.local/192.168.4.1
```

### Statut

⏳ **EN ATTENTE DE VALIDATION** - Corrections appliquées, à tester lors de la prochaine visite.

### Workaround en attendant

- Utiliser `http://192.168.4.1/remote` (IP directe)
- Ou utiliser la télécommande cloud : `https://dashboard.neopro.tv/remote/{siteId}`

---

## Notes diverses

_(Ajouter ici toute information utile découverte au fil du temps)_

- Le réseau NLFH semble avoir 3+ répéteurs couvrant une grande surface
- Signal parfois faible selon l'emplacement du Pi
- **Isolation client activée** - Voir section dédiée ci-dessus
- ...

---

---

## Nouveautés v2.34 - Résilience Réseau

### Hotspot Watchdog

Service de surveillance du hotspot WiFi actif par défaut.

**Fonctionnement :**

- Vérifie toutes les 30 secondes : hostapd, mode AP, dnsmasq, rfkill, IP
- Récupération automatique (max 3 tentatives, cooldown 5 min)
- Logs dans `/var/log/neopro-hotspot-watchdog.log`

**Commandes :**

```bash
# Voir le statut
/home/pi/neopro/scripts/hotspot-watchdog.sh --status

# Voir les logs
tail -f /var/log/neopro-hotspot-watchdog.log

# Redémarrer le service
sudo systemctl restart neopro-hotspot-watchdog
```

### Blocage BSSID Lock en Mesh

**Admin Panel (`:8080`)** :

- Détection automatique de l'environnement mesh (scan des APs)
- Checkbox "Verrouiller BSSID" désactivé si mesh détecté
- Message d'erreur explicite si contournement tenté

**Dashboard Central** :

- Avertissement visuel dans l'onglet Debug
- Recommandation de supprimer le BSSID lock si détecté en mesh

### Étude Industrie

Voir `/docs/research/NETWORK_CHALLENGES_INDUSTRY_ANALYSIS.md` pour l'analyse complète des problèmes réseau dans l'industrie du digital signage. Conclusion : Neopro n'est pas seul avec ces défis, mais peut se différencier par une meilleure gestion automatique.

---

**Dernière mise à jour :** 18 janvier 2026 (v2.35 - NetworkDetector)
