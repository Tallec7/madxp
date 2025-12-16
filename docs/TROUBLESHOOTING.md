# Guide de dépannage Neopro

## Table des matières

1. [Problèmes de connexion](#problèmes-de-connexion)
2. [Erreurs 500](#erreurs-500)
3. [Problèmes d'authentification](#problèmes-dauthentification)
4. [Services qui ne démarrent pas](#services-qui-ne-démarrent-pas)
5. [Problèmes de synchronisation](#problèmes-de-synchronisation)
6. [Diagnostic réseau à distance](#diagnostic-réseau-à-distance)
7. [Diagnostic complet](#diagnostic-complet)

---

## Problèmes de connexion

### Le boîtier ne répond pas (neopro.local inaccessible)

#### 1. Vérifier que le Pi est allumé et connecté

```bash
# Tester la connexion
ping neopro.local
```

**Si pas de réponse :**

```bash
# Essayer avec l'IP directe
ping 192.168.4.1

# Vérifier que vous êtes connecté au WiFi NEOPRO-[CLUB]
```

#### 2. Vérifier le WiFi hotspot

```bash
# Se connecter au Pi (si possible via Ethernet ou autre WiFi)
ssh pi@raspberrypi.local

# Vérifier le service hotspot
sudo systemctl status hostapd
sudo systemctl status dnsmasq

# Redémarrer le hotspot
sudo systemctl restart hostapd
sudo systemctl restart dnsmasq
```

#### 3. Problème mDNS (neopro.local ne fonctionne pas)

**Solution temporaire :** Utiliser l'IP directe `192.168.4.1`

```bash
# Accès direct par IP
http://192.168.4.1/login
http://192.168.4.1:8080
```

**Solution permanente :**

```bash
ssh pi@192.168.4.1

# Vérifier avahi
sudo systemctl status avahi-daemon

# Redémarrer avahi
sudo systemctl restart avahi-daemon

# Vérifier le hostname
hostname -f
# Devrait afficher : neopro.local
```

---

## Erreurs 500

### Erreur 500 sur /tv et /remote

#### Symptômes
- `http://neopro.local:8080` fonctionne
- `http://neopro.local/tv` → Erreur 500
- `http://neopro.local/remote` → Erreur 500

#### Diagnostic

```bash
ssh pi@neopro.local

# Vérifier les logs nginx
sudo tail -50 /home/pi/neopro/logs/nginx-error.log

# Rechercher :
# "Permission denied" → Problème de permissions
# "No such file or directory" → Application non déployée
```

#### Solution 1 : Problème de permissions

```bash
# Fix permissions
sudo chmod 755 /home/pi
sudo chmod 755 /home/pi/neopro
sudo chown -R www-data:www-data /home/pi/neopro/webapp/
sudo find /home/pi/neopro/webapp -type f -exec chmod 644 {} \;
sudo find /home/pi/neopro/webapp -type d -exec chmod 755 {} \;

# Redémarrer nginx
sudo systemctl restart nginx

# Tester
curl -I http://localhost/tv
# Devrait retourner : HTTP/1.1 200 OK
```

#### Solution 2 : Application non déployée

```bash
# Depuis votre ordinateur
cd /path/to/neopro
npm run build:raspberry
npm run deploy:raspberry neopro.local
```

#### Explication technique

Pour qu'nginx (qui tourne sous `www-data`) puisse accéder aux fichiers :
1. `/home/pi` doit avoir les permissions 755
2. Les fichiers webapp doivent appartenir à `www-data`
3. L'application Angular doit être déployée dans `/home/pi/neopro/webapp/`

---

## Problèmes d'authentification

### Le login ne fonctionne pas

#### Symptôme : "Mot de passe incorrect"

**Vérifier le mot de passe configuré :**

```bash
# Voir la configuration
ssh pi@neopro.local
cat /home/pi/neopro/webapp/configuration.json | grep -A 3 "auth"
```

**Résultat attendu :**

```json
"auth": {
  "password": "VotreMotDePasse",
  "clubName": "CLUB_NAME",
  "sessionDuration": 28800000
}
```

**Si `auth` est absent ou vide :**

Le mot de passe par défaut est utilisé : `GG_NEO_25k!`

**Pour changer le mot de passe :**

```bash
# Option 1 : Via l'interface admin
http://neopro.local:8080
# Éditer configuration.json → Sauvegarder

# Option 2 : Manuellement
ssh pi@neopro.local
nano /home/pi/neopro/webapp/configuration.json
# Modifier auth.password
# Ctrl+X, Y, Enter

# Redémarrer nginx
sudo systemctl restart nginx
```

### Session expirée trop rapidement

**Modifier la durée de session :**

```json
"auth": {
  "sessionDuration": 28800000
}
```

Valeurs :
- `28800000` = 8 heures (par défaut)
- `3600000` = 1 heure
- `86400000` = 24 heures

---

## Services qui ne démarrent pas

### Vérifier tous les services

```bash
ssh pi@neopro.local

# Statut de tous les services
sudo systemctl status neopro-app
sudo systemctl status neopro-admin
sudo systemctl status neopro-sync
sudo systemctl status nginx
```

### Service neopro-app (Socket.IO - port 3000)

**Problème : Service crashed**

```bash
# Voir les logs
sudo journalctl -u neopro-app -n 50

# Erreurs courantes :
# "EADDRINUSE" → Port 3000 déjà utilisé
# "MODULE_NOT_FOUND" → npm install manquant
```

**Solutions :**

```bash
# Tuer le processus sur port 3000
sudo lsof -ti:3000 | xargs kill -9

# Réinstaller les dépendances
cd /home/pi/neopro/server
npm install

# Redémarrer
sudo systemctl restart neopro-app
```

### Service neopro-admin (port 8080)

**Même diagnostic que neopro-app :**

```bash
sudo journalctl -u neopro-admin -n 50
sudo lsof -ti:8080 | xargs kill -9
cd /home/pi/neopro/admin
npm install
sudo systemctl restart neopro-admin
```

**Redémarrage depuis l'interface :8080**

- Les boutons "Redémarrer service" de l'interface admin exécutent `sudo systemctl restart ...` via `raspberry/admin/admin-server.js`.
- Il faut que l'unité systemd `neopro-admin.service` autorise cette élévation (pas de `NoNewPrivileges=true`). Sinon `sudo` affiche _"no new privileges"_ et les actions échouent.
- Après modification du fichier `raspberry/config/systemd/neopro-admin.service`, déployer-le sur le Raspberry Pi puis :
  ```bash
  sudo systemctl daemon-reload
  sudo systemctl restart neopro-admin
  ```
- `./raspberry/scripts/build-and-deploy.sh` (ou `deploy-remote.sh`) copie automatiquement l'unité depuis `raspberry/config/systemd/neopro-admin.service` avant de relancer systemd.

### Service nginx

**Problème : nginx ne démarre pas**

```bash
# Tester la configuration
sudo nginx -t

# Voir les logs
sudo journalctl -u nginx -n 50
sudo tail -50 /home/pi/neopro/logs/nginx-error.log
```

**Solution :**

```bash
# Réparer la configuration
sudo nano /etc/nginx/sites-enabled/neopro

# Redémarrer
sudo systemctl restart nginx
```

### Service neopro-kiosk (mode TV)

Le mode kiosque utilise Chromium pour afficher automatiquement `/tv`. Sur Raspberry Pi OS Trixie et les images Golden récentes, l’exécutable est `chromium` (et non `chromium-browser`).

#### Symptômes
- L’écran reste noir ou n’affiche pas `/tv` après le boot.
- `journalctl -u neopro-kiosk` affiche `No such file or directory` pour `/usr/bin/chromium-browser`.

#### Diagnostic

```bash
# Statut du service
sudo systemctl status neopro-kiosk

# Chercher le binaire Chromium disponible
command -v chromium
command -v chromium-browser
```

#### Solutions

1. Si `command -v chromium` renvoie un chemin, vérifie que `neopro-kiosk.service` pointe vers `/usr/bin/chromium` :

```bash
sudo grep ExecStart /etc/systemd/system/neopro-kiosk.service
# ou
cat /etc/systemd/system/neopro-kiosk.service | head -n 25
```

2. Si la ligne pointe encore vers `chromium-browser` :  
   - Modifie `/etc/systemd/system/neopro-kiosk.service` (ou `raspberry/config/systemd/neopro-kiosk.service` si tu rebuild l’image golden) en remplaçant `/usr/bin/chromium-browser` par `/usr/bin/chromium`.
   - Recharge systemd et redémarre :

```bash
sudo systemctl daemon-reload
sudo systemctl restart neopro-kiosk
```

3. Si `command -v chromium` ne renvoie rien :
   - Installe Chromium `sudo apt install chromium`
   - Vérifie à nouveau que le chemin existe

4. Pour que la Golden Image et les futures mises à jour utilisent le bon binaire, assure-toi que ton dépôt synchronise `raspberry/config/systemd/neopro-kiosk.service` et que les scripts de déploiement copient cette version avant `systemctl daemon-reload` sur le Pi.

---

## Problèmes d'analytics

### Les analytics vidéo ne remontent pas au dashboard central

#### Symptômes
- Le dashboard central n'affiche pas les lectures vidéo
- Les statistiques d'utilisation sont vides ou à zéro
- Le buffer analytics reste vide sur le Pi

#### Architecture du flux analytics

```
Frontend Angular → POST /api/analytics → serveur local (port 3000)
                                              ↓
                                    analytics_buffer.json
                                              ↓
                        Sync-agent (toutes les 5 min) → POST /api/analytics/video-plays
                                              ↓
                                    Serveur central (PostgreSQL)
                                              ↓
                                    Dashboard admin
```

#### Diagnostic

```bash
ssh pi@neopro.local

# 1. Vérifier que le serveur local a l'endpoint analytics
curl -X POST http://localhost:3000/api/analytics \
  -H "Content-Type: application/json" \
  -d '{"events":[{"video_filename":"test.mp4","category":"sponsor","played_at":"2025-01-01T12:00:00Z","duration_played":10,"video_duration":10,"completed":true,"trigger_type":"auto"}]}'

# Si "Cannot POST /api/analytics" → Le serveur n'a pas l'endpoint (voir solution 1)
# Si {"success":true} → OK, passer à l'étape 2

# 2. Vérifier le buffer local
cat ~/neopro/data/analytics_buffer.json
# Doit contenir les événements

# 3. Vérifier les logs du sync-agent
journalctl -u neopro-sync-agent -n 50 --no-pager | grep -i analytic

# 4. Tester l'envoi vers le serveur central
curl -X POST https://neopro-central.onrender.com/api/analytics/video-plays \
  -H "Content-Type: application/json" \
  -d '{"site_id":"VOTRE_SITE_ID","plays":[]}'
# Doit retourner {"success":true,"recorded":0}
```

#### Solution 1 : Mettre à jour le serveur local

Si `curl` retourne "Cannot POST /api/analytics", le serveur local est une ancienne version sans l'endpoint analytics.

```bash
# Voir le contenu actuel
cat /home/pi/neopro/server/server.js | head -20

# Si le fichier ne contient pas "ANALYTICS ENDPOINT", mettre à jour :
# Depuis votre machine de dev, redéployer le serveur :
cd raspberry/
./scripts/deploy-remote.sh pi@neopro.local

# Ou manuellement sur le Pi, copier la nouvelle version depuis le repo
```

#### Solution 2 : Redémarrer le sync-agent

```bash
sudo systemctl restart neopro-sync-agent

# Attendre 5 secondes puis vérifier
sleep 5
journalctl -u neopro-sync-agent -n 10 --no-pager

# Rechercher "Analytics sent" dans les logs
```

#### Solution 3 : Vérifier que des vidéos sont jouées

Les analytics ne sont générées que lorsque des vidéos sont effectivement lues sur le Pi.
- Vérifier que le mode TV (`/tv`) est actif
- Vérifier que des vidéos sont configurées dans `configuration.json`
- Déclencher manuellement une lecture depuis la télécommande (`/remote`)

---

## Problèmes de synchronisation

### Le site n'apparaît pas sur le serveur central

#### 1. Vérifier le service sync-agent

```bash
ssh pi@neopro.local

# Statut
sudo systemctl status neopro-sync

# Logs
sudo journalctl -u neopro-sync -n 50
```

**Erreurs courantes :**

- `"Connection refused"` → Serveur central inaccessible
- `"401 Unauthorized"` → Site non enregistré
- `"ENOTFOUND"` → Problème DNS/Internet

#### 2. Vérifier la configuration sync

```bash
# Voir la config du site
cat /etc/neopro/site.conf

# Doit contenir :
# SITE_ID=...
# SITE_NAME=...
# etc.
```

**Si le fichier n'existe pas :**

Le site n'est pas enregistré.

#### 3. Réenregistrer le site

```bash
ssh pi@neopro.local
cd /home/pi/neopro/sync-agent

# Réinstaller les dépendances
npm install --production

# Enregistrer
sudo node scripts/register-site.js

# Redémarrer le service
sudo systemctl restart neopro-sync

# Vérifier les logs
sudo journalctl -u neopro-sync -f
```

#### 4. Vérifier sur le dashboard

1. Aller sur https://neopro-central.onrender.com
2. Menu **Sites** → **Liste des sites**
3. Chercher votre site dans la liste
4. Vérifier le statut : 🟢 En ligne

**Si le site n'apparaît pas :**

Le serveur central n'a peut-être pas reçu l'enregistrement.

```bash
# Vérifier que le sync-agent envoie bien des données
sudo journalctl -u neopro-sync -f

# Rechercher :
# "Connected to central server"
# "Metrics sent successfully"
```

### Le site est "Hors ligne" sur le dashboard

**Causes possibles :**

1. Le Raspberry Pi est éteint
2. Pas de connexion Internet
3. Le service neopro-sync est arrêté
4. Le serveur central est en maintenance

**Vérifications :**

```bash
# 1. Pi allumé ?
ping neopro.local

# 2. Internet ?
ssh pi@neopro.local 'ping -c 3 8.8.8.8'

# 3. Service actif ?
ssh pi@neopro.local 'sudo systemctl status neopro-sync'

# 4. Connexion serveur central ?
ssh pi@neopro.local 'curl -I https://neopro-central.onrender.com'
```

### La progression des déploiements reste bloquée à 0 %

**Symptômes**

- Dans **Contenu → Historique** ou **Gestion des mises à jour**, les cartes restent sur `0 %` avec le badge « En attente ».
- Les Raspberry confirment pourtant la réception d'une commande `deploy_video`.

**Cause**

Les composants Angular s'abonnaient au socket avant que la connexion Socket.IO ne soit établie. Comme `SocketService.on()` branchait les handlers directement sur `this.socket`, les événements `deploy_progress`/`update_progress` envoyés juste après la connexion étaient ignorés si l'abonnement avait été créé trop tôt.

**Vérifications**

1. Dans DevTools → Network → WS, vérifier que la frame socket.io contient des messages `deploy_progress`.
2. Dans la console, inspecter `ng.getComponent($0).deployments` : le champ `progress` reste à 0 malgré les messages WebSocket.

**Résolution**

1. Mettre à jour le dashboard vers la version incluant le nouveau `SocketService.on()` basé sur `events$` (`central-dashboard/src/app/core/services/socket.service.ts`).
2. Les événements sont désormais tamponnés dans `eventsSubject`, ce qui garantit la réception par les écrans même si l'abonnement est antérieur à la connexion réseau.
3. Rafraîchir la page pour réinitialiser les abonnements et vérifier que la progression augmente en direct.

---

## Diagnostic réseau à distance

### Utiliser le diagnostic réseau depuis le dashboard

Depuis le **dashboard central**, vous pouvez diagnostiquer la connectivité d'un boîtier à distance, même sans être sur le même réseau.

#### Comment utiliser

1. Allez sur la page détail d'un site connecté (statut "En ligne")
2. Dans la section **Actions rapides**, cliquez sur **Diagnostic réseau** (icône 🌐)
3. Attendez quelques secondes que les tests s'exécutent sur le boîtier
4. Les résultats s'affichent dans un modal

#### Tests effectués

| Test | Description | Indicateur |
|------|-------------|------------|
| **Internet** | Ping vers 8.8.8.8 (5 paquets) | Connectivité générale + perte de paquets |
| **Serveur central** | Ping, HTTP, port 443, SSL | Communication complète avec le dashboard |
| **DNS** | Résolution de google.com | Fonctionnement du DNS + IP résolue |
| **Passerelle** | Ping vers la gateway locale | Connexion au routeur |

#### Informations détaillées affichées

**Internet :**
- Latence ping (ms)
- Perte de paquets (%) - utile pour détecter une connexion instable
- Nombre de paquets envoyés/reçus

**Serveur central :**
- Latence ping (ms)
- Latence HTTP (ms) - temps de réponse réel de l'API
- Code HTTP (200 = OK, 4xx/5xx = erreur)
- Port 443 (HTTPS) : Ouvert / Fermé
- Certificat SSL : Valide / Invalide

**DNS :**
- Domaine testé (google.com)
- IP résolue
- Temps de résolution (ms)

**WiFi** (si applicable) :
- SSID du réseau connecté
- Qualité du signal (%)
- Puissance (dBm)
- Débit (Mb/s)

**Stabilité :**
- Uptime interface réseau
- Nombre de reconnexions (depuis le boot)

> **Note** : Les adresses IP locales (192.168.x.x) ne sont pas affichées car elles ne sont pas accessibles depuis un poste distant. Seule l'IP publique du site est visible dans les informations générales.

#### Interprétation des résultats

| Situation | Diagnostic probable |
|-----------|---------------------|
| ❌ Passerelle | Câble débranché ou problème DHCP |
| ✅ Passerelle, ❌ Internet | Routeur sans accès internet |
| ✅ Internet, ❌ DNS | Problème de configuration DNS |
| ✅ Internet, ❌ Serveur central | Pare-feu bloquant ou serveur indisponible |
| Tous ✅ mais "Connexion instable" | Latence élevée ou déconnexions fréquentes |
| Perte de paquets > 0% | Connexion WiFi faible ou réseau encombré |
| Perte de paquets > 10% | Connexion très instable, vidéos risquent de ne pas charger |
| Port 443 fermé | Pare-feu bloque HTTPS, WebSocket impossible |
| SSL invalide | Certificat expiré ou problème de date système |
| Reconnexions > 5 | Interface réseau instable (câble, WiFi...) |

#### Statut de connexion temps réel

Le dashboard vérifie **en temps réel** si le boîtier est connecté via WebSocket au serveur central. Les actions à distance (logs, diagnostic, redémarrage, etc.) ne sont activées **que si** le boîtier est connecté.

| Indicateur | Signification |
|------------|---------------|
| 🟢 **Connecté** | WebSocket actif, actions disponibles |
| 🟡 **Instable** | Vu récemment (<2 min) mais pas de WebSocket actif |
| 🔴 **Hors ligne** | Aucune connexion depuis >2 minutes |
| ⚪ **Inconnu** | Jamais connecté ou données manquantes |

> **Important** : Si le site apparaît "instable" ou "hors ligne", les boutons d'action seront désactivés. Le boîtier doit être connecté en temps réel pour exécuter des commandes à distance.

#### Statut de connexion temps réel

Le dashboard vérifie **en temps réel** si le boîtier est connecté via WebSocket au serveur central. Les actions à distance (logs, diagnostic, redémarrage, etc.) ne sont activées **que si** le boîtier est connecté.

| Indicateur | Signification |
|------------|---------------|
| 🟢 **Connecté** | WebSocket actif, actions disponibles |
| 🟡 **Instable** | Vu récemment (<2 min) mais pas de WebSocket actif |
| 🔴 **Hors ligne** | Aucune connexion depuis >2 minutes |
| ⚪ **Inconnu** | Jamais connecté ou données manquantes |

> **Important** : Si le site apparaît "instable" ou "hors ligne", les boutons d'action seront désactivés. Le boîtier doit être connecté en temps réel pour exécuter des commandes à distance.

#### WiFi : qualité du signal

| Qualité | Signal (dBm) | Interprétation |
|---------|--------------|----------------|
| 🟢 > 70% | > -60 dBm | Excellent |
| 🟡 40-70% | -60 à -70 dBm | Correct |
| 🔴 < 40% | < -70 dBm | Faible, risque de déconnexions |

#### Exemple de résultat

```
┌─────────────────────────────────────────┐
│  ✅ Internet (45ms)                     │
│  ✅ Serveur central (120ms)             │
│  ✅ DNS (15ms)                          │
│  ✅ Passerelle (5ms)                    │
├─────────────────────────────────────────┤
│  Internet                               │
│  Latence ping: 45ms                     │
│  Perte de paquets: 0% (5/5)             │
├─────────────────────────────────────────┤
│  Serveur central                        │
│  Latence ping: 120ms                    │
│  Latence HTTP: 250ms                    │
│  Status HTTP: 200                       │
│  Port 443: Ouvert                       │
│  Certificat SSL: Valide                 │
├─────────────────────────────────────────┤
│  DNS                                    │
│  Domaine testé: google.com              │
│  IP résolue: 142.250.74.238             │
│  Temps résolution: 15ms                 │
├─────────────────────────────────────────┤
│  WiFi                                   │
│  SSID: BOX-CLUB                         │
│  Qualité: 75%                           │
│  Signal: -55 dBm                        │
│  Débit: 65 Mb/s                         │
├─────────────────────────────────────────┤
│  Stabilité                              │
│  Uptime interface: 5j 12h 30m           │
│  Reconnexions: 2                        │
└─────────────────────────────────────────┘
```

---

## Diagnostic complet

### Script de diagnostic automatique

```bash
ssh pi@neopro.local
cd /home/pi/neopro
./scripts/diagnose-pi.sh
```

**Ce script vérifie :**
- ✅ Services systemd (neopro-app, neopro-admin, neopro-sync, nginx)
- ✅ Ports ouverts (80, 3000, 8080)
- ✅ Fichiers déployés
- ✅ Permissions
- ✅ Configuration
- ✅ Connectivité réseau
- ✅ Espace disque
- ✅ Température CPU

**Exemple de sortie :**

```
╔════════════════════════════════════════════════════════════════╗
║              DIAGNOSTIC RASPBERRY PI NEOPRO                    ║
╚════════════════════════════════════════════════════════════════╝

>>> Services systemd
✓ neopro-app      : active (running)
✓ neopro-admin    : active (running)
✓ neopro-sync     : active (running)
✓ nginx           : active (running)

>>> Ports
✓ Port 80   : LISTEN (nginx)
✓ Port 3000 : LISTEN (node)
✓ Port 8080 : LISTEN (node)

>>> Fichiers
✓ /home/pi/neopro/webapp/index.html existe
✓ /home/pi/neopro/webapp/configuration.json existe

>>> Permissions
✓ /home/pi : 755
✓ /home/pi/neopro : 755
✓ /home/pi/neopro/webapp : www-data:www-data

>>> Configuration
✓ auth.password défini
✓ sync.enabled = true

>>> Réseau
✓ neopro.local résout vers 192.168.4.1
✓ Ping localhost OK

>>> Système
✓ Espace disque : 12GB libre / 30GB (40% utilisé)
✓ Température CPU : 42.5°C

╔════════════════════════════════════════════════════════════════╗
║                    DIAGNOSTIC TERMINÉ                          ║
╚════════════════════════════════════════════════════════════════╝
```

### Commandes de diagnostic manuel

```bash
# Vérifier tous les services
sudo systemctl status neopro-app neopro-admin neopro-sync nginx

# Vérifier les ports
sudo netstat -tlnp | grep -E ':(80|3000|8080) '

# Vérifier les fichiers
ls -la /home/pi/neopro/webapp/

# Vérifier les permissions
stat /home/pi/neopro/webapp/

# Vérifier la configuration
cat /home/pi/neopro/webapp/configuration.json | python3 -m json.tool

# Logs en temps réel
sudo journalctl -f

# Température
vcgencmd measure_temp

# Espace disque
df -h

# Mémoire
free -h
```

---

## Réparation rapide

### Réinitialiser les permissions

```bash
ssh pi@neopro.local

# Script de réparation
sudo chmod 755 /home/pi
sudo chmod 755 /home/pi/neopro
sudo chown -R www-data:www-data /home/pi/neopro/webapp/
sudo chown -R pi:pi /home/pi/neopro/server
sudo chown -R pi:pi /home/pi/neopro/admin
sudo chown -R pi:pi /home/pi/neopro/sync-agent
sudo find /home/pi/neopro/webapp -type f -exec chmod 644 {} \;
sudo find /home/pi/neopro/webapp -type d -exec chmod 755 {} \;

# Redémarrer tous les services
sudo systemctl restart nginx
sudo systemctl restart neopro-app
sudo systemctl restart neopro-admin
sudo systemctl restart neopro-sync
```

### Redéploiement complet

```bash
# Depuis votre ordinateur
cd /path/to/neopro

# Rebuild
npm run build:raspberry

# Deploy
npm run deploy:raspberry neopro.local

# Vérifier
ssh pi@neopro.local './scripts/diagnose-pi.sh'
```

### Redémarrage complet

```bash
# Redémarrer le Raspberry Pi
ssh pi@neopro.local 'sudo reboot'

# Attendre 1-2 minutes

# Tester
ping neopro.local
curl -I http://neopro.local/login
```

---

## Problèmes connus

### 1. Build échoue avec erreur TypeScript

**Erreur :** `npm error enoent Could not read package.json`

**Cause :** Bug dans `build-raspberry.sh` (ligne `cd ..`)

**Solution :** Vérifier que `build-raspberry.sh` ne contient pas de `cd ..` erroné.

### 2. Déploiement SSH échoue

**Erreur :** `Connection refused` ou demande de mot de passe

**Cause :** Clé SSH non configurée

**Solutions :**

```bash
# Option 1 : Configurer la clé SSH
ssh-copy-id pi@neopro.local

# Option 2 : Déploiement manuel avec mot de passe
npm run deploy:raspberry neopro.local
# Entrer le mot de passe quand demandé

# Option 3 : SCP manuel
scp -r dist/neopro/browser/* pi@neopro.local:/home/pi/neopro/webapp/
```

### 3. Le hotspot WiFi ne fonctionne pas

**Vérifications :**

```bash
ssh pi@neopro.local

# Vérifier les services
sudo systemctl status hostapd
sudo systemctl status dnsmasq

# Vérifier les configs
cat /etc/hostapd/hostapd.conf
cat /etc/dnsmasq.conf

# Relancer
sudo systemctl restart hostapd
sudo systemctl restart dnsmasq
```

### 4. Vidéos ne se chargent pas

**Cause :** Chemins incorrects dans configuration.json

**Solution :**

```bash
# Vérifier que les vidéos sont copiées
ssh pi@neopro.local 'ls -la /home/pi/neopro/videos/'

# Vérifier configuration.json
cat /home/pi/neopro/webapp/configuration.json

# Les chemins doivent être relatifs :
# "videoPath": "/videos/sponsors/sponsor1.mp4"
```

---

## Contact support

Si le problème persiste après toutes ces vérifications :

1. **Exécuter le diagnostic complet :**
   ```bash
   ssh pi@neopro.local './scripts/diagnose-pi.sh' > diagnostic.txt
   ```

2. **Récupérer les logs :**
   ```bash
   ssh pi@neopro.local 'sudo journalctl -u neopro-app -n 200' > logs-app.txt
   ssh pi@neopro.local 'sudo journalctl -u neopro-sync -n 200' > logs-sync.txt
   ssh pi@neopro.local 'sudo tail -200 /home/pi/neopro/logs/nginx-error.log' > logs-nginx.txt
   ```

3. **Envoyer :**
   - diagnostic.txt
   - logs-app.txt
   - logs-sync.txt
   - logs-nginx.txt
   - Description du problème

---

**Dernière mise à jour :** 16 décembre 2025
