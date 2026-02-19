# Fix: Hostname perdu après reboot

## 🐛 Problème

Après un reboot du Raspberry Pi, le hostname revient à `raspberrypi` au lieu de rester `neopro`.

```bash
# Avant reboot
pi@neopro:~ $ hostname
neopro

# Après reboot
pi@raspberrypi:~ $ hostname
raspberrypi
```

## 🔍 Cause

Le problème peut venir de plusieurs sources :

1. `cloud-init` qui réinitialise le hostname au démarrage
2. Configuration `/etc/hosts` mal formatée
3. Service `avahi-daemon` qui ne démarre pas correctement

## ✅ Solution

### Option 1 : Script automatique (rapide)

Nous avons créé un script qui fixe tout automatiquement :

```bash
# 1. Copier le script sur le Pi
scp raspberry/scripts/fix-hostname.sh pi@neopro.local:~/

# 2. Se connecter au Pi
ssh pi@neopro.local

# 3. Exécuter le script
chmod +x fix-hostname.sh
./fix-hostname.sh

# 4. Rebooter pour vérifier
sudo reboot
```

### Option 2 : Configuration manuelle

Si vous préférez faire les modifications manuellement :

```bash
# Se connecter au Pi
ssh pi@neopro.local

# 1. Fixer /etc/hostname
echo "neopro" | sudo tee /etc/hostname

# 2. Fixer /etc/hosts
sudo sed -i 's/127.0.1.1.*/127.0.1.1\tneopro.local neopro/' /etc/hosts

# 3. Appliquer le hostname
sudo hostnamectl set-hostname neopro

# 4. Empêcher cloud-init de réinitialiser (si présent)
if [ -f /etc/cloud/cloud.cfg ]; then
    sudo sed -i 's/preserve_hostname: false/preserve_hostname: true/' /etc/cloud/cloud.cfg
    echo "preserve_hostname: true" | sudo tee /etc/cloud/cloud.cfg.d/99_hostname.cfg
fi

# 5. Redémarrer avahi-daemon
sudo systemctl restart avahi-daemon

# 6. Vérifier
hostnamectl --static
# Devrait afficher: neopro

# 7. Rebooter pour tester
sudo reboot
```

## 🔎 Vérification

Après le reboot :

```bash
# Se reconnecter
ssh pi@neopro.local

# Vérifier le hostname
hostname
# Devrait afficher: neopro

hostnamectl --static
# Devrait afficher: neopro

# Vérifier mDNS
avahi-browse -a -t -r | grep neopro
# Devrait lister les services neopro.local
```

## 📝 Pour les nouvelles installations

Cette correction a été intégrée dans le script `install.sh` pour les futures installations.

Les prochaines installations auront automatiquement :

- Hostname persistant configuré via `hostnamectl`
- `/etc/hostname` et `/etc/hosts` correctement configurés
- Protection contre cloud-init (si présent)
- Service avahi-daemon configuré

**Fichier modifié :** `raspberry/install.sh` (configure_mdns)

## 🏷️ Hostname dynamique (v3.51+)

Depuis la v3.51, le hostname est **dérivé automatiquement du club_name** :

- Pattern : `neopro-<club-slugifié>` (ex: club "USAP" → `neopro-usap.local`)
- Stocké dans `HOSTNAME_SLUG` dans `/etc/neopro/site.conf`
- `fix-hostname.sh` et `install.sh` lisent cette variable (fallback: `neopro`)
- La commande OTA `update_hostname` est envoyée automatiquement quand le club_name change dans le dashboard

Pour changer manuellement le hostname d'un Pi existant :

```bash
# Depuis le dashboard : modifier le club_name du site
# → Le hostname sera re-dérivé et la commande envoyée automatiquement au Pi

# Ou manuellement via site.conf :
sudo sed -i 's/^HOSTNAME_SLUG=.*/HOSTNAME_SLUG=neopro-mon-club/' /etc/neopro/site.conf
sudo bash ~/neopro/scripts/fix-hostname.sh
```

## 🎯 Commandes de diagnostic

Si le problème persiste, utilisez ces commandes pour diagnostiquer :

```bash
# Voir la configuration actuelle
echo "=== /etc/hostname ==="
cat /etc/hostname

echo "=== /etc/hosts ==="
cat /etc/hosts

echo "=== hostnamectl ==="
hostnamectl

echo "=== avahi-daemon status ==="
systemctl status avahi-daemon

echo "=== cloud-init config (if exists) ==="
if [ -f /etc/cloud/cloud.cfg ]; then
    grep preserve_hostname /etc/cloud/cloud.cfg
fi
```

## ⚠️ Notes importantes

1. **Le reboot est nécessaire** pour que le changement de hostname soit complètement appliqué
2. **Certains services** peuvent mettre du cache le hostname (notamment SSH)
3. **Si vous utilisez des clés SSH** configurées avec `raspberrypi.local`, il faudra les mettre à jour vers le hostname du Pi (ex: `neopro-usap.local`)

---

**Date de création :** 6 décembre 2025
**Testé sur :** Raspberry Pi OS (Trixie)
