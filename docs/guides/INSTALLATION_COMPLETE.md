# Installation complète d'un nouveau boîtier Neopro

## 🎯 Vue d'ensemble

Il y a **3 méthodes** pour installer un nouveau boîtier :

### Méthode 1 : Setup Remote (RECOMMANDÉE) ✅ - 22 min

**Installation complète sans dépendance locale** - Idéal pour la production :

```
1. Flash Raspberry Pi OS Lite                        → 5 min
2. Installation système (curl setup.sh)              → 15-20 min
3. Configuration club (setup-remote-club.sh)         → 2-5 min
                                             TOTAL : ~22 min
```

**Avantages :**

- ✅ Aucune dépendance au dossier Neopro
- ✅ Fonctionne depuis n'importe quel ordinateur
- ✅ Toujours la dernière version depuis GitHub
- ✅ Installation terrain simplifiée

**Guide complet : [ONLINE_INSTALLATION.md](../ONLINE_INSTALLATION.md)**
**Script club : [../../raspberry/scripts/CLUB-SETUP-README.md](../../raspberry/scripts/CLUB-SETUP-README.md)**

### Méthode 2 : Image Golden - 10 min

Si vous avez une **Image Golden** pré-configurée :

```
1. Flash image golden (Raspberry Pi Imager)          → 5 min
2. Premier boot + first-boot-setup.sh                → 1 min
3. setup-new-club.sh ou setup-remote-club.sh         → 5 min
                                             TOTAL : ~10 min
```

**Avantages :**

- ✅ Le plus rapide
- ✅ Pas besoin de connexion Internet

**Guide complet : [GOLDEN_IMAGE.md](GOLDEN_IMAGE.md)**

### Méthode 3 : Installation manuelle - 45 min

Sans image golden, installation manuelle complète :

```
1. Flash Raspberry Pi OS Lite                        → 5 min
2. copy-to-pi.sh + install.sh                        → 30 min
3. setup-new-club.sh (nécessite dossier Neopro)      → 10 min
                                             TOTAL : ~45 min
```

**Quand l'utiliser :**

- 🔧 Développement et tests
- 🔧 Modifications custom nécessaires

**Cette page décrit la méthode 3.**

---

## Méthode 3 : Installation manuelle complète (sans Image Golden)

### Étape 1 : Installation système (sur le Raspberry Pi)

### Prérequis

- Raspberry Pi 3B+, 4, ou **5** (tous supportés depuis v2.27)
- Carte microSD 32GB minimum
- Raspberry Pi OS Lite 64-bit (Bullseye ou Bookworm)

### 1.1 Flasher la carte SD

```bash
# Utiliser Raspberry Pi Imager
# 1. Choisir Raspberry Pi OS Lite (64-bit)
# 2. Configurer (roue dentée) :
#    - Activer SSH
#    - Utilisateur : pi
#    - Mot de passe : votre choix
#    - WiFi temporaire (pour l'installation)
# 3. Flasher
```

### 1.2 Premier démarrage

```bash
# Trouver l'IP du Pi (sur votre réseau WiFi temporaire)
ping raspberrypi.local
# OU
nmap -sn 192.168.1.0/24 | grep -i raspberry

# Se connecter
ssh pi@raspberrypi.local
```

### 1.3 Copier les fichiers d'installation

```bash
# Depuis votre Mac/PC (méthode recommandée)
cd /path/to/neopro
./raspberry/scripts/copy-to-pi.sh raspberrypi.local

# OU méthode manuelle (copie plus de fichiers que nécessaire)
scp -r raspberry/ pi@raspberrypi.local:~/

# Vérifier
ssh pi@raspberrypi.local 'ls -la ~/raspberry/'
```

**Note :** Le script `copy-to-pi.sh` copie uniquement les fichiers nécessaires à l'installation, excluant les scripts Mac, outils, et fichiers `.DS_Store`.

### 1.4 Lancer l'installation système

