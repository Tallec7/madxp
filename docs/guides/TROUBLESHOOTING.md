# Guide de dépannage Neopro

## Table des matières

1. [Problèmes SSH](#problèmes-ssh)
2. [Problèmes de connexion](#problèmes-de-connexion)
3. [Erreurs 500](#erreurs-500) (MIME type, Pi /tv /remote, **rapports PDF**)
4. [Problèmes d'authentification](#problèmes-dauthentification)
5. [Services qui ne démarrent pas](#services-qui-ne-démarrent-pas)
6. [Problèmes de synchronisation](#problèmes-de-synchronisation)
7. [Problèmes de watermark (v3.50+)](#problèmes-de-watermark-v350)
8. [Diagnostic réseau à distance](#diagnostic-réseau-à-distance)
9. [Diagnostic complet](#diagnostic-complet)
10. [CI/CD et Release](#cicd-et-release)
11. [NetworkWatchdog — Auto-recovery réseau (v3.36+)](#networkwatchdog--auto-recovery-réseau-v336)
12. [Hotspot Watchdog (v2.34+)](#hotspot-watchdog-v234)
13. [Blocage BSSID Lock en Mesh (v2.34+)](#blocage-bssid-lock-en-mesh-v234)
14. [Écran / HDMI (v3.44+)](#écran--hdmi-v344)
15. [Recording Analytics (v3.38+)](#recording-analytics--état-denregistrement-v338)
16. [Saturation pool DB (MaxClientsInSessionMode)](#saturation-pool-db-maxclientsinsessionmode)

> **WiFi USB** : Pour un guide complet sur la clé WiFi USB (installation, diagnostic, pannes, recovery), voir [WIFI_USB_GUIDE.md](WIFI_USB_GUIDE.md).
>
> **Hotspot iOS** : Pour le guide dédié connexion iPhone/iPad, voir [IOS_HOTSPOT_FIX.md](IOS_HOTSPOT_FIX.md). Pour Android, voir [ANDROID_HOTSPOT_FIX.md](ANDROID_HOTSPOT_FIX.md).

---

## Problèmes SSH

### L'hôte distant a changé d'identification

**Erreur :**

```
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!
...
Host key verification failed.
```

**Cause :** Le Raspberry Pi a une nouvelle identité SSH. Cela arrive quand :

- Vous avez réinstallé Raspberry Pi OS
- Vous avez changé de carte SD
- Vous avez flashé une nouvelle image
- Vous avez un nouveau boîtier avec le même hostname

**Solution :**

```bash
# Supprimer l'ancienne empreinte du fichier known_hosts
ssh-keygen -R raspberrypi.local
# ou
ssh-keygen -R neopro.local
# ou avec l'IP
ssh-keygen -R 192.168.4.1

# Se reconnecter - répondre "yes" pour accepter la nouvelle empreinte
ssh pi@raspberrypi.local
```

**Explication :** SSH garde en mémoire l'empreinte (fingerprint) de chaque serveur dans `~/.ssh/known_hosts`. Quand cette empreinte change, SSH bloque la connexion par sécurité pour vous protéger d'une attaque man-in-the-middle. Si vous savez que le changement est légitime (réinstallation), supprimez simplement l'ancienne empreinte.

### Gestion de plusieurs boîtiers

Si vous gérez plusieurs Raspberry Pi Neopro, consultez la section **Configuration pour plusieurs boîtiers** dans [SSH_SETUP.md](SSH_SETUP.md#configuration-pour-plusieurs-boîtiers).

---

## Problèmes de connexion

### Le boîtier ne répond pas (hostname.local inaccessible)

> **Note (v3.51+)** : Le hostname mDNS est désormais dérivé du club_name (ex: `neopro-usap.local`). Consultez le dashboard (onglet Status du site) pour connaître le hostname de chaque Pi. L'ancien `neopro.local` reste le fallback pour les Pi non encore mis à jour.

#### 1. Vérifier que le Pi est allumé et connecté

```bash
# Tester la connexion (remplacer par le hostname du Pi)
ping neopro-usap.local
# ou l'ancien hostname pour les Pi non mis à jour
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

#### 2b. Diagnostic rapide de tous les services hotspot

Si le hotspot fonctionnait avant et a soudainement cassé, un service a probablement crashé. Vérifier tous les services d'un coup :

```bash
# Vérification rapide — les 4 services critiques du hotspot
systemctl is-active hostapd dnsmasq nginx avahi-daemon
# Tout doit afficher "active"

# Ou en une commande avec détails
for svc in hostapd dnsmasq nginx avahi-daemon; do
  printf "%-15s %s\n" "$svc:" "$(systemctl is-active $svc)"
done

# Vérifier aussi l'interface wlan0 et son IP
ip addr show wlan0 | grep "inet "
# Doit afficher : inet 192.168.4.1/24

# Tester que nginx répond (captive portal + webapp)
curl -s -o /dev/null -w "%{http_code}" http://localhost/
# Doit retourner : 200

# Tester le captive portal iOS
curl -s http://localhost/hotspot-detect.html
# Doit retourner : <HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>

# Ou lancer le watchdog en mode status (vérifie tout)
/home/pi/neopro/scripts/hotspot-watchdog.sh --status
```

**Le coupable le plus probable quand "ça marchait avant"** : `avahi-daemon` ou `nginx` a crashé silencieusement. Le hotspot-watchdog (v3.61+) surveille désormais ces deux services en plus de hostapd et dnsmasq.

#### 3. Problème mDNS (neopro.local ne fonctionne pas)

**Solution temporaire :** Utiliser l'IP directe `192.168.4.1` (hotspot) ou l'IP Ethernet

```bash
# Accès direct par IP
http://192.168.4.1/login
http://192.168.4.1:8080
```

**Diagnostic sur le Pi :**

```bash
ssh pi@192.168.4.1

# Vérifier avahi
sudo systemctl status avahi-daemon

# Vérifier les erreurs dans les logs (IMPORTANT)
sudo journalctl -u avahi-daemon -n 30 --no-pager | grep -i error
```

**Bug connu (versions < 2.33)** : Le fichier `/etc/avahi/services/neopro.service` contenait des commentaires `#` invalides en XML, ce qui empêchait avahi de charger la configuration mDNS.

**Symptôme dans les logs** :

```
XML_ParseBuffer() failed at line 1: not well-formed (invalid token)
Failed to load service group file /services/neopro.service, ignoring.
```

**Solution (obligatoire pour les Pi installés avant v2.33)** :

```bash
sudo tee /etc/avahi/services/neopro.service > /dev/null << 'EOF'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">Neopro %h</name>
  <service>
    <type>_http._tcp</type>
    <port>80</port>
    <txt-record>path=/</txt-record>
  </service>
  <service>
    <type>_neopro._tcp</type>
    <port>3000</port>
    <txt-record>version=1.0</txt-record>
  </service>
</service-group>
EOF
sudo systemctl restart avahi-daemon
```

**Vérifier que le fix a fonctionné** :

```bash
sudo journalctl -u avahi-daemon -n 10 --no-pager | grep neopro
# Doit afficher : Loading service file /services/neopro.service.
# Sans erreur XML
```

**Sur votre Mac/PC** (si le problème persiste après le fix sur le Pi) :

```bash
# Vider le cache DNS
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

# Vérifier les anciennes entrées dans /etc/hosts
cat /etc/hosts | grep neopro
# Si une ancienne IP apparaît, la supprimer :
sudo sed -i '' '/neopro.local/d' /etc/hosts
```

#### 4. neopro.local ne fonctionne pas sur iPhone (mais fonctionne sur Mac)

**Symptômes :**

- Mac connecté au hotspot → `http://neopro.local/remote` ✅ fonctionne
- iPhone connecté au même hotspot → `http://neopro.local/remote` ❌ ne fonctionne pas
- iPhone → `http://192.168.4.1/remote` ✅ fonctionne

**Cause :**

Deux problèmes peuvent causer ce comportement :

1. **Avahi (mDNS) n'écoute pas sur l'interface hotspot (wlan0)** - Par défaut, Avahi peut ne publier `neopro.local` que sur wlan1 (interface cliente), pas sur wlan0 (hotspot). Le Mac résout via son cache Bonjour plus robuste, l'iPhone non.

2. **dnsmasq ne répond pas pour neopro.local** - iOS utilise le DNS classique en priorité, pas seulement mDNS. Si dnsmasq n'est pas configuré pour répondre à `neopro.local`, iOS ne peut pas résoudre.

**Diagnostic :**

```bash
ssh pi@192.168.4.1

# Vérifier si Avahi écoute sur wlan0
sudo journalctl -u avahi-daemon -n 30 | grep wlan0
# Si aucune ligne → Avahi n'écoute pas sur wlan0

# Vérifier si dnsmasq répond pour neopro.local
grep "neopro.local" /etc/dnsmasq.conf
# Si rien → dnsmasq ne répond pas pour neopro.local
```

**Solution 1 : Configurer Avahi pour écouter sur wlan0**

```bash
# Ajouter allow-interfaces dans avahi-daemon.conf
sudo sed -i 's/^#allow-interfaces=.*/allow-interfaces=eth0,wlan0,wlan1/' /etc/avahi/avahi-daemon.conf

# Si la ligne n'existe pas, l'ajouter après [server]
grep -q "allow-interfaces" /etc/avahi/avahi-daemon.conf || \
  sudo sed -i '/^\[server\]/a allow-interfaces=eth0,wlan0,wlan1' /etc/avahi/avahi-daemon.conf

# Redémarrer avahi
sudo systemctl restart avahi-daemon

# Vérifier
sudo journalctl -u avahi-daemon -n 20 | grep wlan0
# Doit afficher : "Joining mDNS multicast group on interface wlan0.IPv4"
```

**Solution 2 : Ajouter neopro.local dans dnsmasq**

```bash
# Ajouter la résolution DNS classique
echo "address=/neopro.local/192.168.4.1" | sudo tee -a /etc/dnsmasq.conf

# Redémarrer dnsmasq
sudo systemctl restart dnsmasq

# Vérifier
grep neopro /etc/dnsmasq.conf
# Doit afficher : address=/neopro.local/192.168.4.1
```

**Après les corrections :**

1. Sur l'iPhone, **déconnectez puis reconnectez** le WiFi (pour récupérer la nouvelle config DNS)
2. Essayez `http://neopro.local/remote` dans Safari

**Solution 3 : Vérifier le captive portal iOS (v2.5.0+)**

iOS envoie une requête HTTP vers `http://captive.apple.com/hotspot-detect.html` à chaque connexion WiFi. Si la réponse n'est pas exactement `<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>`, iOS ouvre un **captive portal sheet** qui restreint l'accès réseau dans Safari.

```bash
ssh pi@192.168.4.1

# 1. Vérifier que nginx répond au captive portal iOS
curl -s http://localhost/hotspot-detect.html
# Doit retourner exactement : <HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>

# 2. Vérifier que dnsmasq redirige captive.apple.com vers le Pi
grep "captive.apple.com" /etc/dnsmasq.conf
# Doit afficher : address=/captive.apple.com/192.168.4.1

# 3. Si l'endpoint ne répond pas, vérifier nginx
sudo systemctl status nginx
sudo nginx -t  # Vérifier la config
```

Si le captive portal n'est pas configuré, consultez le guide complet : [IOS_HOTSPOT_FIX.md](IOS_HOTSPOT_FIX.md)

**Workaround si ça ne marche toujours pas :**

Utiliser l'IP directe : `http://192.168.4.1/remote`

---

#### 5. Android refuse de se connecter au hotspot WiFi

**Symptômes :**

- Android affiche "Pas d'accès Internet"
- Le téléphone se déconnecte automatiquement du hotspot
- Impossible d'accéder à `http://neopro.local/login`
- Erreur "Pas de DNS" dans le navigateur

**Cause :** Android détecte que le réseau n'a pas d'accès Internet et bloque la connexion.

**Solution immédiate :**

1. Connectez-vous au WiFi `NEOPRO-{CLUB}` malgré l'avertissement
2. Tapez "Rester connecté" quand Android demande
3. Utilisez l'IP directe dans le navigateur :
   ```
   http://192.168.4.1/login
   ```

**Solution permanente :**

Le **captive portal** est automatiquement configuré sur les nouvelles installations (version 2.5.0+).

Pour vérifier que le captive portal fonctionne :

```bash
ssh pi@192.168.4.1

# Tester les endpoints captive portal
curl -I http://localhost/generate_204
# Doit retourner : HTTP/1.1 204 No Content

curl http://localhost/connecttest.txt
# Doit retourner : Microsoft Connect Test
```

Si les endpoints ne fonctionnent pas, consultez le guide complet : [ANDROID_HOTSPOT_FIX.md](ANDROID_HOTSPOT_FIX.md)

---

## Erreurs 500

### Erreur MIME type "text/html" sur fichiers JavaScript (v3.43 corrigé)

#### Symptômes

- Console navigateur : `Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html"`
- L'application Angular ne charge plus après un déploiement OTA
- Les fichiers `.js` retournent du HTML (contenu de `index.html`)

#### Cause

Après un déploiement, les anciens fichiers `.js` hachés n'existent plus. La directive `try_files $uri $uri/ /index.html` de nginx renvoyait `index.html` (MIME `text/html`) au lieu d'un 404, ce qui cassait le chargement des modules ES.

#### Solution (corrigé en v3.43)

Les configs nginx (`nginx-captive-portal.conf` et `nginx/neopro-hls.conf`) séparent désormais les fichiers statiques (`.js`, `.css`, `.woff2`, images) du fallback SPA. Les fichiers statiques manquants retournent **404** au lieu du fallback HTML.

**Si vous avez une ancienne version :**

```bash
# Copier les configs corrigées
sudo cp /home/pi/neopro/config/nginx-captive-portal.conf /etc/nginx/sites-enabled/neopro-captive
sudo cp /home/pi/neopro/config/nginx/neopro-hls.conf /etc/nginx/sites-enabled/neopro-hls
sudo nginx -t && sudo systemctl reload nginx
```

**Workaround temporaire :** un rafraîchissement forcé (Ctrl+Shift+R) résout le problème car le navigateur télécharge les nouveaux fichiers hachés.

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

### Erreur 500 sur POST /api/reports/generate (v3.49+)

#### Symptômes

- Console navigateur : `POST /api/reports/generate 500 (Internal Server Error)`
- Logs Railway : `[ReportsController] Error generating report`

#### Causes possibles

**1. NOT NULL constraint sur `storage_path`** (corrigé v3.49.2)

```
null value in column "storage_path" of relation "generated_reports" violates not-null constraint
```

Le `INSERT INTO generated_reports` avec `status='generating'` doit fournir un `storage_path` placeholder.

**2. Dépendances canvas manquantes**

`chartjs-node-canvas` requiert des libs système pour le rendu des graphiques :

```bash
# Vérifier dans les logs Railway
Error: Cannot find module 'canvas'
# Ou : libc error, libcairo not found

# Fix dans le Dockerfile/Nixpacks
apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

**3. Colonne manquante dans les requêtes SQL**

Le service `pdf-report.service.ts` fait des requêtes directes (pas via repository). Si le schéma DB a changé :

```bash
# Vérifier les colonnes utilisées
# club_sessions: audience_estimate, videos_played, manual_triggers, auto_plays, duration_seconds
# video_plays: category, duration_played, video_filename
# advertiser_impressions: duration_played, site_id
railway logs -n 50 -s neopro-central --filter "report"
```

#### Diagnostic

```bash
# Logs Railway filtrés
railway logs -n 100 -s neopro-central --filter "MonthlyReports\|report\|pdf"

# Vérifier les rapports en échec en DB
psql "$DATABASE_URL" -c "SELECT id, report_type, status, error_message, created_at FROM generated_reports WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;"
```

---

## Problèmes d'authentification

### Erreur "Erreur lors de la configuration du mot de passe" au premier démarrage

#### Symptômes

- Message console : `Erreur lors de la configuration du mot de passe: Fa` (ou `Failed to fetch`)
- L'URL dans l'erreur est `http://localhost:3000/api/auth/setup`
- Vous accédez à l'app via `http://neopro.local` (pas localhost)

#### Cause

L'`AuthService` utilisait une URL hardcodée `http://localhost:3000` pour l'API d'authentification. Quand vous accédez à l'app depuis `http://neopro.local`, le navigateur essaie d'appeler `localhost:3000` sur votre machine locale (pas le Raspberry Pi), ce qui échoue.

#### Solution (corrigé en janvier 2026)

L'URL est maintenant construite dynamiquement à partir de `window.location.hostname` :

```typescript
// Avant (problématique)
private readonly LOCAL_SERVER_URL = 'http://localhost:3000';

// Après (corrigé)
private readonly LOCAL_SERVER_URL = `${window.location.protocol}//${window.location.hostname}:3000`;
```

**Si vous avez une ancienne version :**

1. Mettre à jour le code source (`raspberry/src/app/services/auth.service.ts`)
2. Rebuild : `cd raspberry && ng build`
3. Déployer : `scp -r dist/neopro/* pi@neopro.local:/home/pi/neopro/webapp/`
4. Hard refresh dans le navigateur (Ctrl+Shift+R)

---

### Déconnexion immédiate après login sur mobile (Safari iOS/iPadOS)

#### Symptômes

- Le login réussit (code 200)
- Le dashboard s'affiche une seconde
- Redirection automatique vers `/login`
- Fonctionne sur desktop mais pas sur mobile

#### Cause

Safari iOS/iPadOS bloque les cookies cross-origin via **ITP** (Intelligent Tracking Prevention), même avec `SameSite=none` et `Secure=true`.

Le frontend est sur `https://neopro-admin.kalonpartners.bzh` et le backend sur `https://neopro-central-production.up.railway.app` - Safari considère le cookie comme un "tracker" et le bloque.

#### Solution implémentée (décembre 2025)

Le frontend envoie maintenant le token via le header `Authorization: Bearer` en plus du cookie :

1. Après le login, le token JWT est stocké en mémoire dans `AuthService.sseToken`
2. L'intercepteur HTTP (`auth.interceptor.ts`) ajoute automatiquement le header Authorization
3. Le serveur accepte l'authentification via cookie OU header Authorization

**Fichiers concernés :**

- `central-dashboard/src/app/core/interceptors/auth.interceptor.ts`
- `central-dashboard/src/app/core/services/auth.service.ts`
- `central-dashboard/src/app/core/guards/auth.guard.ts`

#### Diagnostic

Dans les logs Railway, vérifier le flux des requêtes :

```
POST /api/auth/login     200  ← Login OK
GET  /api/sites          401  ← Cookie non envoyé (ITP)
```

Si les requêtes après login retournent 401, c'est un problème de cookie bloqué.

#### Si le problème persiste

1. Vérifier que le frontend est bien à jour (build récent)
2. Vider le cache du navigateur sur mobile
3. Vérifier les logs console côté client pour voir si le token est présent

---

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
- Il faut que **toutes** les unités systemd Neopro (`neopro-app`, `neopro-admin`, `neopro-sync`) n'aient **pas** `NoNewPrivileges=true`. Ce flag kernel bloque irréversiblement `sudo` pour le process et tous ses enfants. Sinon `sudo` affiche _"no new privileges"_.
- Après modification d'un fichier `.service`, déployer-le sur le Raspberry Pi puis :
  ```bash
  sudo systemctl daemon-reload
  sudo systemctl restart neopro-app neopro-admin neopro-sync
  ```
- `./raspberry/scripts/build-and-deploy.sh` (ou `deploy-remote.sh`) copie automatiquement les unités depuis `raspberry/config/systemd/` avant de relancer systemd.
- **Smoke tests (garde-fou CI)** : `npm run test:smoke` vérifie que les `.service` ne contiennent ni `NoNewPrivileges=true` ni `ProtectSystem=strict`, et que le fichier sudoers inclut les règles `apt`.
- **Auto-correction OTA (>= v3.17.1)** : le mécanisme `apply-services` corrige les `.service` lors du déploiement. Le sync-agent appelle `POST http://127.0.0.1:8080/api/system/apply-services` sur l'admin-server (qui n'a pas le flag), qui copie les fichiers corrigés dans `/etc/systemd/system/` et fait `daemon-reload` + restart.
- Si le dashboard et l'admin-server sont tous deux bloqués, corriger via SSH :
  ```bash
  sudo cp /home/pi/neopro/config/systemd/*.service /etc/systemd/system/
  sudo cp /home/pi/neopro/config/sudoers.d/neopro /etc/sudoers.d/neopro
  sudo chmod 644 /etc/systemd/system/neopro-*.service
  sudo chmod 440 /etc/sudoers.d/neopro
  sudo systemctl daemon-reload
  sudo systemctl restart neopro-sync-agent neopro-admin
  ```

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

Le mode kiosque utilise Chromium pour afficher automatiquement `/tv`. Le chemin de l'exécutable varie selon la version de Raspberry Pi OS :

- **Raspberry Pi OS Bookworm et récent** : `/usr/bin/chromium`
- **Raspberry Pi OS Bullseye et ancien** : `/usr/bin/chromium-browser`

> **Note :** Depuis décembre 2025, le script `install.sh` détecte automatiquement le bon chemin lors de l'installation.

#### Symptômes

- L'écran reste noir ou n'affiche pas `/tv` après le boot
- `journalctl -u neopro-kiosk` affiche `No such file or directory` pour le binaire Chromium

#### Diagnostic

```bash
# Statut du service
sudo systemctl status neopro-kiosk

# Voir les logs d'erreur
journalctl -u neopro-kiosk -n 20

# Chercher quel binaire Chromium est disponible
which chromium chromium-browser 2>/dev/null

# Voir quel chemin est configuré dans le service
grep ExecStart /etc/systemd/system/neopro-kiosk.service
```

#### Solutions

**Solution rapide (correction manuelle) :**

```bash
# Si seul /usr/bin/chromium existe
sudo sed -i 's|/usr/bin/chromium-browser|/usr/bin/chromium|' /etc/systemd/system/neopro-kiosk.service

# Si seul /usr/bin/chromium-browser existe
sudo sed -i 's|/usr/bin/chromium |/usr/bin/chromium-browser |' /etc/systemd/system/neopro-kiosk.service

# Recharger et redémarrer
sudo systemctl daemon-reload
sudo systemctl restart neopro-kiosk
```

**Solution permanente (réinstallation) :**

Le script `install.sh` détecte maintenant automatiquement le bon chemin. Pour en bénéficier :

```bash
# Depuis votre Mac, redéployer les fichiers système
./raspberry/scripts/deploy-remote.sh pi@neopro.local

# Ou sur le Pi, relancer la configuration des services
cd ~/raspberry
sudo ./install.sh CLUB_NAME WIFI_PASSWORD
```

**Si Chromium n'est pas installé :**

```bash
sudo apt update
sudo apt install chromium
# Puis relancer l'installation ou corriger manuellement
```

---

## Problèmes d'analytics

### Perte complète des analytics après reboot du Pi (corrigé v3.7.1)

#### Symptômes

- Le Pi a été utilisé pendant plusieurs jours/semaines offline
- Après reconnexion au cloud, aucune donnée analytics pour la période offline
- Les données apparaissent uniquement pour le jour de reconnexion

#### Cause racine

Chromium était lancé avec le flag `--incognito` dans `kiosk-watchdog.sh`, rendant le localStorage **éphémère**. À chaque redémarrage de Chromium (reboot Pi, crash, watchdog kill), le buffer analytics en localStorage était perdu.

De plus, les événements n'étaient persistés sur disque (via POST au serveur local) que toutes les 5 minutes, créant une fenêtre de perte de données.

#### Solution (v3.7.1+)

1. **`--incognito` supprimé** de `kiosk-watchdog.sh` → localStorage persistant entre les redémarrages
2. **Persistance immédiate** : chaque événement est sauvé dans localStorage ET envoyé au serveur local dès la fin de la vidéo
3. **Retry 30s** : si le serveur local n'est pas prêt (boot), retry automatique après 30 secondes

#### Migration Pi existants

```bash
# 1. Copier kiosk-watchdog.sh (supprime --incognito)
scp raspberry/scripts/kiosk-watchdog.sh pi@neopro.local:/home/pi/neopro/scripts/

# 2. Rebuild et déployer le frontend Angular
npm run build:raspberry
# puis déployer le build vers le Pi

# 3. Redémarrer Chromium
ssh pi@neopro.local 'sudo systemctl restart neopro-kiosk'
```

---

### Les analytics vidéo ne remontent pas au dashboard central

#### Symptômes

- Le dashboard central n'affiche pas les lectures vidéo
- Les statistiques d'utilisation sont vides ou à zéro
- Le buffer analytics reste vide sur le Pi

#### Architecture du flux analytics

```
Frontend Angular → POST /api/analytics → serveur local (port 3000)
                    (immédiat)                ↓
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
curl -X POST https://neopro-central-production.up.railway.app/api/analytics/video-plays \
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

### Le batch video-plays échoue avec "violates foreign key constraint" (corrigé v3.61+)

#### Symptômes

- Logs central : `insert or update on table "video_plays" violates foreign key constraint "video_plays_sponsor_id_fkey"` (ou `video_plays_video_id_fkey`, `video_plays_session_id_fkey`)
- La totalité du batch (jusqu'à 100 plays) est rejetée — perte de données analytics
- Le Pi continue d'envoyer le même buffer en boucle (les plays ne sont jamais consommées)

#### Cause

Le Pi envoie des `sponsor_id`, `video_id` ou `session_id` référençant des enregistrements supprimés côté serveur (advertiser désactivé, vidéo supprimée, session nettoyée). Le serveur validait uniquement le format UUID mais pas l'existence en base, provoquant un rejet FK PostgreSQL sur tout le batch.

#### Correction (v3.61+)

Le contrôleur `POST /api/analytics/video-plays` effectue désormais une vérification d'existence en parallèle sur les 3 FK (`advertisers`, `videos`, `club_sessions`) avant l'INSERT. Les références orphelines sont nullifiées avec un warning log et une métrique Prometheus (`neopro_video_plays_fk_fallback_total{column="sponsor_id|video_id|session_id"}`).

#### Diagnostic si le problème persiste

```bash
# Vérifier les logs pour les FK fallback (devrait être un warning, pas une erreur)
railway logs -n 100 -s neopro-central --filter "FK targets"

# Vérifier la métrique Prometheus
curl -s https://neopro-central-production.up.railway.app/metrics | grep video_plays_fk_fallback
```

---

### Les analytics restent dans le buffer et ne partent jamais

#### Symptômes

- Logs : `Failed to send analytics to server: timeout of 10000ms exceeded`
- Le buffer analytics grossit indéfiniment
- Les statistiques du dashboard n'affichent pas les nouvelles données

#### Cause

Si le Pi a été hors ligne longtemps ou si un bug a empêché l'envoi, le buffer peut accumuler des milliers d'événements. L'envoi de tout le buffer d'un coup dépasse le timeout de 10s.

#### Diagnostic

```bash
# Vérifier la taille du buffer
ssh pi@neopro.local 'cat /home/pi/neopro/data/analytics_buffer.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"'
# Si > 1000, c'est probablement la cause du timeout

# Vérifier les logs
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -n 50 --no-pager | grep -i analytics'
```

#### Solution (v2.15+)

Depuis la version 2.15, le sync-agent envoie les analytics par batches de 100 événements avec :

- Timeout de 15s par batch
- Pause de 500ms entre batches
- Sauvegarde progressive après chaque batch réussi

**Mettre à jour :**

```bash
# Depuis votre Mac
scp raspberry/sync-agent/src/analytics.js pi@neopro.local:/home/pi/neopro/sync-agent/src/

# Redémarrer le sync-agent
ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'

# Observer l'envoi par batches
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -f'
# Devrait afficher : "Sending analytics in batches" puis "Analytics sent to server"
```

**Vérifier que le fix est actif :**

```bash
ssh pi@neopro.local 'grep "BATCH_SIZE" /home/pi/neopro/sync-agent/src/analytics.js'
# Doit afficher : const BATCH_SIZE = 100;
```

---

## Problèmes de synchronisation

### Fichiers manquants dans sync-agent après mise à jour (MODULE_NOT_FOUND)

**Symptômes :**

- Le service `neopro-sync-agent` crash en boucle (restart counter élevé)
- Logs affichent : `Error: Cannot find module './utils/version-info'` (ou autre fichier)
- Le dossier `sync-agent/src/utils/` est vide ou incomplet

**Cause :**

Bug dans `update-software.js` (corrigé en v2.15.1) : la commande `tar -xzf` était exécutée directement dans `/home/pi/neopro/` au lieu d'extraire dans un dossier temporaire puis copier avec `cp -r`. Cela causait des extractions partielles sans erreur visible.

**Diagnostic :**

```bash
# Vérifier ce qui manque
ls -la /home/pi/neopro/sync-agent/src/utils/

# Le dossier devrait contenir :
# - config-merge.js
# - config-validator.js
# - version-info.js
```

**Solution immédiate :**

```bash
# Télécharger les fichiers manquants depuis GitHub
mkdir -p /home/pi/neopro/sync-agent/src/utils
curl -fsSL https://raw.githubusercontent.com/tallec7/neopro/main/raspberry/sync-agent/src/utils/version-info.js -o /home/pi/neopro/sync-agent/src/utils/version-info.js
curl -fsSL https://raw.githubusercontent.com/tallec7/neopro/main/raspberry/sync-agent/src/utils/config-merge.js -o /home/pi/neopro/sync-agent/src/utils/config-merge.js
curl -fsSL https://raw.githubusercontent.com/tallec7/neopro/main/raspberry/sync-agent/src/utils/config-validator.js -o /home/pi/neopro/sync-agent/src/utils/config-validator.js

# Redémarrer le service
sudo systemctl restart neopro-sync-agent
```

**Solution permanente :**

Mettre à jour `update-software.js` vers v2.15.1+ qui aligne la logique sur `deploy-remote.sh` :

```bash
# Depuis votre Mac
scp raspberry/sync-agent/src/commands/update-software.js pi@neopro.local:/home/pi/neopro/sync-agent/src/commands/
ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'
```

**Note (v3.7.14+) :** Le script `update-software.js` copie maintenant aussi le dossier `config/` (services systemd). Les versions précédentes ne copiaient jamais `config/`, ce qui empêchait l'installation des services `neopro-hotspot-watchdog`, `neopro-sync-guardian` et `neopro-hotspot-optimizer` via OTA.

**⚠️ Golden snapshot automatique (v3.7.16+) :** `update-software.js` crée automatiquement un snapshot golden de la version actuelle du sync-agent **avant** de la remplacer (si aucun golden n'existe). Cela résout le problème critique suivant : un Pi recevant le guardian pour la première fois via OTA n'avait aucun golden → si le nouveau code crashait, le guardian ne pouvait pas restaurer → **Pi hors ligne indéfiniment**. Symptôme : Pi reste "Hors ligne" après OTA, le guardian log "Golden directory does not exist". Fix immédiat si déjà impacté : reboot physique du Pi.

**Voir aussi :** Section [v2.15.x dans CLAUDE.md](/CLAUDE.md#v215x-janvier-2026) pour les détails techniques.

---

### configuration.json corrompu (SyntaxError: Unexpected string in JSON)

**Symptômes :**

- Tous les déploiements vidéo échouent en boucle sur un Pi
- Le dashboard affiche "En cours 100%" mais ne passe jamais à "Complété"
- Logs sync-agent : `Failed to update configuration: Unexpected string in JSON at position XXXXX`
- `Failed to sync local state` répété en boucle

**Cause :**

Corruption du fichier `/home/pi/neopro/webapp/configuration.json` suite à une coupure de courant pendant une écriture `fs.writeFile()` (non atomique). Le fichier contient des données orphelines après la fin du JSON valide.

**Diagnostic (remote shell) :**

```bash
node -e "JSON.parse(require('fs').readFileSync('/home/pi/neopro/webapp/configuration.json','utf-8')); console.log('JSON OK')"
```

**Solution immédiate :**

```bash
# Tronquer le fichier au premier objet JSON complet
node -e "const fs=require('fs'); const c=fs.readFileSync('/home/pi/neopro/webapp/configuration.json','utf-8'); let d=0; let cut=0; for(let i=0;i<c.length;i++){if(c[i]==='{')d++;if(c[i]==='}'){d--;if(d===0){cut=i+1;break;}}} const t=c.substring(0,cut); JSON.parse(t); fs.writeFileSync('/home/pi/neopro/webapp/configuration.json',t); console.log('Fixed: '+cut+'/'+c.length)"

# Redémarrer le sync-agent
sudo systemctl restart neopro-sync-agent
```

**Solution permanente (v3.49+) :**

Mise à jour vers v3.49+ qui implémente l'écriture atomique (tmp + rename) et l'auto-recovery depuis backup. Voir [ADR-028](../adr/ADR-028-atomic-config-write.md).

---

### Dépendances npm manquantes après mise à jour (socket.io-client, axios, etc.)

**Symptômes :**

- Le service `neopro-sync-agent` crash en boucle
- Logs affichent : `Error: Cannot find module 'socket.io-client'` (ou `axios`, `fs-extra`, `winston`)
- Le dossier `sync-agent/node_modules/` est vide ou incomplet

**Cause :**

Avant v2.15.4, les `node_modules` n'étaient pas inclus dans l'archive de déploiement. Si `npm install` échouait sur le Pi (pas d'accès internet, timeout, etc.), les dépendances manquaient.

**Diagnostic :**

```bash
# Vérifier les dépendances
ls /home/pi/neopro/sync-agent/node_modules/ | head -10

# Doit contenir : socket.io-client, axios, fs-extra, winston, etc.
```

**Solution immédiate :**

```bash
# Sur le Pi (nécessite accès internet)
cd /home/pi/neopro/sync-agent
npm install --production

# Redémarrer le service
sudo systemctl restart neopro-sync-agent
```

**Solution permanente :**

Utiliser une archive v2.15.4+ qui inclut les `node_modules` pré-installés :

```bash
# Sur votre Mac
npm run build:raspberry

# L'archive inclut maintenant sync-agent/node_modules/
# Déployer via le dashboard central ou l'admin panel :8080
```

**Note :** Depuis v2.15.4, `update-software.js` exécute aussi `npm install --production` comme fallback si les modules manquent.

---

### Mise à jour OTA échoue avec "No such file or directory" (v2.21.1)

**Symptôme** : La mise à jour depuis le dashboard échoue avec :

```
Command failed: cp -r /tmp/neopro-update-extractwebapp/* /home/pi/neopro/webapp/
cp: cannot stat '/tmp/neopro-update-extractwebapp/*': No such file or directory
```

**Cause** : Bug dans `update-software.js` (corrigé en v2.21.1) : le chemin était mal construit. `sourcePath` se terminait par `/` et on concaténait directement `webapp/*` sans slash, donnant `/tmp/neopro-update-extractwebapp/*` au lieu de `/tmp/neopro-update-extract/webapp/*`.

**Diagnostic** :

```bash
ssh pi@neopro.local "grep 'sourcePath}webapp' /home/pi/neopro/sync-agent/src/commands/update-software.js"
# Si résultat non vide → ancienne version buggée
# Devrait utiliser path.join(sourcePath, 'webapp')
```

**Solution** :

Envoyer le fichier corrigé depuis votre Mac (le curl peut échouer si GitHub n'a pas encore propagé) :

```bash
cat raspberry/sync-agent/src/commands/update-software.js | ssh pi@<IP_DU_PI> 'cat > /home/pi/neopro/sync-agent/src/commands/update-software.js && sudo systemctl restart neopro-sync-agent'
```

Puis relancer la mise à jour depuis le dashboard.

**Vérification** :

```bash
ssh pi@neopro.local "grep 'path.join(sourcePath' /home/pi/neopro/sync-agent/src/commands/update-software.js | head -3"
# Doit afficher des lignes avec path.join(sourcePath, 'webapp') etc.
```

---

### Mise à jour OTA échoue avec "permission denied, unlink VERSION"

**Symptôme** : La mise à jour depuis le dashboard échoue à 60% avec :

```
EACCES: permission denied, unlink '/home/pi/neopro/VERSION'
```

**Cause** : Le fichier `/home/pi/neopro/VERSION` appartient à `root:root` (créé par d'anciennes versions du sync-agent qui utilisaient `sudo cp/tee`). Le sync-agent tourne en tant que `pi` et `fs.copy({ overwrite: true })` fait un `fs.unlink()` implicite → EACCES.

**Versions affectées** : Pi v3.10→v3.17 (`fs.copy` sans try/catch + `NoNewPrivileges=true` bloque sudo). Les Pi v3.20+ ont un try/catch non-bloquant.

**Diagnostic** :

```bash
# Via SSH :
ssh pi@neopro.local "stat -c '%U:%G %a' /home/pi/neopro/ /home/pi/neopro/VERSION /home/pi/neopro/release.json"
# Si VERSION affiche "root:root" → fichier problématique
# Si le DOSSIER affiche "root:root" → rm -f échouera aussi

# Via remote_shell : la pré-migration logge un bloc "=== PRE-MIGRATION DIAG ==="
# avec les permissions. Visible dans Railway logs.
```

**Solution immédiate** :

```bash
# Si accès SSH :
ssh pi@neopro.local "sudo chown pi:pi /home/pi/neopro/VERSION /home/pi/neopro/release.json 2>/dev/null; ls -la /home/pi/neopro/VERSION"

# Si admin-server accessible (v3.32.1+) :
curl -sf -X POST http://<pi-ip>:8080/api/system/fix-ownership
```

Puis relancer la mise à jour depuis le dashboard.

**Solution automatique** (pré-migration serveur) :

Le central server envoie un `remote_shell` avant chaque OTA (`applyPreUpdateMigration()`) :

1. `rm -f` sans sudo — supprime le fichier root (marche si dossier parent `pi:pi`)
2. `sudo chown pi:pi` — fallback si rm échoue (marche si `NoNewPrivileges=false`)
3. `sudo rm -f` — dernier recours
4. Diagnostic — logge les permissions pour debug

**Pièges connus** :

- **`NoNewPrivileges=true`** (Pi v3.10→v3.17) bloque tous les sudo du sync-agent. Seul `rm -f` sans sudo fonctionne.
- **Dossier root:root** : si `/home/pi/neopro/` est root, même `rm -f` échoue. Nécessite SSH ou admin-server `fix-ownership`.
- **NE PAS appeler `apply-services`** dans la pré-migration — ça restart le sync-agent avant que `update_software` n'arrive
- **Race condition** : délai de 3s entre pré-migration et `update_software` (commandes Pi en parallèle)

---

### Vérifier que les options de déploiement (reboot / rollback) ont été appliquées (v3.25.0+)

**Contexte** : Le wizard de déploiement propose deux options : "Rollback automatique" et "Redémarrage après installation". Pour vérifier qu'elles ont bien été prises en compte :

**1. Vérifier côté DB** (ce qui a été stocké) :

```sql
SELECT id, schedule_reboot, auto_rollback, status, created_at
FROM update_deployments
ORDER BY created_at DESC LIMIT 5;
```

**2. Vérifier côté central server** (Railway logs) — rechercher :

```
Sending update_software command via sendOrQueue { ..., scheduleReboot: true, autoRollback: true }
```

**3. Vérifier côté Pi** (SSH ou remote shell) :

```bash
# Logs du sync-agent — options reçues au début de la MAJ
sudo journalctl -u neopro-sync-agent --since "1 hour ago" | grep "Starting software update"
# → Starting software update { version: "x.y.z", scheduleReboot: true, autoRollback: true }

# Preuve du reboot effectué
sudo journalctl -u neopro-sync-agent --since "1 hour ago" | grep "Scheduled reboot"
# → Scheduled reboot requested, rebooting in 10 seconds...

# Preuve du rollback désactivé (en cas d'échec)
sudo journalctl -u neopro-sync-agent --since "1 hour ago" | grep "Auto-rollback disabled"
# → Auto-rollback disabled, leaving system in current state

# Confirmer que le reboot a eu lieu (heure du dernier boot)
who -b
uptime
```

---

### Erreur EACCES permission denied sur configuration.backup.json

**Symptôme** : Les logs du sync-agent affichent :

```
Configuration update failed: EACCES: permission denied, open '/home/pi/neopro/webapp/configuration.backup.json'
```

**Cause** : Le dossier webapp a le mauvais groupe (www-data au lieu de pi).

**Solution** :

```bash
ssh pi@neopro.local 'sudo chown -R pi:pi /home/pi/neopro/webapp && sudo usermod -a -G pi www-data'
```

### Le site n'apparaît pas sur le serveur central

#### 1. Vérifier le service sync-agent

```bash
ssh pi@neopro.local

# IMPORTANT: Le service s'appelle neopro-sync-agent (pas neopro-sync)
sudo systemctl status neopro-sync-agent

# Logs
sudo journalctl -u neopro-sync-agent -n 50
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

1. Aller sur https://neopro-central-production.up.railway.app
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
ssh pi@neopro.local 'sudo systemctl status neopro-sync-agent'

# 4. Connexion serveur central ?
ssh pi@neopro.local 'curl -I https://neopro-central-production.up.railway.app'
```

### Le site affiche "0.0% uptime" alors qu'il est connecté

**Symptômes :**

- Dashboard affiche "0.0% uptime" sur la page de détail d'un site
- Le site est bien connecté (indicateur vert) et "Il y a moins d'une minute"

**Cause (corrigée en v3.24.1) :**

L'uptime était hardcodé à `0` dans `site-detail.component.ts` lors de la construction de l'objet `connectionStatus` depuis l'API `/dashboard`. Le `heartbeat_24h.count` était bien récupéré mais jamais utilisé pour calculer l'uptime.

**Formule :** `uptime24h = min(100, (heartbeatCount24h / 2880) * 100)` — 2880 = nombre de heartbeats attendus en 24h (un toutes les 30s).

### L'onglet Sponsors affiche "Aucun sponsor" alors que des sponsors existent

**Symptômes :**

- L'onglet Sponsors d'un site affiche "Aucun sponsor pour ce club"
- Les sponsors ont bien été créés via le dashboard
- La console navigateur peut afficher `Cannot read properties of undefined (reading 'length')` en boucle

**Causes possibles :**

1. **Route shadowing (corrigé en v3.58.1) :** Une route backward-compat `GET /api/sites/:id/sponsors` dans `advertiser-sites.routes.ts` masquait le handler `site-sponsor.routes.ts`, retournant `{ advertisers: [] }` au lieu de `{ sponsors: [] }`
2. **Frontend obsolète :** Le build Angular déployé sur Hostinger ne contient pas les derniers correctifs null-safety (v3.57.4+)
3. **Lien sponsor en localhost :** Le magic link affiche `localhost:4300` au lieu de l'URL prod → vérifier que `FRONTEND_URL` est configuré sur Railway ou que le backend est en v3.59.1+

**Vérification API :**

```bash
curl -s https://neopro-central-production.up.railway.app/api/sites/[SITE_ID]/sponsors \
  -H "Authorization: Bearer [TOKEN]" | jq '.data.sponsors | length'
```

Si la réponse contient `advertisers` au lieu de `sponsors`, mettre à jour le backend.

**Fix :** Mettre à jour vers v3.58.1+ (backend) et redéployer le dashboard Angular sur Hostinger.

### Le site affiche "Connexion instable" alors qu'il est connecté

**Symptômes :**

- Dashboard affiche "Connexion instable" (indicateur orange)
- `health.socketInMap = false` dans l'API `/dashboard`
- `health.reason = "not_in_map"`
- Mais `connection.isConnected = true` et `secondsSinceLastSeen` est faible

**Cause : Connexion zombie côté Pi**

Le Pi pense être connecté (`this.connected = true`) mais la socket WebSocket est en réalité morte. Les heartbeats sont envoyés dans le vide.

**Diagnostic :**

```bash
# Vérifier les logs du sync-agent
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -n 50 --no-pager'

# Chercher :
# - "Zombie connection detected" → Le Pi a détecté le problème (v2.15+)
# - Pas de "Disconnected" après le dernier "Connected" → Zombie non détecté
# - Pas de heartbeat loggé depuis longtemps
```

**Solution immédiate :**

```bash
# Redémarrer le sync-agent pour forcer une reconnexion propre
ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'
```

**Solution permanente (v2.15+, améliorée v3.43) :**

Depuis la version 2.15, le sync-agent inclut une détection automatique des connexions zombies :

1. **Dans `sendHeartbeat()`** : Vérifie `socket.connected` avant d'envoyer
2. **Dans `handlePingCheck()`** : Détecte si on reçoit un ping mais la socket est morte
3. **Health check périodique (30s, réduit de 60s en v3.43)** : Vérifie la cohérence entre le flag et la socket

**Améliorations v3.43 :**

- **Côté sync-agent** : health check réduit à **30s** (au lieu de 60s), seuil stale **60s** (au lieu de 90s). Le health check force maintenant une **déconnexion + reconnexion propre** au lieu de simplement logger.
- **Côté serveur** : `pingInterval` réduit à **10s**, `pingTimeout` à **20s** (détection en 30s vs 85s avant), health check serveur toutes les **15s**, seuil zombie **45s**.
- **Anti-thundering herd** : `randomizationFactor: 0.5` empêche 50+ Pi de reconnecter simultanément après un redémarrage serveur.

Si votre Pi a une version antérieure, mettez à jour le fichier `sync-agent/src/agent.js`.

**Vérifier que le fix est actif :**

```bash
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -n 20 | grep "health check"'
# Doit afficher : "Starting connection health check" avec interval: 30000
```

**Pourquoi ça arrive :**

- Le serveur central a redémarré/scalé pendant que le Pi était connecté
- Le Pi n'a pas détecté la déconnexion (pas d'événement `disconnect`)
- La socket TCP reste "ouverte" côté Pi mais ne fonctionne plus
- Les heartbeats sont envoyés sur une connexion morte (pas d'erreur Socket.IO sur `.emit()`)

**Voir aussi :** Section technique dans [CLAUDE.md](/CLAUDE.md#sync-agent-raspberry-pi)

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

### La barre de progression affiche 100 % mais « 0 / N sites »

**Symptômes**

- Dans **Mises à jour → Historique**, la barre de progression est pleine (100 %) mais le compteur affiche `0 / 1 sites`.
- Un refresh de la page corrige l'affichage.

**Cause**

Le handler `deploy-progress.handler.ts` broadcastait les événements `deploy_progress` / `update_progress` vers le dashboard **sans les champs `deployedCount` et `status`**. Le frontend mettait à jour `progress` via WebSocket mais `deployed_count` restait à `0` (valeur par défaut) et `status` ne changeait pas.

Au rechargement de la page, l'API REST retournait les bonnes valeurs car la requête SQL calcule `deployed_count` dynamiquement à partir du `status`.

**Résolution**

Corrigé dans la version incluant l'enrichissement du payload WebSocket dans `deploy-progress.handler.ts`. Le handler calcule maintenant `deployedCount` (depuis le type de cible) et `status` avant le broadcast, garantissant la cohérence temps réel entre la barre et le compteur.

### Déploiement vidéo échoue avec "Video checksum is required"

**Symptômes**

- Dans **Contenu → Historique**, le déploiement affiche « Échoué » avec 0 % de progression.
- En base de données : `error_message = 'Video checksum is required for deployment'`

**Cause**

Les vidéos uploadées via l'endpoint **bulk upload** (`POST /videos/bulk`) avant la version 2.21.x n'avaient pas de checksum SHA256 calculé. Le déploiement exige ce checksum pour vérifier l'intégrité du fichier après téléchargement.

**Vérification**

```sql
SELECT id, filename, checksum FROM videos WHERE checksum IS NULL;
```

**Résolution**

1. **Supprimer** les vidéos concernées (via dashboard ou SQL)
2. **Ré-uploader** les vidéos — le checksum sera calculé automatiquement
3. **Relancer** le déploiement

**Prévention**

Mettre à jour `central-server` vers v2.21.x+ où le fix est inclus dans `content.controller.ts`.

---

## Problèmes de watermark (v3.50+)

> **Référence architecture :** Voir [VIDEO_STORAGE.md § Flux de déploiement watermark](../technical/VIDEO_STORAGE.md#9-flux-de-déploiement-watermark-v350)

### Upload watermark échoue (500 Internal Server Error)

**Symptôme :** Erreur 500 sur `POST /api/assets/watermark/:siteId`.

**Cause probable :** Le sous-dossier `watermarks/` n'existe pas sur le FTP Hostinger.

**Diagnostic :**

```bash
# Logs Railway — chercher :
# "FTPError: 550 watermarks/watermark_neopro.png: No such file or directory"
```

**Solution :** Corrigé en v3.49.4 — `ftp-storage.ts` appelle `client.ensureDir(dir)` automatiquement avant chaque upload. Si l'erreur réapparaît, vérifier les permissions FTP.

### Watermark uploadé mais pas déployé sur le Pi

**Symptôme :** L'upload réussit dans le dashboard mais le watermark n'apparaît pas sur la TV.

**Causes possibles :**

1. **Checksum mismatch** (< v3.55.3) : Le `deploy_asset` échouait systématiquement car le checksum était calculé sur le buffer mémoire avant l'upload FTP, mais le CDN/Hostinger servait un contenu binaire différent. Vérifiable via `SELECT * FROM remote_commands WHERE command_type = 'deploy_asset' ORDER BY created_at DESC LIMIT 5;`.
   - **Fix :** Le central-server n'envoie plus de checksum pour les assets CDN (v3.55.3). Le Pi traite le mismatch comme un warning non-bloquant.

2. **Config non envoyée** (< v3.50.1) : `uploadWatermarkFile()` n'appelait pas `saveWatermarkConfig()` automatiquement. L'utilisateur devait cliquer manuellement sur "Deployer le watermark".
   - **Fix :** Mis à jour en v3.50.1 — auto-deploy après upload.

3. **Race condition deploy_asset** (< v3.53.2) : `deploy_asset` émettait `config_updated` avant que `update_config` n'ait écrit la section watermark dans `configuration.json`. L'app Angular recevait une config sans watermark.
   - **Fix :** `deploy_asset` n'émet plus `config_updated` depuis v3.53.2. Seul `update_config` (qui écrit réellement dans `configuration.json`) émet l'événement.

**Diagnostic côté Pi :**

```bash
# Vérifier que l'image existe
ls -la /home/pi/neopro/webapp/assets/watermarks/

# Vérifier que configuration.json contient la section watermark
node -e "const c=JSON.parse(require('fs').readFileSync('/home/pi/neopro/webapp/configuration.json','utf-8')); console.log(JSON.stringify(c.watermark, null, 2))"

# Logs sync-agent (vérifier deploy_asset + update_config)
sudo journalctl -u neopro-sync-agent -n 100 | grep -E 'deploy-asset|update_config|watermark'
```

### Watermark perdu au refresh du dashboard

**Symptôme :** Le watermark est configuré et déployé, mais disparaît quand on rafraîchit la page du dashboard.

**Cause :** Pendant le lock de 60 secondes (`config_update_pending_until`), `sync_local_state` ne met à jour que les métadonnées dans `local_config_mirror`, pas la config complète. Si le Pi renvoie son état pendant cette fenêtre, la config watermark est écrasée.

**Fix (v3.50.2+) :** `command-queue.service.ts` merge immédiatement le contenu `neoProContent` (watermark, sponsors, etc.) dans `local_config_mirror` via `jsonb_set` au moment de l'envoi de la commande `update_config`. Le dashboard voit ainsi la config à jour même pendant le lock.

**Diagnostic SQL :**

```sql
-- Vérifier la section watermark dans local_config_mirror
SELECT
  name,
  local_config_mirror->'watermark' as watermark,
  config_update_pending_until
FROM sites
WHERE id = 'SITE_ID';
```

### Le watermark ne s'affiche pas sur l'écran TV (Angular)

**Conditions d'affichage :** Les 3 conditions suivantes doivent être remplies :

1. `configuration.watermark.enabled` = `true`
2. `configuration.watermark.imagePath` non vide
3. Le fichier image existe dans `/home/pi/neopro/webapp/assets/watermarks/`

**Diagnostic rapide :**

```bash
# 1. Vérifier configuration.json
ssh pi@neopro.local 'node -e "const c=JSON.parse(require(\"fs\").readFileSync(\"/home/pi/neopro/webapp/configuration.json\",\"utf-8\")); console.log(\"enabled:\", c.watermark?.enabled, \"path:\", c.watermark?.imagePath)"'

# 2. Vérifier que le fichier image existe
ssh pi@neopro.local 'ls -la /home/pi/neopro/webapp/assets/watermarks/'

# 3. Vérifier les logs pour errors
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -n 50 | grep watermark'
```

**Si `imagePath` est vide mais l'image existe :** Le `update_config` n'a pas été envoyé ou a échoué. Redéployer depuis le dashboard (onglet Paramètres > Watermark).

**Si le fichier image n'existe pas :** Le `deploy_asset` a échoué. Vérifier les logs sync-agent pour l'erreur de téléchargement.

### Watermark pas mis à jour après changement d'image (v3.55.4)

**Symptôme :** L'image existe sur le Pi et la config est correcte, mais le watermark affiché est l'ancienne version (après remplacement avec le même nom de fichier).

**Cause (< v3.55.4) :** nginx sert les fichiers statiques avec `Cache-Control: public, immutable` et `expires 30d`. Si l'image est remplacée avec le même nom de fichier, Chromium sert l'ancienne version depuis son cache.

**Fix (v3.55.4) :** `WatermarkService.getImageSrc()` ajoute systématiquement un cache-buster `?_v=<timestamp>` à l'URL de l'image. Le timestamp change à chaque reload de configuration, forçant Chromium à charger la nouvelle version.

**Solution immédiate (versions antérieures) :** Redémarrer Chromium sur le Pi pour vider le cache :

```bash
sudo systemctl restart chromium
```

### Image manquante sur le Pi malgré config watermark OK (v3.54.3)

**Symptôme :** `configuration.json` contient bien `watermark.enabled: true` et `watermark.imagePath`, mais le dossier `assets/watermarks/` est vide et les logs sync-agent ne montrent aucune trace de `deploy_asset`.

**Cause racine (< v3.54.3) :** Le bouton "Deployer le watermark" n'envoyait que `update_config` (la configuration JSON). La commande `deploy_asset` (téléchargement de l'image) n'était envoyée qu'une seule fois lors de l'upload initial. Si cette première commande échouait ou n'atteignait pas le Pi, l'image n'était jamais re-déployée.

**Fix (v3.54.3) :**

1. **Dashboard** : `saveWatermarkConfig()` envoie désormais `update_config` + `deploy_asset` (re-téléchargement de l'image depuis `cloudUrl`).
2. **Pi** : `WatermarkService.onImageError()` retente le chargement 5 fois avec backoff progressif (5s, 10s, 30s, 60s, 120s) et cache-buster pour éviter les 404 en cache.

**Solution immédiate :** Cliquer sur "Deployer le watermark" dans le dashboard (v3.54.3+). L'image sera re-déployée automatiquement.

**Solution manuelle (versions antérieures) :**

```bash
# Sur le Pi — télécharger manuellement l'image depuis le cloud
mkdir -p /home/pi/neopro/webapp/assets/watermarks/
wget -O /home/pi/neopro/webapp/assets/watermarks/IMAGE_NAME.png "CLOUD_URL"
```

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

| Test                | Description                   | Indicateur                               |
| ------------------- | ----------------------------- | ---------------------------------------- |
| **Internet**        | Ping vers 8.8.8.8 (5 paquets) | Connectivité générale + perte de paquets |
| **Serveur central** | Ping, HTTP, port 443, SSL     | Communication complète avec le dashboard |
| **DNS**             | Résolution de google.com      | Fonctionnement du DNS + IP résolue       |
| **Passerelle**      | Ping vers la gateway locale   | Connexion au routeur                     |

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

| Situation                         | Diagnostic probable                                        |
| --------------------------------- | ---------------------------------------------------------- |
| ❌ Passerelle                     | Câble débranché ou problème DHCP                           |
| ✅ Passerelle, ❌ Internet        | Routeur sans accès internet                                |
| ✅ Internet, ❌ DNS               | Problème de configuration DNS                              |
| ✅ Internet, ❌ Serveur central   | Pare-feu bloquant ou serveur indisponible                  |
| Tous ✅ mais "Connexion instable" | Latence élevée ou déconnexions fréquentes                  |
| Perte de paquets > 0%             | Connexion WiFi faible ou réseau encombré                   |
| Perte de paquets > 10%            | Connexion très instable, vidéos risquent de ne pas charger |
| Port 443 fermé                    | Pare-feu bloque HTTPS, WebSocket impossible                |
| SSL invalide                      | Certificat expiré ou problème de date système              |
| Reconnexions > 5                  | Interface réseau instable (câble, WiFi...)                 |

#### Statut de connexion temps réel

Le dashboard vérifie **en temps réel** si le boîtier est connecté via WebSocket au serveur central. Les actions à distance (logs, diagnostic, redémarrage, etc.) ne sont activées **que si** le boîtier est connecté.

| Indicateur        | Signification                                     |
| ----------------- | ------------------------------------------------- |
| 🟢 **Connecté**   | WebSocket actif, actions disponibles              |
| 🟡 **Instable**   | Vu récemment (<2 min) mais pas de WebSocket actif |
| 🔴 **Hors ligne** | Aucune connexion depuis >2 minutes                |
| ⚪ **Inconnu**    | Jamais connecté ou données manquantes             |

> **Important** : Si le site apparaît "instable" ou "hors ligne", les boutons d'action seront désactivés. Le boîtier doit être connecté en temps réel pour exécuter des commandes à distance.

#### Statut de connexion temps réel

Le dashboard vérifie **en temps réel** si le boîtier est connecté via WebSocket au serveur central. Les actions à distance (logs, diagnostic, redémarrage, etc.) ne sont activées **que si** le boîtier est connecté.

| Indicateur        | Signification                                     |
| ----------------- | ------------------------------------------------- |
| 🟢 **Connecté**   | WebSocket actif, actions disponibles              |
| 🟡 **Instable**   | Vu récemment (<2 min) mais pas de WebSocket actif |
| 🔴 **Hors ligne** | Aucune connexion depuis >2 minutes                |
| ⚪ **Inconnu**    | Jamais connecté ou données manquantes             |

> **Important** : Si le site apparaît "instable" ou "hors ligne", les boutons d'action seront désactivés. Le boîtier doit être connecté en temps réel pour exécuter des commandes à distance.

#### WiFi : qualité du signal

| Qualité   | Signal (dBm)  | Interprétation                 |
| --------- | ------------- | ------------------------------ |
| 🟢 > 70%  | > -60 dBm     | Excellent                      |
| 🟡 40-70% | -60 à -70 dBm | Correct                        |
| 🔴 < 40%  | < -70 dBm     | Faible, risque de déconnexions |

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

# Mode JSON (pour automation ou parsing)
./scripts/diagnose-pi.sh --json

# Mode silencieux (erreurs uniquement)
./scripts/diagnose-pi.sh --quiet
```

**Ce script vérifie (16 catégories, v3.45.1+) :**

- ✅ Version Node.js (v18+ requis)
- ✅ Paquets apt critiques et recommandés
- ✅ Services systemd (état + installation)
- ✅ Masquage curseur (mode TV)
- ✅ Ports ouverts (80, 3000, 8080)
- ✅ Fichiers et répertoires déployés
- ✅ node_modules (server, admin, sync-agent)
- ✅ Webapp Angular (index.html, main-\*.js)
- ✅ Config Nginx (syntaxe, routes, site-enabled)
- ✅ WiFi AP (interface, mode, SSID, IP)
- ✅ Permissions et propriétaires
- ✅ Configuration GPU
- ✅ Espace disque
- ✅ Informations de version

Le code de retour = nombre d'erreurs (0 = Pi sain). Le mode `--json` est automatiquement utilisé par `deploy-remote.sh` (post-déploiement) et `update-software.js` (rapport OTA).

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

### Script fix-fleet-pi.sh (v3.7.14+)

Pour corriger les problèmes courants identifiés par un debug bundle (15 sections : config, logs, réseau, dmesg kernel, périphériques USB, etc. — voir [sync-agent brick](../architecture/bricks/sync-agent.md#debug-bundle-export_debug_bundle)), utiliser le script générique de réparation flotte :

```bash
# Copier et exécuter sur le Pi
scp raspberry/scripts/fix-fleet-pi.sh pi@neopro.local:/tmp/
ssh pi@neopro.local 'chmod +x /tmp/fix-fleet-pi.sh && sudo /tmp/fix-fleet-pi.sh'
```

**Ce que fait le script :**

1. **TKIP → CCMP** dans hostapd.conf (éjections téléphones)
2. **Installe les 3 services systemd manquants** (watchdog, guardian, optimizer)
3. **Crée le dossier videos-processing** (permission denied)
4. **Vérifie les flags GPU** du kiosk (Pi 4 vs Pi 5)
5. **Vide le cache Chromium** (erreurs SharedImage/AllocateRingBuffer)
6. **Flush les buffers** analytics et sponsors bloqués
7. **Vérifie gpu_mem** (doit être 256 sur Pi 4)

Le script auto-détecte le modèle de Pi, le type de connexion (Ethernet vs WiFi) et le nom du site.

**Voir aussi :** [MODOP-S04-05 Section 3.7](../modops/MODOP-S04-05-Diagnostic-Distance.md#37-script-fix-fleet-pish-v3714)

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

## Commandes en file d'attente (Command Queue)

### Les commandes ne sont pas exécutées après reconnexion du site

**Symptômes :**

- Des commandes sont visibles dans "Commandes en attente" sur le dashboard
- Le site se reconnecte mais les commandes restent en attente
- Aucune action n'est effectuée sur le Raspberry Pi

**Vérifications :**

```bash
# 1. Vérifier les logs du serveur central (Render)
# Rechercher "Processing pending commands" ou "Pending commands processed"

# 2. Vérifier les commandes en base
psql -h $DB_HOST -U $DB_USER -d $DB_NAME
SELECT id, command_type, attempts, max_attempts, expires_at
FROM pending_commands WHERE site_id = 'UUID_DU_SITE';
```

**Causes et solutions :**

| Cause                                 | Solution                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `attempts >= max_attempts`            | Réinitialiser : `UPDATE pending_commands SET attempts = 0 WHERE site_id = 'UUID';` |
| `expires_at < NOW()`                  | La commande a expiré, en créer une nouvelle                                        |
| Site déconnecté pendant le traitement | Attendre la prochaine reconnexion                                                  |

### Une commande "temps réel" ne fonctionne pas sur un site offline

**Symptôme :** Message d'erreur "La commande X ne peut pas être mise en file d'attente"

**Explication :** Certaines commandes nécessitent une connexion temps réel et ne peuvent pas être différées :

- `get_logs` - Lecture des logs
- `get_system_info` - Informations système
- `get_config` - Configuration actuelle
- `network_diagnostics` - Diagnostic réseau
- `get_hotspot_config` - Configuration WiFi

**Solution :** Attendre que le site soit en ligne (statut "Connecté") pour exécuter ces commandes.

### Voir toutes les commandes en attente pour tous les sites

```bash
# Via l'API
curl -H "Authorization: Bearer $TOKEN" \
  https://neopro-central-production.up.railway.app/api/sites/queue/summary

# Via SQL
SELECT
  s.club_name,
  COUNT(*) as pending,
  MIN(pc.created_at) as oldest
FROM pending_commands pc
JOIN sites s ON s.id = pc.site_id
WHERE (pc.expires_at IS NULL OR pc.expires_at > NOW())
  AND pc.attempts < pc.max_attempts
GROUP BY s.club_name;
```

### Forcer l'exécution des commandes en attente

Si un site est connecté mais les commandes ne s'exécutent pas :

1. **Méthode 1 : Reconnecter le site**

   ```bash
   # Sur le Raspberry Pi
   sudo systemctl restart neopro-sync
   ```

2. **Méthode 2 : Réinitialiser les tentatives**
   ```sql
   UPDATE pending_commands
   SET attempts = 0, last_attempt_at = NULL
   WHERE site_id = 'UUID_DU_SITE';
   ```

### Nettoyer la queue manuellement

```sql
-- Supprimer les commandes expirées
DELETE FROM pending_commands
WHERE expires_at IS NOT NULL AND expires_at < NOW();

-- Supprimer les commandes ayant échoué trop de fois
DELETE FROM pending_commands WHERE attempts >= max_attempts;

-- Vider la queue d'un site
DELETE FROM pending_commands WHERE site_id = 'UUID_DU_SITE';
```

> **Documentation complète :** Voir [COMMAND_QUEUE.md](COMMAND_QUEUE.md)

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

### 3b. Clé WiFi USB non détectée (pas de wlan1)

**Symptômes :**

- La clé WiFi USB est branchée mais `ip link show` n'affiche pas `wlan1`
- `lsusb` montre le périphérique mais aucune interface réseau n'est créée

**Cause :**

Les drivers pour certains chipsets WiFi USB (Realtek, Ralink) ne sont pas inclus par défaut dans Raspberry Pi OS. C'est fréquent avec les clés USB bon marché.

**Solution :**

```bash
# Installer les firmwares WiFi USB
sudo apt update && sudo apt install -y firmware-realtek firmware-ralink
sudo reboot

# Après reboot, vérifier que wlan1 apparaît
ip link show wlan1
```

**Note :** Depuis la version 3.17.1, `install.sh` installe automatiquement ces firmwares. Ce problème ne concerne que les boîtiers installés avec une version antérieure. Depuis la version 3.17.2, cette commande peut être exécutée directement depuis le dashboard (onglet Debug, super_admin uniquement) sans SSH.

### 3c. Configurer le WiFi client (wlan1) à distance depuis le dashboard

**Contexte :**

La clé WiFi USB (wlan1) permet de connecter le Pi au WiFi du club pour un accès Internet permanent. Depuis la version 3.20, cette configuration se fait **entièrement à distance** depuis le dashboard central, sans accès physique au Pi.

**Prérequis :**

- Le Pi doit être **en ligne** (connecté via Ethernet ou un ancien WiFi)
- La clé WiFi USB doit être **branchée** et détectée (`wlan1` visible)
- Version sync-agent >= 3.20 avec `scan_wifi_networks` dans `DEFAULT_ALLOWED_COMMANDS`

**Procédure :**

1. Dashboard central → détail du site → onglet **Debug**
2. Section **WiFi Client (wlan1)** → Cliquer **📡 Scanner les réseaux**
3. La liste des réseaux visibles s'affiche (triés par signal)
4. Cliquer sur le réseau du club → Entrer le mot de passe WiFi → **Connecter**
5. Le résultat affiche l'IP obtenue et le signal

**Troubleshooting :**

| Symptôme                         | Cause probable                                                        | Solution                                                                  |
| -------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Le bouton "Scanner" ne fait rien | `scan_wifi_networks` absent de `DEFAULT_ALLOWED_COMMANDS` (config.js) | Pousser un OTA >= 3.20 incluant le fix config.js                          |
| "Interface wlan1 non détectée"   | Clé USB non branchée ou driver manquant                               | Voir section 3b ci-dessus                                                 |
| Scan OK mais connexion échoue    | Mot de passe incorrect ou signal trop faible                          | Vérifier le mot de passe (8-63 caractères WPA2), rapprocher le Pi de l'AP |
| Timeout 30s sans résultat        | Pi hors ligne ou sync-agent non redémarré après OTA                   | Vérifier que le site est "En ligne" dans le dashboard                     |

**Détails techniques :**

- Le mot de passe est hashé via `wpa_passphrase` (jamais stocké en clair sur le Pi)
- La config est écrite dans `/etc/wpa_supplicant/wpa_supplicant.conf`
- Ne touche **jamais** wlan0 (hotspot) ni eth0
- Commandes realtime-only (non queueables — le Pi doit être connecté au moment de l'action)

### 4. WiFi USB roaming entre points d'accès (connexion instable)

**Symptômes :**

- La clé USB WiFi (wlan1) se déconnecte et reconnecte fréquemment
- Le Pi change d'AP (BSSID) alors que le SSID reste le même
- Connexion internet intermittente malgré plusieurs APs à proximité
- Logs sync-agent montrent des reconnexions fréquentes

**Cause :**

Quand un club a plusieurs points d'accès avec le même SSID (ex: répéteurs, mesh), le Pi fait du "roaming" entre les APs. En 2.4 GHz, ce roaming peut être instable et causer des déconnexions.

**Solution : Fixer le BSSID via l'admin panel**

Depuis la version 2.28+, l'admin panel (:8080) permet de fixer le point d'accès WiFi :

1. Accéder à `http://neopro.local:8080` ou `http://192.168.4.1:8080`
2. Onglet **Réseau**
3. Section **Réseaux WiFi disponibles** → Cliquer **Scanner**
4. L'interface affiche tous les APs, groupés par SSID
   - Si un SSID a plusieurs APs, ils sont listés avec leur BSSID, canal et signal
5. Cliquer **Connecter** sur l'AP avec le meilleur signal
6. Cocher **🔒 Fixer ce point d'accès (évite le roaming)** (coché par défaut)
7. Entrer le mot de passe WiFi et valider

**Vérification :**

```bash
# Voir si le BSSID est fixé dans wpa_supplicant
ssh pi@neopro.local 'grep -A5 "network={" /etc/wpa_supplicant/wpa_supplicant-wlan1.conf'

# Exemple avec BSSID fixé :
# network={
#     ssid="MonWiFi"
#     psk="xxx"
#     bssid=AA:BB:CC:DD:EE:FF
# }
```

**Diagnostic depuis le dashboard central :**

Dans l'onglet Debug d'un site, la section "Hotspot WiFi" affiche :

- SSID du hotspot
- Channel utilisé
- Nombre de clients connectés
- État actif/inactif

**Note :** Cette solution ne fonctionne que si le Pi reste à proximité de l'AP sélectionné. Si le Pi est déplacé, il faudra refixer un nouveau BSSID.

---

### 5. Le hotspot WiFi est invisible ou instable après déplacement du boîtier

**Symptômes :**

- Le SSID `NEOPRO-XXX` n'apparaît pas dans la liste des réseaux WiFi
- Le SSID apparaît puis disparaît
- Connexion impossible ou très lente

**Causes fréquentes :**

1. **Interférences sur le channel 6** - Dans un nouveau lieu (gymnase, salle des fêtes), beaucoup de réseaux WiFi peuvent utiliser le même canal
2. **Alimentation insuffisante** - Le Pi est branché sur un port USB de TV ou hub non alimenté (voltage < 5V)
3. **Distance/obstacles** - Le WiFi 2.4GHz a une portée limitée (~10-15m), les murs épais ou structures métalliques bloquent le signal

**Solution automatique au boot (v2.28+) :**

Depuis la version 2.28, le Pi **optimise automatiquement le canal WiFi au démarrage** :

- Au boot, scanne les canaux 1, 6, 11 (non-overlapping 2.4GHz)
- Si le canal actuel a >= 3 réseaux voisins, switch vers le canal le moins encombré
- Redémarre hostapd pour appliquer le nouveau canal
- Log dans `/var/log/neopro-hotspot-optimizer.log`

**Vérifier si l'optimizer a changé le canal :**

```bash
cat /var/log/neopro-hotspot-optimizer.log
# Exemple de sortie :
# [2026-01-18 10:30:00] Channel 6 is congested (>= 3 networks)
# [2026-01-18 10:30:01] Switching from channel 6 to 1
# [2026-01-18 10:30:02] SUCCESS: Hotspot now on channel 1
```

**Diagnostic et réparation depuis le dashboard central (v2.33+) :**

1. Aller dans l'onglet **Debug** du site
2. Section **Hotspot WiFi** → Cliquer **Réparer automatiquement**
3. Si un changement de canal est nécessaire, un modal de confirmation apparaît
4. Choisir **Redémarrer maintenant** (applique immédiatement) ou **Plus tard** (appliqué au prochain reboot)

**Diagnostic et réparation depuis l'admin panel (:8080) :**

1. Accéder à `http://neopro.local:8080` ou `http://192.168.4.1:8080`
2. Onglet **Réseau** → Section **Diagnostic Hotspot WiFi**
3. Cliquer **🔍 Diagnostiquer** pour voir l'état actuel
4. Cliquer **🔧 Réparer automatiquement** pour corriger

**Diagnostic et réparation via SSH :**

```bash
# Sur le Pi (via Ethernet ou écran+clavier)
cd /home/pi/neopro/scripts

# Mode diagnostic (affiche les problèmes sans corriger)
./fix-hotspot.sh

# Mode auto-fix (prépare le changement de canal - reboot requis)
./fix-hotspot.sh --auto-fix

# Mode JSON pour intégration dashboard/admin
./fix-hotspot.sh --json --auto-fix

# Redémarrer immédiatement après correction
./fix-hotspot.sh --auto-fix --reboot-now
```

**Ce que fait le script :**

- Vérifie l'alimentation (détecte sous-voltage)
- Scanne les canaux WiFi et trouve le moins encombré (1, 6 ou 11)
- Vérifie hostapd, dnsmasq, rfkill
- Change le canal dans la config **sans redémarrer hostapd** (préserve wlan1)
- Le changement sera effectif au prochain reboot du Pi

**⚠️ IMPORTANT (v2.33+)** : Le script ne redémarre plus automatiquement hostapd car cela coupe la connexion WiFi cliente (wlan1). Un reboot est requis pour appliquer le changement de canal. Cela permet de garder l'accès à distance au Pi.

**Changer manuellement le channel :**

```bash
# Voir le channel actuel
grep "^channel=" /etc/hostapd/hostapd.conf

# Passer en channel 1 (souvent moins encombré que 6)
sudo sed -i 's/channel=6/channel=1/' /etc/hostapd/hostapd.conf
# Le changement sera appliqué au prochain reboot
sudo reboot
```

**Vérifier l'alimentation :**

```bash
vcgencmd get_throttled
# 0x0 = OK (aucun événement)
# Problèmes d'alimentation réels (bits 0 et 16) :
#   - 0x1 ou 0x10001 = Sous-voltage actuel ou passé → changer d'alimentation 5V/3A
# Événements thermiques (informatifs, pas un problème d'alimentation) :
#   - 0x80000 = Limite température soft passée (historique)
#   - 0x40000 = Throttling thermique passé (historique)
#   - 0x20000 = Bridage fréquence passé (historique)
```

**Vérifier rfkill (blocage WiFi) :**

```bash
rfkill list
# Si "Soft blocked: yes" → débloquer avec :
sudo rfkill unblock wifi
```

### 5b. Connexion wlan1 instable en environnement mesh WiFi (répéteurs)

**Symptômes :**

- Le site passe fréquemment Hors Ligne puis revient En Ligne
- Déconnexions après reboot ou changement de canal hotspot
- Le lieu utilise des répéteurs WiFi ou un réseau mesh (plusieurs APs avec le même SSID)

**Diagnostic :**

```bash
# Voir les réseaux WiFi disponibles (plusieurs APs avec le même SSID = mesh)
sudo iwlist wlan1 scan | grep -E "ESSID|Address|Channel|Signal"

# Si vous voyez plusieurs lignes avec le même SSID mais des BSSID différents → environnement mesh
# Exemple :
#   Cell 01 - Address: 34:3A:20:15:02:40  ESSID:"NLFH"  Channel:1   Signal:-58 dBm
#   Cell 02 - Address: 34:3A:20:16:B3:E0  ESSID:"NLFH"  Channel:6   Signal:-72 dBm
#   Cell 03 - Address: 34:8A:12:30:0B:00  ESSID:"NLFH"  Channel:11  Signal:-64 dBm
```

**⚠️ IMPORTANT : Ne JAMAIS verrouiller le BSSID en environnement mesh**

En mesh WiFi, le dongle USB doit pouvoir choisir automatiquement le meilleur point d'accès selon le signal. Un verrouillage BSSID (`bssid=XX:XX:XX:XX:XX:XX` dans wpa_supplicant) empêche ce roaming et peut causer des déconnexions si l'AP verrouillé devient inaccessible.

**Vérifier si un BSSID est verrouillé :**

```bash
grep "bssid=" /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
# Si une ligne bssid= existe → SUPPRIMER
sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
sudo wpa_cli -i wlan1 reconfigure
```

**Solution : Optimiser wpa_supplicant pour environnement mesh**

La config par défaut peut causer des scans WiFi agressifs qui perturbent la connexion. Ajouter `bgscan` pour un roaming contrôlé :

```bash
# Backup
sudo cp /etc/wpa_supplicant/wpa_supplicant-wlan1.conf /etc/wpa_supplicant/wpa_supplicant-wlan1.conf.backup

# Éditer la config
sudo nano /etc/wpa_supplicant/wpa_supplicant-wlan1.conf
```

**Config optimisée pour mesh :**

```
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=FR

network={
    ssid="NOM_DU_RESEAU"
    psk=MOT_DE_PASSE_OU_HASH
    priority=10
    id_str="club_wifi"
    bgscan="simple:30:-70:300"
    scan_ssid=0
}
```

**Explication des paramètres :**

| Paramètre     | Valeur              | Effet                                                                                      |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| `bgscan`      | `simple:30:-70:300` | Scan en background : toutes les 300s si signal > -70dBm, toutes les 30s si signal < -70dBm |
| `scan_ssid=0` | Désactivé           | Pas de probe actif (optimisation si le SSID n'est pas caché)                               |

**Appliquer sans reboot :**

```bash
sudo wpa_cli -i wlan1 reconfigure
# Vérifier la connexion
iwconfig wlan1 | grep -E "ESSID|Signal"
```

**Si le signal est faible (< -75 dBm) :**

1. **Améliorer le dongle USB** : Utiliser un dongle avec antenne externe (gain 5dBi+) comme le TP-Link Archer T2U Plus ou similaire avec chipset Realtek RTL8812AU
2. **Rapprocher le Pi** d'un des points d'accès mesh si possible
3. **Envisager l'Ethernet** si disponible dans le lieu (solution la plus fiable)

**Comprendre les reason codes de déconnexion WiFi :**

Les logs `wpa_supplicant` affichent un `reason=X` lors des déconnexions. Voici les codes les plus fréquents :

| Code   | Nom                         | Signification                | Action                                   |
| ------ | --------------------------- | ---------------------------- | ---------------------------------------- |
| **1**  | UNSPECIFIED                 | Raison non spécifiée         | Vérifier les logs AP                     |
| **2**  | AUTH_NOT_VALID              | Authentification invalide    | Vérifier le mot de passe                 |
| **3**  | DEAUTH_LEAVING              | Le client quitte le BSS      | Normal si `locally_generated=1` (bgscan) |
| **4**  | DISASSOC_INACTIVITY         | Inactivité détectée          | Vérifier power management                |
| **6**  | CLASS2_FRAME                | Frame classe 2 non autorisée | Problème d'association                   |
| **7**  | CLASS3_FRAME                | Frame classe 3 non autorisée | Problème d'authentification              |
| **8**  | DISASSOC_STA_LEFT           | Le STA quitte le réseau      | Normal lors d'un roaming                 |
| **15** | 4WAY_HANDSHAKE_TIMEOUT      | Timeout handshake            | Problème de mot de passe ou AP surchargé |
| **16** | GROUP_KEY_HANDSHAKE_TIMEOUT | Timeout group key            | AP surchargé, firmware bugué             |

**Drapeaux complémentaires :**

- `locally_generated=1` → La déconnexion est initiée par le Pi (souvent bgscan qui cherche mieux)
- `locally_generated=0` → La borne a éjecté le Pi (surcharge, timeout, sécurité)

**Exemple typique en mesh (signal limite ~-70/-75 dBm) :**

```
DISCONNECTED bssid=XX:XX:XX reason=3 locally_generated=1  ← bgscan cherche mieux
CONNECTED    bssid=XX:XX:XX completed [id=0]               ← reconnecté 2s après (même borne)
```

Ce comportement est **normal** et géré automatiquement par le NetworkWatchdog. Les coupures durent 1-3 secondes et n'impactent pas la lecture vidéo (vidéos locales sur le Pi).

**Protections automatiques (v3.7.14+) :**

Depuis la v3.7.14, le NetworkDetector et NetworkWatchdog incluent des protections supplémentaires pour les environnements mesh :

| Protection                           | Détail                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------- |
| **Debounce 120s** (NetworkDetector)  | Le profil réseau n'est pas réévalué plus d'une fois toutes les 120s       |
| **Grace period 60s au boot**         | Pas de recovery WiFi pendant les 60 premières secondes après le démarrage |
| **Recovery progressive (4 phases)**  | Escalade graduelle au lieu de `wpa_cli reconfigure` agressif              |
| **Écriture atomique wpa_supplicant** | Écriture dans un fichier temporaire + `mv` atomique (pas de corruption)   |

**Les 4 phases de recovery progressive :**

| Phase | Délai  | Action                                            |
| ----- | ------ | ------------------------------------------------- |
| 1     | 0-30s  | Attente passive (laisse le driver se reconnecter) |
| 2     | 30-60s | `wpa_cli -i wlan1 reassociate`                    |
| 3     | 60-90s | `wpa_cli -i wlan1 reconfigure`                    |
| 4     | 90s+   | `dhclient -r wlan1 && dhclient wlan1`             |

Maximum 5 tentatives de recovery, cooldown de 300s (5 min) entre les cycles.

### 6. Flash noir entre les vidéos sur boucles longues (20+ vidéos)

**Symptômes :**

- Écran noir visible (~1-3s) entre la dernière et la première vidéo de la boucle
- Ne se produit pas avec des boucles courtes (8-10 vidéos)
- Flash uniquement au "wrap" (retour à la vidéo 0)

**Cause racine (corrigée en v3.9.1) :**

Deux bugs combinés :

1. **Listeners `timeupdate` jamais enregistrés** : le preload anticipé (1.5s avant la fin) et l'early switch (0.5s avant la fin) étaient du code mort. Chaque transition attendait l'event `ended` puis lançait le preload from scratch.
2. **Cache disque OS évincé** : avec 20+ vidéos, la vidéo 0 n'est plus dans le page cache Linux quand on y revient après 19 autres fichiers. Le preload depuis la carte SD prend trop longtemps.

**Solution (v3.9.1) :**

- Enregistrement des listeners `timeupdate` (active preload anticipé + early switch)
- `warmDiskCache()` préchauffe le page cache kernel via `fetch()` à mi-vidéo pour les 3 prochaines vidéos
- Supporte les boucles de 100+ vidéos sans flash

### 7. Chromium crash "Aw, Snap! Error code: 5" après 1-2h de boucle vidéo

**Symptômes :**

- L'écran TV affiche "Aw, Snap!" avec le message "Error code: 5"
- Le bouton "Reload" est affiché mais personne n'est là pour cliquer
- Nécessite un reboot manuel (débrancher/rebrancher)
- Après reboot, écran blanc

**Note (v3.9.1) :** Le cleanup agressif des buffers décodeur GPU (`cleanupInactivePlayer()`) après chaque switch maintient la mémoire Chromium stable (~50-60MB) quel que soit le nombre de vidéos, réduisant significativement les crash OOM.

#### ⚠️ IMPORTANT : Raspberry Pi 5 vs Pi 4

Le problème et la solution diffèrent selon le modèle de Raspberry Pi :

| Modèle                 | GPU           | Problème                       | Solution                                     |
| ---------------------- | ------------- | ------------------------------ | -------------------------------------------- |
| **Pi 4 et antérieurs** | VideoCore VI  | Mémoire GPU insuffisante       | Configurer `gpu_mem=256`                     |
| **Pi 5**               | VideoCore VII | Pas de décodeur H.264 hardware | Utiliser SwiftShader (seule solution stable) |

**Identifier le modèle :**

```bash
cat /proc/device-tree/model
# Exemple: "Raspberry Pi 5 Model B Rev 1.0"
```

---

#### Solution pour Raspberry Pi 4 (et antérieurs)

**Cause racine : Mémoire GPU insuffisante**

Le Raspberry Pi OS Lite alloue par défaut très peu de mémoire au GPU (parfois 4 Mo seulement). Avec 4 players vidéo HTML5 + canvas pour les transitions, le GPU finit par saturer.

**Diagnostic :**

```bash
# Vérifier la mémoire GPU (CRITIQUE)
vcgencmd get_mem gpu
# Si affiche "gpu=4M" ou moins de 128M → C'EST LE PROBLÈME
```

**Solution :**

```bash
# Ajouter gpu_mem=256 à la config
echo "gpu_mem=256" | sudo tee -a /boot/config.txt && sudo reboot

# Vérifier après reboot :
vcgencmd get_mem gpu
# Doit afficher : gpu=256M
```

---

#### Solution pour Raspberry Pi 5

**Cause racine : Pas de décodeur H.264 hardware**

Le Pi 5 (BCM2712) a **supprimé le décodeur H.264 hardware**. Seul H.265/HEVC est accéléré par le GPU. Sur le Pi 5, `gpu_mem` est ignoré (mémoire partagée dynamique CMA).

**Note :** Sur Pi 5, `vcgencmd get_mem gpu` retourne toujours `gpu=4M` - c'est une valeur legacy, pas un problème.

**Solution : V3D Mesa + décodage vidéo software (v3.26.1+)**

Le Pi 5 utilise le **driver V3D natif (Mesa)** pour le compositing GPU, mais le **décodage vidéo hardware est désactivé**. Sans cette désactivation, Chromium tente de créer des `SharedImage` GPU pour les frames vidéo 1080p (format `Y_UV, 420`) via le backend `shared_memory`, ce que le driver V3D ne supporte pas — provoquant des erreurs `SharedImageBackingFactory` toutes les ~5s et un crash loop du watchdog.

Le Pi 5 (quad Cortex-A76 2.4GHz) a largement la puissance pour décoder du 1080p en software.

Le `kiosk-watchdog.sh` utilise les flags suivants pour Pi 5 :

```bash
# Flags spécifiques Pi 5 (v3.26.1+)
--ignore-gpu-blocklist
--enable-gpu-rasterization
--disable-features=VaapiVideoDecoder,UseChromeOSDirectVideoDecoder
--disable-gpu-memory-buffer-video-frames

# Flags communs (Pi 4 et Pi 5)
--disable-dev-shm-usage
--disable-checker-imaging
```

**Explication des flags Pi 5 :**

| Flag                                       | Effet                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `--ignore-gpu-blocklist`                   | Force l'utilisation du GPU même si le modèle est dans la blocklist         |
| `--enable-gpu-rasterization`               | Active la rastérisation GPU pour de meilleures performances                |
| `--disable-features=VaapiVideoDecoder,…`   | Désactive le décodage vidéo hardware (cause des SharedImage errors)        |
| `--disable-gpu-memory-buffer-video-frames` | Empêche l'allocation de GpuMemoryBuffer pour les frames vidéo              |
| `--disable-dev-shm-usage`                  | Utilise /tmp au lieu de /dev/shm (évite les problèmes de mémoire partagée) |
| `--disable-checker-imaging`                | Désactive le décodage checker (réduit la charge CPU)                       |

**Historique des tentatives :**

| Version | Solution                             | Résultat                                                           |
| ------- | ------------------------------------ | ------------------------------------------------------------------ |
| v2.27   | SwiftShader                          | Rendu CPU, stable mais vidéos saccadées en 1080p                   |
| v3.7.2  | EGL natif + Vulkan                   | Erreurs SharedImageStub toutes les 5 secondes                      |
| v3.7.2  | Retour SwiftShader                   | Toujours trop lent pour vidéo 1080p                                |
| v3.7.3  | V3D natif (Mesa) sans flags          | Fonctionnel mais SharedImageBackingFactory crash loop en kiosk     |
| v3.26.1 | **V3D Mesa + video decode software** | **Solution actuelle** — compositing GPU, décodage software, stable |

**Mise à jour depuis une ancienne version :**

```bash
# Copier le nouveau kiosk-watchdog.sh
scp raspberry/scripts/kiosk-watchdog.sh pi@<IP>:/home/pi/neopro/scripts/
# Redémarrer le kiosk
ssh pi@<IP> 'sudo systemctl restart neopro-kiosk'
```

**Vérifier que les bons flags sont actifs :**

```bash
# Vérifier que le décodage vidéo hardware est désactivé
pgrep -a chromium | grep -o "disable-features=[^ ]*"
# Doit afficher: disable-features=VaapiVideoDecoder,UseChromeOSDirectVideoDecoder

# Vérifier qu'il n'y a PAS de flags SwiftShader/EGL
pgrep -a chromium | grep -E "use-gl|use-angle|swiftshader"
# Aucun résultat = OK (V3D natif actif)
```

**Note :** Le script `kiosk-watchdog.sh` détecte automatiquement le modèle de Pi et applique les bons flags (GPU hardware pour Pi 4, V3D Mesa + video decode software pour Pi 5).

---

#### Solutions complémentaires (filets de sécurité)

Depuis la version 2.24+, deux systèmes de récupération automatique sont en place :

1. **Watchdog Kiosk** (`/home/pi/neopro/scripts/kiosk-watchdog.sh`) :
   - Détecte automatiquement Pi 4 vs Pi 5 et applique les bons flags GPU
   - Surveille le titre de la fenêtre Chromium (détecte "Aw, Snap!", "Error", "Oups")
   - Surveille les erreurs GPU driver via journalctl (`AllocateRingBuffer`, `kFatalFailure`) — >3 erreurs en 2 min déclenche un recovery (seuil abaissé de 10 à 3 pour détecter avant la mort de Chromium)
   - Écrit le statut dans `/home/pi/neopro/data/kiosk-status.json` (lu par le sync-agent, remonté au central via heartbeat → alertes `kiosk_crash` / `kiosk_unstable`)
   - Tue Chromium, vide le cache, libère la mémoire GPU, relance
   - Anti-boucle : attend 60s après 3 crashs en 5 min

2. **Error Recovery TV** (dans le composant Angular) :
   - Error handlers sur les 4 players vidéo
   - Watchdog vérifie que la vidéo progresse toutes les 10s
   - Full reset après 3 erreurs consécutives
   - Cleanup mémoire toutes les 30 min ou après 50 vidéos

**Vérifier que le watchdog est actif :**

```bash
# Statut du service kiosk
sudo systemctl status neopro-kiosk

# Logs du watchdog (vérifier le modèle détecté)
sudo tail -50 /var/log/neopro-kiosk-watchdog.log
# Doit afficher le modèle détecté (pi5 ou pi4)
```

**Note :** Les nouvelles installations (v2.24+) configurent automatiquement `gpu_mem=256` pour les Pi 4 et antérieurs via le script `install.sh`.

### 7. Vidéos manuelles coupées avant la fin sur navigateur PC (neopro.local/tv)

**Symptômes :**

- La vidéo manuelle (déclenchée par la télécommande) ne joue pas jusqu'au bout sur un navigateur PC
- La boucle réapparaît derrière la vidéo manuelle avant sa fin
- Pas de problème sur Chromium/Pi (le HW overlay masque le bug)

**Cause racine (corrigée en v3.26.4) :**

Le `onTimeUpdate()` de la boucle arrière-plan ne vérifiait pas `isManualMode`. Quand la boucle atteignait 0.5s de sa fin, l'early switch déclenchait `hideBlackOverlay()`, retirant le masque noir (z-index 5) qui protégeait la vidéo manuelle. Sur Chromium/Pi, le décodeur hardware compose les vidéos en HW overlay indépendamment des z-index CSS, donc le bug était invisible. Sur un navigateur desktop, le compositing CSS/DOM exposait la boucle derrière la vidéo manuelle.

**Solution (v3.26.4) :**

- Ajout de `if (this.isManualMode) return;` dans `onTimeUpdate()` pour bloquer l'early switch pendant les vidéos manuelles
- Protection de tous les `hideBlackOverlay()` dans `switchPlayers()`, `playOnActivePlayer()` et `startSeamlessLoop()` avec `if (!this.isManualMode)`

### 7b. Boucle vidéo reprend au début après une vidéo manuelle (logo Neopro)

**Symptômes :**

- Depuis la télécommande, on lance une vidéo manuelle
- La vidéo joue correctement
- Au retour en boucle, la boucle repart de la vidéo 0 (le logo Neopro) au lieu de reprendre là où elle en était

**Cause racine (corrigée en v3.60.1) :**

Pendant le mode manuel, `onVideoEnded()` ignore les events de la boucle (`isManualMode` guard, ligne 1877). La boucle arrière-plan meurt car la vidéo en cours se termine sans transition vers la suivante. À la fin de la vidéo manuelle, `onManualEnded()` détecte la boucle morte et appelle `startSeamlessLoop()` qui faisait `currentLoopIndex = 0` inconditionnellement.

**Solution (v3.60.1) :**

- `_savedLoopIndex` sauvegarde la position courante avant d'entrer en mode manuel
- `startSeamlessLoop(resumeIndex?)` accepte un index de reprise optionnel (clampé via modulo)
- `onManualEnded()` passe `_savedLoopIndex + 1` pour reprendre à la vidéo suivante

**Vérification :**

```bash
# Dans la console navigateur (/tv), on doit voir :
# "tv player : loop died during manual, restarting at index 5"  (au lieu de 0)
# "[TV] Starting loop with 12 videos at index 5"                (au lieu de "at index 0")
```

**Monitoring :** Le `PlayerState` remonté au central via heartbeat affiche désormais le bon `loopIndex` après reprise (visible dans le dashboard monitoring du site).

### 8. Vidéos ne se chargent pas

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

### 9. Alerting crash "is not valid JSON" sur checkHourlyMetrics

**Erreur :**

```
Error checking hourly metrics: Unexpected token 'e', "email" is not valid JSON
    at JSON.parse (<anonymous>)
    at AlertingService.mapThresholdRow
```

**Cause :** La colonne `notify_channels` (JSONB) de la table `alert_thresholds` contient une chaîne brute (ex: `email`) au lieu d'un tableau JSON valide (ex: `["email"]`). Typiquement causé par une insertion SQL manuelle ou une migration incomplète.

**Impact :** Le service d'alerting crashe sur `checkHourlyMetrics` — aucune alerte n'est évaluée tant que la donnée corrompue existe.

**Solution :**

```sql
-- Identifier les lignes corrompues
SELECT id, name, notify_channels
FROM alert_thresholds
WHERE notify_channels IS NOT NULL
  AND jsonb_typeof(notify_channels) != 'array';

-- Corriger les valeurs brutes en tableaux JSON
UPDATE alert_thresholds
SET notify_channels = jsonb_build_array(notify_channels #>> '{}')
WHERE jsonb_typeof(notify_channels) != 'array';
```

**Prévention :** Depuis v3.31.0, `mapThresholdRow` utilise un parser défensif (`parseNotifyChannels`) qui gère les chaînes brutes, tableaux, null, et JSON strings sans crasher.

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

## CI/CD et Release

### Semantic Release échoue avec EGITNOPERMISSION

#### Erreur

```
SemanticReleaseError: Cannot push to the Git repository.
code: 'EGITNOPERMISSION'
```

#### Cause

Le token utilisé par le workflow `release.yml` n'a pas les permissions pour pusher des tags et commits sur `main`. Le workflow utilise le secret `RELEASE_TOKEN` (PAT Classic avec scope `repo`).

#### Diagnostic

```bash
# Vérifier que le secret existe
gh secret list --repo Tallec7/neopro

# Vérifier les branch protection rules
gh api repos/Tallec7/neopro/branches/main/protection

# Vérifier les rulesets
gh api repos/Tallec7/neopro/rulesets
```

#### Solution

1. Aller sur **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Créer ou régénérer un PAT avec le scope **`repo`**
3. Mettre à jour le secret dans **Repo → Settings → Secrets → Actions → `RELEASE_TOKEN`**
4. Relancer le workflow : `gh run rerun <run_id> --repo Tallec7/neopro`

> **Note** : Le `GITHUB_TOKEN` par défaut ne suffit pas pour semantic-release car il ne peut pas pusher de commits/tags sur `main`.

---

## NetworkWatchdog — Auto-recovery réseau (v3.36+)

Depuis la v3.36, le NetworkWatchdog (intégré au sync-agent) démarre **dès le boot**, avant la connexion Socket.IO au cloud. Il surveille wlan0, wlan1 et la connexion cloud indépendamment.

### Changements clés (v3.36+)

- **Démarrage au boot** : le watchdog n'attend plus l'authentification cloud pour démarrer
- **Pas de process.exit** : le sync-agent ne se tue plus après 10 échecs de connexion — il attend 30s puis retente, laissant le watchdog actif
- **6 phases de recovery** pour wlan1 : reconfigure → interface down/up → systemctl restart → modprobe driver → USB power-cycle

### Vérifier que le watchdog tourne

```bash
# Logs du watchdog réseau (dans les logs du sync-agent)
journalctl -u neopro-sync-agent --since "1 hour ago" --no-pager | grep -i "watchdog\|recovery\|wlan1"

# Vérifier le démarrage au boot
journalctl -u neopro-sync-agent --since "boot" | grep "Starting network watchdog"
```

### Le watchdog ne tente pas de recovery ?

Causes possibles :

1. **Grace period active** : après un `wpa_cli reconfigure` ou un auto-optimize, le watchdog attend 60s avant de checker. Vérifier : `grep "grace period" /tmp/neopro-watchdog-grace.json`
2. **Cooldown actif** : après 6 tentatives échouées, 5 min de cooldown. Vérifier les logs pour "Trop de tentatives"
3. **Connexion Ethernet détectée** : si eth0 a une IP, le watchdog ne tente pas de recovery WiFi (problème physique)

---

## Hotspot Watchdog (v2.34+)

Depuis la version 2.34, un service de surveillance du hotspot est actif par défaut.

### Fonctionnement

Le watchdog vérifie toutes les 30 secondes :

- hostapd actif
- wlan0 en mode AP
- dnsmasq actif
- WiFi non bloqué par rfkill
- IP 192.168.4.1 configurée

En cas de problème, il tente une récupération automatique (max 3 tentatives, cooldown 5 min).

**Installation :** Depuis la v3.7.14, `install.sh` enregistre automatiquement le service `neopro-hotspot-watchdog` ainsi que `neopro-sync-guardian` et `neopro-hotspot-optimizer`. Pour les Pi installés avant cette version, utiliser `fix-fleet-pi.sh` pour installer les services manquants.

### Auto-optimisation canal WiFi (v3.61+)

Le sync-agent optimise automatiquement le canal du hotspot au boot (30s après démarrage) et toutes les heures. Il scanne les réseaux WiFi visibles et bascule vers le canal le moins congestionné (1, 6 ou 11).

**Seuils :** Congestion ≥ 5 réseaux sur le canal actuel, amélioration ≥ 3 réseaux vs meilleur canal.

**Diagnostic :**

```bash
# Vérifier si l'auto-optimisation a agi
journalctl -u neopro-sync-agent --since "1 hour ago" | grep -i "hotspot channel"

# Canal actuel
grep "^channel=" /etc/hostapd/hostapd.conf

# Scan des réseaux par canal
sudo iwlist wlan0 scan 2>/dev/null | grep "Channel:" | sort | uniq -c | sort -rn
```

### Commandes utiles

```bash
# Voir le statut actuel
/home/pi/neopro/scripts/hotspot-watchdog.sh --status

# Voir les logs du watchdog
tail -f /var/log/neopro-hotspot-watchdog.log

# Redémarrer le service
sudo systemctl restart neopro-hotspot-watchdog

# Vérifier que le service est actif
sudo systemctl status neopro-hotspot-watchdog
```

### Désactiver le watchdog (déconseillé)

```bash
sudo systemctl stop neopro-hotspot-watchdog
sudo systemctl disable neopro-hotspot-watchdog
```

---

## Blocage BSSID Lock en Mesh (v2.34+)

Depuis la version 2.34, le verrouillage BSSID est **bloqué automatiquement** en environnement mesh.

### Comment ça fonctionne

1. **Admin Panel (`:8080`)** : Le checkbox "Verrouiller BSSID" est désactivé si plusieurs APs avec le même SSID sont détectés
2. **Validation serveur** : Même si le frontend est contourné, le backend refuse la requête
3. **Dashboard central** : Un avertissement apparaît si un BSSID lock est détecté en mesh

### Supprimer un BSSID lock existant

```bash
# Via admin panel
http://neopro.local:8080 → Onglet Réseau → Bouton "Supprimer le verrouillage"

# Ou manuellement
sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant.conf
sudo wpa_cli -i wlan1 reconfigure
```

---

## Curseur souris visible sur la TV

Depuis la v3.45, le curseur est masqué par triple protection : `unclutter-xfixes` (OS), CSS `cursor: none` sur `app-tv` (navigateur, scopé à la route `/tv` uniquement), et fallback `xdotool` (watchdog).

### Le curseur souris reste visible sur l'écran TV

**Causes possibles :**

1. `unclutter-xfixes` n'est pas installé (ancien paquet `unclutter` insuffisant sur Pi 4/5 + Bookworm)
2. L'autostart LXDE ne contient pas la commande `@unclutter`
3. L'application Angular n'a pas été re-déployée (manque `cursor: none` CSS sur le composant `app-tv`)

**Diagnostic :**

```bash
# Vérifier que unclutter-xfixes est installé (pas l'ancien unclutter)
dpkg -l | grep unclutter
# Attendu : ii  unclutter-xfixes  (PAS unclutter tout court)

# Vérifier que le processus tourne
pgrep -a unclutter
# Attendu : unclutter -idle 0 -root

# Vérifier l'autostart LXDE
cat /home/pi/.config/lxsession/LXDE-pi/autostart | grep unclutter
# Attendu : @unclutter -idle 0 -root

# Vérifier le CSS dans le build Angular
grep -r "cursor.*none" /home/pi/neopro/webapp/styles*.css 2>/dev/null
# Attendu : cursor:none
```

**Solutions :**

```bash
# 1. Remplacer unclutter par unclutter-xfixes
sudo apt-get remove -y unclutter 2>/dev/null
sudo apt-get install -y unclutter-xfixes

# 2. Corriger l'autostart LXDE
grep -q "unclutter" /home/pi/.config/lxsession/LXDE-pi/autostart || \
  echo "@unclutter -idle 0 -root" >> /home/pi/.config/lxsession/LXDE-pi/autostart

# 3. Redémarrer pour appliquer
sudo reboot
```

> **Note :** Le CSS `cursor: none` est scopé au composant `app-tv` (route `/tv` uniquement) pour ne pas masquer le curseur sur `/remote` et les autres routes. Si seule la couche CSS est active (pas d'`unclutter`), le curseur sera invisible sur `/tv` dans Chromium mais visible si on sort de la fenêtre navigateur (alt-tab accidentel). `unclutter-xfixes` le masque globalement au niveau X11.

---

## Écran / HDMI (v3.44+)

Depuis la v3.44, le Pi détecte automatiquement l'écran connecté via EDID et adapte l'affichage dashboard en conséquence.

### Le dashboard affiche "❓ Non détecté" pour l'alimentation TV

**Cause :** Le Pi est connecté à un **moniteur PC** qui ne supporte pas HDMI-CEC. C'est un comportement normal.

**Vérification :**

```bash
# Vérifier le type d'écran détecté
curl -s http://localhost:3000/api/hdmi-status | python3 -m json.tool
# Chercher "display_type": "monitor" dans la réponse
```

**Résultat attendu (v3.44+) :** Le dashboard affiche "🖥️ Écran (Moniteur PC)" avec le nom du modèle, et masque les métriques CEC non pertinentes.

### L'écran est connecté mais le dashboard affiche "Aucun écran détecté"

**Causes possibles :**

1. Le fichier EDID est vide (écran éteint ou câble HDMI défectueux)
2. Le répertoire `/sys/class/drm/` ne contient pas d'entrée HDMI

**Diagnostic :**

```bash
# Lister les connecteurs DRM
ls /sys/class/drm/ | grep HDMI
# Exemple attendu : card1-HDMI-A-1

# Vérifier la taille du fichier EDID (> 0 = écran connecté)
stat /sys/class/drm/card1-HDMI-A-1/edid
# size: 256 → écran connecté, size: 0 → pas d'écran ou câble défectueux

# Lire les données EDID brutes (si edid-decode est installé)
cat /sys/class/drm/card1-HDMI-A-1/edid | edid-decode 2>/dev/null
```

**Solutions :**

- Vérifier le câble HDMI (essayer un autre câble)
- Vérifier que l'écran est allumé (l'EDID est envoyé uniquement quand l'écran est actif)
- Sur Pi 5 : vérifier que le driver DRM est correctement chargé (`ls /sys/class/drm/`)

### Le type d'écran est "unknown" au lieu de "tv" ou "monitor"

**Cause :** L'heuristique n'a pas pu déterminer le type. Cela arrive si :

- `cec-client` n'est pas installé (`sudo apt install cec-utils`)
- L'EDID ne contient pas de CEA extension block (TV ancienne ou exotique)
- CEC est désactivé dans les paramètres de la TV

**Solution :** Installer `cec-utils` et vérifier que CEC est activé dans les réglages de la TV (souvent sous "Anynet+", "SimpLink", "Bravia Sync", "VIERA Link" selon le fabricant).

---

## Recording Analytics — État d'enregistrement (v3.38+)

Le tracking analytics (video plays + impressions sponsors) n'est actif que si `RecordingStateService.isRecording === true`. Depuis v3.43+, le recording se coupe automatiquement au retour en phase `neutral` et démarre temporairement pour les vidéos manuelles.

### Le recording ne s'active pas en phase match

**Symptôme :** `isRecording` reste `false` après le passage en phase `before`/`during`/`after`.

**Diagnostic :**

```bash
# Dans la console navigateur (onglet /remote) :
# Vérifier l'état du service RecordingStateService
# L'indicateur REC devrait apparaître en haut de la télécommande
```

**Causes possibles :**

- La télécommande n'appelle pas `RecordingStateService.onPhaseChange()`
- Le BroadcastChannel ou Socket.IO ne synchronise pas l'état entre les onglets

### Les analytics des vidéos manuelles ne sont pas enregistrées

**Symptôme :** En neutral (boot), lancer une vidéo manuelle ne génère pas d'entrée analytics.

**Diagnostic :**

```bash
# Vérifier le buffer analytics après la vidéo :
cat ~/neopro/data/analytics_buffer.json
cat ~/neopro/data/sponsor_impressions.json
```

**Solution (v3.43.2+) :** Le `TvComponent` démarre temporairement le recording dans `play()` et le coupe dans `onManualEnded()`. Vérifier que le build est à jour.

### Le recording ne se coupe pas au retour en boucle par défaut

**Symptôme :** Après une phase de match, le retour en `neutral` laisse le recording actif pendant 15+3 min.

**Solution (v3.43.2+) :** `onPhaseChange('neutral')` appelle `stopRecording(false)` immédiatement (sauf override manuel). Vérifier la version du build.

### La TV ne revient pas en boucle par défaut après inactivité

**Symptôme :** Après 15+3 min sans interaction, le recording s'arrête mais la TV reste en phase match.

**Solution (v3.44.5+) :** La `RemoteComponent` souscrit à `inactivityExpired$` et appelle `switchPhase('neutral')`. Vérifier que la Remote est ouverte (elle gère la phase active).

---

## Saturation pool DB (MaxClientsInSessionMode)

### Symptôme

Tous les sites passent "Connexion instable" ou "Hors ligne" simultanément, même ceux en Ethernet. Les logs Railway montrent :

```
MaxClientsInSessionMode: max clients reached - in Session mode max clients are limited to pool_size
```

### Cause

Le pooler Supabase PgBouncer a deux modes :

- **Session Mode** (port 5432) : chaque connexion Node.js réserve une connexion PgBouncer pour toute la durée de vie du process
- **Transaction Mode** (port 6543) : les connexions sont partagées, empruntées le temps d'une transaction

En Session Mode, un restart Railway (ancien + nouveau process) doublait les connexions requises, saturant le pool.

### Vérification

```bash
# Vérifier le mode actuel (port dans DATABASE_URL)
railway variables --service neopro-central | grep DATABASE_URL
# Port 6543 = Transaction Mode ✅
# Port 5432 = Session Mode ⚠️

# Vérifier les logs de santé du pool (toutes les 5 min)
railway logs --service neopro-central --lines 10 --filter "pool saturated OR pool high utilization"
```

### Correction

Si le pool est en Session Mode (port 5432), passer en Transaction Mode :

```bash
# Changer le port dans DATABASE_URL
railway variables --set "DATABASE_URL=postgresql://...@pooler.supabase.com:6543/postgres" --service neopro-central

# Réduire le pool (5 suffisent en Transaction Mode)
railway variables --set "DB_POOL_MAX=5" --service neopro-central
```

### Monitoring

Le fichier `database.ts` logge l'état du pool toutes les 5 minutes :

- **`Database pool saturated`** (warn) : toutes les connexions occupées
- **`Database pool high utilization`** (warn) : > 80% d'utilisation
- **`Database pool health`** (debug) : état normal

Le mode pooler (`transaction` / `session` / `direct`) est loggé au démarrage et dans chaque log de santé.

---

**Dernière mise à jour :** 19 février 2026 (ajout section saturation pool DB)
