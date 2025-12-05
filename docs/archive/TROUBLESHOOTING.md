# Guide de dépannage Neopro Raspberry Pi

## Problème : Erreur 500 sur /tv et /remote

### Symptômes
- `http://neopro.local:8080` fonctionne (interface admin)
- `http://neopro.local/tv` retourne une erreur 500
- `http://neopro.local/remote` retourne une erreur 500

### Cause
Problème de permissions : nginx (qui tourne sous l'utilisateur `www-data`) ne peut pas accéder aux fichiers dans `/home/pi/neopro/webapp/`.

### Diagnostic

```bash
# Vérifier les logs nginx
sudo tail -50 /home/pi/neopro/logs/nginx-error.log

# Rechercher cette erreur :
# stat() "/home/pi/neopro/webapp/index.html" failed (13: Permission denied)
```

### Solution

```bash
# 1. Donner les permissions de traversée au répertoire /home/pi
sudo chmod 755 /home/pi

# 2. Donner les permissions au répertoire neopro
sudo chmod 755 /home/pi/neopro

# 3. Changer le propriétaire des fichiers webapp pour www-data
sudo chown -R www-data:www-data /home/pi/neopro/webapp/

# 4. Configurer les bonnes permissions sur les fichiers
sudo find /home/pi/neopro/webapp -type f -exec chmod 644 {} \;
sudo find /home/pi/neopro/webapp -type d -exec chmod 755 {} \;

# 5. Redémarrer nginx
sudo systemctl restart nginx

# 6. Tester
curl -I http://localhost/tv
# Devrait retourner : HTTP/1.1 200 OK
```

### Explication technique

Pour qu'nginx puisse accéder à `/home/pi/neopro/webapp/index.html`, il doit pouvoir :
1. Traverser `/home` (permissions 755 par défaut)
2. Traverser `/home/pi` (besoin de 755, souvent 700 par défaut)
3. Traverser `/home/pi/neopro` (besoin de 755)
4. Lire les fichiers dans `/home/pi/neopro/webapp/` (besoin que les fichiers appartiennent à www-data)

### Prévention

Le script `deploy-remote.sh` a été mis à jour pour configurer automatiquement les permissions correctes lors du déploiement.

## Problème : Application Angular non déployée

### Symptômes
- Erreur 500 sur toutes les pages
- Le répertoire `/home/pi/neopro/webapp/` est vide ou contient seulement `.htaccess`

### Solution

```bash
# Depuis votre Mac
cd /Users/gletallec/.claude-worktrees/neopro/interesting-nobel
npm run build:raspberry
npm run deploy:raspberry neopro.local

# OU manuellement
ng build --configuration=production
scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/
ssh pi@neopro.local 'sudo systemctl restart nginx'
```

## Problème : Services qui ne démarrent pas

### Vérification des services

```bash
# Statut de tous les services
sudo systemctl status neopro-app
sudo systemctl status neopro-admin
sudo systemctl status nginx

# Logs des services
sudo journalctl -u neopro-app -n 50
sudo journalctl -u neopro-admin -n 50
sudo journalctl -u nginx -n 50
```

### Redémarrage des services

```bash
sudo systemctl restart neopro-app
sudo systemctl restart neopro-admin
sudo systemctl restart nginx
```

## Problème : WiFi Hotspot ne démarre pas

### Vérification

```bash
# Vérifier hostapd
sudo systemctl status hostapd

# Vérifier dnsmasq
sudo systemctl status dnsmasq

# Vérifier l'interface WiFi
iw dev

# Devrait afficher le mode AP :
# type AP
```

### Solution

```bash
# Redémarrer les services réseau
sudo systemctl restart dhcpcd
sudo systemctl restart dnsmasq
sudo systemctl restart hostapd

# Vérifier les logs
sudo journalctl -u hostapd -n 50
sudo journalctl -u dnsmasq -n 50
```

## Problème : mDNS (neopro.local) ne fonctionne pas

### Vérification

```bash
# Vérifier avahi-daemon
sudo systemctl status avahi-daemon

# Vérifier le hostname
hostnamectl

# Devrait afficher : Static hostname: neopro
```

### Solution

```bash
# Utiliser l'IP de secours
http://192.168.4.1

# OU reconfigurer mDNS
sudo systemctl restart avahi-daemon
```

## Script de diagnostic complet

Un script de diagnostic automatique est disponible :

```bash
# Copier le script sur le Pi
scp raspberry/scripts/diagnose-pi.sh pi@neopro.local:~/

# L'exécuter
ssh pi@neopro.local
chmod +x ~/diagnose-pi.sh
./diagnose-pi.sh
```

Le script vérifie :
- ✅ Services systemd
- ✅ Ports réseau
- ✅ Fichiers et répertoires
- ✅ Application Angular
- ✅ Configuration nginx
- ✅ Réseau WiFi
- ✅ Tests HTTP

## Checklist de vérification complète

### 1. Services actifs

```bash
sudo systemctl is-active neopro-app     # should return: active
sudo systemctl is-active neopro-admin   # should return: active
sudo systemctl is-active nginx          # should return: active
sudo systemctl is-active hostapd        # should return: active
sudo systemctl is-active dnsmasq        # should return: active
```

### 2. Fichiers présents

```bash
ls -la /home/pi/neopro/webapp/
# Devrait contenir : index.html, main.*.js, polyfills.*.js, styles.*.css
```

### 3. Permissions correctes

```bash
ls -ld /home/pi
# Devrait être : drwxr-xr-x (755)

ls -ld /home/pi/neopro
# Devrait être : drwxr-xr-x (755)

ls -ld /home/pi/neopro/webapp
# Devrait être : drwxr-xr-x ... www-data www-data
```

### 4. Ports en écoute

```bash
sudo netstat -tulnp | grep -E ':(80|3000|8080) '
# Devrait afficher :
# :80   -> nginx
# :3000 -> node (neopro-app)
# :8080 -> node (neopro-admin)
```

### 5. Tests HTTP

```bash
curl -I http://localhost/
curl -I http://localhost/tv
curl -I http://localhost/remote
curl -I http://localhost:8080

# Tous devraient retourner : HTTP/1.1 200 OK
```

## Commandes utiles

```bash
# Redémarrer le Raspberry Pi
sudo reboot

# Voir les logs en temps réel
sudo journalctl -u neopro-app -f

# Vérifier l'espace disque
df -h

# Vérifier les processus Node.js
ps aux | grep node

# Nettoyer les logs
sudo journalctl --vacuum-time=7d

# Mettre à jour le système
sudo apt-get update && sudo apt-get upgrade -y
```

## Support

Si aucune de ces solutions ne fonctionne :

1. Exécutez le script de diagnostic complet
2. Sauvegardez les logs :
   ```bash
   sudo journalctl -u neopro-app > neopro-app.log
   sudo journalctl -u nginx > nginx.log
   cat /home/pi/neopro/logs/nginx-error.log > nginx-error.log
   ```
3. Contactez le support avec ces fichiers
