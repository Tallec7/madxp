# Configuration Systemd pour Raspberry Pi

## 📺 Mode Kiosque TV (neopro-kiosk.service)

Ce service lance automatiquement Chromium en mode kiosque sur `/tv` au démarrage du Raspberry Pi.

### Caractéristiques

- ✅ **Lancement automatique** au boot
- ✅ **Plein écran** sans bordures ni barres d'outils
- ✅ **Autoplay avec son** (flag `--autoplay-policy=no-user-gesture-required`)
- ✅ **Curseur souris masqué** - triple protection : `unclutter-xfixes` (OS) + CSS `cursor: none` sur `app-tv` (navigateur, scopé `/tv`) + `xdotool` fallback (watchdog)
- ✅ **Pas d'interaction requise** - parfait pour écran HDMI seul
- ✅ **Redémarrage automatique** en cas de crash
- ✅ **Mode incognito** - pas de cache ni cookies persistants

### Installation

```bash
# 1. Copier le fichier service
sudo cp neopro-kiosk.service /etc/systemd/system/

# 2. Recharger systemd
sudo systemctl daemon-reload

# 3. Activer le service au démarrage
sudo systemctl enable neopro-kiosk.service

# 4. Démarrer le service
sudo systemctl start neopro-kiosk.service
```

### Vérification

```bash
# Vérifier le statut
sudo systemctl status neopro-kiosk.service

# Voir les logs
journalctl -u neopro-kiosk.service -f

# Redémarrer le service
sudo systemctl restart neopro-kiosk.service

# Arrêter le service
sudo systemctl stop neopro-kiosk.service
```

### Configuration

Le service se lance **10 secondes** après le boot pour laisser le temps:

- Au serveur web local de démarrer
- À l'interface graphique (X11) de s'initialiser
- Au réseau de se connecter

**URL cible:** `http://localhost/tv` (utilise `localhost` et non `neopro.local` pour éviter les collisions mDNS quand plusieurs Pi sont sur le même LAN)

### Flags Chromium Importants

| Flag                                         | Rôle                                 |
| -------------------------------------------- | ------------------------------------ |
| `--kiosk`                                    | Mode plein écran sans chrome browser |
| `--autoplay-policy=no-user-gesture-required` | **Autorise l'autoplay avec son** 🔊  |
| `--noerrdialogs`                             | Masque les popups d'erreur           |
| `--disable-infobars`                         | Masque les bannières d'info          |
| `--incognito`                                | Pas de cache persistant              |

### Dépendances

**Prérequis:**

- Service `neopro-app.service` doit être actif (serveur web local)
- X11 doit être configuré (`DISPLAY=:0`)
- User `pi` doit avoir accès au display
- `unclutter-xfixes` installé (masquage du curseur souris au niveau X11)

### Détection automatique du chemin Chromium

Le chemin de Chromium varie selon la version de Raspberry Pi OS :

- **Bookworm et récent** : `/usr/bin/chromium`
- **Bullseye et ancien** : `/usr/bin/chromium-browser`

Le script `install.sh` détecte automatiquement le bon chemin lors de l'installation et met à jour le fichier de service en conséquence.

**Vérifier le chemin configuré :**

```bash
grep ExecStart /etc/systemd/system/neopro-kiosk.service
```

**Corriger manuellement si nécessaire :**

```bash
# Si erreur "chromium-browser not found" et que seul chromium existe
sudo sed -i 's|/usr/bin/chromium-browser|/usr/bin/chromium|' /etc/systemd/system/neopro-kiosk.service
sudo systemctl daemon-reload
sudo systemctl restart neopro-kiosk
```

### Troubleshooting

#### Écran noir au démarrage

```bash
# Vérifier que X11 est lancé
echo $DISPLAY
# Doit afficher: :0

# Vérifier les permissions
xhost +local:
```

#### Chromium introuvable (No such file or directory)

