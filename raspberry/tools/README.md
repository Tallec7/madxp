# Neopro Tools - Outils de maintenance

Suite d'outils pour le déploiement, la maintenance et le diagnostic des systèmes Neopro.

---

## 📦 Outils disponibles

### `prepare-golden-image.sh` (RECOMMANDÉ)
Prépare un Raspberry Pi installé pour être cloné en "Image Golden".

```bash
sudo ./prepare-golden-image.sh
```

**Utilise pour :** Créer une image master réutilisable pour tous les clubs

**Actions :**
- Supprime la configuration club (config, vidéos, logs)
- Réinitialise le WiFi (SSID: NEOPRO-NOUVEAU, Pass: NeoProWiFi2025)
- Nettoie le sync-agent
- Supprime les clés SSH (régénérées au boot)
- Crée `~/first-boot-setup.sh` pour le premier démarrage

⚠️ **IMPORTANT :** Après exécution, éteindre le Pi (ne PAS redémarrer)

---

### `prepare-image.sh` (ancien)
Ancienne version du script de préparation. Préférer `prepare-golden-image.sh`.

```bash
sudo ./prepare-image.sh
```

---

### `clone-sd-card.sh`
Crée une image compressée d'une carte SD.

```bash
sudo ./clone-sd-card.sh [nom-image]
```

**Utilise pour :** Cloner une carte SD configurée pour distribution

**Génère :**
- Image compressée (.img.gz)
- Checksum SHA256
- README d'installation

**Exemple :**
```bash
sudo ./clone-sd-card.sh neopro-v1.0
```

---

### `recovery.sh`
Diagnostic et réparation automatique du système.

```bash
# Mode interactif
sudo ./recovery.sh

# Mode automatique
sudo ./recovery.sh --auto
```

**Utilise pour :** Réparer un système qui ne fonctionne pas correctement

**Fonctionnalités :**
- Diagnostic complet
- Réparation automatique
- Nettoyage logs
- Redémarrage services
- Backup automatique
- Génération rapport

**Menu :**
1. Diagnostic complet
2. Réparer les problèmes
3. Nettoyer les logs
4. Redémarrer services
5. Créer backup
6. Générer rapport
7. Tout réparer (recommandé)

---

### `healthcheck.sh`
Vérification rapide de l'état du système.

```bash
./healthcheck.sh
```

**Utilise pour :** Vérifier rapidement si le système fonctionne

**Vérifie :**
- Système (CPU, RAM, Température, Disque)
- Services (neopro-app, admin, nginx, etc.)
- Réseau (Hotspot, mDNS)
- Application (webapp, serveur, admin, vidéos)
- Connectivité (HTTP, Socket.IO, Admin)

**Code de sortie :**
- `0` = Tout OK
- `1` = Avertissements
- `2` = Erreurs

**Intégration automation :**
```bash
./healthcheck.sh
if [ $? -eq 0 ]; then
  echo "Système OK"
else
  echo "Problème détecté"
  sudo ./recovery.sh --auto
fi
```

---

## 🔄 Workflows

### Process OPTIMAL : Image Golden (10 min par club)

```
┌─────────────────────────────────────────────────────────────────┐
│  CRÉATION IMAGE GOLDEN (une seule fois)                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Installer un Pi de référence avec install.sh                │
│  2. Tester avec healthcheck.sh                                  │
│  3. sudo ./prepare-golden-image.sh                              │
│  4. Éteindre : sudo shutdown -h now                             │
│  5. Cloner : sudo ./clone-sd-card.sh neopro-golden-v1.0         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  NOUVEAU CLUB (5-10 min)                                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Flash image golden sur carte SD         (5 min)             │
│  2. Premier boot : ~/first-boot-setup.sh    (1 min)             │
│  3. Se connecter au WiFi NEOPRO-NOUVEAU                         │
│  4. ./raspberry/scripts/setup-new-club.sh   (5 min)             │
│                                                                 │
│  TOTAL : ~10 min (vs 45 min sans image golden)                  │
└─────────────────────────────────────────────────────────────────┘
```

### Créer une image golden

```bash
# 1. Installer et configurer un Pi de référence
./raspberry/scripts/copy-to-pi.sh raspberrypi.local
ssh pi@raspberrypi.local
cd raspberry
sudo ./install.sh MASTER MasterPass123

# 2. Tester complètement
./healthcheck.sh

# 3. Préparer l'image golden
sudo ./tools/prepare-golden-image.sh

# 4. Éteindre (NE PAS redémarrer)
sudo shutdown -h now

# 5. Retirer la carte SD, la mettre dans un lecteur sur Mac
# 6. Créer l'image (depuis Mac)
sudo ./tools/clone-sd-card.sh neopro-golden-v1.0
```

