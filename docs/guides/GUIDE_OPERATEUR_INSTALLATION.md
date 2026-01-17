# Guide Opérateur - Installation Neopro Pas à Pas

**Pour qui ?** : Techniciens et opérateurs qui installent les boîtiers Neopro dans les clubs.

**Durée totale** : ~25 minutes

**Niveau technique requis** : Débutant (savoir utiliser un terminal)

---

## Checklist Matériel

Avant de partir sur site, vérifiez que vous avez :

- [ ] **Raspberry Pi 4 ou Pi 5** (avec alimentation 5V/3A officielle)
- [ ] **Carte microSD** 32GB minimum (64GB recommandé)
- [ ] **Câble HDMI** pour la connexion TV
- [ ] **Câble Ethernet** (pour l'installation initiale)
- [ ] **Lecteur de carte SD** pour votre ordinateur
- [ ] **Ordinateur** avec connexion Internet (Mac, Windows ou Linux)
- [ ] **Accès WiFi du club** (SSID et mot de passe) - optionnel mais recommandé

---

## Phase 1 : Préparation de la Carte SD (5 min)

### Étape 1.1 - Télécharger Raspberry Pi Imager

Si vous ne l'avez pas déjà :

- **Mac/Windows/Linux** : https://www.raspberrypi.com/software/

### Étape 1.2 - Flasher la carte SD

1. **Insérez** la carte SD dans votre ordinateur
2. **Lancez** Raspberry Pi Imager
3. **Choisissez l'OS** :
   - Cliquez sur "CHOISIR L'OS"
   - Sélectionnez **"Raspberry Pi OS (other)"**
   - Sélectionnez **"Raspberry Pi OS Lite (64-bit)"** ← Important : version LITE
4. **Choisissez le stockage** :
   - Cliquez sur "CHOISIR LE STOCKAGE"
   - Sélectionnez votre carte SD
5. **Configurez les options** (icône engrenage ⚙️) :
   - ✅ **Activer SSH** (utiliser l'authentification par mot de passe)
   - ✅ **Définir un nom d'utilisateur** : `pi`
   - ✅ **Définir un mot de passe** : `raspberry` (ou autre de votre choix)
   - ✅ **Configurer le WiFi** : Entrez le WiFi de votre téléphone en partage de connexion OU le WiFi du club
   - ✅ **Définir les paramètres régionaux** : Europe/Paris, clavier FR
6. **Cliquez** sur "ÉCRIRE" et attendez (~3-5 min)

**Ce qui se passe** : L'outil écrit le système d'exploitation Raspberry Pi OS sur la carte SD. C'est comme installer Windows sur un PC, mais en version miniature.

### Étape 1.3 - Éjecter et insérer

1. **Éjectez** proprement la carte SD de votre ordinateur
2. **Insérez** la carte SD dans le Raspberry Pi (slot sous la carte)

---

## Phase 2 : Premier Démarrage du Pi (2 min)

### Étape 2.1 - Branchements

1. **Branchez le câble Ethernet** entre le Pi et votre box/routeur (ou utilisez le WiFi configuré)
2. **Branchez l'alimentation** du Pi
3. **Attendez 60-90 secondes** que le Pi démarre complètement

**Ce qui se passe** : Le Pi s'allume, charge le système d'exploitation depuis la carte SD, et se connecte au réseau. Les LEDs clignotent pendant le démarrage.

### Étape 2.2 - Connexion SSH

Ouvrez un terminal sur votre ordinateur :

**Mac** : Applications → Utilitaires → Terminal
**Windows** : PowerShell ou PuTTY

```bash
ssh pi@raspberrypi.local
```

**Mot de passe** : celui que vous avez défini (défaut : `raspberry`)

**Vous devez voir** :

```
pi@raspberrypi:~ $
```

**Si ça ne marche pas** :

- Attendez encore 30 secondes et réessayez
- Essayez avec l'IP : `ssh pi@192.168.1.xxx` (regardez sur votre box)
- Vérifiez que le Pi est bien connecté en Ethernet

---

## Phase 3 : Installation Neopro (15-20 min)

### Étape 3.1 - Lancer l'installation

C'est LA commande magique. Copiez-collez exactement :

```bash
curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s NOM_CLUB MOT_DE_PASSE_WIFI
```

**Remplacez** :

- `NOM_CLUB` par le nom du club (ex: NANTES, RENNES, CESSON)
- `MOT_DE_PASSE_WIFI` par le mot de passe du hotspot WiFi (min 8 caractères)

**Exemple concret** :

```bash
curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s NANTES MonWiFi2024!
```

**Option avancée** - Ajouter le WiFi Internet du club (si vous avez une clé USB WiFi) :

```bash
curl -sSL https://tallec7.github.io/neopro/install/setup.sh | sudo bash -s NANTES MonWiFi2024! Livebox-F730 MotDePasseBox
```

### Ce qui se passe pendant l'installation

L'installation prend **15-20 minutes**. Voici ce que vous verrez et ce qui se passe :

---

#### 📥 Phase 3.1 - Téléchargement du script (10 sec)

**Vous voyez** :

```
Downloading installation files from GitHub...
```

**Ce qui se passe** : Le script principal est téléchargé depuis GitHub. C'est le "chef d'orchestre" qui va coordonner toute l'installation.

---

#### 🔄 Phase 3.2 - Mise à jour système (3-5 min)

**Vous voyez** :

```
Updating system packages...
Reading package lists...
Building dependency tree...
```

**Ce qui se passe** : Le Pi télécharge et installe les dernières mises à jour de sécurité. C'est comme faire "Windows Update" sur un PC. Beaucoup de texte défile, c'est normal.

---

#### 📦 Phase 3.3 - Installation des dépendances (5-8 min)

**Vous voyez** :

```
Installing required packages...
nginx hostapd dnsmasq nodejs npm chromium-browser...
```

**Ce qui se passe** :
| Paquet | Rôle |
|--------|------|
| `nginx` | Serveur web qui sert l'application sur la TV |
| `hostapd` | Crée le réseau WiFi "NEOPRO-XXX" |
| `dnsmasq` | Gère les adresses IP du hotspot |
| `nodejs` | Moteur JavaScript pour le serveur |
| `chromium-browser` | Navigateur qui affiche l'app en mode kiosque |

---

#### 🎮 Phase 3.4 - Configuration GPU (30 sec)

**Vous voyez** :

```
Configuring GPU memory...
Detected: Raspberry Pi 4 → Setting gpu_mem=256
```

ou

```
Detected: Raspberry Pi 5 → Configuring SwiftShader
```

**Ce qui se passe** :

- **Pi 4** : Le script alloue 256MB de mémoire au GPU pour éviter les crashs vidéo
- **Pi 5** : Le script configure le rendu logiciel (SwiftShader) car le GPU Pi 5 a des incompatibilités avec Chromium

---

#### 📡 Phase 3.5 - Configuration WiFi Hotspot (1-2 min)

**Vous voyez** :

```
Configuring WiFi hotspot...
SSID: NEOPRO-NANTES
Password: MonWiFi2024!
```

**Ce qui se passe** : Le Pi devient un point d'accès WiFi autonome. Les smartphones pourront s'y connecter pour accéder à la télécommande, même sans Internet.

---

#### 🔧 Phase 3.6 - Configuration des services (1 min)

**Vous voyez** :

```
Creating systemd services...
Enabling neopro-app...
Enabling neopro-kiosk...
Enabling neopro-sync-agent...
```

**Ce qui se passe** : Le script configure le Pi pour démarrer automatiquement l'application Neopro à chaque boot. Plus besoin d'intervention manuelle.

---

#### ✅ Phase 3.7 - Fin d'installation

**Vous voyez** :

```
========================================
 Installation completed successfully!
========================================
WiFi Hotspot: NEOPRO-NANTES
Password: MonWiFi2024!
Admin panel: http://neopro.local:8080
Remote: http://neopro.local/remote
========================================
Rebooting in 10 seconds...
```

**Ce qui se passe** : Le Pi va redémarrer automatiquement. Après le reboot, l'application Neopro sera active.

---

### Étape 3.2 - Vérifier l'installation

Après le reboot (~2 minutes), vérifiez que tout fonctionne :

1. **Sur votre téléphone** :
   - Cherchez le réseau WiFi `NEOPRO-NANTES` (ou le nom de votre club)
   - Connectez-vous avec le mot de passe défini

2. **Ouvrez un navigateur** et allez sur :
   - `http://neopro.local` → Doit afficher l'application TV
   - `http://neopro.local/remote` → Doit afficher la télécommande
   - `http://neopro.local:8080` → Panel d'administration

**Si ça ne marche pas** :

- Utilisez `http://192.168.4.1` au lieu de `neopro.local`

---

## Phase 4 : Configuration du Club (5 min)

L'installation de base est faite, mais il faut maintenant configurer le club avec ses informations spécifiques.

### Étape 4.1 - Télécharger le script de configuration

Sur **votre ordinateur** (pas sur le Pi), ouvrez un terminal.

**Commande 1** - Télécharger le script :

```bash
curl -O https://raw.githubusercontent.com/Tallec7/neopro/main/raspberry/scripts/setup-remote-club.sh
```

**Commande 2** - Rendre exécutable :

```bash
chmod +x setup-remote-club.sh
```

### Étape 4.2 - Lancer la configuration

**Commande 3** - Lancer le script :

```bash
./setup-remote-club.sh
```

Le script vous pose des questions. Répondez-y :

**Exemple de session** :

```
🏟️  Configuration d'un nouveau club Neopro
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Adresse du Pi [neopro.local]: ↵ (appuyez Entrée)
🔑 Mot de passe SSH [raspberry]: ↵
🏢 Nom court du site (ex: NANTES): NANTES
🏟️ Nom complet du club: FC Nantes Futsal
📍 Ville: Nantes
🗺️ Région: Pays de la Loire
⚽ Sport principal (foot/basket/hand/volley): futsal
🔐 Mot de passe télécommande (min 8 car.): Nantes2024!
🌐 Connecter au serveur central? [o/n]: o
🔑 API Key du site (depuis le dashboard): abc123-def456-...
```

### Ce qui se passe pendant la configuration

| Étape             | Ce qui se passe                                             |
| ----------------- | ----------------------------------------------------------- |
| Téléchargement    | Récupère la dernière version depuis GitHub Releases         |
| Génération config | Crée le fichier `configuration.json` avec les infos du club |
| Déploiement       | Copie les fichiers sur le Pi via SSH                        |
| Redémarrage       | Redémarre les services pour appliquer la config             |

**Vous voyez à la fin** :

```
✅ Configuration terminée !

📺 TV: http://neopro.local
📱 Télécommande: http://neopro.local/remote
⚙️ Admin: http://neopro.local:8080

Le boîtier est prêt à être installé !
```

---

## Phase 5 : Installation Physique dans le Club

### Étape 5.1 - Branchements définitifs

1. **Débranchez** le câble Ethernet (plus besoin)
2. **Connectez le HDMI** à la TV du club
3. **Placez le boîtier** dans un endroit ventilé, à l'abri de la chaleur

### Étape 5.2 - Configuration TV

1. **Allumez la TV** et sélectionnez la source HDMI correspondante
2. **Vérifiez** que l'application Neopro s'affiche
3. **Réglez la TV** en mode "Jeu" ou désactivez les traitements d'image pour réduire la latence

### Étape 5.3 - Test final

Avec votre téléphone connecté au WiFi `NEOPRO-XXX` :

1. Allez sur `http://neopro.local/remote`
2. Entrez le mot de passe de la télécommande
3. Testez la lecture d'une vidéo
4. Vérifiez le volume

---

## Résumé des Durées

| Phase                    | Durée       | Description          |
| ------------------------ | ----------- | -------------------- |
| 1. Préparation SD        | 5 min       | Flash de la carte SD |
| 2. Premier boot          | 2 min       | Connexion SSH        |
| 3. Installation          | 15-20 min   | Script automatique   |
| 4. Configuration         | 5 min       | Infos du club        |
| 5. Installation physique | 5 min       | Branchements TV      |
| **TOTAL**                | **~30 min** |                      |

---

## Dépannage Rapide

### Le Pi ne démarre pas (pas de LEDs)

- Vérifiez l'alimentation (5V/3A minimum)
- Réessayez de flasher la carte SD

### SSH "Connection refused"

- Attendez 2 minutes après le branchement
- Vérifiez que SSH était bien activé lors du flash
- Essayez `ping raspberrypi.local`

### Le WiFi NEOPRO-XXX n'apparaît pas

- Attendez 3 minutes après le reboot
- Vérifiez avec `ssh pi@neopro.local 'sudo systemctl status hostapd'`

### Chromium crash "Aw, Snap!"

- **Pi 4** : Vérifiez `vcgencmd get_mem gpu` → doit être 256M
- **Pi 5** : Vérifiez `pgrep -a chromium | grep swiftshader`
- Voir [TROUBLESHOOTING.md](TROUBLESHOOTING.md#5-chromium-crash)

### neopro.local ne répond pas

- Utilisez l'IP directe : `http://192.168.4.1`
- Sur Android, ignorez le message "Pas d'accès Internet"

---

## QR Code Télécommande

Pour générer un QR code permettant aux utilisateurs d'accéder facilement à la télécommande :

1. Allez dans le **Dashboard Central**
2. Sélectionnez le site
3. Onglet **Paramètres** → Section **QR Code**
4. Cliquez sur **Générer QR Code**
5. Imprimez et affichez près de la TV

Le QR code contient l'URL de la télécommande et les instructions de connexion WiFi.

---

## Contacts Support

- **Documentation complète** : [docs/guides/](../guides/)
- **Problèmes techniques** : [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **GitHub Issues** : https://github.com/Tallec7/neopro/issues

---

**Version** : 1.0.0
**Date** : Janvier 2026
**Public cible** : Opérateurs terrain