```bash
# Voir quel binaire est disponible
which chromium chromium-browser

# Vérifier les logs
journalctl -u neopro-kiosk -n 20

# Corriger le chemin (voir section "Détection automatique" ci-dessus)
```

#### Curseur souris visible sur la TV

```bash
# Vérifier que unclutter-xfixes est installé
dpkg -l | grep unclutter-xfixes

# Si manquant, installer
sudo apt-get install -y unclutter-xfixes

# Vérifier que le processus tourne
pgrep -a unclutter
# Attendu : unclutter -idle 0 -root

# Forcer le masquage immédiat
DISPLAY=:0 xdotool mousemove 0 0
```

#### Pas de son

**Vérifiez le flag autoplay:**

```bash
sudo systemctl cat neopro-kiosk.service | grep autoplay-policy
# Doit afficher: --autoplay-policy=no-user-gesture-required
```

**Vérifier le volume système:**

```bash
amixer get PCM
# Augmenter si nécessaire:
amixer set PCM 100%
```

#### Service qui redémarre en boucle

```bash
# Voir les erreurs
journalctl -u neopro-kiosk.service -n 50

# Causes courantes:
# - Serveur web pas encore démarré → Augmenter ExecStartPre sleep
# - URL incorrecte → Vérifier http://localhost/tv
# - Permissions X11 → Vérifier XAUTHORITY
```

### Désactivation Temporaire

Si vous voulez accéder au bureau Raspberry Pi:

```bash
# Arrêter le kiosk
sudo systemctl stop neopro-kiosk.service

# Désactiver au démarrage
sudo systemctl disable neopro-kiosk.service

# Pour réactiver
sudo systemctl enable neopro-kiosk.service
sudo systemctl start neopro-kiosk.service
```

### Mode Debug

Pour voir Chromium en mode fenêtré (pas kiosk):

```bash
# Lancer manuellement sans kiosk
DISPLAY=:0 chromium \
  --autoplay-policy=no-user-gesture-required \
  http://localhost/tv
```

### Alternatives

#### Utiliser lightdm pour auto-login

```bash
# /etc/lightdm/lightdm.conf
[Seat:*]
autologin-user=pi
autologin-user-timeout=0
```

#### Utiliser .xinitrc pour lancement X

```bash
# /home/pi/.xinitrc
#!/bin/bash
chromium \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  http://localhost/tv
```

---

## 🔧 Configuration Matérielle Recommandée

### Raspberry Pi

- **Modèle:** Raspberry Pi 4 (4GB RAM minimum)
- **Carte SD:** 32GB+ (classe 10)
- **Alimentation:** Officielle 5V 3A USB-C
- **Sortie:** HDMI vers écran TV

### Réseau

- **Connexion:** Ethernet recommandé (WiFi possible)
- **Hostname:** `neopro.local` (mDNS)

### Audio

- **Sortie:** HDMI (son inclus)
- **Alternative:** Jack 3.5mm si nécessaire

---

## 📋 Checklist Installation Complète

- [ ] Raspberry Pi OS installé et à jour
- [ ] Serveur web `neopro-app.service` installé et actif
- [ ] Hostname configuré: `neopro.local`
- [ ] Service kiosk copié: `/etc/systemd/system/neopro-kiosk.service`
- [ ] Service activé: `systemctl enable neopro-kiosk.service`
- [ ] Service démarré: `systemctl start neopro-kiosk.service`
- [ ] Test: Page `/tv` s'affiche en plein écran
- [ ] Test: Vidéos jouent **avec son** automatiquement
- [ ] Test: Curseur souris **invisible** sur l'écran TV
- [ ] Test: Redémarrage du Pi → Kiosk se lance automatiquement

---

**Dernière mise à jour:** 16 février 2026
**Version:** 1.2 - Triple protection masquage curseur souris (unclutter-xfixes + CSS + xdotool)
**Auteur:** Claude Code