### Installer chez un club (avec image golden)

```bash
# 1. Flash l'image golden sur nouvelle carte SD (Raspberry Pi Imager)
# 2. Premier boot : exécuter l'assistant
ssh pi@neopro.local  # Mot de passe par défaut du Pi
./first-boot-setup.sh
# → Entrer le nom du club et mot de passe WiFi

# 3. Se connecter au nouveau WiFi NEOPRO-[CLUB]
# 4. Configurer depuis Mac
./raspberry/scripts/setup-new-club.sh
```

### Alternative : Installation sans image golden (45 min)

```bash
# 1. Flash Raspberry Pi OS Lite
# 2. Copier les fichiers
./raspberry/scripts/copy-to-pi.sh raspberrypi.local

# 3. Installer
ssh pi@raspberrypi.local
cd raspberry
sudo ./install.sh MONCLUB MotDePasseWiFi

# 4. Configurer
./raspberry/scripts/setup-new-club.sh
```

### Maintenance régulière

```bash
# Vérification
./healthcheck.sh

# Si problème
sudo ./recovery.sh --auto
```

---

## 🛠️ Dépannage

### prepare-image.sh échoue

**Vérifier :**
- Exécuté avec sudo
- Système Raspberry Pi
- Tous les services installés

### clone-sd-card.sh ne trouve pas la carte SD

**Vérifier :**
- Carte SD insérée
- Périphérique monté
- Permissions (sudo)

**Lister les périphériques :**
```bash
# Linux
lsblk

# Mac
diskutil list
```

### recovery.sh ne corrige pas le problème

**Actions :**
- Consulter le rapport généré
- Vérifier les logs :
  ```bash
  sudo journalctl -u neopro-app -n 100
  ```
- Réinstaller manuellement

### healthcheck.sh montre des erreurs

**Actions courantes :**
```bash
# Service arrêté
sudo systemctl start neopro-app

# Dépendances manquantes
cd /home/pi/neopro/server
npm install --production

# Permissions incorrectes
sudo chown -R pi:pi /home/pi/neopro
```

---

## 📋 Checklist utilisation

### Avant distribution image
- [ ] Installation complète testée
- [ ] Tous les services fonctionnels
- [ ] healthcheck.sh OK
- [ ] prepare-image.sh exécuté
- [ ] Système éteint (non redémarré)
- [ ] Image clonée avec clone-sd-card.sh
- [ ] Checksum calculé
- [ ] README inclus

### Installation nouveau club
- [ ] Image flashée sur carte SD
- [ ] Premier boot assistant complété
- [ ] Configuration WiFi testée
- [ ] Application copiée
- [ ] Vidéos copiées
- [ ] healthcheck.sh OK
- [ ] Test depuis mobile
- [ ] Interface Admin accessible

### Maintenance mensuelle
- [ ] healthcheck.sh exécuté
- [ ] Logs nettoyés
- [ ] Espace disque vérifié
- [ ] Backup créé
- [ ] Services redémarrés si nécessaire

---

## 🔧 Configuration avancée

### Personnaliser prepare-image.sh

Éditer les variables en haut du script :
```bash
INSTALL_DIR="/home/pi/neopro"
DEFAULT_SSID="NEOPRO-UNCONFIGURED"
```

### Ajouter des vérifications à healthcheck.sh

Ajouter dans le script :
```bash
# Nouvelle vérification
if [ condition ]; then
    print_ok "Ma vérification"
else
    print_error "Ma vérification échouée"
fi
```

### Personnaliser recovery.sh

Ajouter une fonction de réparation :
```bash
my_custom_repair() {
    print_step "Ma réparation personnalisée..."
    # Actions
    print_success "Réparation terminée"
}
```

---

## 📞 Support

**Problèmes avec les outils :**
- Email: support@neopro.fr
- GitHub Issues: [Créer un ticket]

**Documentation complète :**
- `../README.md` - Installation technique
- `../GUIDE-CLUB.md` - Guide utilisateur clubs
- `../GUIDE-DEMO.md` - Guide démonstration

---

**Version :** 1.0.0
**Date :** Décembre 2024
**Auteur :** Neopro / Kalon Partners
