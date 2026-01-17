# Guide Image Golden Neopro

## Qu'est-ce qu'une Image Golden ?

Une **Image Golden** est une copie complète d'une carte SD Raspberry Pi pré-configurée avec tout le système Neopro installé. Elle permet de déployer de nouveaux boîtiers en **10 minutes** au lieu de 45 minutes.

```
Sans Image Golden              Avec Image Golden
──────────────────             ─────────────────
1. Flash Raspberry Pi OS       1. Flash Image Golden
2. Copier fichiers             2. Premier boot setup
3. install.sh (30 min)         3. setup-new-club.sh
4. setup-new-club.sh

TOTAL: ~45 min                 TOTAL: ~10 min
```

---

## Création de l'Image Golden (une seule fois)

### Prérequis

- Un Raspberry Pi 3B+, 4, ou **5** (tous supportés depuis v2.27)
- Une carte SD 32GB minimum
- Un lecteur de carte SD pour Mac
- Connexion Internet (pour l'installation initiale)

> **Note Pi 5** : Les images Golden créées sur Pi 4 fonctionnent sur Pi 5, mais le script `install.sh` doit être relancé pour configurer SwiftShader. Pour une compatibilité maximale, créez des images séparées pour Pi 4 et Pi 5.

### 🚀 Méthode AUTOMATISÉE (Recommandée)

Cette méthode utilise un script qui automatise tout le processus depuis votre Mac.

#### Étape 1 : Préparer le Pi de référence

```bash
# 1. Flasher Raspberry Pi OS Lite avec Raspberry Pi Imager
#    - Activer SSH
#    - Configurer WiFi temporaire
#    - User: pi

# 2. Copier les fichiers d'installation (depuis Mac)
./raspberry/scripts/copy-to-pi.sh raspberrypi.local

# 3. Se connecter et installer
ssh pi@raspberrypi.local
cd raspberry
sudo ./install.sh MASTER MasterPass123
# Optionnel : sudo ./install.sh MASTER MasterPass123 Livebox-F730 MonPassInternet456
# Durée: 20-30 minutes

# 4. Vérifier l'installation
./tools/healthcheck.sh
```

#### Étape 2 : Lancer le script automatisé

```bash
# Depuis votre Mac (à la racine du projet)
./raspberry/tools/create-golden-from-mac.sh raspberrypi.local neopro-golden-v1.0
```

**Le script va automatiquement :**

1. ✅ Se connecter au Pi via SSH
2. ✅ Exécuter `prepare-golden-image.sh` sur le Pi
3. ✅ Éteindre le Pi
4. ⏸️ Attendre que vous retiriez la carte SD et l'insériez dans le Mac
5. ✅ Lancer `clone-sd-card.sh` pour créer l'image

**Résultat :**

```
~/neopro-images/
├── neopro-golden-v1.0.img.gz     # Image compressée (~2-4 GB)
├── neopro-golden-v1.0.sha256     # Checksum
└── neopro-golden-v1.0-README.txt # Instructions
```

---

### 🔧 Méthode MANUELLE (Alternative)

Si vous préférez contrôler chaque étape, vous pouvez suivre le processus manuel.

#### Étape 1 : Préparer le Pi de référence

```bash
# 1. Flasher Raspberry Pi OS Lite avec Raspberry Pi Imager
#    - Activer SSH
#    - Configurer WiFi temporaire
#    - User: pi

# 2. Copier les fichiers d'installation (depuis Mac)
./raspberry/scripts/copy-to-pi.sh raspberrypi.local

# 3. Se connecter et installer
ssh pi@raspberrypi.local
cd raspberry
sudo ./install.sh MASTER MasterPass123
# Optionnel : sudo ./install.sh MASTER MasterPass123 Livebox-F730 MonPassInternet456
# Durée: 20-30 minutes
```

### Étape 2 : Vérifier l'installation

```bash
# Sur le Pi, après redémarrage
./tools/healthcheck.sh

# Vérifier les services
sudo systemctl status neopro-app
sudo systemctl status neopro-admin
sudo systemctl status nginx
sudo systemctl status hostapd
```

### Étape 3 : Préparer l'image golden

```bash
# Sur le Pi
sudo ./tools/prepare-golden-image.sh
```

Ce script :

- Supprime la configuration club (config, vidéos, logs)
- Réinitialise le WiFi (SSID: `NEOPRO-NOUVEAU`, Pass: `NeoProWiFi2025`)
- Nettoie le sync-agent
- Supprime les clés SSH (régénérées au boot)
- Crée le script `~/first-boot-setup.sh`

### Étape 4 : Éteindre le Pi (IMPORTANT)

```bash
sudo shutdown -h now
```

**Ne PAS redémarrer !** Retirer la carte SD une fois le Pi éteint.

### Étape 5 : Cloner la carte SD (sur Mac)

```bash
# Insérer la carte SD dans le lecteur Mac
# Trouver le périphérique
diskutil list

# Cloner
sudo ./raspberry/tools/clone-sd-card.sh neopro-golden-v1.0
```

**Résultat :**

```
~/neopro-images/
├── neopro-golden-v1.0.img.gz     # Image compressée (~2-4 GB)
├── neopro-golden-v1.0.sha256     # Checksum
└── neopro-golden-v1.0-README.txt # Instructions
```

---

## Utilisation de l'Image Golden

### Pour chaque nouveau club (10 minutes)

#### Étape 1 : Flasher l'image (5 min)

1. Ouvrir **Raspberry Pi Imager** sur Mac
2. **Choose OS** → **Use custom** → Sélectionner `neopro-golden-v1.0.img.gz`
3. **Choose Storage** → Sélectionner la nouvelle carte SD
4. _(Optionnel)_ **Settings** (roue dentée) :
   - SSH : Activer
   - Username: pi
   - Password: votre choix
5. **Write** → Attendre 5-10 min

#### Étape 2 : Premier démarrage (1 min)

```bash
# 1. Insérer la carte SD dans le nouveau Pi
# 2. Brancher l'alimentation
# 3. Attendre 1-2 min que le Pi démarre

# 4. Se connecter au WiFi NEOPRO-NOUVEAU
#    Mot de passe: NeoProWiFi2025

# 5. SSH vers le Pi
ssh pi@neopro.local

# 6. Exécuter l'assistant
./first-boot-setup.sh
```

L'assistant demande :

- **Nom du club** (ex: NANTES, CESSON, RENNES)
- **Mot de passe WiFi** (min 8 caractères)

Après validation :

- Le SSID WiFi devient `NEOPRO-NANTES`
- Le mot de passe WiFi est mis à jour

#### Étape 3 : Configurer le club (5 min)

```bash
# 1. Se reconnecter au nouveau WiFi NEOPRO-[CLUB]

# 2. Depuis Mac (à la racine du projet)
./raspberry/scripts/setup-new-club.sh
```

Le script :

- Collecte les informations du club
- Build l'application Angular
- Déploie sur le Pi
- Configure le sync-agent

---

## Schéma récapitulatif

```
┌─────────────────────────────────────────────────────────────────┐
│                    CRÉATION IMAGE GOLDEN                        │
│                      (une seule fois)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Mac                              Pi de référence               │
│  ───                              ───────────────               │
│                                                                 │
│  copy-to-pi.sh ──────────────────→ ~/raspberry/                 │
│                                         │                       │
│                                         ↓                       │
│                                   install.sh                    │
│                                   (20-30 min)                   │
│                                         │                       │
│                                         ↓                       │
│                                   healthcheck.sh                │
│                                         │                       │
│                                         ↓                       │
│                                   prepare-golden-image.sh       │
│                                         │                       │
│                                         ↓                       │
│                                   shutdown -h now               │
│                                         │                       │
│  ←────────────────────────────── Retirer carte SD               │
│         │                                                       │
│         ↓                                                       │
│  clone-sd-card.sh                                               │
│         │                                                       │
│         ↓                                                       │
│  neopro-golden-v1.0.img.gz                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ (réutilisable pour chaque club)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    NOUVEAU CLUB (~10 min)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Mac                              Nouveau Pi                    │
│  ───                              ──────────                    │
│                                                                 │
│  Raspberry Pi Imager                                            │
│  (flash image golden) ───────────→ Carte SD                     │
│                                         │                       │
│                                         ↓                       │
│                                   Premier boot                  │
│                                         │                       │
│  WiFi: NEOPRO-NOUVEAU ←──────────       │                       │
│         │                               │                       │
│         ↓                               ↓                       │
│  ssh pi@neopro.local ────────────→ first-boot-setup.sh          │
│                                   (nom club + mdp WiFi)         │
│                                         │                       │
│  WiFi: NEOPRO-[CLUB] ←───────────       │                       │
│         │                               │                       │
│         ↓                               ↓                       │
│  setup-new-club.sh ──────────────→ Configuration complète       │
│                                         │                       │
│                                         ↓                       │
│                                   BOÎTIER PRÊT !                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Mise à jour de l'Image Golden

Quand mettre à jour l'image golden :

- Nouvelle version majeure de l'application
- Nouveaux paquets système requis
- Corrections de bugs critiques dans `install.sh`

### Processus de mise à jour

```bash
# Option A : Recréer depuis zéro
# (recommandé pour les mises à jour majeures)

# Option B : Mettre à jour un Pi existant
ssh pi@neopro.local
cd raspberry
git pull  # ou copier les nouveaux fichiers
sudo ./install.sh MASTER MasterPass123  # réinstaller
# Optionnel : sudo ./install.sh MASTER MasterPass123 Livebox-F730 MonPassInternet456

# Puis préparer et cloner comme avant
sudo ./tools/prepare-golden-image.sh
sudo shutdown -h now
# Cloner sur Mac...
```

### Versioning recommandé

```
neopro-golden-v1.0.img.gz   # Version initiale
neopro-golden-v1.1.img.gz   # Corrections mineures
neopro-golden-v2.0.img.gz   # Nouvelle fonctionnalité majeure
```

---

## Dépannage

### L'image ne démarre pas

1. Vérifier que le flash s'est bien terminé
2. Essayer avec une autre carte SD
3. Vérifier le checksum :
   ```bash
   shasum -a 256 -c neopro-golden-v1.0.sha256
   ```

### Le WiFi NEOPRO-NOUVEAU n'apparaît pas

```bash
# Se connecter via Ethernet ou WiFi temporaire
ssh pi@raspberrypi.local

# Vérifier hostapd
sudo systemctl status hostapd
sudo journalctl -u hostapd -n 50

# Redémarrer
sudo systemctl restart hostapd
```

### first-boot-setup.sh n'existe pas

Le script `prepare-golden-image.sh` n'a pas été exécuté correctement sur le Pi de référence. Recréer l'image.

### neopro.local ne répond pas

```bash
# Utiliser l'IP directe
ping 192.168.4.1
ssh pi@192.168.4.1
```

---

## Checklist

### Création Image Golden

- [ ] Pi de référence installé avec `install.sh`
- [ ] `healthcheck.sh` OK
- [ ] `prepare-golden-image.sh` exécuté
- [ ] Pi éteint (pas redémarré)
- [ ] Carte SD clonée avec `clone-sd-card.sh`
- [ ] Checksum vérifié
- [ ] Image testée sur un autre Pi

### Nouveau Club

- [ ] Image flashée avec Raspberry Pi Imager
- [ ] Premier boot OK
- [ ] `first-boot-setup.sh` exécuté
- [ ] WiFi NEOPRO-[CLUB] accessible
- [ ] `setup-new-club.sh` exécuté
- [ ] Application accessible (http://neopro.local)
- [ ] Interface admin accessible (http://neopro.local:8080)

---

## Scripts associés

| Script                    | Emplacement          | Description                 |
| ------------------------- | -------------------- | --------------------------- |
| `copy-to-pi.sh`           | `raspberry/scripts/` | Copie fichiers vers Pi      |
| `prepare-golden-image.sh` | `raspberry/tools/`   | Prépare Pi pour clonage     |
| `clone-sd-card.sh`        | `raspberry/tools/`   | Clone carte SD en image     |
| `first-boot-setup.sh`     | `~/` (sur Pi)        | Assistant premier démarrage |
| `setup-new-club.sh`       | `raspberry/scripts/` | Configuration club complète |

---

## Support Raspberry Pi 5

Le Pi 5 nécessite une configuration GPU différente du Pi 4 :

| Modèle       | Configuration GPU                       |
| ------------ | --------------------------------------- |
| Pi 3B+, Pi 4 | `gpu_mem=256` dans `/boot/config.txt`   |
| **Pi 5**     | Flags SwiftShader dans le service kiosk |

**Recommandation** : Créez des images Golden séparées pour chaque génération de Pi :

```
neopro-golden-pi4-v2.27.img.gz    # Pour Pi 3B+, Pi 4
neopro-golden-pi5-v2.27.img.gz    # Pour Pi 5
```

Si vous utilisez une image Pi 4 sur un Pi 5, le watchdog kiosk détectera automatiquement le modèle et appliquera les flags SwiftShader au prochain redémarrage du service.

**Vérifier après le premier boot** :

```bash
# Vérifier le modèle
cat /proc/device-tree/model

# Pi 5 : vérifier que SwiftShader est actif
pgrep -a chromium | grep swiftshader
# Doit afficher le processus avec --use-angle=swiftshader
```

---

**Version :** 2.0.0
**Dernière mise à jour :** Janvier 2026
