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

## Notes diverses

_(Ajouter ici toute information utile découverte au fil du temps)_

- Le réseau NLFH semble avoir 3+ répéteurs couvrant une grande surface
- Signal parfois faible selon l'emplacement du Pi
- ...

---

**Dernière mise à jour :** 18 janvier 2026