```bash
# Sur le Pi
ssh pi@raspberrypi.local

# Aller dans le dossier
cd raspberry

# Lancer l'installation (REMPLACER PAR VOS VALEURS)
sudo ./install.sh NANTES VotreMotDePasseWiFi123
# Optionnel : ajouter le WiFi Internet (clé USB branchée)
# sudo ./install.sh NANTES VotreMotDePasseWiFi123 Livebox-F730 MonPassInternet456

# Durée : 20-30 minutes
```

**Ce que fait install.sh :**

- ✅ Vérifie les prérequis (connexion Internet, espace disque, fichiers requis)
- ✅ Met à jour le système
- ✅ Installe Node.js, nginx, hostapd, dnsmasq
- ✅ Configure le hostname → `neopro.local`
- ✅ Configure le WiFi hotspot → `NEOPRO-NANTES`
- ✅ Détecte une clé WiFi USB (`wlan1`) et propose/configure le WiFi client (Internet)
- ✅ Installe l'application (server, admin, **sync-agent**)
- ✅ Configure les services systemd (neopro-app, neopro-admin, neopro-sync-agent)
- ✅ Configure nginx
- ✅ **Détecte le modèle de Pi** et configure le GPU :
  - Pi 4 et antérieurs : `gpu_mem=256` dans `/boot/config.txt`
  - Pi 5 : Driver V3D natif (aucun flag GPU custom, v3.7.3+)
- ✅ **Installe le watchdog kiosk** pour récupération automatique des crashs Chromium
- ✅ **Installe 3 services de protection** : hotspot-watchdog, sync-guardian, hotspot-optimizer
- ✅ Affiche la durée totale d'installation

### 1.5 Vérification

Après le redémarrage (attendre 2 minutes) :

```bash
# 1. Se connecter au WiFi NEOPRO-NANTES
#    Mot de passe : VotreMotDePasseWiFi123

# 2. Tester l'accès
ping neopro.local

# 3. Tester l'interface admin
# Dans un navigateur :
http://neopro.local:8080

# 4. (Si WiFi client configuré) vérifier wlan1
ssh pi@neopro.local 'ip addr show wlan1'
# (install.sh + setup-wifi-client activent automatiquement wpa_supplicant@wlan1 et dhcpcd : la connexion survit aux redémarrages)
# ou configurez-le plus tard via http://neopro.local:8080 -> Réseau

# Si ça fonctionne → Installation système réussie ! ✅
```

---

## Étape 2 : Configuration du club (depuis votre Mac/PC)

Maintenant que le Pi est installé, on configure le club spécifique.

### 2.1 Se connecter au WiFi du boîtier

```
SSID : NEOPRO-NANTES
Mot de passe : VotreMotDePasseWiFi123
```

### 2.2 (Optionnel mais RECOMMANDÉ) Configurer SSH

Pour éviter de retaper le mot de passe SSH à chaque déploiement :

```bash
# 1. Créer une clé SSH (si vous n'en avez pas)
ssh-keygen -t rsa -b 4096
# Appuyez sur Entrée 3 fois (emplacement par défaut, pas de passphrase)

# 2. Copier la clé sur le Pi
ssh-copy-id pi@neopro.local
# Entrez le mot de passe du Pi (une dernière fois !)

# 3. Tester
ssh pi@neopro.local
# Devrait fonctionner sans mot de passe ✅
```

**Si vous sautez cette étape :** Le script fonctionnera quand même, mais vous devrez entrer le mot de passe SSH plusieurs fois.

**Guide détaillé :** [SSH_SETUP.md](SSH_SETUP.md)

### 2.3 Lancer le script de configuration

```bash
# Depuis votre Mac/PC
cd /path/to/neopro

# Lancer le script
./raspberry/scripts/setup-new-club.sh
```

**Le script va demander :**

- Nom du club (NANTES)
- Nom complet (NANTES LOIRE FÉMININ HANDBALL)
- Nom du site (MANGIN BEAULIEU)
- Ville (NANTES)
- Région (PDL)
- Sports (handball)
- Email de contact
- Téléphone
- Mot de passe d'accès (12+ caractères)
- Adresse du Pi (neopro.local)

