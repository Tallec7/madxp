# Installation complète d'un nouveau boîtier Neopro

## 🎯 Vue d'ensemble

Il y a **2 méthodes** pour installer un nouveau boîtier :

### Méthode 1 : Image Golden (RECOMMANDÉE) - 10 min

Si vous avez une **Image Golden** pré-configurée :

```
1. Flash image golden (Raspberry Pi Imager)     → 5 min
2. Premier boot + first-boot-setup.sh           → 1 min
3. setup-new-club.sh                            → 5 min
                                        TOTAL : ~10 min
```

**Guide complet : [GOLDEN_IMAGE.md](GOLDEN_IMAGE.md)**

### Méthode 2 : Installation complète - 45 min

Sans image golden, installation depuis zéro :

```
1. Flash Raspberry Pi OS Lite                   → 5 min
2. copy-to-pi.sh + install.sh                   → 30 min
3. setup-new-club.sh                            → 10 min
                                        TOTAL : ~45 min
```

**Cette page décrit la méthode 2.**

---

## Méthode 2 : Installation complète (sans Image Golden)

### Étape 1 : Installation système (sur le Raspberry Pi)

### Prérequis

- Raspberry Pi 3B+ ou supérieur
- Carte microSD 32GB minimum
- Raspberry Pi OS (Bullseye ou Bookworm)

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

# Durée : 20-30 minutes
```

**Ce que fait install.sh :**
- ✅ Vérifie les prérequis (connexion Internet, espace disque, fichiers requis)
- ✅ Met à jour le système
- ✅ Installe Node.js, nginx, hostapd, dnsmasq
- ✅ Configure le hostname → `neopro.local`
- ✅ Configure le WiFi hotspot → `NEOPRO-NANTES`
- ✅ Installe l'application (server, admin, **sync-agent**)
- ✅ Configure les services systemd (neopro-app, neopro-admin, neopro-sync-agent)
- ✅ Configure nginx
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

| Étape | Durée |
|-------|-------|
| Flash carte SD | 5-10 min |
| Premier boot | 2-3 min |
| Copie fichiers | 1 min |
| install.sh | 20-30 min |
| Redémarrage | 2 min |
| Config SSH (optionnel) | 1 min |
| setup-new-club.sh | 5-10 min |
| **TOTAL** | **35-50 min** |

---

## Pour les clubs suivants

Une fois que vous avez un Pi installé, vous pouvez :

1. **Créer une Image Golden** pour accélérer les prochaines installations → [GOLDEN_IMAGE.md](GOLDEN_IMAGE.md)
2. **Juste changer la config** avec setup-new-club.sh
3. **Réinstaller** avec un nouveau nom de club

La partie longue (install.sh) n'est à faire qu'une fois par Pi physique.

---

## Scripts disponibles

| Script | Emplacement | Description |
|--------|-------------|-------------|
| `copy-to-pi.sh` | `raspberry/scripts/` | Copie intelligente vers Pi |
| `install.sh` | `raspberry/` | Installation système sur Pi |
| `setup-new-club.sh` | `raspberry/scripts/` | Configuration club complète |
| `build-and-deploy.sh` | `raspberry/scripts/` | Mise à jour application |
| `prepare-golden-image.sh` | `raspberry/tools/` | Prépare Pi pour clonage |
| `clone-sd-card.sh` | `raspberry/tools/` | Clone carte SD en image |
| `cleanup-pi.sh` | `raspberry/scripts/` | Nettoie ~/raspberry après install |

---

**Prochaines étapes :**
- [GOLDEN_IMAGE.md](GOLDEN_IMAGE.md) - Créer une Image Golden
- [README.md](../README.md) - Utilisation quotidienne
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Dépannage
