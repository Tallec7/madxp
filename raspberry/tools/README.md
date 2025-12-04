# Neopro Tools - Outils de maintenance

Suite d'outils pour le déploiement, la maintenance et le diagnostic des systèmes Neopro.

---

## 📦 Outils disponibles

### `prepare-image.sh`
Prépare un système Neopro pour création d'image réutilisable.

```bash
sudo ./prepare-image.sh
```

**Utilise pour :** Créer une image master à distribuer aux clubs

**Actions :**
- Nettoie le système (logs, cache, historique)
- Généralise la configuration
- Crée un assistant de première configuration
- Régénère les clés SSH au prochain boot

⚠️ **IMPORTANT :** Après exécution, éteindre le système (ne PAS redémarrer)

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

### Créer une image master

```bash
# 1. Installer et configurer
sudo ../install.sh MASTER MasterPass123

# 2. Tester complètement
../tools/healthcheck.sh

# 3. Préparer l'image
sudo ./prepare-image.sh

# 4. Éteindre (NE PAS redémarrer)
sudo shutdown -h now

# 5. Créer l'image (depuis une autre machine)
sudo ./clone-sd-card.sh neopro-master-v1.0
```

### Installer chez un club

```bash
# 1. Flash l'image sur carte SD
# 2. Premier boot → Assistant auto
# 3. Vérification
./healthcheck.sh
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