**Ce que fait le script :**

- ✅ Crée la configuration dans `raspberry/config/templates/NANTES-configuration.json`
- ✅ Teste la connexion SSH au Pi (avec réinitialisation de clé si nécessaire)
- ✅ Build l'application Angular (réutilise `build-and-deploy.sh`)
- ✅ Déploie sur le Pi via SSH avec backup automatique
- ✅ Configure le hotspot WiFi (SSID `NEOPRO-NANTES`)
- ✅ Configure le sync-agent pour le serveur central
- ✅ Affiche un résumé complet avec durée d'exécution

**⚠️ Note SSH :** Le script va demander le mot de passe SSH plusieurs fois pendant le déploiement (sauf si vous avez configuré une clé SSH à l'étape 2.2).

### 2.4 Test final

```bash
# Dans un navigateur
http://neopro.local/login

# Entrer le mot de passe configuré
# Si ça fonctionne → Configuration réussie ! ✅
```

---

## Récapitulatif complet

### Première fois (nouveau Pi)

```bash
# 1. Flasher la carte SD avec Raspberry Pi Imager
#    - Raspberry Pi OS Lite
#    - Activer SSH, configurer WiFi temporaire

# 2. Copier les fichiers sur le Pi
scp -r raspberry/ pi@raspberrypi.local:~/

# 3. Installer le système
ssh pi@raspberrypi.local
cd raspberry
sudo ./install.sh NANTES VotreMotDePasseWiFi123
# Attendre 20-30 min + redémarrage

# 4. Se connecter au WiFi NEOPRO-NANTES

# 5. (Optionnel) Configurer SSH pour éviter de retaper le mot de passe
ssh-keygen -t rsa -b 4096
ssh-copy-id pi@neopro.local

# 6. Configurer le club
cd /path/to/neopro
./raspberry/scripts/setup-new-club.sh
# Suivre les instructions interactives
# Entrer le mot de passe SSH quand demandé (si pas de clé SSH)
```

### Club suivant (Pi déjà installé)

Si vous avez déjà un Pi installé et que vous voulez changer de club :

```bash
# Option A : Réinstaller complètement
ssh pi@neopro.local
cd raspberry
sudo ./install.sh NOUVEAU_CLUB NouveauMotDePasseWiFi

# Option B : Juste changer la configuration
./raspberry/scripts/setup-new-club.sh
# Le script peut redéployer sur un Pi existant
```

### Mise à jour de l'application (sans changer de club)

Pour mettre à jour l'application sans reconfigurer le club :

```bash
# Depuis votre Mac/PC (à la racine du projet)
./raspberry/scripts/build-and-deploy.sh

# Ou vers une adresse spécifique
./raspberry/scripts/build-and-deploy.sh neopro.local
./raspberry/scripts/build-and-deploy.sh 192.168.4.1
```

**Ce que fait build-and-deploy.sh :**

- ✅ Vérifie les prérequis (Node.js, npm, Angular CLI)
- ✅ Build l'application Angular (optimisé : skip npm install si pas nécessaire)
- ✅ Crée un backup de la version actuelle sur le Pi
- ✅ Déploie webapp, server et sync-agent
- ✅ Redémarre tous les services (neopro-app, nginx, sync-agent)
- ✅ Vérifie que les services sont actifs
- ✅ Affiche la durée totale

---

## Troubleshooting

### Le Pi ne redémarre pas après install.sh

```bash
# Vérifier les logs via HDMI + clavier
# OU se reconnecter au WiFi temporaire
ssh pi@raspberrypi.local
sudo journalctl -xe
```

### Le WiFi NEOPRO-CLUB n'apparaît pas

```bash
ssh pi@raspberrypi.local  # Via WiFi temporaire ou Ethernet

# Vérifier hostapd
sudo systemctl status hostapd
sudo journalctl -u hostapd -n 50

# Redémarrer
sudo systemctl restart hostapd
sudo systemctl restart dnsmasq
```

### neopro.local ne fonctionne pas

```bash
# Utiliser l'IP directe
http://192.168.4.1:8080

# Vérifier avahi
ssh pi@neopro.local  # Si accessible
sudo systemctl status avahi-daemon
sudo systemctl restart avahi-daemon
```

### setup-new-club.sh ne peut pas se connecter

```bash
# Vérifier que vous êtes sur le bon WiFi
# SSID : NEOPRO-CLUB

# Tester la connexion
ping neopro.local

# Si ping ne fonctionne pas, utiliser l'IP
ping 192.168.4.1

# Modifier le script pour utiliser l'IP
# Quand il demande l'adresse, entrer : 192.168.4.1
```

### Android refuse de se connecter au hotspot

**Symptômes :** Android affiche "Pas d'accès Internet" et se déconnecte du WiFi `NEOPRO-{CLUB}`.

**Solution :** Le captive portal est automatiquement configuré depuis la version 2.5.0. Si vous avez des problèmes :

1. **Solution immédiate :** Tapez "Rester connecté" et utilisez `http://192.168.4.1/login`
2. **Vérifier le captive portal :**
   ```bash
   ssh pi@192.168.4.1
   curl -I http://localhost/generate_204
   # Doit retourner : HTTP/1.1 204 No Content
   ```
3. **Guide complet :** [docs/guides/ANDROID_HOTSPOT_FIX.md](ANDROID_HOTSPOT_FIX.md)

### Le sync-agent ne se connecte pas au serveur central

```bash
ssh pi@neopro.local

# Vérifier le status du service
sudo systemctl status neopro-sync-agent

# Voir les logs
sudo journalctl -u neopro-sync-agent -n 50

# Vérifier la configuration
cat /etc/neopro/site.conf

# Réenregistrer le site manuellement
cd /home/pi/neopro/sync-agent
sudo npm run register
sudo systemctl restart neopro-sync-agent
```

---

## Schéma récapitulatif

```
┌─────────────────────────────────────────────────┐
│  NOUVEAU RASPBERRY PI                           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  1. Flasher SD avec Raspberry Pi Imager         │
│     - Raspberry Pi OS Lite                      │
│     - SSH activé                                │
│     - WiFi temporaire configuré                 │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  2. Copier fichiers                             │
│     scp -r raspberry/ pi@raspberrypi.local:~/   │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  3. Installation système                        │
│     ssh pi@raspberrypi.local                    │
│     cd raspberry                                │
│     sudo ./install.sh CLUB MotDePasseWiFi       │
│     [20-30 min]                                 │
└─────────────────────────────────────────────────┘
                    ↓
         [REDÉMARRAGE AUTOMATIQUE]
                    ↓
┌─────────────────────────────────────────────────┐
│  SYSTÈME INSTALLÉ                               │
│  - Hostname : neopro.local                      │
│  - WiFi : NEOPRO-CLUB                           │
│  - Services : nginx, neopro-app, sync-agent     │
│  - Dossier : /home/pi/neopro/                   │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  4. Se connecter au WiFi NEOPRO-CLUB            │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  5. (Optionnel) Configurer SSH                  │
│     ssh-keygen -t rsa -b 4096                   │
│     ssh-copy-id pi@neopro.local                 │
│     [1 min]                                     │
│     ⚡ Évite de retaper le mot de passe         │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  6. Configuration du club                       │
│     ./raspberry/scripts/setup-new-club.sh       │
│     [5-10 min]                                  │
│     💡 Entrer le mot de passe SSH si demandé    │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  BOÎTIER PRÊT ! 🎉                              │
│  - http://neopro.local/login                    │
│  - http://neopro.local/tv                       │
│  - http://neopro.local/remote                   │
│  - http://neopro.local:8080                     │
└─────────────────────────────────────────────────┘
```

---

## Temps estimés

| Étape                  | Durée         |
| ---------------------- | ------------- |
| Flash carte SD         | 5-10 min      |
| Premier boot           | 2-3 min       |
| Copie fichiers         | 1 min         |
| install.sh             | 20-30 min     |
| Redémarrage            | 2 min         |
| Config SSH (optionnel) | 1 min         |
| setup-new-club.sh      | 5-10 min      |
| **TOTAL**              | **35-50 min** |

---

## Pour les clubs suivants

Une fois que vous avez un Pi installé, vous pouvez :

1. **Créer une Image Golden** pour accélérer les prochaines installations → [GOLDEN_IMAGE.md](GOLDEN_IMAGE.md)
2. **Juste changer la config** avec setup-new-club.sh
3. **Réinstaller** avec un nouveau nom de club

La partie longue (install.sh) n'est à faire qu'une fois par Pi physique.

---

## Scripts disponibles

| Script                    | Emplacement          | Description                       |
| ------------------------- | -------------------- | --------------------------------- |
| `copy-to-pi.sh`           | `raspberry/scripts/` | Copie intelligente vers Pi        |
| `install.sh`              | `raspberry/`         | Installation système sur Pi       |
| `setup-new-club.sh`       | `raspberry/scripts/` | Configuration club complète       |
| `build-and-deploy.sh`     | `raspberry/scripts/` | Mise à jour application           |
| `prepare-golden-image.sh` | `raspberry/tools/`   | Prépare Pi pour clonage           |
| `clone-sd-card.sh`        | `raspberry/tools/`   | Clone carte SD en image           |
| `cleanup-pi.sh`           | `raspberry/scripts/` | Nettoie ~/raspberry après install |
| `diagnose-pi.sh`          | `raspberry/scripts/` | Diagnostic complet du Pi (CPU, GPU, services, réseau) |
| `fix-fleet-pi.sh`         | `raspberry/scripts/` | Réparation flotte (TKIP, services, GPU, buffers) |
| `fix-hotspot.sh`          | `raspberry/scripts/` | Diagnostic et réparation hotspot WiFi |

---

---

## Support Raspberry Pi 5

Depuis la version 2.27+, le **Raspberry Pi 5** est entièrement supporté. Depuis la v3.7.3, le Pi 5 utilise le **driver V3D natif (Mesa)** pour des performances optimales.

| Modèle       | GPU           | Configuration GPU                                |
| ------------ | ------------- | ------------------------------------------------ |
| Pi 3B+, Pi 4 | VideoCore VI  | `gpu_mem=256` dans `/boot/config.txt`            |
| **Pi 5**     | VideoCore VII | V3D natif (Mesa) — aucun flag GPU custom (v3.7.3+) |

**Pourquoi V3D natif sur Pi 5 ?**

Le Pi 5 utilise le driver Mesa V3D 7.1 pour le compositing GPU, identique au navigateur Chromium normal. Les anciennes solutions (SwiftShader v2.27, EGL natif v3.7.2) ont été abandonnées car elles causaient des saccades ou des erreurs SharedImageStub.

**Vérifier le modèle** :

```bash
cat /proc/device-tree/model
# "Raspberry Pi 5 Model B Rev 1.0" ou "Raspberry Pi 4 Model B Rev 1.4"
```

**Vérifier la configuration GPU** :

```bash
# Pi 4 : doit afficher 256M
vcgencmd get_mem gpu

# Pi 5 : affiche toujours 4M (normal, utilise CMA dynamique)
# Vérifier qu'aucun flag GPU custom n'est actif :
pgrep -a chromium | grep -E "use-gl|use-angle|swiftshader"
# Aucun résultat = OK (V3D natif actif)
```

Pour plus de détails sur les crashs Chromium, voir [TROUBLESHOOTING.md](TROUBLESHOOTING.md#5-chromium-crash-aw-snap-error-code-5-après-1-2h-de-boucle-vidéo).

---

**Prochaines étapes :**

- [GOLDEN_IMAGE.md](GOLDEN_IMAGE.md) - Créer une Image Golden
- [README.md](../README.md) - Utilisation quotidienne
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Dépannage

---

**Version :** 2.1.0
**Dernière mise à jour :** Février 2026
