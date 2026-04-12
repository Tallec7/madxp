# Guide de dépannage Neopro

## Table des matières

1. [Problèmes SSH](#problèmes-ssh)
2. [Problèmes de connexion](#problèmes-de-connexion)
3. [Erreurs 500](#erreurs-500) (MIME type, **Admin HTML-as-JSON**, Pi /tv /remote, **rapports PDF**)
4. [Problèmes d'authentification](#problèmes-dauthentification)
5. [Services qui ne démarrent pas](#services-qui-ne-démarrent-pas)
6. [Problèmes de synchronisation](#problèmes-de-synchronisation)
7. [Problèmes de watermark (v3.50+)](#problèmes-de-watermark-v350)
8. [Diagnostic réseau à distance](#diagnostic-réseau-à-distance)
9. [Diagnostic complet](#diagnostic-complet)
10. [CI/CD et Release](#cicd-et-release) (EGITNOPERMISSION, **release bloquée "behind remote"**, smoke CI)
11. [NetworkWatchdog — Auto-recovery réseau (v3.36+)](#networkwatchdog--auto-recovery-réseau-v336)
12. [Hotspot Watchdog (v2.34+)](#hotspot-watchdog-v234)
13. [Blocage BSSID Lock en Mesh (v2.34+)](#blocage-bssid-lock-en-mesh-v234)
14. [Écran / HDMI (v3.44+)](#écran--hdmi-v344)
15. [Recording Analytics (v3.38+)](#recording-analytics--état-denregistrement-v338)
16. [Saturation pool DB (MaxClientsInSessionMode)](#saturation-pool-db-maxclientsinsessionmode)
17. [Cloud Remote ne fonctionne pas (v3.69.3+)](#cloud-remote-ne-fonctionne-pas-v3692)
18. [500/429 cascade sur GET /api/deployments (v3.82.1+)](#500429-cascade-sur-get-apideployments-v3821)
19. [Second écran ne s'affiche pas (v3.82.7+)](#second-écran-ne-saffiche-pas-v3827)
20. [Deux écrans désynchronisés (v3.82.10+)](#deux-écrans-désynchronisés-v38210)
21. [Déploiement vidéo secondaire échoué (EACCES / race condition)](#déploiement-vidéo-secondaire-échoué-eacces--race-condition)
22. [Résolution écran non affichée dans le dashboard (v3.87.4+)](#résolution-écran-non-affichée-dans-le-dashboard-v3874)
23. [Changement de profil ne fonctionne pas (v3.92.0+)](#changement-de-profil-ne-fonctionne-pas-v3920)
24. [Kiosk pas en plein écran à l'init avec HDMI-0 seul (v3.96+)](#kiosk-pas-en-plein-écran-à-linit-avec-hdmi-0-seul-v396)
25. [Ventilateur Active Cooler Pi 5 non détecté (v3.104.3+)](#ventilateur-active-cooler-pi-5-non-détecté-v31043)
26. [Kiosk pas en plein écran sur HDMI-1 (v3.111.1+)](#kiosk-pas-en-plein-écran-sur-hdmi-1-v31111)
27. [Vidéo gelée/lag sur navigateur PC (v3.114+)](#vidéo-geléelag-sur-navigateur-pc-v3114)
28. [Hotspot-watchdog restart loop sur Debian 13 Trixie (v3.116.33+)](#hotspot-watchdog-restart-loop-sur-debian-13-trixie-v311633)
29. [WiFi wlan1 drop après double scan RTL8192EU (v3.117.1+)](#wifi-wlan1-drop-après-double-scan-rtl8192eu-v31171)
30. [Vidéos de boucle "introuvables" après reconnexion site hors ligne (v3.115.2+)](#vidéos-de-boucle-introuvables-après-reconnexion-site-hors-ligne-v31152)
31. [Échec validation post-OTA (v3.116+)](#échec-validation-post-ota-v3116)
32. [Alerte canary post-OTA (v3.116+)](#alerte-canary-post-ota-v3116)
33. [Bgscan reconfigure loop — déconnexions WiFi auto-infligées (v3.116.25+)](#bgscan-reconfigure-loop--déconnexions-wifi-auto-infligées-v311625)
34. [OTA bloquée à 5% sur WiFi mesh (v3.116.24+)](#ota-bloquée-à-5-sur-wifi-mesh-v311624)
35. [Hotspot channel flapping au boot (v3.116.26+)](#hotspot-channel-flapping-au-boot-v311626)
36. [Hotspot recovery disproportionnée — restart complet pour IP manquante (v3.116.26+)](#hotspot-recovery-disproportionnée--restart-complet-pour-ip-manquante-v311626)
37. [Déploiement vidéo SaaS bloqué indéfiniment (v3.127.5+)](#déploiement-vidéo-saas-bloqué-indéfiniment-v31275)
38. [Déploiement OTA "Échoué" sans message d'erreur (v3.116.28+)](#déploiement-ota-échoué-sans-message-derreur-v311628)
39. [Post-OTA validation failed: ECONNREFUSED ::1 (v3.116.28+)](#post-ota-validation-failed-econnrefused-1-v311628)
40. [Fausses alertes offline/online Slack — flapping Socket.IO (v3.118.2+)](#fausses-alertes-offlineonline-slack--flapping-socketio-v31182)
41. [Taille vidéo affichée "-" au lieu de la vraie taille (v3.127.7+)](#taille-vidéo-affichée---au-lieu-de-la-vraie-taille-v31277)

> **WiFi USB** : Pour un guide complet sur la clé WiFi USB (installation, diagnostic, pannes, recovery), voir [WIFI_USB_GUIDE.md](WIFI_USB_GUIDE.md).
>
> **Hotspot iOS** : Pour le guide dédié connexion iPhone/iPad, voir [IOS_HOTSPOT_FIX.md](IOS_HOTSPOT_FIX.md). Pour Android, voir [ANDROID_HOTSPOT_FIX.md](ANDROID_HOTSPOT_FIX.md).

---

## Boot splash / écran de démarrage (v3.96+)

Le boot d'un Pi affiche désormais un écran noir propre (pas de texte console) suivi d'un splash Neopro brandé (logo + spinner + "Chargement...") avant qu'Angular ne bootstrap.

### Le splash ne s'affiche pas (écran blanc au démarrage)

**Cause possible :** `index.html` ne contient pas le bloc splash inline, ou le build Angular n'a pas été déployé.

**Vérification :**

```bash
# Vérifier que le splash est présent dans le webapp déployé
grep 'neopro-boot-splash' /home/pi/neopro/webapp/index.html
```

**Solution :** Redéployer le webapp depuis une version ≥ 3.96.

### Messages console Linux visibles au boot (texte défilant)

**Cause :** Les paramètres `cmdline.txt` ne sont pas configurés.

**Vérification :**

```bash
# Pi 4
cat /boot/cmdline.txt | grep -o 'quiet\|splash\|logo.nologo\|loglevel=1'

# Pi 5
cat /boot/firmware/cmdline.txt | grep -o 'quiet\|splash\|logo.nologo\|loglevel=1'
```

**Solution :** Exécuter `fix-fleet-pi.sh` (step 11) ou ajouter manuellement les paramètres :

```bash
# Pi 4
sudo sed -i 's/$/ quiet splash logo.nologo vt.global_cursor_default=0 loglevel=1/' /boot/cmdline.txt

# Pi 5
sudo sed -i 's/$/ quiet splash logo.nologo vt.global_cursor_default=0 loglevel=1/' /boot/firmware/cmdline.txt

# Supprimer le rainbow splash firmware
echo 'disable_splash=1' | sudo tee -a /boot/config.txt  # ou /boot/firmware/config.txt

sudo reboot
```

### Carré arc-en-ciel au tout début du boot

**Cause :** `disable_splash=1` manquant dans `config.txt`.

**Vérification :**

```bash
grep 'disable_splash=1' /boot/config.txt /boot/firmware/config.txt 2>/dev/null
```

**Solution :** Ajouter `disable_splash=1` dans le bon `config.txt` et rebooter.

### Le splash reste bloqué (ne disparaît jamais)

**Cause possible :** Angular ne bootstrap pas correctement (erreur JS, Socket.IO introuvable, etc.).

**Vérification :**

```bash
# Vérifier les logs Chromium
journalctl -u neopro-kiosk --no-pager -n 50 | grep -i 'error\|crash\|snap'

# Vérifier que le fichier socket.io.min.js est présent
ls -la /home/pi/neopro/webapp/assets/socket.io.min.js
```

**Solution :** Le splash est supprimé par `app.component.ts ngOnInit()`. Si Angular crashe au boot, le splash reste affiché — investiguer les erreurs Chromium dans les logs kiosk.

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

#### 3b. Collision mDNS — Un Pi affiche la boucle vidéo d'un autre Pi (v3.96+)

**Symptôme :** Vous branchez un Pi sur un écran et il affiche la boucle vidéo d'un **autre** Pi du réseau au lieu de la sienne.

**Cause :** Tous les Pi ont le hostname `neopro` et publient `neopro.local` via avahi/mDNS. Quand deux Pi sont sur le même LAN (ex: setup de test, même réseau Ethernet), la résolution mDNS `neopro.local` peut pointer vers l'autre Pi.

**Résolu depuis v3.96 :** Le kiosk Chromium utilise désormais `http://localhost/tv` au lieu de `http://neopro.local/tv`. Le Pi parle toujours à son propre nginx via `localhost`, éliminant toute dépendance mDNS pour l'affichage interne.

> **Note :** `neopro.local` reste valide et nécessaire pour l'accès **externe** : SSH (`ssh pi@neopro.local`), télécommande (`neopro.local/remote`), admin (`neopro.local:8080`). Seul le kiosk Chromium interne utilise `localhost`.

**Si le problème persiste sur un Pi en version < 3.96 :**

```bash
# Vérifier vers où pointe neopro.local
ping -c1 neopro.local
# Si l'IP retournée n'est pas celle du Pi lui-même → collision confirmée

# Fix rapide : forcer localhost dans /etc/hosts
sudo sed -i 's/127.0.1.1.*/127.0.1.1\tneopro.local neopro/' /etc/hosts
sudo systemctl restart avahi-daemon
sudo systemctl restart neopro-kiosk
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

### Admin : toutes les API retournent du HTML (SyntaxError)

#### Symptômes

- L'interface admin (`http://neopro.local/admin/`) s'affiche mais toutes les données sont vides
- Console : `SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON` sur chaque appel API
- Tous les endpoints `/admin/api/*` retournent du HTML (`index.html` de la webapp Angular) au lieu de JSON

#### Cause racine

Le fichier `nginx-captive-portal.conf` ne contient pas le bloc `location /admin/` qui redirige vers le serveur admin (port 8080). Sans ce bloc, la règle SPA catch-all (`try_files $uri $uri/ /index.html`) intercepte toutes les requêtes `/admin/api/*` et retourne le `index.html` de la webapp Angular.

**Note :** Ce problème ne se produit PAS si on accède directement à `http://neopro.local:8080` (qui bypasse nginx). Il n'apparaît que via le port 80 (nginx).

#### Diagnostic

```bash
# Vérifier si le proxy admin est configuré dans nginx
grep -c 'location /admin/' /etc/nginx/sites-enabled/neopro-captive
# Résultat attendu : 1 (si 0 → bloc manquant)

# Tester directement
curl -sI http://neopro.local/admin/api/status | head -5
# Si Content-Type: text/html → nginx retourne du HTML (bug)
# Si Content-Type: application/json → OK
```

#### Solution (corrigé en v3.87)

Le fichier `nginx-captive-portal.conf` contient désormais le bloc proxy admin :

```nginx
location /admin/ {
    proxy_pass http://localhost:8080/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Si vous avez une ancienne version :**

```bash
sudo cp /home/pi/neopro/config/nginx-captive-portal.conf /etc/nginx/sites-enabled/neopro-captive
sudo nginx -t && sudo systemctl reload nginx
```

**Protection supplémentaire :** Le fetch interceptor de l'admin (`modules/core/state.js`) détecte maintenant les réponses HTML sur les appels API et retourne un JSON d'erreur propre (status 502, code `HTML_RESPONSE`) au lieu de laisser `response.json()` crasher.

---

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

#### TV affiche une ancienne version au boot (v3.80+)

**Symptômes :**

- Au boot, l'écran TV affiche une ancienne version de l'app Angular (features supprimées réapparaissent : score overlay, encart noir, etc.)
- Un `systemctl restart neopro-kiosk` corrige le problème
- `cat /home/pi/neopro/webapp/version.json` montre la bonne version (les fichiers sur disque sont à jour)

**Cause :** Chromium conservait des données dans des sous-dossiers du profil non nettoyés au boot (Session Storage, IndexedDB, Local Storage, HTTP cache sérialisé). De plus, le service kiosk pouvait démarrer avant Nginx, forçant Chromium à charger du contenu depuis son cache interne.

**Correction (appliquée en v3.80) :**

1. **Purge complète du profil Chromium** : `rm -rf ~/.cache/chromium ~/.config/chromium` au lieu de sous-dossiers individuels (mode kiosk = aucun état persistant nécessaire)
2. **Dépendance systemd** : `Requires=nginx.service` + `After=nginx.service` ajoutés à `neopro-kiosk.service`
3. **Smoke test** : vérifie que la purge complète et la dépendance nginx sont présentes

**Diagnostic sur un Pi non mis à jour :**

```bash
# Vérifier la version affichée vs la version sur disque
cat /home/pi/neopro/webapp/version.json

# Vérifier que nginx est dans les dépendances du kiosk
grep nginx /etc/systemd/system/neopro-kiosk.service

# Vérifier que la purge complète est dans le watchdog
grep -c 'rm -rf /home/pi/.config/chromium ' /home/pi/neopro/scripts/kiosk-watchdog.sh
# Attendu: 1 (purge complète). Si 0: ancienne version avec nettoyage partiel
```

**Fix manuel (Pi non encore mis à jour) :**

```bash
sudo systemctl restart neopro-kiosk
```

#### Crash loop Chromium après déploiement OTA — Pi 5 (v3.81+)

**Symptômes :**

- Après un `deploy-remote.sh` ou une mise à jour OTA, Chromium entre dans une boucle de crash/relance
- Les logs kiosk montrent `GetVSyncParametersIfAvailable() failed` et des erreurs Vulkan/Dawn
- Un simple `systemctl restart neopro-kiosk` ne résout pas le problème
- **Débrancher/rebrancher le Pi (power cycle) corrige le problème**
- Affecte Pi 5 uniquement (GPU V3D Mesa)

**Cause racine :** `ExecStop=/usr/bin/pkill -9 -f chromium` dans `neopro-kiosk.service` exécutait un
SIGKILL direct sur Chromium **avant** que le trap handler du watchdog (SIGTERM → `cleanup_chromium()`)
ne puisse s'exécuter. Ce SIGKILL empêche le driver GPU V3D Mesa de libérer les DMA buffers,
shaders et mémoire GPU. Au redémarrage du service, le nouveau Chromium hérite d'un état GPU corrompu
(segments mémoire partagée `/dev/shm/.org.chromium.*` orphelins) → artifacts de rendu
(rectangle noir, vieux score neon vert, remote inopérante).
Le power cycle fonctionne car le kernel réinitialise entièrement le GPU.

**Problèmes secondaires :**

- `stop_chromium_secondary()` utilisait aussi `kill -9` direct (même corruption GPU V3D)
- `check_for_crash_page()` matchait `*"Error"*` (faux positif sur fenêtres xdg-desktop-portal)
- `deploy-remote.sh` redémarrait nginx et kiosk en parallèle (race condition)

**Correction (v3.81) — 7 changements :**

1. **`neopro-kiosk.service`** : suppression `ExecStop=pkill -9`, ajout `KillMode=mixed` (SIGTERM au
   watchdog seul → trap handler → `cleanup_chromium()` gracieux) + `TimeoutStopSec=15`
2. **Arrêt gracieux** : `cleanup_chromium()` et `stop_chromium_secondary()` envoient SIGTERM (5s timeout)
   avant SIGKILL en dernier recours
3. **Nettoyage `/dev/shm`** : suppression des segments mémoire partagée Chromium orphelins après kill
4. **Attente nginx** : le watchdog vérifie que nginx répond (HTTP 200) avant de lancer Chromium (15s timeout)
5. **Déploiement séquentiel** : `deploy-remote.sh` redémarre kiosk APRÈS nginx + backend (deux phases)
6. **`--disable-gpu-shader-disk-cache`** : empêche le cache shader GPU persistant entre versions
7. **`--disable-features=XdgDesktopPortal`** : empêche les fenêtres portal en mode kiosk

**Diagnostic :**

```bash
# Vérifier que le service n'a PAS de ExecStop avec pkill -9
grep 'ExecStop' /home/pi/neopro/config/systemd/neopro-kiosk.service
# Attendu: rien. Si "ExecStop=...pkill -9...": ancienne version

# Vérifier KillMode=mixed
grep 'KillMode' /home/pi/neopro/config/systemd/neopro-kiosk.service
# Attendu: KillMode=mixed. Si absent ou "control-group": ancienne version

# Vérifier que le watchdog utilise SIGTERM
grep -c 'kill -TERM' /home/pi/neopro/scripts/kiosk-watchdog.sh
# Attendu: 2+. Si 0: ancienne version avec SIGKILL direct

# Vérifier le nettoyage /dev/shm
grep -c 'dev/shm/.org.chromium' /home/pi/neopro/scripts/kiosk-watchdog.sh
# Attendu: 2+. Si 0: ancienne version sans nettoyage shm

# Vérifier XdgDesktopPortal disable
grep -c 'XdgDesktopPortal' /home/pi/neopro/scripts/kiosk-watchdog.sh
# Attendu: 1+. Si 0: ancienne version
```

**Fix manuel (Pi non encore mis à jour) :**

```bash
# Copier les fichiers mis à jour
scp raspberry/scripts/kiosk-watchdog.sh pi@neopro.local:/home/pi/neopro/scripts/
scp raspberry/scripts/deploy-remote.sh pi@neopro.local:/home/pi/neopro/scripts/
scp raspberry/config/systemd/neopro-kiosk.service pi@neopro.local:/home/pi/neopro/config/systemd/
# Recharger systemd et power cycle pour repartir d'un état GPU propre
ssh pi@neopro.local 'sudo cp /home/pi/neopro/config/systemd/neopro-kiosk.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo shutdown -r now'
```

#### Spam "Failed to connect to MCS endpoint with error -105" (v3.84.2+)

**Symptômes :**

- `journalctl -u neopro-kiosk` montre des centaines de lignes :
  ```
  google_apis/gcm/engine/connection_factory_impl.cc:434
  Failed to connect to MCS endpoint with error -105
  ```
- Se produit en boucle toutes les ~30s, surtout pendant les coupures WiFi
- Aucun impact sur la lecture vidéo locale, mais pollue les logs

**Cause :** Chromium tente de se connecter à Google Cloud Messaging (`mtalk.google.com`) pour les push notifications internes. L'erreur `-105` = `ERR_NAME_NOT_RESOLVED` — le DNS échoue quand le WiFi est instable (fréquent avec les dongles USB RTL8192EU). Neopro n'utilise pas les push notifications Chromium.

**Correction (v3.84.2) :** `GCMDriver` ajouté dans `--disable-features` du kiosk-watchdog.sh (primaire et secondaire). Désactive entièrement le client GCM de Chromium.

**Diagnostic :**

```bash
# Vérifier que GCMDriver est bien désactivé
grep 'GCMDriver' /home/pi/neopro/scripts/kiosk-watchdog.sh
# Attendu: "TranslateUI,MediaRouter,XdgDesktopPortal,GCMDriver"
# Si absent: version < 3.84.2

# Vérifier en temps réel (après mise à jour, ne devrait plus apparaître)
journalctl -u neopro-kiosk -f | grep -i "MCS endpoint"
# Attendu: aucune ligne
```

#### VSync failures sur Pi 5 — "GetVSyncParametersIfAvailable() failed" (v3.84.2+)

**Symptômes :**

- `journalctl -u neopro-kiosk` montre :
  ```
  ui/gl/gl_surface_presentation_helper.cc:260
  GetVSyncParametersIfAvailable() failed for 3 times!
  ```
- Affecte Pi 5 uniquement (driver V3D Mesa)
- La vidéo joue mais sans synchronisation verticale optimale (possible tearing)

**Cause :** Le driver GPU V3D Mesa sur Pi 5 ne supporte pas correctement la requête VSync de Chromium. Le flag `--disable-gpu-vsync` était présent sur Pi 4 mais manquait dans les gpu_flags Pi 5.

**Correction (v3.84.2) :** `--disable-gpu-vsync` ajouté dans les gpu_flags Pi 5 (primaire et secondaire). Chromium utilise son propre timer de rafraîchissement au lieu du VSync driver.

**Diagnostic :**

```bash
# Vérifier les flags GPU Pi 5 dans le watchdog
grep -A5 '"pi5"' /home/pi/neopro/scripts/kiosk-watchdog.sh | grep 'disable-gpu-vsync'
# Attendu: --disable-gpu-vsync. Si absent: version < 3.84.2

# Vérifier en temps réel
journalctl -u neopro-kiosk -f | grep -i "VSync"
# Attendu: aucune ligne après mise à jour
```

#### Ecran noir — fenêtre Chromium 1x1 pixel (v3.84.4+)

**Symptômes :**

- L'écran affiche le bureau LXDE (fond d'écran, barre de tâches)
- Un processus Chromium est bien lancé mais la fenêtre est **invisible** (1x1 pixel)
- `systemctl status neopro-kiosk` montre `active (running)` — pas de crash
- La télécommande cloud ne répond pas (la page n'est pas chargée dans la micro-fenêtre)
- Le watchdog ne redémarre PAS Chromium car le processus est techniquement vivant

**Cause racine :** Les variables `PRIMARY_SCREEN_WIDTH` et `PRIMARY_SCREEN_HEIGHT` dans
`kiosk-watchdog.sh` étaient initialisées à `0` au lieu de `""` (chaîne vide).
Le fallback bash `${VAR:-1920}` ne se déclenche que si VAR est vide ou unset, PAS si `=0`.
Résultat : `--window-size=0,0` → Chromium s'ouvre en 1×1 pixel → écran noir apparent.

**Correction (v3.84.4 → amélioré en v3.85.0) :**

1. Init changé de `=0` à `=""` (le fallback `:-default` fonctionne)
2. Runtime guard ajouté : si dimensions ≤ 0, forcer `DEFAULT_SCREEN_WIDTH`×`DEFAULT_SCREEN_HEIGHT`
3. **(v3.85.0)** Cascade `get_output_resolution()` remplace tous les magic numbers — chaque TV obtient sa résolution native automatiquement (voir section "Résolution écran en mode dégradé" ci-dessous)

**Diagnostic :**

```bash
# Vérifier l'initialisation dans le watchdog
grep -n 'PRIMARY_SCREEN_WIDTH=' /home/pi/neopro/scripts/kiosk-watchdog.sh | head -1
# Attendu: PRIMARY_SCREEN_WIDTH=""
# Bug: PRIMARY_SCREEN_WIDTH=0 → fenêtre 1x1

# Vérifier la taille réelle de la fenêtre Chromium
DISPLAY=:0 xdotool search --name "Chromium" getwindowgeometry
# Attendu: résolution native de la TV (ex: 3840x2160 pour 4K)
# Bug: 0x0 ou 1x1

# Vérifier les arguments de lancement
ps aux | grep chromium | grep -- '--window-size'
# Attendu: --window-size=<largeur_native>,<hauteur_native>
# Bug: --window-size=0,0

# Vérifier si la cascade a fonctionné
cat /home/pi/neopro/data/kiosk-status.json | python3 -m json.tool | grep displayFallback
# Attendu: "displayFallback": "" (résolution détectée)
# Dégradé: "displayFallback": "primary: xrandr+EDID unavailable"
```

#### Services orphelins en crash-loop (v3.84.4+, fix v3.99.3)

**Symptômes :**

- `journalctl -u neopro-*` montre des centaines de lignes de redémarrages :
  ```
  neopro-score-bridge.service: Main process exited, code=exited, status=1/FAILURE
  neopro-score-bridge.service: Scheduled restart job, restart counter is at 305.
  ```
- Les services concernés : `neopro-score-bridge`, `neopro-playlist-manager`,
  `neopro-ffmpeg-stream`, `neopro-vlc-kiosk`
- Ces services consomment CPU et polluent les logs avec des centaines de restarts
- La charge système élevée peut ralentir les services légitimes

**Cause racine :** Des fichiers `.service` ont été déployés manuellement sur le Pi
(pipeline HLS expérimental) mais le code source correspondant n'a **jamais** été créé.
Les services ont `Restart=always` et redémarrent en boucle à chaque boot.

**Pourquoi le cleanup automatique échouait (v3.84.4 → v3.99.2) :**

Le script `fix-fleet-pi.sh` (lancé automatiquement lors du deploy OTA) contenait le code
de nettoyage mais utilisait uniquement `systemctl is-enabled` pour détecter les services.
Or, les services installés **manuellement** (fichier `.service` copié directement dans
`/etc/systemd/system/` sans passer par `systemctl enable`) retournent une erreur ou un
statut non-standard avec `is-enabled` — le if-block les ignorait silencieusement comme
"déjà désactivés" alors qu'ils étaient activement en crash-loop via `Restart=always`.

**Fix v3.99.3 :** Ajout de `|| systemctl is-active` comme fallback pour détecter les
services qui tournent même sans être "enabled", suppression du fichier `.service` unitaire
(`rm -f`), et `daemon-reload` + `reset-failed` après nettoyage.

**Monitoring (v3.99.3+) :** Pipeline de détection à 3 couches :

1. **Pi-side** : `metrics.js getOrphanServices()` détecte les services neopro-\* non-légitimes
   actifs, intégrés dans le health score (-5 points) avec suggestion de fix
2. **Transmission** : le heartbeat du sync-agent transmet `orphanServices` au central
3. **Central** : le heartbeat handler crée des alertes `orphan_systemd_service` + incrémente
   le compteur Prometheus `neopro_orphan_service_detected_total` pour alerting Grafana

**Diagnostic :**

```bash
# Lister TOUS les services neopro
systemctl list-units 'neopro-*' --all --no-pager
# Services légitimes (12) : admin, app, backup, hotspot-optimizer, hotspot-watchdog,
#   kiosk, sd-health, sync-agent, sync-guardian, usb-wifi, video-processor
# Tout autre service neopro-* = orphelin à supprimer

# Vérifier is-enabled ET is-active (les deux sont nécessaires !)
systemctl is-enabled neopro-score-bridge 2>&1  # Peut retourner "indirect" ou erreur
systemctl is-active neopro-score-bridge 2>&1   # Active = en train de tourner

# Compter les restarts
systemctl show neopro-score-bridge -p NRestarts 2>/dev/null
# Si > 0 : service en crash-loop

# Vérifier que les fichiers source n'existent pas
ls -la /home/pi/neopro/services/score-bridge.js /home/pi/neopro/services/playlist-manager.js 2>&1
# Attendu: "No such file or directory"
```

**Fix :**

```bash
# Désactiver, arrêter et supprimer les services orphelins
sudo systemctl stop neopro-vlc-kiosk neopro-ffmpeg-stream neopro-score-bridge neopro-playlist-manager 2>/dev/null
sudo systemctl disable neopro-vlc-kiosk neopro-ffmpeg-stream neopro-score-bridge neopro-playlist-manager 2>/dev/null
sudo rm -f /etc/systemd/system/neopro-vlc-kiosk.service
sudo rm -f /etc/systemd/system/neopro-ffmpeg-stream.service
sudo rm -f /etc/systemd/system/neopro-score-bridge.service
sudo rm -f /etc/systemd/system/neopro-playlist-manager.service
sudo systemctl daemon-reload
sudo systemctl reset-failed
```

#### TV figée — fenêtre parasite devant Chromium (v3.81+)

**Symptômes :**

- La TV affiche un contenu figé (score overlay ancien, rectangle noir, vidéo en boucle sans contrôle)
- La télécommande Socket.IO ne répond pas (pas de changement visible à l'écran)
- Un `systemctl restart neopro-kiosk` ne résout PAS le problème
- Un power cycle peut résoudre temporairement (selon l'ordre de démarrage des services)
- Affecte un seul Pi (services installés manuellement sur cette machine)

**Cause racine :** Un processus non-Chromium (VLC, xdg-desktop-portal, etc.) tourne en fullscreen
**par-dessus** la fenêtre Chromium du kiosk Angular. Chromium est bien actif en arrière-plan
(il reçoit les events Socket.IO) mais sa fenêtre est masquée par la fenêtre parasite.
La télécommande paraît inopérante car les changements Angular ne sont pas visibles.

**Cas réel (24/12/2024) :** Un pipeline HLS expérimental composé de 4 services systemd manuels
(`neopro-vlc-kiosk`, `neopro-ffmpeg-stream`, `neopro-score-bridge`, `neopro-playlist-manager`)
faisait tourner VLC fullscreen pour afficher un flux HLS avec score incrusté par FFmpeg.
Ces services n'étaient PAS dans le codebase et redémarraient à chaque boot (`Restart=always`).

**Protection intégrée (v3.81+) :** Le watchdog détecte automatiquement les fenêtres non-Chromium
au premier plan (toutes les 30s), les tue, et remet Chromium en focus.
Les logs contiendront : `🚨 FENÊTRE PARASITE détectée: '<nom>'`.

**Diagnostic :**

```bash
# Vérifier quelle fenêtre est au premier plan
DISPLAY=:0 xdotool getactivewindow getwindowname
# Attendu: "Neopro - Chromium". Si autre chose: fenêtre parasite

# Lister TOUS les services neopro
systemctl list-units 'neopro-*' --all --no-pager
# Attendu: 7 services légitimes (admin, app, hotspot-optimizer, hotspot-watchdog, kiosk, sync-agent, sync-guardian)
# Si plus: services parasites à supprimer

# Vérifier les logs du watchdog pour détections de parasites
journalctl -u neopro-kiosk --since "1 hour ago" --no-pager | grep -i "parasite"
```

**Fix manuel (si le watchdog n'est pas à jour) :**

```bash
# 1. Identifier le processus parasite
DISPLAY=:0 xdotool getactivewindow getwindowname
DISPLAY=:0 xdotool getactivewindow getwindowpid

# 2. Le tuer
kill -9 <PID>

# 3. Désactiver les services parasites
sudo systemctl disable --now neopro-vlc-kiosk neopro-ffmpeg-stream neopro-score-bridge neopro-playlist-manager 2>/dev/null
sudo rm -f /etc/systemd/system/neopro-vlc-kiosk.service /etc/systemd/system/neopro-ffmpeg-stream.service /etc/systemd/system/neopro-score-bridge.service /etc/systemd/system/neopro-playlist-manager.service
sudo systemctl daemon-reload

# 4. Supprimer les scripts parasites
rm -f /home/pi/neopro/scripts/vlc-kiosk.sh /home/pi/neopro/scripts/ffmpeg-stream.sh
rm -f /home/pi/neopro/services/score-bridge.js /home/pi/neopro/services/playlist-manager.js

# 5. Remettre Chromium au premier plan
DISPLAY=:0 xdotool search --name "Chromium" windowactivate
```

#### Popup "Choose password for new keyring" (v3.80.1+)

**Symptômes :**

- Au boot, Chromium affiche un popup GNOME Keyring : "Choose password for new keyring"
- Le popup est bloquant et empêche le chargement de la page `/tv`
- Apparaît uniquement après la mise à jour vers v3.80+ (ajout de `dbus-launch`)

**Cause :** Le `dbus-launch` ajouté en v3.80 pour supprimer le spam D-Bus ("Failed to connect to the bus") crée une session D-Bus complète. Chromium détecte alors le système de keyring GNOME et tente de l'utiliser pour stocker les mots de passe, ce qui déclenche un popup de création de keyring.

**Correction (v3.80.1) :** `--password-store=basic` ajouté sur les deux instances Chromium (TV + LED) dans `kiosk-watchdog.sh`. Ce flag force Chromium à utiliser un stockage de mots de passe basique (en mémoire) au lieu de GNOME Keyring.

**Diagnostic :**

```bash
# Vérifier que le flag est présent dans le watchdog
grep -c 'password-store=basic' /home/pi/neopro/scripts/kiosk-watchdog.sh
# Attendu: 2 (une fois pour TV, une fois pour LED). Si 0: version < v3.80.1

# Vérifier que dbus-launch est présent
grep -c 'dbus-launch' /home/pi/neopro/scripts/kiosk-watchdog.sh
# Attendu: 1+. Si 0: version < v3.80.0
```

**Fix manuel (Pi non encore mis à jour) :**

```bash
# Ajouter le flag dans les common_flags des deux instances Chromium
# dans /home/pi/neopro/scripts/kiosk-watchdog.sh :
#   "--password-store=basic"
# puis redémarrer :
sudo systemctl restart neopro-kiosk
```

#### TV noire — "X server not ready after 60s" (v3.72+)

**Symptômes :**

- L'écran reste noir après le boot
- `journalctl -u neopro-kiosk` affiche `X server not ready after 60s`
- Le service restart en boucle (3 tentatives puis abandon)

**Cause :** Le paquet `x11-utils` (qui fournit `xdpyinfo`) n'est pas installé. Le service `neopro-kiosk.service` utilise `xdpyinfo` pour vérifier que le serveur X est prêt avant de lancer Chromium. Sans cet outil, le health check échoue systématiquement.

**Diagnostic :**

```bash
# Vérifier si xdpyinfo est installé
which xdpyinfo
# Si "not found" → c'est le problème

# Vérifier que X est bien disponible (après install x11-utils)
DISPLAY=:0 xdpyinfo | head -5
```

**Solution :**

```bash
# Installer le paquet manquant
sudo apt-get update && sudo apt-get install -y x11-utils

# Redémarrer le kiosk
sudo systemctl restart neopro-kiosk

# Vérifier
sudo systemctl status neopro-kiosk
```

> **Note :** Depuis v3.72, l'OTA installe automatiquement `x11-utils` si manquant. Ce problème ne devrait plus se reproduire sur les futures mises à jour.

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

### Ancienne version de l'app visible au boot (cache Chromium)

#### Symptômes

- Au démarrage du kiosk, on voit brièvement l'ancienne version de l'app Angular
- Rectangle noir en haut à gauche (ancien player Video.js)
- Score "DOMICILE 0 - 0 EXTÉRIEUR" avec l'ancien design
- Après quelques secondes, la vraie app se charge avec la bonne boucle vidéo

#### Cause racine

Chromium cachait `index.html` sur disque (pas de header `Cache-Control`), et au boot il servait
l'ancienne version cachée avant de revalider avec nginx. L'ancien `index.html` référençait les
vieux fichiers JS/CSS (avec les anciens content-hash) → rendu de l'ancien code Angular.

#### Solution (v3.72+)

1. **nginx `Cache-Control: no-store` sur `index.html`** — force Chromium à toujours charger
   le dernier build. Les fichiers JS/CSS avec content-hash restent cachés 30d (immutable).
2. **Nettoyage complet du cache Chromium au boot** — `cleanup_chromium()` dans `kiosk-watchdog.sh`
   supprime `Cache/`, `Code Cache/`, `GPUCache/`, `Service Worker/`, `Application Cache/`.
3. **Flags `--disk-cache-size=1 --aggressive-cache-discard`** — Chromium ne met quasi rien en cache disque.

#### Vérification

```bash
# Vérifier les headers nginx sur index.html
curl -I http://neopro.local/index.html
# Doit contenir: Cache-Control: no-cache, no-store, must-revalidate

# Vérifier les flags Chromium
ps aux | grep chromium | grep disk-cache-size
# Doit contenir: --disk-cache-size=1

# Vérifier que le cache est vide après boot
ls -la /home/pi/.cache/chromium/Default/Cache/ 2>/dev/null
# Doit être vide ou inexistant
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

### Sponsors parasites créés automatiquement ("Intro Neopro", doublons) (corrigé v3.113.3)

**Symptômes :**

- L'onglet Sponsors affiche des sponsors indésirables ("B", "J", "P", "Intro Neopro") avec 0 impressions
- Le nombre de sponsors est supérieur à ce qui a été configuré manuellement
- Les sponsors parasites réapparaissent après suppression

**Cause :** Bug dans `_reconcileOrphanedLoopVideos()` du Pi admin `sponsor.service.js`. Le critère `owner === 'club'` était utilisé comme marqueur sponsor, mais les clubs ont des vidéos non-sponsor dans la boucle (présentation, ambiance). Toute vidéo club sans `_sponsorLocalId` était auto-créée comme sponsor parasite avec le `name` de la loopVideo (parfois une seule lettre).

**Fix (v3.113.3 initial, renforcé v3.118.3) :**

- **Pi** : `_isSponsorEntry()` ne garde que `site_sponsor_id` et `analytics_category` comme marqueurs. `owner === 'club'` seul n'est plus suffisant.
- **Central** : `resolveLocalSponsors()` et `createSiteSponsor()` refusent les noms < 2 caractères.
- **Monitoring** : `checkPhantomSponsors()` dans `alerting.service.ts` auto-désactive les sponsors à 1 caractère toutes les 5 minutes. Smoke test enforced.

**Nettoyage des sponsors parasites existants :**

1. Les sponsors à 1 caractère sont auto-désactivés par le monitoring (statut → `inactive`)
2. Pour les sponsors parasites avec des noms plus longs, aller sur l'onglet Sponsors du site
3. Identifier les sponsors avec 0 impressions qui ne devraient pas exister
4. Les supprimer manuellement via le bouton poubelle
5. Vérifier après le prochain `sync_local_state` qu'ils ne réapparaissent pas

### Badges sponsors absents dans le loop-manager (corrigé v3.113.3)

**Symptômes :**

- Le loop-manager affiche les vidéos de boucle sans badge sponsor
- Les sponsors sont bien configurés dans l'onglet Sponsors avec les bonnes vidéos
- Seules les vidéos dont le filename exact correspond au `site_sponsor_videos` affichent un badge

**Cause :** Les vidéos de boucle utilisent des noms préfixés pour l'ordre (`07_A_L_AFFUT.mp4`) mais `site_sponsor_videos` stocke le nom de catégorie (`A_L_AFFUT.mp4`). Le match exact échouait.

**Fix (v3.113.3) :** `getAutoDetectedSponsor()` a maintenant un fallback qui supprime le préfixe numérique (`^\d+_`) avant de re-chercher. Smoke test enforced.

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

### Déploiement vidéo échoue avec "Checksum is required" depuis l'onglet site

**Symptômes**

- L'upload depuis l'onglet contenu d'un site fonctionne (la vidéo apparaît dans la bibliothèque)
- Cliquer « Déployer » échoue silencieusement ou affiche une erreur
- En base : `remote_commands.error_message = 'Checksum is required for video deployment. Video rejected for security.'`
- Le même fichier se déploie sans problème depuis la page **Contenu** (menu principal)

**Cause (fixé en v3.124.13)**

Le `site-content-tab` envoyait `deploy_video` via `sendCommand()` directement, sans inclure le `checksum` dans le payload. Le sync-agent Pi rejette tout deploy sans checksum (ligne 99 de `deploy-video.js`).

La page Contenu passait par `deployment.service.ts` qui récupère le checksum depuis la DB automatiquement.

**Vérification**

```sql
-- Chercher les deploy_video failed avec cette erreur
SELECT id, command_data, error_message, created_at
FROM remote_commands
WHERE command_type = 'deploy_video'
  AND error_message LIKE '%Checksum is required%'
ORDER BY created_at DESC LIMIT 10;
```

**Résolution**

Mettre à jour le dashboard vers v3.124.13+. Le fix ajoute `checksum`, `category` et `originalName` au payload, et un guard frontend empêche le deploy si le checksum est absent.

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

**Solution :** Corrigé en v3.49.4 pour `uploadFileToFtp()` (buffer) et en v3.80.17 pour `uploadFileToFtpFromDisk()` (streaming) — `ftp-storage.ts` appelle `client.ensureDir(dir)` automatiquement avant chaque upload. Les variantes vidéo (chemin `variants/{uuid}/secondary/`) utilisent le streaming et étaient impactées. Smoke test `FTP upload ensureDir guard` empêche la régression. Si l'erreur réapparaît, vérifier les permissions FTP.

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

**Ce script vérifie (17 catégories, v3.69+) :**

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
- ✅ **Santé filesystem SD** (erreurs EXT4 dmesg, état tune2fs, lecture seule)
- ✅ Informations de version

Le code de retour = nombre d'erreurs (0 = Pi sain). Le mode `--json` est automatiquement utilisé par `deploy-remote.sh` (post-déploiement) et `update-software.js` (rapport OTA).

> **Note v3.82.3+ :** Si le diagnostic post-déploiement affiche `"impossible de déterminer l'état"`, cela signifie que la connexion SSH pour le diagnostic a échoué (mot de passe incorrect, timeout, etc.). Le script affiche maintenant le code d'erreur SSH et la raison. Relancez manuellement : `ssh pi@neopro.local '/home/pi/neopro/scripts/diagnose-pi.sh'`

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

## Corruption SD card (v3.69+)

### Erreurs EXT4 dans dmesg

**Symptôme :** Le dashboard affiche une alerte `fs_ext4_errors` ou le diagnostic affiche des erreurs filesystem.

**Cause :** Les SD cards subissent de la corruption due aux coupures de courant pendant les écritures. Les blocs `/var/log/` sont les plus vulnérables (logrotate + journalctl).

**Diagnostic :**

```bash
# Vérifier les erreurs EXT4
dmesg | grep "EXT4-fs error"

# Vérifier l'état du filesystem
sudo tune2fs -l /dev/mmcblk0p2 | grep "Filesystem state"

# Vérifier si monté en lecture seule
mount | grep "on / "
```

**Protections déployées automatiquement par OTA (v3.69+) :**

- **journald.conf** : Limite les journaux à 100M / 7 jours (réduit les écritures)
- **fstab noatime** : Supprime les écritures d'accès-time à chaque lecture fichier
- **Déduplication OTA** : Lock file `/tmp/neopro-update.lock` empêche les doubles exécutions
- **Timer sd-health** : Check hebdomadaire (erreurs dmesg + état filesystem)
- **Monitoring heartbeat** : Erreurs EXT4 et lecture-seule remontées automatiquement au dashboard

**Si filesystem "not clean" ou "read-only" :**

```bash
# Planifier un fsck au prochain reboot
sudo touch /forcefsck
sudo reboot
```

---

## Réparation rapide

### Script fix-fleet-pi.sh (v3.7.14+)

Pour corriger les problèmes courants identifiés par un debug bundle (16 sections : config, logs, réseau, WiFi client, dmesg kernel, périphériques USB, etc. — voir [sync-agent brick](../architecture/bricks/sync-agent.md#debug-bundle-export_debug_bundle)), utiliser le script générique de réparation flotte :

```bash
# Copier et exécuter sur le Pi
scp raspberry/scripts/fix-fleet-pi.sh pi@neopro.local:/tmp/
ssh pi@neopro.local 'chmod +x /tmp/fix-fleet-pi.sh && sudo /tmp/fix-fleet-pi.sh'
```

**Ce que fait le script (13 étapes) :**

1. **TKIP → CCMP** dans hostapd.conf (éjections téléphones)
2. **Installe les packages recommandés** manquants (unclutter-xfixes, x11-utils, edid-decode, feh)
3. **Corrige le masquage curseur TV** (remplacement ancien unclutter → unclutter-xfixes + autostart LXDE)
4. **Installe les 3 services systemd manquants** (watchdog, guardian, optimizer)
5. **Crée le dossier videos-processing** (permission denied)
6. **Vérifie les flags GPU** du kiosk (Pi 4 vs Pi 5)
7. **Vide le cache Chromium** (erreurs SharedImage/AllocateRingBuffer)
8. **Flush les buffers** analytics et sponsors bloqués
9. **Vérifie gpu_mem** (doit être 256 sur Pi 4)
10. **Vérifie hdmi_force_hotplug** sur les 2 ports HDMI (E-23)
11. **Configure le boot splash** (cmdline.txt quiet boot + config.txt disable_splash=1 + Plymouth NEOPRO + desktop noir + image splash kiosk)
12. **Captive portal iptables** (Android HTTPS connectivity checks)
13. **Pi 5 Active Cooler** (dtparam=cooling_fan dans config.txt)

Le script auto-détecte le modèle de Pi, le type de connexion (Ethernet vs WiFi) et le nom du site.

> **⚠️ Bug historique (corrigé v3.106.1) :** `deploy-remote.sh` et `update-software.js` appelaient `fix-fleet-pi.sh` sans `sudo`. Le script vérifie `id -u == 0` et quittait silencieusement — les 13 étapes n'étaient jamais appliquées via deploy/OTA. Corrigé par ajout de `sudo` dans les 2 callers + smoke tests.

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

# IMPORTANT: après restart hostapd, l'IP peut disparaître temporairement
# dhcpcd la ré-applique en 2-5s depuis /etc/dhcpcd.conf
# Si absente après 5s :
sudo ip addr add 192.168.4.1/24 dev wlan0 2>/dev/null || true
```

> **Note (v3.116.22+):** La recovery automatique (NetworkWatchdog + hotspot-watchdog.sh) applique l'IP **apres** le restart hostapd. Avant v3.116.22, l'IP etait ajoutee avant le restart et systematiquement flushee par la reinitialisation wlan0.

### 3c. "Mauvais mot de passe" malgré le bon mot de passe (TKIP)

**Symptômes :**

- Le SSID `NEOPRO-XXX` est visible mais la connexion échoue
- Le téléphone affiche "Mot de passe incorrect" alors que c'est le bon
- Principalement sur Android 12+ et iOS 16+

**Cause :** Le fichier `hostapd.conf` utilise `wpa_pairwise=TKIP` (cipher déprécié). Les téléphones modernes rejettent TKIP silencieusement et affichent "mauvais mot de passe" au lieu de "cipher non supporté".

**Diagnostic :**

```bash
grep wpa_pairwise /etc/hostapd/hostapd.conf
# Si TKIP → c'est le problème
```

**Correction :**

```bash
# Remplacer TKIP par CCMP (AES)
sudo sed -i 's/wpa_pairwise=TKIP/wpa_pairwise=CCMP/' /etc/hostapd/hostapd.conf
sudo systemctl restart hostapd
```

**Note (v3.69+) :** Le `hotspot-optimizer.sh` corrige automatiquement TKIP → CCMP au boot. Le prochain OTA déploiera ce fix sur toute la flotte.

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
2. **Scan WiFi sur l'interface AP (corrigé v3.69+)** - Le `hotspot-optimizer.sh` faisait `iwlist wlan0 scan` alors que wlan0 est l'interface AP, causant la sortie temporaire du mode AP et la disparition du SSID pendant 10-15 min. Le scan se fait maintenant sur wlan1
3. **Alimentation insuffisante** - Le Pi est branché sur un port USB de TV ou hub non alimenté (voltage < 5V)
4. **Distance/obstacles** - Le WiFi 2.4GHz a une portée limitée (~10-15m), les murs épais ou structures métalliques bloquent le signal

**Solution automatique au boot (v2.28+) :**

Depuis la version 2.28, le Pi **optimise automatiquement le canal WiFi au démarrage** :

- Au boot, scanne les canaux 1, 6, 11 (non-overlapping 2.4GHz)
- Si le canal actuel a >= 3 réseaux voisins, switch vers le canal le moins encombré
- Redémarre hostapd pour appliquer le nouveau canal
- Log dans `/var/log/neopro-hotspot-optimizer.log`
- Réduction TX power automatique (v3.69+) : 15 dBm par défaut (au lieu de 31 dBm) pour minimiser les interférences avec wlan1

**Configurer le TX power (v3.69+) :**

```bash
# Voir la puissance actuelle
iw dev wlan0 info | grep txpower

# Override la valeur par défaut (15 dBm) — créer le fichier avec la valeur en dBm (1-31)
echo "20" | sudo tee /home/pi/neopro/config/hotspot-txpower.conf
```

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

| Paramètre     | Valeur              | Effet                                                                                                                                                                                                                            |
| ------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bgscan`      | `simple:30:-70:300` | Scan en background : toutes les 300s si signal > -70dBm, toutes les 30s si signal < -70dBm. **Note (v3.116.25+)** : `autoOptimize()` ajuste dynamiquement le seuil avec hystérésis (-67/-78 dBm) pour éviter le reconfigure loop |
| `scan_ssid=0` | Désactivé           | Pas de probe actif (optimisation si le SSID n'est pas caché)                                                                                                                                                                     |

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

### Release bloquée — "local branch is behind the remote" {#release-bloquée}

#### Erreur

```
[semantic-release] › ℹ  The local branch main is behind the remote one, therefore a new version won't be published.
```

Le workflow tourne (status `success`) mais aucune release n'est publiée. Les commits `fix()` et `feat()` s'accumulent sans version.

#### Cause

Boucle `chore(release)` : semantic-release pousse un commit `chore(release): x.y.z` qui modifie `raspberry/*/package.json` (non couvert par `paths-ignore`). Ce commit déclenche un nouveau run du workflow, qui checkout un état en retard par rapport au remote → semantic-release refuse de publier. Les vrais commits `fix()` suivants héritent du même problème.

#### Diagnostic

```bash
# Vérifier les derniers runs
gh run list --workflow=release.yml --limit=5

# Chercher le message dans les logs du dernier run
gh run view <RUN_ID> --log | grep -i "behind the remote"
```

#### Solution (implémentée v3.153.8+)

1. **Guard `if`** sur le job `release` : skip les commits `chore(release)` au niveau du job (le `[skip ci]` dans le commit message ne suffit pas avec `paths-ignore`)
2. **`git pull --ff-only`** après checkout : synchronise la branche locale avec le remote avant de lancer semantic-release

#### Si le problème revient

```bash
# Relancer manuellement le dernier commit éligible
gh workflow run release.yml --ref main
```

---

### Smoke tests échouent sur le CI mais passent en local

#### Erreur

```
Tests: 4 failed, 1718 passed, 1722 total
expect(buildScript).toContain('BEFORE_FILES=');
```

#### Cause

Les smoke tests lisent des fichiers **cross-repo** (`raspberry/scripts/`, `central-dashboard/`, etc.). Si les smoke tests sont committés avant le code qu'ils testent (dans 2 commits séparés), le CI lance un run sur le commit intermédiaire où le code n'existe pas encore → échec.

#### Pourquoi ça ne se voit pas en local

En local, le workspace contient toujours le code le plus récent. Le CI, lui, checkout le commit exact du push.

#### Solution (implémentée)

Le workflow `ci.yml` utilise `concurrency: cancel-in-progress: true` pour annuler automatiquement les runs obsolètes quand un nouveau push arrive sur la même branche.

#### Prévention

- **Toujours committer les smoke tests dans le même commit que le code testé**
- Si 2 commits sont liés, les pusher ensemble (`git push` unique) — GitHub ne lance le CI que sur le HEAD du push
- 2 smoke tests gardent le setting `concurrency` dans `ci.yml`

---

## NetworkWatchdog — Auto-recovery réseau (v3.36+)

Depuis la v3.36, le NetworkWatchdog (intégré au sync-agent) démarre **dès le boot**, avant la connexion Socket.IO au cloud. Il surveille wlan0, wlan1 et la connexion cloud indépendamment.

### Changements clés (v3.36+)

- **Démarrage au boot** : le watchdog n'attend plus l'authentification cloud pour démarrer
- **Pas de process.exit** : le sync-agent ne se tue plus après 10 échecs de connexion — il attend 30s puis retente, laissant le watchdog actif
- **6 phases de recovery** pour wlan1 : reconfigure → interface down/up → systemctl restart → modprobe driver → USB power-cycle
- **Détection portail captif** (v3.69+) : avant toute recovery, vérifie si le réseau a un portail captif (`connectivitycheck.gstatic.com/generate_204`). Si portail détecté, skip la recovery et alerte l'opérateur

### Vérifier que le watchdog tourne

```bash
# Logs du watchdog réseau (dans les logs du sync-agent)
journalctl -u neopro-sync-agent --since "1 hour ago" --no-pager | grep -i "watchdog\|recovery\|wlan1"

# Vérifier le démarrage au boot
journalctl -u neopro-sync-agent --since "boot" | grep "Starting network watchdog"
```

### BSSID mismatch auto-clear (v3.79+)

Quand le Pi est connecté en WiFi et sain, le watchdog vérifie si le BSSID connecté correspond au BSSID verrouillé dans wpa_supplicant. Si un mismatch persiste >5 min, le lock est automatiquement supprimé et une alerte `bssid_lock_auto_cleared` est envoyée au central (DB + Slack + dashboard temps réel).

### Config-watcher pause pendant OTA (v3.79+)

Avant chaque OTA, le config-watcher est mis en pause (2 min) pour éviter les 11x événements `config change detected` causés par l'extraction de l'archive. Un seul check différé est effectué à la reprise.

### Boot race condition WiFi (v3.84.3)

**Symptôme** : Après un reboot, wlan1 (RTL8192EU USB) perd la connectivité pendant ~2 min. Les logs montrent le watchdog escaladant les 6 phases de recovery immédiatement après le boot.

**Cause racine** : Le `internetWatchLoop` démarrait 10s après le boot de l'agent. Si wlan1 n'avait pas terminé WPA auth + DHCP (typiquement 15-30s pour un dongle USB), le watchdog détectait "pas de connectivité" → lançait la recovery → perturbait l'authentification en cours → cascade complète.

**Aggravé par E-23** : Les opérations HDMI au boot (xrandr, udev DRM, sysfs reads) augmentent la contention du bus PCIe RP1 du Pi 5, retardant l'initialisation USB WiFi.

**Fix (v3.84.3)** :

1. Grace period de 45s au boot (`enableGracePeriod('internet', 45000)` dans `start()`)
2. `autoOptimize` différé de 30s → 60s (les `iwlist scan` déstabilisaient le RTL8192EU)
3. Dépendance circulaire corrigée (lazy require)

**Diagnostic** :

```bash
# Vérifier la timeline boot → premier check internet
journalctl -u neopro-sync-agent --since "boot" --no-pager | grep -E "boot grace|Internet check|internetWatchLoop|Starting network"

# Vérifier que le grace period est bien actif au boot
journalctl -u neopro-sync-agent --since "boot" --no-pager | grep "grace period"

# Timeline complète boot WiFi (wlan1 WPA + DHCP)
journalctl --since "boot" --no-pager | grep -E "wlan1.*(associated|CTRL-EVENT|DHCP|inet )" | head -20
```

### Le watchdog ne tente pas de recovery ?

Causes possibles :

1. **Grace period active** : au boot (45s) ou après un `wpa_cli reconfigure` / auto-optimize (60s), le watchdog ignore les checks internet. Vérifier : `grep "grace period" /tmp/neopro-watchdog-grace.json`
2. **Cooldown actif** : après 6 tentatives échouées, 5 min de cooldown. Vérifier les logs pour "Trop de tentatives"
3. **Connexion Ethernet détectée** : si eth0 a une IP, le watchdog ne tente pas de recovery WiFi (problème physique)

---

## Hotspot Watchdog (v2.34+)

Depuis la version 2.34, un service de surveillance du hotspot est actif par défaut.

### Fonctionnement

Le watchdog vérifie toutes les 30 secondes :

- **brcmfmac firmware** (v3.69+) — crash silencieux du chip Broadcom (dmesg `brcmf_fw_crashed`)
- hostapd actif
- wlan0 en mode AP
- dnsmasq actif
- nginx actif (captive portal + webapp)
- avahi-daemon actif (résolution mDNS neopro.local)
- WiFi non bloqué par rfkill
- IP 192.168.4.1 configurée

En cas de problème, il tente une récupération automatique (max 3 tentatives, cooldown 5 min).

**Recovery proportionnelle (v3.116.26+) :** Si hostapd et dnsmasq sont actifs mais l'IP 192.168.4.1 est absente, le NetworkWatchdog applique un fast-path `ip addr add` sans redémarrer les services. Le restart complet hostapd+dnsmasq n'est déclenché que si un service est réellement down. Cela évite de couper tous les clients AP pour une simple IP manquante (dhcpcd lent).

**⚠️ Bug corrigé (v3.89.2) — faux positif brcmfmac :**

Avant v3.89.2, `check_brcmfmac()` utilisait `grep -c "brcmf_fw_crashed" || echo "0"`. Ce pattern est un antipattern bash classique : `grep -c` affiche `0` sur stdout ET retourne exit code 1 quand le count est 0, déclenchant `|| echo "0"` qui ajoute un second `0`. La variable contenait alors `"0\n0"` → erreur arithmétique bash → le check échouait systématiquement → **faux positif "firmware crash" → recovery toutes les 30s → hostapd redémarré en boucle → perte d'internet wlan1**.

**Symptôme** : Pi perd l'internet quelques secondes après le boot, nécessite un rebranchement physique. Les logs `/var/log/neopro-hotspot-watchdog.log` montrent des recoveries brcmfmac en boucle.

**Diagnostic** :

```bash
# Vérifier si le faux positif est actif (version non-patchée)
grep "brcmfmac firmware crash detected" /var/log/neopro-hotspot-watchdog.log | tail -5
# Si présent toutes les 30s → bug actif, mettre à jour vers v3.89.2+
```

**Monitoring (v3.89.2+)** : L'alerte Prometheus `ExcessiveHotspotRecovery` détecte >3 recovery/heure, signalant un faux positif ou une instabilité réelle.

**Séquence de recovery (v3.69+) :**

| Étape | Action                                                            |
| ----- | ----------------------------------------------------------------- |
| 0     | Recovery brcmfmac (`modprobe -r` / `modprobe`) si firmware crashé |
| 1     | Déblocage rfkill                                                  |
| 2     | Configuration IP statique 192.168.4.1                             |
| 3     | Redémarrage hostapd                                               |
| 4     | Redémarrage dnsmasq                                               |
| 5     | Redémarrage nginx                                                 |
| 6     | Redémarrage avahi-daemon                                          |

**Compatibilité Debian 13 (v3.116.26+) :** Sur Debian 13 (trixie), `dhcpcd` est remplacé par `systemd-networkd`. `fix-fleet-pi.sh` crée `/etc/systemd/network/10-wlan0-hotspot.network` comme fallback pour assigner 192.168.4.1 au hotspot quand dhcpcd est absent.

**Installation :** Depuis la v3.7.14, `install.sh` enregistre automatiquement le service `neopro-hotspot-watchdog` ainsi que `neopro-sync-guardian` et `neopro-hotspot-optimizer`. Pour les Pi installés avant cette version, utiliser `fix-fleet-pi.sh` pour installer les services manquants.

### Auto-optimisation canal WiFi (v3.61+)

Le `hotspot-optimizer.sh` optimise automatiquement le canal du hotspot au boot. Il scanne les réseaux WiFi visibles via wlan1 (sans perturber l'AP sur wlan0) et bascule vers le canal le moins congestionné (1, 6 ou 11). Depuis v3.69, il corrige aussi automatiquement TKIP → CCMP si détecté.

**Seuils (v3.116.26+) :** Congestion ≥ 5 réseaux sur le canal actuel, amélioration ≥ 3 réseaux vs meilleur canal. (v3.79 avait abaissé à ≥3/≥2, ce qui causait du channel flapping sur les signaux fluctuants. Les seuils ont été relevés en v3.116.26 avec un guard once-per-boot.)

**Scan unique (v3.84.6+) :** Le scan WiFi est effectué UNE SEULE fois au boot, puis les résultats sont mis en cache dans la variable `CACHED_SCAN`. Toutes les analyses de canal (1, 6, 11) parsent ce cache avec `grep` — aucun scan supplémentaire n'est déclenché. C'est critique car le RTL8192EU est single-radio : chaque `iwlist scan` coupe le carrier pendant ~6s. Avant cette correction, 5 scans consécutifs causaient une perte de carrier de 2-3 minutes à chaque boot.

**Attente wlan1 (v3.84.6+) :** Avant de scanner, le script attend que wlan1 obtienne une adresse IP (polling `ip addr show wlan1` toutes les 2s, max 30s). Le RTL8192EU met 15-30s pour WPA auth + DHCP au boot — scanner avant déstabilise la connexion.

**Coordination inter-processus (v3.84.9+) :** Deux processus distincts scannent wlan1 au boot : `hotspot-optimizer.sh` (boot +12s) et `NetworkDetector.detect()` dans le sync-agent (boot +60s). Sans coordination, ces deux scans s'additionnent et dépassent le seuil de tolérance de la Livebox (~12s d'absence = déassociation). Le cache inter-processus `/tmp/neopro-wlan1-scan-cache` + `/tmp/neopro-wlan1-scan-ts` (TTL 120s) garantit qu'un seul scan physique est effectué : le premier écrit le cache, le second le lit.

```
Boot +12s : hotspot-optimizer.sh → iwlist wlan1 scan → écrit /tmp/neopro-wlan1-scan-cache
Boot +60s : NetworkDetector.detect() → lit le cache (TTL 120s) → zéro scan supplémentaire
```

**Diagnostic :**

```bash
# Vérifier si l'auto-optimisation a agi
cat /var/log/neopro-hotspot-optimizer.log | tail -30

# Vérifier le scan unique (doit afficher "Performing single WiFi scan" UNE seule fois)
grep "single WiFi scan" /var/log/neopro-hotspot-optimizer.log

# Vérifier l'attente wlan1 (doit afficher "wlan1 is ready")
grep "wlan1 is ready" /var/log/neopro-hotspot-optimizer.log

# Vérifier la coordination inter-processus (NetworkDetector doit réutiliser le cache)
sudo journalctl -u neopro-sync-agent --since "5 min ago" | grep "scan cache"
# Attendu : "reusing wlan1 scan cache (avoids second scan)"
# Problème : "scan cache too old" → hotspot-optimizer n'a pas écrit le cache

# Vérifier le cache directement
cat /tmp/neopro-wlan1-scan-ts && echo "s old: $(($(date +%s) - $(cat /tmp/neopro-wlan1-scan-ts)))"
cat /tmp/neopro-wlan1-scan-cache | head -5

# Canal actuel
grep "^channel=" /etc/hostapd/hostapd.conf

# Scan manuel des réseaux par canal (utiliser wlan1, PAS wlan0 qui est l'AP !)
# ⚠️ ATTENTION : un seul scan à la fois, jamais deux en < 120s
sudo iwlist wlan1 scan 2>/dev/null | grep "Channel:" | sort | uniq -c | sort -rn
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
4. **Auto-clear (v3.79+)** : Si le Pi est connecté à un BSSID différent du BSSID verrouillé pendant >5 min (mismatch), le watchdog supprime automatiquement le lock et émet une alerte `bssid_lock_auto_cleared` vers le central

### Supprimer un BSSID lock existant

```bash
# Via admin panel
http://neopro.local:8080 → Onglet Réseau → Bouton "Supprimer le verrouillage"

# Ou manuellement
sudo sed -i '/bssid=/d' /etc/wpa_supplicant/wpa_supplicant.conf
sudo wpa_cli -i wlan1 reconfigure
```

### Diagnostic BSSID mismatch (v3.79+)

```bash
# Voir le BSSID actuellement connecté
wpa_cli -i wlan1 status | grep bssid

# Voir le BSSID verrouillé dans la config
grep -i bssid /etc/wpa_supplicant/wpa_supplicant*.conf

# Vérifier si le watchdog a auto-clear un lock
journalctl -u neopro-sync-agent --since "24 hours ago" | grep -i "bssid.*mismatch\|bssid.*auto-clear"
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

### Un moniteur PC est classifié "📺 TV" au lieu de "🖥️ Moniteur PC"

**Cause probable :** Le moniteur a un bloc CEA Extension dans son EDID (courant sur les moniteurs modernes pour la compatibilité HDMI audio/YCbCr), et le filtre `monitorOnlyMfg` est absent ou défaillant dans le code.

**Diagnostic :**

```bash
# Lire le manufacturer EDID
ssh pi@neopro.local
curl -s http://localhost:3000/api/hdmi-status | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'manufacturer={d.get(\"manufacturer\")}, display_type={d.get(\"display_type\")}, display_category={d.get(\"display_category\")}')"
```

**Fabricants PC-only (doivent toujours retourner `monitor`) :**
`LEN` (Lenovo), `DEL` (Dell), `ACI` (ASUS), `HWP` (HP), `BNQ` (BenQ), `ACR` (Acer), `EIZ` (EIZO), `NEC` (NEC), `AOC` (AOC)

**Si le manufacturer est dans la liste ci-dessus mais display_type = "tv" :**

1. Vérifier que `hdmi.service.js` a le filtre `monitorOnlyMfg` dans `getDisplayInfo()` ET `getFullStatus()`
2. Vérifier que `metrics.js` (sync-agent) a le **même** filtre dans `getDisplayInfo()` ET `getSecondaryDisplayInfo()`
3. Le dashboard utilise les données du sync-agent, pas du server — un oubli dans `metrics.js` cause une incohérence (incident LEN L27i-30, v3.99.2)

**Résolution :** Mettre à jour le Pi vers la version contenant le fix. Le heartbeat central envoie aussi une alerte `display_type_misclassification` si ce cas est détecté.

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

### Résolution écran en mode dégradé — `displayFallback` (v3.85.0+)

**Symptômes :**

- Le dashboard fleet affiche une alerte warning `display_fallback` pour un site
- `kiosk-status.json` contient `"displayFallback": "primary: xrandr+EDID unavailable"` (ou `secondary:`)
- L'image est en 1920×1080 sur une TV 4K (pas la résolution native)

**Cause :** La cascade de détection `get_output_resolution()` n'a trouvé la résolution à aucun des 3 premiers niveaux (xrandr geometry, xrandr preferred mode, EDID native) et a utilisé le fallback `DEFAULT_SCREEN_WIDTH`×`DEFAULT_SCREEN_HEIGHT`.

**Diagnostic :**

```bash
# 1. Vérifier xrandr
DISPLAY=:0 xrandr --query
# Chercher "HDMI-A-1 connected 3840x2160+0+0" (niveau 1: geometry)
# Ou "3840x2160  60.00*+" dans la liste des modes (niveau 2: preferred)

# 2. Vérifier EDID
ls /sys/class/drm/ | grep HDMI
# Exemple: card1-HDMI-A-1
edid-decode /sys/class/drm/card1-HDMI-A-1/edid 2>/dev/null | grep "DTD 1"
# Attendu: "DTD 1:  3840x2160  60.000000 Hz"

# 3. Vérifier le statut kiosk
cat /home/pi/neopro/data/kiosk-status.json | python3 -m json.tool | grep -E "displayFallback|SCREEN"
# "displayFallback": "" → cascade a trouvé la résolution
# "displayFallback": "primary: xrandr+EDID unavailable" → fallback default

# 4. Vérifier que edid-decode est installé
which edid-decode || echo "MANQUANT — sudo apt install edid-decode"
```

**Solutions :**

1. **TV éteinte ou câble HDMI défectueux** → vérifier connexion physique, l'EDID n'est envoyé que TV allumée
2. **`edid-decode` non installé** → `sudo apt install edid-decode` (niveau 3 de la cascade)
3. **TV lente à négocier** → le retry 3×2s devrait suffire, sinon vérifier `journalctl -u neopro-kiosk` pour les logs "EDID en cours"
4. **Forcer une résolution** (contournement temporaire) : `DISPLAY=:0 xrandr --output HDMI-A-1 --mode 3840x2160` puis restart kiosk

### Le type d'écran est "unknown" au lieu de "tv" ou "monitor"

**Cause :** L'heuristique n'a pas pu déterminer le type. Cela arrive si :

- `cec-client` n'est pas installé (`sudo apt install cec-utils`)
- L'EDID ne contient pas de CEA extension block (TV ancienne ou exotique)
- CEC est désactivé dans les paramètres de la TV

**Solution :** Installer `cec-utils` et vérifier que CEC est activé dans les réglages de la TV (souvent sous "Anynet+", "SimpLink", "Bravia Sync", "VIERA Link" selon le fabricant).

### Le dashboard affiche "✅ Connecté" alors qu'aucun HDMI n'est branché (v3.90.0+)

**Symptôme :** Dans le panneau "Santé système", la section "État TV (HDMI-CEC)" affiche "CONNEXION HDMI: ✅ Connecté", "CEC DISPONIBLE: ✅ Oui" et "PÉRIPHÉRIQUES CEC: 0" malgré l'absence de câble HDMI.

**Cause (Pi 5 uniquement) :** Sur Pi 5 avec le southbridge RP1, `cec-client` renvoie une réponse `power status:` même sans câble HDMI physiquement connecté. Le catch-all dans `_parseCecOutput()` interprète cette réponse comme `tv_connected = true` alors qu'il n'y a rien de branché. C'est un quirk matériel spécifique au Pi 5 ; le Pi 4 n'est pas affecté.

**Vérification :**

```bash
# Vérifier le statut DRM (fiable, basé sur la détection physique du câble)
cat /sys/class/drm/card1-HDMI-A-1/status
# "disconnected" → pas de câble → le CEC mentait

# Vérifier le statut CEC (non fiable sur Pi 5 sans câble)
echo "pow 0" | timeout 5 cec-client -s -d 1 2>/dev/null
# Peut renvoyer "power status: unknown" même sans câble
```

**Correctif (v3.90.0) :** `getFullStatus()` dans `hdmi.service.js` croise maintenant 3 signaux avant de reporter une connexion :

- `cec.tv_connected` (CEC, non fiable)
- `display.connected` (EDID/DRM sysfs, fiable)
- `cec.devices_found` (nombre de devices CEC)

Quand les 3 convergent vers "rien de branché" (`tv_connected=true` mais `devices_found=0` et `display.connected=false`), le faux positif CEC est corrigé automatiquement.

**Régression protégée par :** smoke test `hdmi.service.js getFullStatus must override CEC false positive when no EDID and no devices` + 3 unit tests dans `hdmi.service.test.js`.

### Débordement viewport et contenu coupé sur navigateur PC (v3.84.5+)

**Symptôme 1 — Débordement horizontal (~17px) :** Sur `neopro.local/tv` en plein écran depuis un navigateur PC, une scrollbar horizontale apparaît. Sur le Pi en mode kiosk, l'affichage est normal.

**Cause :** `width: 100vw` inclut la largeur des scrollbars sur navigateur PC, alors qu'en mode kiosk Chromium (Pi), il n'y a pas de scrollbar.

**Correctif (v3.84.5) :** `100vw` → `100%` dans tous les SCSS TV + `body:has(app-tv) { overflow: hidden }` dans `styles.scss`.

**Symptôme 2 — Contenu vidéo coupé sur les bords :** En plein écran sur PC, les bords de la vidéo sont rognés (ex: texte "NOS PARTENAIRES" coupé). Sur le Pi, tout est visible.

**Cause :** `object-fit: cover` zoome la vidéo pour remplir le conteneur et coupe les bords qui dépassent si le ratio moniteur ≠ ratio vidéo (ex: moniteur 16:10 vs vidéo 16:9). Sur le Pi (vidéo 1080p + TV 1080p = même ratio), `cover` = `contain` → aucun crop.

**Correctif (v3.84.7) :** `object-fit: cover` → `object-fit: contain` sur `.freeze-canvas`, `.double-buffer-player`, `.manual-player`. `contain` affiche tout le contenu avec bandes noires si le ratio ne matche pas.

**Vérification :**

```bash
# Vérifier qu'aucun composant TV n'utilise 100vw (doit retourner 0 résultat)
grep -rn '100vw' raspberry/src/app/components/tv/ raspberry/src/app/components/waiting-screen/ raspberry/src/app/components/wrong-port-screen/ --include='*.scss' | grep -v '//'

# Vérifier qu'aucun player vidéo TV n'utilise object-fit: cover
grep -n 'object-fit.*cover' raspberry/src/app/components/tv/tv.component.scss | grep -v '//'

# Vérifier que les smoke tests passent
npm run test:smoke -- --testNamePattern="100vw|object-fit"
```

**Smoke tests :** 8 tests empêchent la régression — 4 pour `100vw`, 4 pour `object-fit: cover`.

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
# Note: sponsor_impressions.json n'existe plus depuis v3.66 (pipeline consolidé).
# Si ce fichier existe encore, il est stale et sera supprimé automatiquement
# au prochain démarrage du sync-agent (cleanupLegacyFiles).
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

## Cloud Remote ne fonctionne pas (v3.69.3+)

### Symptôme 1 : Dashboard affiche "Succès" mais rien ne se passe sur le Pi

**Cause probable : Connexion zombie.** Le Pi apparaît connecté dans la Map `connectedSites`, mais le socket a été déconnecté sans que le handler `disconnect` ne se déclenche (partition réseau, timeout TCP silencieux). L'émission `io.to(siteId).emit()` envoie dans une room vide.

**Depuis v3.69.3 :** Le controller vérifie la room Socket.IO en plus de la Map. Si la room est vide, il retourne **503 "Connexion instable"** au lieu d'un faux succès. Le Pi se reconnecte automatiquement sous ~30s.

**Vérification :**

```bash
# Logs Railway — chercher les détections zombie
railway logs --service neopro-central --lines 50 --filter "zombie connection detected"

# Métrique Prometheus — compteur de commandes zombie
curl -s https://api.neopro.fr/metrics | grep 'neopro_commands_total{type=.*status="zombie"}'
```

### Symptôme 2 : Score / phase / timer marchent mais match-config ne fait rien

**Cause (< v3.69.3) :** Le handler `match-info-updated` manquait dans `raspberry/server/socket/handlers.js`. L'événement était relayé par le sync-agent au local server, mais le local server n'avait pas de listener et l'événement était silencieusement ignoré.

**Correction (v3.69.3) :** Handler `match-info-updated` ajouté — broadcast vers TV/Remote clients.

### Symptôme 3 : Les scores Pi → Dashboard ne remontent pas (dashboard live score vide)

**Cause (< v3.69.3) :** Mismatch `socket.data.siteId` vs `(socket as any).siteId` dans `score-update.handler.ts` et `match-config.handler.ts`. Socket.IO v4 sépare `socket.data` (objet vide `{}`) et les propriétés directes du socket. Le `siteId` était `undefined` → early return silencieux.

**Correction (v3.69.3) :** Accès unifié via `(socket as any).siteId` — cohérent avec `socket.service.ts`.

### Symptôme 4 : Les commandes cloud remote sont envoyées mais le sync-agent les drop silencieusement

**Cause :** La connexion locale (sync-agent → Pi local server port 3000) est coupée. Le `relayToLocalServer()` appelait `localSocket.emit()` qui retournait `false` sans log visible.

**Depuis v3.69.3 :** `relayToLocalServer()` logge un **warn** quand un événement est droppé :

```
☁️ Cloud remote event DROPPED — local server not connected { eventName: 'score-update' }
```

**Vérification sur le Pi :**

```bash
# Vérifier les logs du sync-agent
journalctl -u neopro-sync -n 50 --no-pager | grep -E "DROPPED|relayed"

# Vérifier que le local server tourne
systemctl is-active neopro-server

# Vérifier la connexion locale
journalctl -u neopro-sync -n 20 --no-pager | grep "local server"
```

### Chaîne complète du relay cloud remote

```
Dashboard (Angular)
    │
    ▼ HTTP POST /api/remote/:siteId/command
Central Server (remote.controller.ts)
    │ ✅ Vérifie room membership (anti-zombie)
    ▼ io.to(siteId).emit(eventName, payload)
Sync-Agent (agent.js — sur le Pi)
    │ ✅ Logge warn si drop
    ▼ relayToLocalServer(eventName, data) → localSocket.emit()
Pi Local Server (handlers.js — port 3000)
    │
    ▼ socket.broadcast.emit() → TV Angular component
```

**Événements relayés :**

| Commande dashboard | Événement central→Pi  | Événement local→TV   |
| ------------------ | --------------------- | -------------------- |
| `play-video`       | `cloud-remote-action` | `command`            |
| `play-sponsors`    | `cloud-remote-action` | `command`            |
| `score-update`     | `score-update`        | `score-update`       |
| `score-reset`      | `score-reset`         | `score-reset`        |
| `phase-change`     | `phase-change`        | `phase-change`       |
| `timer-update`     | `timer-update`        | `timer-update`       |
| `breaking-news`    | `breaking-news`       | `breaking-news`      |
| `match-config`     | `match-info-updated`  | `match-info-updated` |
| `recording-toggle` | `recording-toggle`    | `recording-toggle`   |
| `screenshot`       | `screenshot-request`  | `screenshot-request` |

---

## 500/429 cascade sur GET /api/deployments (v3.82.1+)

### Symptôme

Le dashboard affiche "Failed to load deployments" dans la console. Les logs réseau montrent :

```
GET /api/deployments → 500 (Internal Server Error)
GET /api/deployments → 429 (Too Many Requests)  ← retries bloqués par rate limiter
GET /api/logs/frontend → 429                     ← rate limiter global déclenché
```

L'onglet "Historique" de Content Management et les pending deployments du site ne chargent pas.

### Cause

`findAllWithDetails()` dans `deployment.repository.ts` n'avait **pas de clause LIMIT**. La requête retournait TOUS les déploiements de la base (JOINs sur `videos` + `sites`), causant un timeout PostgreSQL sur Supabase Transaction Mode (pool=5). Le 500 déclenche des retries Angular qui saturent le rate limiter → 429 en cascade.

### Correction (v3.82.1)

- `findAllWithDetails(limit=200)` : clause `LIMIT $1` paramétrisée (défaut 200)
- Controller : accepte `?limit=` query param (clampé 1–500, défaut 200)
- Smoke test : 2 guards vérifient la présence et la paramétrisation du LIMIT

### Vérification

```bash
# Vérifier que l'endpoint répond (production)
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
  "https://neopro-central-production.up.railway.app/api/deployments?limit=10"
# Doit retourner 200

# Vérifier les logs Railway pour les erreurs de déploiement
railway logs --service neopro-central --lines 20 --filter "Error fetching deployments"

# Vérifier le nombre de déploiements en base
source central-server/.env && psql "$DATABASE_URL" -c \
  "SELECT COUNT(*) as total, MIN(created_at) as oldest FROM content_deployments;"
```

### Monitoring

Le smoke test `Deployment repository query safety` (2 assertions) empêche la régression :

- `findAllWithDetails must have a LIMIT clause`
- `findAllWithDetails LIMIT must be parameterized`

Si le nombre total de `content_deployments` dépasse 10 000 lignes, envisager une purge des déploiements `completed` de plus de 6 mois, ou ajouter une pagination côté dashboard.

---

## Second écran ne s'affiche pas (v3.82.7+)

Le Pi supporte un second écran (HDMI-A-2) affichant la route `/secondary` via un deuxième processus Chromium. Cette section couvre les problèmes de dual-display sur Raspberry Pi 5.

### Symptôme

Le second écran (HDMI-1) reste noir ou ne montre rien. Un seul écran (le principal `/tv`) est visible.

> **Note v3.98.7+** : Le toggle `secondaryDisplayEnabled` a été supprimé du dashboard. Le Pi détecte désormais le dual-display par hardware (DRM sysfs + xrandr). Si vous êtes sur une version antérieure, les anciennes causes liées au toggle config sont documentées ci-dessous.

### Causes connues et corrections

#### 1. xrandr ne détecte pas le second écran (grep `\d` au lieu de `[0-9]`)

**Cause :** `grep -E '\d'` utilise `\d` qui est une syntaxe Perl regex uniquement. Avec `grep -E` (extended regex), `\d` matche le caractère littéral `d`, pas les chiffres.

**Correction (v3.82.3) :** Remplacer `\d` par `[0-9]` dans les patterns grep -E.

**Diagnostic :**

```bash
# Vérifier que le watchdog utilise [0-9] et non \d
grep 'grep -E.*HDMI.*connected' /home/pi/neopro/scripts/kiosk-watchdog.sh
# Attendu: grep -E '^HDMI.* connected [0-9]'
# Si \d est présent: ancienne version
```

#### 2. xrandr utilise le mot-clé "primary" (absent sur Pi 5)

**Cause :** Pi 5 ne marque pas de sortie HDMI comme "primary" dans xrandr. L'ancienne détection par `grep "primary"` ne trouvait rien.

**Correction (v3.82.2) :** Détection par offset de position — la sortie à `+0+0` est le primaire, toute sortie avec un offset non-nul est le secondaire.

**Diagnostic :**

```bash
# Vérifier la détection xrandr
DISPLAY=:0 xrandr --query | grep 'HDMI.*connected'
# Attendu: 2 lignes avec résolutions (ex: 1920x1080+0+0 et 3840x2160+1920+0)
```

#### 3. `--kiosk` force le plein écran sur le moniteur principal

**Cause :** `--kiosk` (et `--start-fullscreen`) ignorent `--window-position` et forcent le plein écran sur l'écran primaire. Le processus Chromium secondaire tourne mais sa fenêtre est invisible (superposée au primaire).

**Correction (v3.82.8) :** Utiliser `--app=URL` au lieu de `--kiosk` pour le Chromium secondaire. `--app` crée une fenêtre sans onglets/barre d'adresse qui respecte `--window-position`. Ensuite, `xprop _MOTIF_WM_HINTS` supprime les décorations (title bar) et `xdotool windowmove/windowsize` force la taille exacte du moniteur. **NB :** `F11` ne marche PAS pour le plein écran par-moniteur — il prend tout le bureau X11 virtuel (les 2 écrans combinés).

**Diagnostic :**

```bash
# Vérifier que le watchdog utilise --app= (pas --kiosk) pour le secondaire
grep -A2 'start_chromium_secondary' /home/pi/neopro/scripts/kiosk-watchdog.sh | head -5

# Vérifier les fenêtres Chromium visibles
DISPLAY=:0 xdotool search --name "" getwindowgeometry 2>/dev/null
# Attendu: 2 fenêtres — une à 0,0 (primaire) et une à 1920,0+ (secondaire)

# Vérifier les processus Chromium
ps aux | grep chromium | grep -v grep
# Attendu: 2 groupes de processus (un avec /tv, un avec /secondary)
```

#### 4. ~~Pas de CONFIG_FILE ou mauvais chemin~~ (obsolète v3.98.7+)

**Historique :** Le watchdog lisait `secondaryDisplayEnabled` depuis la config. Depuis v3.98.7, le watchdog ignore ce flag et détecte le dual-display par hardware (DRM sysfs + xrandr). Ce problème ne peut plus se produire.

**Diagnostic (v3.98.7+) :**

```bash
# Vérifier la détection hardware directement
cat /sys/class/drm/card1-HDMI-A-1/status  # HDMI-0
cat /sys/class/drm/card1-HDMI-A-2/status  # HDMI-1
# Les deux doivent afficher "connected" pour le dual-display
```

### Monitoring intégré

Le watchdog écrit l'état du second écran dans `/home/pi/neopro/data/kiosk-status.json` :

```json
{
  "dualDisplayActive": true,
  "secondaryChromiumAlive": true,
  "hdmi1Status": "connected"
}
```

**Vérification sur un Pi :**

```bash
cat /home/pi/neopro/data/kiosk-status.json | python3 -m json.tool
# Vérifier dualDisplayActive=true et hdmi1Status="connected"
```

### Smoke tests de régression

7 smoke tests empêchent la régression (dans `smoke.test.ts`, section "E-22 watchdog secondary display guard") :

1. `grep [0-9]` (pas `\d`) pour la détection HDMI xrandr
2. `--app=URL` (pas `--kiosk`) pour le Chromium secondaire
3. `xprop _MOTIF_WM_HINTS` + `xdotool windowsize` pour le plein écran par-moniteur (PAS F11)
4. Même chose pour le primaire en mode dual-display (PAS F11)
5. Détection par offset de position (pas par mot-clé "primary")
6. `--user-data-dir` séparé pour éviter les conflits de session
7. `--window-position` et `--window-size` pour le positionnement
8. ~~Lecture de `secondaryDisplayEnabled` depuis la config~~ (supprimé v3.98.7 — détection hardware)
9. `tv.component hdmiConnected must use hdmi0 OR hdmi1` (v3.98.7+)
10. `deployment.service must NOT gate secondary variant on secondary_display_enabled` (v3.98.7+)

### Fix manuel (Pi non encore mis à jour)

```bash
# Vérifier la version
cat /home/pi/neopro/webapp/version.json

# Si < 3.82.7, déployer la dernière version via l'admin
# http://neopro.local:8080 → Upload & Deploy

# Vérification après déploiement
sudo systemctl restart neopro-kiosk
journalctl -u neopro-kiosk -f --no-pager | head -30
# Chercher: "✓ Chromium secondaire lancé" et "✓ Chromium secondaire plein écran par-moniteur (xprop+xdotool"
```

---

---

## Deux écrans désynchronisés (v3.82.10+)

Les deux écrans s'affichent correctement en plein écran (xprop/xdotool OK), mais les vidéos ne sont pas synchronisées — chaque écran joue sa boucle indépendamment.

### Symptôme

Les deux écrans jouent des vidéos différentes ou la même vidéo avec un décalage. Le score, les breaking news et les phases sont synchronisés, mais la boucle vidéo ne l'est pas.

### Causes connues et corrections

#### 1. Le slave ne pause pas sa boucle indépendante (< v3.82.10)

**Cause :** `startSeamlessLoop()` est appelé pendant `ngOnInit()` (ligne 229) AVANT que `tv-register` soit émis (ligne 442). Le slave jouait donc sa boucle complètement seul pendant le round-trip Socket.IO, et ne s'arrêtait pas quand le rôle slave arrivait.

**Correction (v3.82.10) :** Quand `tv-role-assigned` arrive avec `role: 'slave'`, on pause immédiatement `playerA` et `playerB` et on affiche un freeze-frame. Le slave attend maintenant la directive du master via `tv-loop-state`.

#### 2. La sync par `videoPath` échoue avec les variants secondaires (< v3.82.10)

**Cause :** Le master émet `videoPath` original (ex: `/media/videos/pub1.mp4`), mais le slave secondaire utilise les variants (ex: `/media/videos/pub1_secondary.mp4`). `findIndex(v => v.path === state.videoPath)` retournait toujours -1. Le fallback par index existait mais n'incluait pas le seek approximatif.

**Correction (v3.82.10) :** On utilise **toujours** `state.videoIndex` (fiable car les deux boucles ont le même ordre), avec seek approximatif au temps du master.

#### 3. Le slave relance la boucle indépendamment sur `switchToPhase()` (< v3.82.10)

**Cause :** Quand la télécommande change la phase (avant/pendant/après match), `switchToPhase()` appelle `startSeamlessLoop()` qui relançait la boucle indépendamment même en mode slave.

**Correction (v3.82.10) :** `startSeamlessLoop()` retourne immédiatement quand `isSlaveMode === true`.

### Diagnostic

```bash
# 1. Vérifier les rôles assignés
journalctl -u neopro-kiosk --no-pager | grep '\[TV\] Role assigned'
# Attendu: "master, displayType: tv" ET "slave, displayType: secondary"
# Si les deux sont "master" → problème de Socket.IO (vérifier le serveur local)

# 2. Vérifier que le slave a pausé
journalctl -u neopro-kiosk --no-pager | grep '\[TV\] Slave'
# Attendu: "paused independent loop" puis "syncing to index"
# Si absent → ancienne version sans le fix

# 3. Vérifier la réception des événements master
journalctl -u neopro-kiosk --no-pager | grep 'Slave.*sync'
# Attendu: lignes "Slave: syncing to index N (master: path, local: path)"
# Si absent → le master n'émet pas ou le serveur ne relaie pas

# 4. Vérifier le serveur Socket.IO
journalctl -u neopro-app --no-pager | grep 'TV-Sync'
# Attendu: "Registered as master" et "Registered as slave"
```

### Smoke tests de régression

6 smoke tests empêchent la régression (dans `smoke.test.ts`) :

1. `tv-role-assigned` handler doit pauser `playerA` et `playerB` quand slave
2. `startSeamlessLoop` doit retourner immédiatement en mode slave
3. `handleMasterLoopState` doit synchroniser par `videoIndex` (pas `videoPath`)
4. `onVideoEnded` doit afficher freeze-frame et attendre le master quand slave
5. Server `tv-register` doit assigner rôle et envoyer loopState aux slaves
6. Server `tv-loop-update` doit vérifier le master et broadcaster aux slaves

---

## Vidéo secondaire identique à la principale (v3.82.11+)

L'écran secondaire affiche la **même vidéo** que l'écran principal au lieu de la variante secondaire, uniquement quand une vidéo est lancée manuellement (depuis la télécommande ou les catégories).

### Symptôme

La boucle vidéo affiche bien les variantes secondaires (format banner, LED, etc.), mais dès qu'on clique sur une vidéo dans la télécommande, l'écran secondaire joue la vidéo principale au lieu de sa variante secondaire. Le retour à la boucle restaure les bonnes variantes.

### Cause racine

Le serveur Socket.IO broadcast le `command` (`io.emit('action', data)`) à **tous** les clients. Le command contient le chemin de la vidéo principale. La résolution de la variante display (`resolveDisplayVariant`, anciennement `resolveSecondaryVariant`) n'était appliquée que dans `getLoopVideosForPhase()` pour la boucle, mais **pas** pour les vidéos manuelles. Trois points d'entrée étaient affectés :

1. **Handler `action` Socket.IO** : `this.play(command.data)` jouait le path principal
2. **Handler `onCommand` BroadcastChannel** : idem
3. **`handleMasterLoopState` CAS 1** : le slave reconstruisait un `Video` avec `state.manualVideoPath` (path du master) sans résolution de variante

### Correction (v3.82.11)

Ajout de `resolveDisplayVariant()` (anciennement `resolveSecondaryVariant()`, renommée Phase 5 PROP-002) qui :

1. Vérifie `video.variants?.[displayType]?.path` (quand l'objet Video inclut les variants pour ce type d'écran)
2. Sinon, cherche dans la configuration complète via `findVideoInConfig(path)` : sponsors → timeCategories.loopVideos → categories.videos (récursif)
3. Retourne le path de la variante si trouvé, ou le path original sinon

Appliqué aux 3 points d'entrée avant chaque appel à `play()`.

### Diagnostic

```bash
# 1. Vérifier que la résolution de variante fonctionne
journalctl -u neopro-kiosk --no-pager | grep 'resolved:'
# Attendu (secondary): "master switched to manual video: /path/primary.mp4 (resolved: /path/secondary.mp4)"
# Si absent → ancienne version sans le fix

# 2. Vérifier le displayType
journalctl -u neopro-kiosk --no-pager | grep 'Display type'
# Attendu: "Display type: secondary" pour l'écran HDMI 1

# 3. Vérifier que la vidéo a bien une variante secondaire dans configuration.json
cat /home/pi/neopro/webapp/configuration.json | python3 -m json.tool | grep -A5 '"secondary"'
# Attendu: { "path": "...", "filename": "..." }
# Si absent → la vidéo n'a pas été déployée avec variante secondaire
```

### Smoke tests de régression

2 smoke tests supplémentaires (dans `smoke.test.ts`, 291 total) :

1. Les handlers `action` et `handleMasterLoopState` doivent appeler `resolveDisplayVariant` avant `play()`
2. `resolveDisplayVariant` doit exister, vérifier `displayType`, et avoir `findVideoInConfig` pour le fallback

---

## Variants secondaires perdues après sync replace (v3.87.3+, ADR-032)

Les variantes secondaires (dual-display) disparaissent après un `update_config` en mode `replace`. L'écran secondaire joue la même vidéo que le principal, bien que le fichier secondaire soit physiquement présent sur le Pi.

### Symptôme

- Le fichier secondaire existe dans `videos-secondary/` mais `configuration.json` ne contient aucun `variants.secondary`
- Les logs montrent `[TV] Secondary: no variant found for video, using primary path`
- Le problème apparaît **après** une sync centrale, pas immédiatement après le déploiement de la variante

### Cause racine (corrigée en v3.87.3)

`applyReplaceMode()` dans `update-config.js` remplaçait les champs `sponsors`, `categories`, `timeCategories` en bloc sans appeler `restoreSecondaryVariants()`. Le mode `merge` appelait bien cette fonction via `mergeConfigurations()`, mais le mode `replace` l'omettait.

### Diagnostic

```bash
# 1. Vérifier les variants dans configuration.json
python3 -c "
import json
cfg = json.load(open('/home/pi/neopro/webapp/configuration.json'))
found = 0
for s in cfg.get('sponsors', []):
    if s.get('variants', {}).get('secondary', {}).get('path'):
        found += 1; print(f'  sponsor: {s[\"path\"]} -> {s[\"variants\"][\"secondary\"][\"path\"]}')
for tc in cfg.get('timeCategories', []):
    for v in tc.get('loopVideos', []):
        if v.get('variants', {}).get('secondary', {}).get('path'):
            found += 1; print(f'  loopVideo: {v[\"path\"]} -> {v[\"variants\"][\"secondary\"][\"path\"]}')
for cat in cfg.get('categories', []):
    for v in cat.get('videos', []):
        if v.get('variants', {}).get('secondary', {}).get('path'):
            found += 1; print(f'  category: {v[\"path\"]} -> {v[\"variants\"][\"secondary\"][\"path\"]}')
print(f'Total variants: {found}')
"

# 2. Vérifier les fichiers secondaires physiques
ls -la /home/pi/neopro/videos-secondary/*/

# 3. Vérifier les logs de restauration
journalctl -u neopro-sync-agent --no-pager --since "1 hour ago" | grep -E 'variants|restore|replace mode'
# Attendu: "Secondary variants preserved in replace mode" ou "Variants secondaires restaurées"
# Si "partially lost" → bug non résolu, contacter support
```

### Solution immédiate (si variants perdues sur Pi live)

Redéployer la variante secondaire depuis le dashboard central, ou redémarrer le sync-agent après mise à jour du code :

```bash
sudo systemctl restart neopro-sync-agent
```

### Smoke tests de régression

2 smoke tests (section E-41 dans `smoke.test.ts`) :

1. `update-config must import restoreSecondaryVariants from config-merge`
2. `update-config must call restoreSecondaryVariants after applyReplaceMode`

---

## Vidéo secondaire ne se lance pas (boucle reste visible) — ADR-033

L'écran secondaire reste sur la boucle quand on clique une vidéo manuelle depuis la télécommande, alors que l'écran principal joue bien la vidéo.

### Symptôme

- L'écran principal joue la vidéo manuellement déclenchée ✅
- L'écran secondaire continue d'afficher la boucle ❌
- Les logs du secondary montrent `tv player : error playing manual video`
- La télécommande affiche bien le badge "2nd" (variants présentes dans la config)

### Cause racine (corrigée en v3.87.4)

Ni Nginx ni le admin-server (port 8080) ne servaient le dossier `/videos-secondary/`. Quand le secondary display tentait de charger `videos-secondary/xxx.mp4`, Nginx retournait `index.html` (fallback SPA Angular) au lieu du fichier vidéo. Le `<video>.play()` échouait silencieusement, le catch handler cachait les overlays, et la boucle restait visible.

### Diagnostic

```bash
# 1. Tester le serving de la vidéo secondaire
curl -sI http://localhost/videos-secondary/category/video.mp4 | head -5
# Attendu: HTTP/1.1 200 OK, Content-Type: video/mp4
# Bug: HTTP/1.1 200 OK, Content-Type: text/html (= retourne index.html)

# 2. Vérifier que le fichier existe physiquement
ls -la /home/pi/neopro/videos-secondary/*/

# 3. Vérifier la config Nginx
sudo nginx -T 2>/dev/null | grep -A3 'videos-secondary'
# Attendu: location /videos-secondary/ avec proxy_pass vers 8080

# 4. Vérifier le admin-server
curl -sI http://localhost:8080/videos-secondary/category/video.mp4 | head -5
```

### Solution immédiate

```bash
# Après mise à jour OTA (le code est déjà corrigé) :
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl restart neopro-admin
```

### Autres causes possibles

#### Écran noir sur le secondary (path erroné dans config)

`deploySecondaryVariant()` utilisait le filename du fichier primaire au lieu de `finalFilename`. Résultat : le path dans `configuration.json` pointait vers un fichier inexistant.

```bash
# Vérifier les paths dans la config
python3 -c "
import json
with open('/home/pi/neopro/webapp/configuration.json') as f:
    cfg = json.load(f)
for s in cfg.get('sponsors', []):
    v = s.get('variants', {}).get('secondary', {})
    if v.get('path'):
        import os
        p = '/home/pi/neopro/' + v['path']
        print(f\"{'✅' if os.path.exists(p) else '❌'} {v['path']}\")"
```

Corrigé dans `deploy-video.js` : `secondaryRelativePath` utilise `finalFilename`.

#### Boucle visible au lieu de la vidéo (race condition master-slave)

Le slave reçoit l'event `action` et démarre la vidéo manuelle, mais un `tv-loop-state` stale (émis par le master AVANT l'action, avec `isManualMode: false`) arrive au slave APRÈS et déclenche `stopManualVideoAndReturnToLoop()`.

```bash
# Vérifier les logs pour la race condition
journalctl -u neopro-app --since '5 minutes ago' | grep -E 'ignoring stale|master returned to loop'
# Si "ignoring stale loop state" apparaît = guard fonctionne
# Si "master returned to loop" apparaît juste après "tv action received" = race condition non protégée
```

Corrigé dans `tv.component.ts` : émission immédiate du master + guard `_lastActionReceivedAt` sur le slave.

#### Décalage visible entre écrans (vidéo manuelle) — ADR-034

Les écrans primaire et secondaire jouent la vidéo manuelle mais avec un décalage visible (~300ms). Corrigé en v3.89.0 (preload/reveal) puis affiné en v3.89.3 (preload silencieux + reveal instantané, ~10ms de décalage).

```bash
# Vérifier que le slave utilise bien le preload/reveal silencieux (ADR-034 v3.89.3+)
journalctl -u neopro-kiosk --no-pager | grep -E 'preloading manual video|revealing preloaded'
# Attendu: "Slave: preloading manual video silently (no freeze/overlay)" PUIS "revealing preloaded manual video (instant)"

# Si "preloading manual video silently" n'apparaît PAS mais "preloading manual video" oui
# → Version v3.89.0/v3.89.1 (freeze+overlay, décalage ~50ms). OTA update vers v3.89.3+

# Si "Slave: preloading manual video" n'apparaît PAS du tout
# → Vieille version sans ADR-034. OTA update vers v3.89.3+

# Vérifier les compteurs de monitoring
journalctl -u neopro-kiosk --no-pager | grep -E 'preloadRevealCount|preloadCleanupCount'
```

Si le slave preload mais ne reveal jamais, vérifier que le master émet bien `manualVideoVisible: true` :

```bash
journalctl -u neopro-kiosk --no-pager | grep 'tv-loop-update.*manualVideoVisible'
```

#### Flash de boucle lors d'un remplacement manual→manual sur secondaire — ADR-034 v3.89.3

Quand une vidéo manuelle est déjà en cours et qu'on en déclenche une autre, le secondaire montre brièvement la boucle. Corrigé en v3.89.3 : `preloadManualVideo()` détecte la transition manual→manual et capture un freeze-frame.

```bash
# Vérifier la détection manual→manual
journalctl -u neopro-kiosk --no-pager | grep 'manual.*manual.*transition'
# Attendu: "Slave: manual→manual transition, capturing freeze-frame"
```

### Smoke tests de régression

19 smoke tests (sections E-41 + ADR-033 + ADR-034 dans `smoke.test.ts`) :

1. `admin-server must import SECONDARY_VIDEOS_DIR from helpers`
2. `admin-server must register /videos-secondary static route`
3. `helpers must define SECONDARY_VIDEOS_DIR pointing to videos-secondary`
4. `Nginx must have location /videos-secondary/ proxying to admin-server`
5. `install.sh must generate Nginx location for /videos-secondary/`
6. `secondaryRelativePath must NOT use buildRelativePath directly`
7. `secondaryRelativePath must reference finalFilename`
8. `action handler must set _lastActionReceivedAt timestamp`
9. `handleMasterLoopState CAS 2 must check _lastActionReceivedAt guard`
10. `play() must emit immediate tv-loop-update with isManualMode:true for master`

---

## HDMI non détecté par le watchdog (v3.84+)

Le watchdog ne réagit pas au branchement/débranchement d'un écran HDMI.

### Symptôme

L'écran est branché mais le statut HDMI reste `disconnected` dans `/tmp/kiosk-status.json` ou dans le panneau admin (port 8080). La LED ne change pas de pattern.

### Causes possibles

1. **udev rules manquantes** — le fichier `/etc/udev/rules.d/99-neopro-hdmi-hotplug.rules` n'existe pas
2. **Script notify non exécutable** — `neopro-hdmi-notify.sh` n'a pas le bit +x
3. **Sysfs path incorrect** — le Pi utilise un chemin DRM différent (Pi 4 vs Pi 5)
4. **Watchdog pas redémarré** après mise à jour des udev rules

### Diagnostic

```bash
# 1. Vérifier la présence des udev rules
ls -la /etc/udev/rules.d/99-neopro-hdmi-hotplug.rules
# Attendu: fichier présent

# 2. Vérifier les chemins DRM sysfs
cat /sys/class/drm/card1-HDMI-A-1/status 2>/dev/null || cat /sys/class/drm/card0-HDMI-A-1/status
# Attendu: "connected" si un écran est branché

# 3. Tester le hotplug manuellement
udevadm monitor --property --subsystem-match=drm
# Puis brancher/débrancher un câble HDMI — doit afficher un événement

# 4. Vérifier le flag file
ls -la /tmp/hdmi-changed
# Doit être présent et récent après un hotplug

# 5. Vérifier le statut watchdog
cat /tmp/kiosk-status.json | python3 -m json.tool | grep -E 'hdmi|HDMI'

# 6. Vérifier les logs watchdog
journalctl -u neopro-kiosk --no-pager -n 50 | grep -i hdmi
```

### Correction

```bash
# Recharger les udev rules
sudo udevadm control --reload-rules && sudo udevadm trigger

# Redémarrer le watchdog
sudo systemctl restart neopro-kiosk
```

### Smoke tests de régression

- `udev rules file must exist for HDMI hotplug`
- `neopro-hdmi-notify.sh must write flag file atomically`
- `kiosk-watchdog.sh must check HDMI flag file for fast hotplug reaction`

---

## Écran branché sur la mauvaise prise HDMI (v3.84+)

L'écran est branché sur HDMI-1 au lieu de HDMI-0 (port le plus proche de l'alimentation USB-C).

### Symptôme

- LED clignote rapidement (200ms on/off)
- 2 bips courts du buzzer
- Message "Écran branché sur le mauvais port" affiché sur l'écran
- Kiosk Chromium pas en plein écran (fenêtre dans un coin) — **corrigé en v3.111.1**

### Comportement actuel (v3.111.1+)

1. **Boot swap immédiat** : Si seul HDMI-1 est connecté au boot, le watchdog exécute `xrandr --output HDMI-A-2 --primary --auto` **immédiatement avant** de lancer Chromium. Pas de délai 10s.
2. **Monitoring** : Le heartbeat remonte `hdmiStatus.hdmiSwapped: true` et `hdmiStatus.wrongPort: true` au central. Le champ est visible dans `kiosk-status.json`.
3. **Runtime auto-swap** : Si le wrong-port est détecté en cours de fonctionnement (pas au boot), l'auto-swap se déclenche après 10s dans le watchdog loop.
4. **Reverse swap** : Si HDMI-0 est rebranché, le système revient automatiquement sur HDMI-0.

### Diagnostic

```bash
# 1. Vérifier quel port est connecté
cat /sys/class/drm/card1-HDMI-A-1/status  # HDMI-0
cat /sys/class/drm/card1-HDMI-A-2/status  # HDMI-1
# Si HDMI-1=connected et HDMI-0=disconnected → mauvaise prise confirmée

# 2. Vérifier les flags watchdog
ls -la /tmp/hdmi-swapped      # Présent = swap actif, l'écran fonctionne sur HDMI-1
ls -la /tmp/hdmi-wrong-port   # Présent = wrong port détecté (avant swap)

# 3. Vérifier le statut watchdog complet
cat /home/pi/neopro/data/kiosk-status.json | python3 -m json.tool
# Champs clés : hdmiSwapped, wrongPort, primaryResolution
```

### Correction

1. **Solution permanente** : Débrancher et rebrancher l'écran sur HDMI-0 (port le plus proche de l'alimentation)
2. **Solution automatique** : Le boot swap immédiat gère le cas transparently — plein écran garanti même sur HDMI-1
3. **Guide de marquage** : Voir `docs/guides/HDMI_MARKING_GUIDE.md` pour marquer physiquement les ports

### Smoke tests de régression

- `kiosk-watchdog must have detect_wrong_port function`
- `kiosk-watchdog must do xrandr --primary --auto BEFORE start_chromium when only HDMI-1`
- `kiosk-status.json must include hdmiSwapped and wrongPort fields`
- `config.txt must have hdmi_force_hotplug entries`

---

## Failover dual-display — HDMI-0 perdu (v3.84+)

En mode dual-display, l'écran principal (HDMI-0) est déconnecté. Le système bascule automatiquement le secondaire en mode TV complet.

### Symptôme

- L'écran secondaire (HDMI-1) affiche soudainement le contenu complet au lieu du contenu secondaire
- Le panneau admin affiche "Failover actif"
- Le heartbeat remonte `hdmiStatus.failover: true`

### Diagnostic

```bash
# 1. Vérifier le flag failover
ls -la /tmp/hdmi-failover-active
# Présent = failover en cours

# 2. Vérifier l'état des ports
cat /tmp/kiosk-status.json | python3 -m json.tool
# Attendu: hdmi0Status=disconnected, hdmiFailoverActive=true

# 3. Vérifier le processus Chromium
pgrep -a chromium
# En failover: un seul processus Chromium (le secondary promu)

# 4. Logs du watchdog
journalctl -u neopro-kiosk --no-pager -n 50 | grep -i failover

# 5. Vérifier côté Angular (dans la console navigateur)
# Le displayType doit être passé de 'secondary' à 'tv' après promotion
```

### Restauration automatique (v3.96+)

Quand HDMI-0 est rebranché, `deactivate_hdmi_failover()` exécute 7 phases :

1. **Kill Chromium** — Arrêt de tous les processus Chromium (SIGTERM → SIGKILL) AVANT toute reconfiguration xrandr (obligatoire, sinon corruption GPU V3D sur Pi 5)
2. **Forçage xrandr par port physique** — Force HDMI-0 (HDMI-A-1) comme primaire à `+0+0` et HDMI-1 (HDMI-A-2) en `--right-of`. Cette étape est critique : après failover, HDMI-1 est à offset `+0+0` (promu), et `setup_secondary_xrandr()` identifie le primaire par offset → sans forçage, HDMI-1 resterait primaire
3. **setup_secondary_xrandr** — Configure la géométrie fine dual-display (résolution native, offsets)
4. **Relance Chromium primaire** sur HDMI-0 avec `xprop _MOTIF_WM_HINTS` + `xdotool windowactivate` (évite barre de tâches visible)
5. **Relance Chromium secondaire** sur HDMI-1
6. **Vérification post-recovery** — Vérifie que HDMI-0 est bien à offset `+0+0` dans xrandr. Si anomalie détectée, log `RECOVERY ANOMALIE` pour diagnostic
7. **Cleanup** — Émet `tv-role-demotion`, supprime `/tmp/hdmi-failover-active`, met à jour `kiosk-status.json`

### Restauration manuelle

```bash
# Si la restauration automatique échoue
sudo systemctl restart neopro-kiosk
```

### Smoke tests de régression

- `kiosk-watchdog must have activate/deactivate_hdmi_failover functions`
- `deactivate_hdmi_failover must force HDMI-0 (HDMI-A-1) as primary BEFORE setup_secondary_xrandr`
- `check_secondary_chromium must handle HDMI failover`
- `stop_chromium_primary must use SIGTERM before SIGKILL`
- `handlers.js must emit tv-role-promotion and tv-role-demotion`

---

## Faux failover au boot — Pi single-display (v3.98.6, résolu définitivement v3.98.7)

Le Pi déclenche un failover HDMI au boot alors qu'un seul écran est branché. Le bureau LXDE est visible 3-5s pendant le kill/restart de Chromium.

### Symptôme

- Bureau LXDE visible brièvement (~3-5s) à chaque boot
- Logs contiennent `FAILOVER: HDMI-0 perdu` dans les 15-20 premières secondes
- Un seul HDMI branché (historiquement lié à `secondaryDisplayEnabled: true` dans la config, supprimé en v3.98.7)
- `xrandr --query` ne montre qu'un seul port (ex: HDMI-A-2 connected, pas de HDMI-A-1)

### Cause racine (corrigée en v3.98.6)

`DUAL_DISPLAY_ACTIVE` était mis à `true` AVANT que `setup_secondary_xrandr` ne réussisse, avec `|| true` qui avalait l'erreur. Sur un Pi avec un seul port HDMI actif, `setup_secondary_xrandr` échoue mais `DUAL_DISPLAY_ACTIVE` reste `true` → le main loop croit être en dual-display → `detect_hdmi0_status` retourne false (car le port n'existe pas dans xrandr) → faux failover.

### Corrections appliquées

1. **Guard `DUAL_DISPLAY_ACTIVE`** — Ne passe à `true` que si `setup_secondary_xrandr` retourne 0 (succès). Sinon reste/passe à `false`
2. **Grace period boot** — `FAILOVER_GRACE_PERIOD=15` bloque le failover pendant les 15 premières secondes (stabilisation EDID/DRM)
3. **Splash de transition** — `show_boot_splash` appelé AVANT `kill Chromium` dans failover/recovery pour couvrir le desktop
4. **Secondary launch guard** — `DUAL_DISPLAY_ACTIVE` (pas `SECONDARY_DISPLAY_ENABLED`) contrôle le lancement du Chromium secondaire

### Diagnostic

```bash
# Vérifier les ports HDMI visibles par xrandr
DISPLAY=:0 xrandr --query | grep -E "^HDMI"
# Si un seul port "connected" → single-display correct

# Vérifier les logs de boot
journalctl -u neopro-kiosk --no-pager | grep -E "Dual-display|single|xrandr.*seul|FAILOVER"

# Vérifier la valeur de DUAL_DISPLAY_ACTIVE au runtime
cat /tmp/kiosk-status.json | python3 -m json.tool | grep -i dual
```

### Smoke tests de régression

- `DUAL_DISPLAY_ACTIVE must be set AFTER setup_secondary_xrandr succeeds`
- `setup_secondary_xrandr must not use || true when determining DUAL_DISPLAY_ACTIVE`
- `check_secondary_chromium must guard DUAL_DISPLAY_ACTIVE behind setup_secondary_xrandr`
- `FAILOVER_GRACE_PERIOD for boot HDMI stabilization`
- `boot_fast_checks for rapid stacking checks after boot`

---

## HDMI-0 ne reprend pas la main après recovery failover (v3.96+)

Après un failover (HDMI-0 déconnecté → HDMI-1 prend la main), HDMI-0 est rebranché mais la vidéo principale reste sur HDMI-1.

### Symptôme

- La vidéo principale continue à jouer sur HDMI-1 (l'écran secondaire)
- HDMI-0 affiche le contenu secondaire, ou ne s'active pas du tout
- Les rôles sont inversés : HDMI-0 = secondary, HDMI-1 = primary

### Cause (corrigée en v3.96)

`deactivate_hdmi_failover()` appelait `setup_secondary_xrandr()` directement sans forcer les rôles xrandr. Après failover, HDMI-1 (HDMI-A-2) était à l'offset `+0+0` (position primaire). `setup_secondary_xrandr()` identifie le primaire par l'offset → HDMI-1 restait primaire. HDMI-0, ayant été `--off` pendant le failover, n'avait pas de géométrie active et n'était pas détecté par le pattern grep.

### Diagnostic

```bash
# 1. Vérifier les rôles xrandr actuels
xrandr --query | grep -E '^HDMI.* connected'
# Attendu après recovery: HDMI-A-1 ... +0+0 (primaire), HDMI-A-2 ... +1920+0 (secondaire)
# Bug: HDMI-A-2 à +0+0 et HDMI-A-1 à +1920+0

# 2. Vérifier la vérification post-recovery dans les logs
journalctl -u neopro-kiosk --no-pager -n 100 | grep -E "RECOVERY (VÉRIFIÉ|ANOMALIE)"
# ✅ "RECOVERY VÉRIFIÉ" = HDMI-0 est bien primaire
# 🔴 "RECOVERY ANOMALIE" = HDMI-0 n'est PAS à offset 0

# 3. Vérifier la transition dans kiosk-status.json
cat /tmp/kiosk-status.json | python3 -m json.tool | grep -E 'lastHdmiTransition|failover'

# 4. Vérifier la version du watchdog
grep "Forçage xrandr" /home/pi/neopro/scripts/kiosk-watchdog.sh
# Doit retourner une ligne — sinon, le fix n'est pas déployé
```

### Correction

- **v3.96+** : Bug corrigé. Mettre à jour le Pi via OTA ou `fix-fleet-pi.sh`
- **Workaround temporaire** : `sudo systemctl restart neopro-kiosk` force un redémarrage propre

### Smoke tests de régression

- `deactivate_hdmi_failover must force HDMI-0 (HDMI-A-1) as primary BEFORE setup_secondary_xrandr`

---

## Barre de tâches visible sur l'écran primaire après branchement du secondaire (v3.87.1+)

Quand l'écran secondaire est branché en mode single-display, la barre de tâches LXDE (lxpanel) apparaît sur l'écran primaire.

### Symptômes

1. **La barre de tâches du Pi est visible** en haut ou en bas de l'écran primaire TV
2. **Apparaît uniquement après branchement du secondaire** — l'écran primaire seul est correct
3. **Peut aussi apparaître au retour d'un failover HDMI**

### Cause

Quand `xrandr` reconfigure le layout X11 pour le dual-display, le window manager (openbox/LXDE) restack toutes les fenêtres. `lxpanel` se retrouve AU-DESSUS de Chromium dans la pile Z-order. Avant v3.87.1, le code de transition ne ré-appliquait que `xdotool windowmove` + `xdotool windowsize` sans :

- `xprop _MOTIF_WM_HINTS` (re-enforcer le mode sans décoration)
- `xdotool windowactivate` (raise Chromium au premier plan)

### Diagnostic

```bash
# 1. Vérifier que le fix est appliqué (v3.87.1+)
grep -c "windowactivate" /home/pi/neopro/scripts/kiosk-watchdog.sh
# Attendu: >= 4 (start_chromium + single→dual + failover-return + check_window_stacking)

# 2. Vérifier le monitoring dans kiosk-status.json
cat /tmp/kiosk-status.json | python3 -m json.tool | grep windowStacking
# Attendu: "windowStacking": "ok"
# Si "panel_above" ou "recovered" → le bug s'est produit et a été auto-corrigé

# 3. Vérifier les logs d'auto-recovery
journalctl -u neopro-kiosk --no-pager -n 200 | grep "STACKING"
# Si présent: le watchdog a détecté et corrigé le problème automatiquement
```

### Correction

Ce bug est corrigé en v3.87.1. Le fix applique le séquence complète en 4 étapes (xprop → windowmove → windowsize → windowactivate) dans toutes les transitions xrandr. Un monitoring runtime (`check_window_stacking`) détecte et corrige automatiquement toute régression toutes les 30 secondes.

### Smoke tests de régression

- `single→dual and failover-return resize must re-apply xprop + windowactivate (taskbar fix)`
- `start_chromium fullscreen subshell must have retry loop (not single sleep+attempt)`
- `check_window_stacking must apply windowmove + windowsize (not just windowactivate)`

---

## Kiosk pas en plein écran à l'init avec HDMI-0 seul (v3.96+)

Le kiosk Chromium s'affiche avec la barre de titre du window manager (Openbox) visible au lieu d'être en plein écran, uniquement au premier démarrage avec un seul écran HDMI-0.

### Symptômes

1. **Barre de titre visible** : la fenêtre Chromium affiche "neopro.local - Chromium" en haut
2. **Le contenu n'occupe pas tout l'écran** : une bande de ~25px (title bar) réduit la zone utile
3. **Le problème disparaît après un changement d'écran** : brancher/débrancher HDMI-1 corrige le fullscreen car les transitions dual⇔single ré-appliquent xprop+xdotool

### Cause

Deux problèmes combinés :

1. **`start_chromium()` subshell sans retry** : le fullscreen est appliqué par un subshell background qui attend 4s puis fait un seul `xdotool search --pid`. Sur un Pi lent (SD card usée, démarrage à froid), Chromium peut mettre >4s à créer sa fenêtre X11. Si le window ID n'est pas trouvé, le fullscreen n'est jamais appliqué.

2. **`check_window_stacking()` incomplet** : cette fonction dans la boucle principale (filet de sécurité) ne vérifiait que le cas "lxpanel devant Chromium" et ne faisait que `xprop` + `windowactivate` — sans `windowmove` ni `windowsize`. Si Chromium est la fenêtre active mais avec des décorations WM, aucun rattrapage n'était effectué.

### Diagnostic

```bash
# 1. Vérifier que le retry loop est présent (v3.96+)
grep -c "max_attempts" /home/pi/neopro/scripts/kiosk-watchdog.sh
# Attendu: >= 1

# 2. Vérifier que check_window_stacking applique windowmove+windowsize
grep -c "windowmove\|windowsize" /home/pi/neopro/scripts/kiosk-watchdog.sh
# Attendu: >= 8 (start_chromium + check_window_stacking + transitions)

# 3. Vérifier les logs d'init fullscreen
journalctl -u neopro-kiosk --no-pager -n 200 | grep -E "plein écran|retry|tentative"
# Log normal: "✓ Chromium primaire plein écran par-moniteur (xprop+xdotool, WID: ..., tentative 1)"
# Si tentative > 1: le Pi est lent, le retry a rattrapé

# 4. Vérifier le stacking status
cat /home/pi/neopro/data/kiosk-status.json | python3 -m json.tool | grep windowStacking
# Attendu: "windowStacking": "ok"
```

### Correction (v3.96+)

1. **Retry loop dans `start_chromium()`** : le subshell fait maintenant 5 tentatives avec délai croissant (2s, 3s, 4s, 5s, 6s = 20s max). Vérifie que Chromium est toujours vivant avant chaque retry.

2. **`check_window_stacking()` fullscreen complet** : applique systématiquement la séquence complète (xprop + windowmove + windowsize + windowactivate) à chaque itération de la boucle (~30s). Les commandes sont idempotentes — pas de side effect si déjà fullscreen. Sert de filet de sécurité permanent.

### Smoke tests de régression

- `start_chromium fullscreen subshell must have retry loop (not single sleep+attempt)`
- `check_window_stacking must apply windowmove + windowsize (not just windowactivate)`

---

## Barre de tâches visible au boot pendant 30-60s (v3.98.2+)

La barre de tâches LXDE (lxpanel) apparaît pendant le boot, couvrant le bas ou le haut de Chromium pendant 30-60s avant de disparaître.

### Symptômes

1. **Barre de tâches visible** au boot pendant ~30-60s
2. **Disparaît après un cycle de `check_window_stacking`** (~30s) ou après le re-raise loop (+15s)
3. **Réapparaît à chaque reboot**

### Cause

`install.sh` incluait `@lxpanel --profile LXDE-pi` dans `/home/pi/.config/lxsession/LXDE-pi/autostart`. LXDE lance lxpanel au démarrage de la session graphique, qui se place AU-DESSUS de Chromium dans la pile Z-order. Le re-raise loop de `start_chromium()` la repousse à +3s/+8s/+15s, mais pendant ce temps la barre est visible.

### Correction (v3.98.2+)

Defense-in-depth en 4 couches :

1. **install.sh** : `@lxpanel` retiré de l'autostart, remplacé par `@xsetroot -solid black` (prévention)
2. **deploy-remote.sh** : corrige automatiquement l'autostart des Pi existants lors de chaque deploy (correction rétroactive)
3. **kiosk-watchdog.sh `start_chromium()`** : `pkill -x lxpanel` proactif au démarrage de Chromium (ceinture)
4. **kiosk-watchdog.sh `check_window_stacking()`** : détecte et tue lxpanel quand panel_above (bretelles)

### Monitoring

- `lxpanelKillCount` dans `kiosk-status.json` : nombre de fois que le watchdog a tué lxpanel
- Si `lxpanelKillCount > 0` : health alert remonté au central → l'autostart de ce Pi contient encore `@lxpanel`
- Correction : `sudo sed -i '/@lxpanel/d' ~/.config/lxsession/LXDE-pi/autostart`

### Diagnostic

```bash
# 1. Vérifier que lxpanel n'est pas dans l'autostart
grep lxpanel /home/pi/.config/lxsession/LXDE-pi/autostart
# Attendu: aucun résultat

# 2. Vérifier que lxpanel ne tourne pas
pgrep -x lxpanel && echo "PROBLÈME: lxpanel tourne" || echo "OK"

# 3. Vérifier le compteur de kills dans le statut kiosk
cat /home/pi/neopro/data/kiosk-status.json | python3 -m json.tool | grep lxpanelKillCount
# Attendu: 0 (si > 0, l'autostart doit être corrigé)
```

### Smoke tests de régression

- `install.sh LXDE autostart must NOT contain @lxpanel (taskbar covers Chromium fullscreen)`
- `kiosk-watchdog.sh start_chromium must kill lxpanel proactively`
- `kiosk-watchdog.sh check_window_stacking must kill lxpanel on panel_above detection`
- `deploy-remote.sh must remove @lxpanel from LXDE autostart on existing Pi`
- `kiosk-watchdog.sh kiosk-status.json must include lxpanelKillCount`
- `metrics.js health report must alert on lxpanelKillCount > 0`

---

## Écran primaire zoomé ou change de page après débranchement du secondaire (v3.86+)

Quand l'écran secondaire est débranché en mode dual-display, l'écran primaire peut montrer un comportement incorrect.

### Symptômes

1. **L'écran primaire affiche "En attente de l'écran secondaire"** pendant quelques secondes après le débranchement
2. **L'écran primaire affiche le contenu ultra-zoomé** (on ne voit que le coin supérieur gauche)

### Cause

Deux bugs dans le retour dual→single display (corrigés en v3.86.0) :

1. **Splash "attente de l'écran secondaire"** : `stop_chromium_secondary()` exécutait `xrandr --output $HDMI1 --off` même quand le câble était déjà physiquement débranché. Cette commande provoquait une race condition DRM kernel qui marquait brièvement HDMI-0 comme "disconnected" dans `/sys/class/drm/` → Angular affichait l'écran d'attente.
2. **Contenu zoomé** : le retour dual→single utilisait `xdotool windowsize` pour redimensionner le Chromium primaire. Or, Chromium ne re-render pas son viewport CSS interne après un resize X11 — la fenêtre X11 change de taille mais le contenu web reste rendu à l'ancienne résolution (ex: 960×1080 en dual → affiché sur 1920×1080 = zoom 2x).

### Diagnostic

```bash
# 1. Vérifier que le fix est appliqué (v3.86.0+)
grep "Retour en single-display: relance" /home/pi/neopro/scripts/kiosk-watchdog.sh
# Attendu: la ligne existe (relaunch au lieu de resize)

# 2. Vérifier les logs du dernier retour dual→single
journalctl -u neopro-kiosk --no-pager -n 100 | grep -E "(single-display|Chromium primaire relancé)"
# Attendu: "Retour en single-display: relance du Chromium primaire"
#          puis "Chromium primaire relancé en single-display (WxH)"

# 3. Vérifier que xrandr --off est bien gardé
grep -A5 "detect_hdmi1_status" /home/pi/neopro/scripts/kiosk-watchdog.sh | grep "xrandr"
# Attendu: xrandr --off est à l'intérieur du bloc if detect_hdmi1_status
```

### Correction

Ce bug est corrigé en v3.86.0. Si vous êtes sur une version antérieure, mettez à jour via OTA ou `git pull && npm run deploy`.

### Smoke tests de régression

- `check_secondary_chromium: dual→single uses Chromium relaunch (xdotool viewport bug)`
- `stop_chromium_secondary must guard xrandr --off behind detect_hdmi1_status (DRM race)`

---

## Accès navigateur PC ne fonctionne pas (v3.84+)

Un navigateur PC sur le réseau local ne peut pas accéder à l'interface TV.

### Symptôme

- La page `http://neopro.local` ne charge pas ou affiche une erreur
- L'écran TV fonctionne normalement sur le Pi

### Diagnostic

```bash
# 1. Vérifier que la webapp est servie
curl -s http://localhost/webapp/ | head -5
# Attendu: HTML de la page d'accueil

# 2. Vérifier la résolution DNS
ping neopro.local
# Attendu: résolution vers l'IP du Pi

# 3. Vérifier nginx
sudo nginx -t
systemctl status nginx

# 4. Vérifier l'accès depuis le PC
# Ouvrir http://neopro.local dans le navigateur
# Si erreur DNS → utiliser l'IP directe (ex: http://192.168.4.1)

# 5. Vérifier le QR code
# Le panneau admin (port 8080) affiche un QR code d'accès rapide
```

### Points d'entrée PC

| URL                                            | Description                                 |
| ---------------------------------------------- | ------------------------------------------- |
| `http://neopro.local/`                         | Homepage enrichie (liens TV, Admin, Remote) |
| `http://neopro.local/tv?displayType=secondary` | Écran TV en mode secondaire                 |
| `http://neopro.local/admin/`                   | Panneau admin local                         |
| `http://neopro.local/remote`                   | Télécommande                                |

### Smoke tests de régression

- `webapp index.html must exist with TV link`
- `webapp manifest.json must exist`
- `analytics displayType guard on all trackVideoStart/trackVideoEnd calls`

---

## Pi démarre sans aucun écran — mode headless (v3.84+)

### Symptôme

Le Pi est sous tension mais aucun écran n'est branché. La LED d'activité clignote lentement (1s on/1s off) et le buzzer émet 3 bips courts au boot.

### Diagnostic

```bash
# 1. Vérifier que le Pi est bien en ligne (depuis un PC sur le même réseau)
ping neopro.local

# 2. Accéder au panneau admin sans écran
curl http://neopro.local/admin/api/system

# 3. Vérifier les flags HDMI
ssh pi@neopro.local 'cat /tmp/kiosk-status.json | python3 -m json.tool'

# 4. Vérifier que les services tournent (sans kiosk Chromium)
ssh pi@neopro.local 'systemctl status neopro-server neopro-sync-agent'

# 5. Vérifier le pattern LED actuel
ssh pi@neopro.local 'cat /sys/class/leds/ACT/trigger 2>/dev/null || cat /sys/class/leds/led0/trigger'
```

### Correction

1. **Brancher un écran** sur HDMI-0 (port le plus proche de l'alimentation USB-C sur Pi 5)
2. Le watchdog détecte automatiquement l'écran via udev (< 1s) ou polling (5s max)
3. Chromium se lance et affiche la TV
4. La LED repasse en mode heartbeat normal

### Notes

- En mode headless, le Pi reste **pleinement fonctionnel** : serveur Socket.IO, sync-agent, admin panel
- Le heartbeat vers le central-server inclut `hdmiStatus.hdmi0: "disconnected"` → alerte "Aucun écran" dans le dashboard
- La config `hdmi_force_hotplug=1` dans `/boot/firmware/config.txt` assure que X11 démarre même sans écran

---

## Navigateur PC rétrogradé en esclave — priorité kiosk (v3.84+)

### Symptôme

Un utilisateur accède à la TV depuis son navigateur PC. Au début tout fonctionne, puis soudainement la page affiche un message indiquant le mode esclave. Le PC ne contrôle plus la boucle vidéo.

### Cause

Le Pi physique (kiosk) a repris le rôle master. Par conception, le Pi est **toujours master** — si un navigateur PC était master, il est automatiquement rétrogradé en slave quand le Pi s'enregistre.

### Diagnostic

```bash
# 1. Vérifier les clients connectés
curl -s http://neopro.local/admin/api/system | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('connectedClients',[]), indent=2))"

# 2. Vérifier dans les logs du serveur Pi
ssh pi@neopro.local 'journalctl -u neopro-server --since "5 min ago" | grep -i "master\|demot\|priority"'
```

### Explication

- Le champ `isKiosk` est détecté via le user-agent (armv7l/aarch64/raspbian = kiosk)
- Un kiosk prend toujours le rôle master, même si un autre client est déjà master
- Un PC ne peut **jamais** reprendre le master tant qu'un kiosk est connecté
- Kiosk-à-kiosk : le premier arrivé reste master (pas de demotion entre kiosks)

### Comportement attendu

Ceci est le **comportement normal et voulu**. Le Pi pilote la TV physique et doit toujours avoir le contrôle. Le navigateur PC peut regarder le flux en mode esclave mais ne contrôle pas la playlist.

---

## Déploiement vidéo secondaire échoué (EACCES / race condition)

> **Version :** v3.87.2+ (fix), affecte toutes les versions avec secondary display

### Symptôme

Le dashboard affiche **"Échoué"** sur le déploiement d'une vidéo avec variante secondaire. Le Pi reçoit bien la commande mais le fichier secondaire n'est pas écrit.

### Causes possibles

#### 1. Permission EACCES sur `/home/pi/neopro/`

Le répertoire `/home/pi/neopro/` (ou un sous-répertoire comme `videos-secondary/`) n'appartient pas à l'utilisateur `pi`. Cela peut arriver si :

- Le Pi a été flashé depuis macOS (ownership `501:staff` au lieu de `pi:pi`)
- Un `sudo` a créé des fichiers en tant que `root`
- Une mise à jour OTA a mal restauré les permissions

**Diagnostic :**

```bash
ssh pi@neopro.local 'ls -la /home/pi/neopro/'
# Vérifier que tout est owned par pi:pi
ssh pi@neopro.local 'journalctl -u neopro-sync-agent --since "10 min ago" | grep -i "EACCES\|permission\|permission issue"'
```

**Fix :**

```bash
ssh pi@neopro.local 'sudo chown -R pi:pi /home/pi/neopro/'
ssh pi@neopro.local 'sudo systemctl restart neopro-sync-agent'
```

> **Note v3.87.2+ :** Le sync-agent effectue un preflight check des permissions au démarrage (`ensureDirectoryPermissions`). Si un répertoire critique n'est pas accessible en écriture, un warning explicite est loggé avec la commande `chown` à exécuter.

#### 2. Race condition sur reconnexion (doublon deploy_video)

Quand un Pi se reconnecte au central, la queue de commandes en attente est vidée d'un coup. Si deux commandes `deploy_video` pour la même vidéo sont envoyées quasi-simultanément, les deux tentent d'écrire le fichier `.downloading` au même chemin → corruption de checksum ou `ENOENT`.

**Diagnostic :**

```bash
ssh pi@neopro.local 'journalctl -u neopro-sync-agent --since "30 min ago" | grep -i "duplicate deploy\|dedup\|in-flight"'
```

> **Fix v3.87.2+ :** Le `deploy-video.js` utilise un mutex (`activeDeployments Map`) qui déduplique les téléchargements concurrents. Si un `deploy_video` est déjà en cours pour le même `videoId`, le second attend le résultat du premier au lieu de lancer un téléchargement parallèle.

#### 3. Répertoire `videos-secondary/` manquant

Le répertoire peut ne pas exister si le Pi a été provisionné avant l'ajout du support dual-display.

**Fix :**

```bash
ssh pi@neopro.local 'mkdir -p /home/pi/neopro/videos-secondary && chown pi:pi /home/pi/neopro/videos-secondary'
```

> **Note v3.87.2+ :** Le preflight check crée automatiquement `videos-secondary/` au démarrage si absent.

### Vérification

```bash
# 1. Vérifier que le preflight a tourné
ssh pi@neopro.local 'journalctl -u neopro-sync-agent --since "5 min ago" | grep -i "permission"'

# 2. Relancer le déploiement depuis le dashboard
# Le déploiement devrait maintenant réussir

# 3. Vérifier que la vidéo secondaire est bien présente
ssh pi@neopro.local 'ls -la /home/pi/neopro/videos-secondary/'
```

---

## Résolution écran non affichée dans le dashboard (v3.87.4+)

Le dashboard (fiche site, onglet État) affiche désormais la résolution réelle de chaque écran HDMI connecté. Si la résolution n'apparaît pas :

### Symptômes

- Le badge HDMI montre "✅ HDMI-0" mais pas de résolution à côté
- `primaryResolution` est vide dans `kiosk-status.json`

### Causes possibles

| Cause                            | Diagnostic                                                                                                       | Solution                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Version kiosk-watchdog < v3.87.4 | `cat /home/pi/neopro/data/kiosk-status.json \| python3 -m json.tool` — champ `primaryResolution` absent          | Mettre à jour le boîtier                                                                   |
| xrandr non disponible au boot    | `journalctl -u neopro-kiosk --since "boot" \| grep "résolution"` — pas de log "Single-display" ni "Dual-display" | Vérifier que le service X11 est démarré avant kiosk                                        |
| Écran non reconnu par xrandr     | `DISPLAY=:0 xrandr --query` — output "disconnected"                                                              | Vérifier le câble HDMI, tester avec un autre écran                                         |
| EDID non lisible                 | `ls /sys/class/drm/card*-HDMI-*/edid` — fichier vide (0 octets)                                                  | Câble HDMI défectueux ou écran éteint au boot → résolution fallback `DEFAULT_SCREEN_WIDTH` |

### Pipeline de résolution (3 tiers)

```
Pi (kiosk-watchdog.sh)          Central Server                    Dashboard
─────────────────────          ──────────────                    ─────────
get_output_resolution()    →   kioskStatus.primaryResolution  →  hdmiStatus.hdmi0Resolution
  ↓ write_kiosk_status()       kioskStatus.secondaryResolution   hdmiStatus.hdmi1Resolution
  ↓ kiosk-status.json             ↓ heartbeat.handler.ts            ↓ site-detail.component.ts
  ↓ sync-agent heartbeat          ↓ hdmi_status_updated (WS)        ↓ badge + résolution
```

### Diagnostic rapide

```bash
# 1. Vérifier la résolution détectée sur le Pi
ssh pi@neopro.local 'cat /home/pi/neopro/data/kiosk-status.json | python3 -m json.tool | grep -i resolution'

# 2. Vérifier la détection xrandr
ssh pi@neopro.local 'DISPLAY=:0 xrandr --query | head -20'

# 3. Vérifier les logs du watchdog
ssh pi@neopro.local 'journalctl -u neopro-kiosk --since "boot" | grep -E "résolution|Resolution|Single-display|Dual-display"'
```

---

## Changement de profil ne fonctionne pas (v3.92.0+)

### Le profil revient toujours au profil par défaut après quelques secondes

**Symptômes :**

- Le staff sélectionne un profil dans le club-selector sur la télécommande
- L'écran charge brièvement le nouveau profil puis revient au profil par défaut
- Ou bien le profil semble changer mais après un événement sync, l'ancien revient

**Cause (corrigée en v3.92.2) :** Le handler `profile-switch` dans `handlers.js` ne persistait pas la config fusionnée dans `configuration.json`. Tout événement `config_updated` ultérieur (sync-agent, auto-reload) relisait `configuration.json` — toujours sur l'ancien profil — et écrasait la sélection.

**Vérification :**

```bash
# 1. Vérifier que le handler persiste bien dans configuration.json
ssh pi@neopro.local 'grep -c "writeFileSync(configPath" /home/pi/neopro/server/socket/handlers.js'
# Attendu : au moins 1 occurrence dans le bloc profile-switch

# 2. Vérifier le marqueur de profil actif
ssh pi@neopro.local 'cat /home/pi/neopro/webapp/profiles/active-profile'

# 3. Vérifier les logs du profile-switch
ssh pi@neopro.local 'journalctl -u neopro-app --since "1 hour ago" | grep "\[Profile\]"'
# Attendu : "[Profile] Active profile set to: {id} (configuration.json updated)"

# 4. Comparer le profil actif avec configuration.json
ssh pi@neopro.local 'ACTIVE=$(cat /home/pi/neopro/webapp/profiles/active-profile); diff <(python3 -c "import json; c=json.load(open(\"/home/pi/neopro/webapp/configuration.json\")); [c.pop(k,None) for k in [\"settings\",\"siteId\",\"siteName\",\"clubName\",\"apiKey\",\"hotspot\",\"localNetwork\",\"localSponsors\"]]; print(json.dumps(c,sort_keys=True))") <(python3 -c "import json; c=json.load(open(\"/home/pi/neopro/webapp/profiles/$ACTIVE.json\")); print(json.dumps(c,sort_keys=True))")'
# Attendu : pas de différence (hors LOCAL_ONLY_SETTINGS)
```

**Correction si version < v3.92.2 :**

```bash
# Mettre à jour le fichier handlers.js manuellement
scp raspberry/server/socket/handlers.js pi@neopro.local:/home/pi/neopro/server/socket/
ssh pi@neopro.local 'sudo systemctl restart neopro-app'
```

### Le club-selector ne s'affiche pas sur la télécommande

**Symptômes :**

- La télécommande ne montre pas le bouton de sélection de profil
- `ProfileConfigService.hasMultipleProfiles()` retourne `false`

**Cause :** Le dossier `profiles/` n'existe pas ou `clubs.json` est absent/invalide.

**Vérification :**

```bash
# Vérifier la présence des fichiers profils
ssh pi@neopro.local 'ls -la /home/pi/neopro/webapp/profiles/'

# Vérifier clubs.json
ssh pi@neopro.local 'cat /home/pi/neopro/webapp/profiles/clubs.json | python3 -m json.tool'
# Attendu : un tableau JSON avec au moins 2 profils

# Vérifier Nginx ne cache pas les profils
ssh pi@neopro.local 'curl -sI http://localhost/profiles/clubs.json | grep -i cache'
# Attendu : "Cache-Control: no-cache" ou "no-store"
```

**Correction :** Cliquer "Déployer" ou "Sync" dans l'onglet Profils du dashboard (ADR-030).

### Un profil a une configuration vide

**Symptômes :**

- Quand le staff sélectionne un profil, l'écran affiche un écran noir ou la page d'attente
- Le fichier `profiles/{id}.json` contient `{}`

**Cause :** Le profil a été créé depuis le dashboard sans configuration source (option "Vierge").

**Vérification :**

```bash
# Vérifier la taille des fichiers profils
ssh pi@neopro.local 'ls -la /home/pi/neopro/webapp/profiles/*.json'
# Un fichier de 2 octets = configuration vide {}
```

**Correction :** Ouvrir le profil dans le dashboard → onglet Contenu/Boucles → sélectionner le profil dans le dropdown → configurer les sponsors/catégories → Déployer.

---

## Ventilateur Active Cooler Pi 5 non détecté (v3.104.3+)

Le ventilateur officiel Active Cooler du Pi 5 tourne à 100% en permanence au lieu d'être régulé par PWM, et n'est pas détecté par le monitoring Neopro.

### Symptômes

1. **Ventilateur à pleine vitesse en permanence** — bruit constant, même quand le CPU est froid
2. **Température CPU élevée si le ventilateur se bloque** — `temp=98.8°C`, `throttled=0xe0006` (throttling actif + sous-tension)
3. **Pas de `cooling_device0`** dans `/sys/class/thermal/` → `getFanStatus()` retourne `present: false`
4. **Pas d'alerte `fan_failure`** dans le dashboard central — le monitoring ne peut pas détecter un ventilateur qu'il ne voit pas
5. **Alerte `fan_config_disabled`** (v3.104.3+) si Pi 5 détecté sans ventilateur kernel

### Cause racine

Le device-tree du Pi 5 contient un nœud `cooling_fan` (RP1 GPIO 45 = FAN_PWM sur le connecteur J2), mais son `status` est `disabled` par défaut. Le paramètre `dtparam=cooling_fan` dans `/boot/firmware/config.txt` active ce nœud → le kernel charge le driver `pwm-fan` → création de `/sys/class/thermal/cooling_device0` avec 5 états PWM (0-4).

**Sans ce paramètre** : le GPIO 45 n'est pas configuré en PWM → le ventilateur reçoit du 5V direct → tourne à 100% → pas de contrôle thermique, pas de monitoring possible.

### Diagnostic

```bash
# 1. Vérifier le modèle (Pi 5 uniquement)
cat /proc/device-tree/model
# Attendu: "Raspberry Pi 5 Model B Rev 1.0"

# 2. Vérifier que dtparam=cooling_fan est dans config.txt
grep "cooling_fan" /boot/firmware/config.txt
# Attendu: "dtparam=cooling_fan"
# Si absent → cause racine confirmée

# 3. Vérifier le device-tree runtime
cat /proc/device-tree/cooling_fan/status 2>/dev/null || echo "noeud absent"
# Attendu: "okay"
# Si "disabled" ou absent → dtparam manquant

# 4. Vérifier la présence du cooling_device kernel
ls /sys/class/thermal/cooling_device0/ 2>/dev/null && echo "OK" || echo "ABSENT"
# Si ABSENT → ventilateur non contrôlé par le kernel

# 5. Vérifier la température et l'état PWM
cat /sys/class/thermal/thermal_zone0/temp  # en millidegrés (ex: 39500 = 39.5°C)
cat /sys/class/thermal/cooling_device0/cur_state  # 0-4 (0=off, 4=max)
cat /sys/class/thermal/cooling_device0/max_state  # 4

# 6. Vérifier le throttling
vcgencmd get_throttled
# 0x0 = OK, 0xe0006 = throttling actif + historique sous-tension
```

### Correction

**Ajouter `dtparam=cooling_fan` au config.txt et redémarrer :**

```bash
# Ajouter le paramètre
echo "" >> /boot/firmware/config.txt
echo "# Active Cooler Pi 5 — contrôle PWM ventilateur (surveillance Neopro)" >> /boot/firmware/config.txt
echo "dtparam=cooling_fan" >> /boot/firmware/config.txt

# Redémarrer pour appliquer
sudo reboot
```

**Après reboot**, vérifier :

```bash
cat /sys/class/thermal/cooling_device0/type   # "pwm-fan"
cat /sys/class/thermal/cooling_device0/cur_state  # 0-3 selon température
cat /proc/device-tree/cooling_fan/status  # "okay"
```

### Prévention

- **`install.sh`** (v3.104.3+) : `configure_pi5_cooling_fan()` ajoute automatiquement `dtparam=cooling_fan` pour les Pi 5
- **`fix-fleet-pi.sh`** (v3.104.3+) : step 13/13 corrige les Pi existants de la flotte
- **`heartbeat.handler.ts`** : alerte `fan_config_disabled` si Pi 5 sans `cooling_device` détecté
- **`diagnose-pi.sh`** : section "12b. Active Cooler" vérifie la configuration et l'état runtime

### Problème physique : faux contact / interférence mécanique

Si le ventilateur s'arrête uniquement quand le capot du boîtier est installé :

1. Le capot exerce une pression sur les pales ou le câble du ventilateur
2. Vérifier que le clip du Active Cooler est correctement encliqué sur le J2 connector
3. Vérifier que le câble FFC/ribbon ne passe pas sous le capot
4. Tester sans capot — si `temp` reste < 50°C, le problème est mécanique

### Smoke tests de régression

- `install.sh must have configure_pi5_cooling_fan function`
- `install.sh configure_pi5_cooling_fan must add dtparam=cooling_fan to config.txt`
- `install.sh main() must call configure_pi5_cooling_fan`
- `fix-fleet-pi.sh must add dtparam=cooling_fan for Pi 5`
- `diagnose-pi.sh must check cooling_fan config on Pi 5`
- `heartbeat.handler.ts must detect fan_config_disabled alert on Pi 5 without fan`

---

## Kiosk pas en plein écran sur HDMI-1 (v3.111.1+)

Le kiosk Chromium apparaît dans un coin (petite fenêtre) au lieu d'être en plein écran quand l'écran est branché sur HDMI-1 (au lieu de HDMI-0).

### Cause racine

Au boot, le watchdog détectait la résolution mais ne configurait **pas** `xrandr --output HDMI-A-2 --primary --auto` avant de lancer Chromium. Résultat : X n'avait pas activé HDMI-A-2 comme sortie principale → Chromium se lançait sur un framebuffer non configuré → fenêtre positionnée à 0,0 avec des dimensions incorrectes.

L'auto-swap du watchdog loop ne se déclenchait qu'après **10 secondes**, et le `xdotool windowsize` post-swap ne force pas toujours Chromium à re-render son viewport CSS.

### Fix (v3.111.1)

Le watchdog exécute maintenant `xrandr --output HDMI-A-2 --primary --auto` **immédiatement au boot** (dans `main()`, avant `start_chromium()`) quand seul HDMI-1 est détecté. La séquence :

1. `detect_hdmi1_status && ! detect_hdmi0_status` → boot swap immédiat
2. `xrandr --output HDMI-A-2 --primary --auto` + `sleep 1`
3. Lecture résolution via `get_output_resolution()` (tier 1 geometry fonctionne maintenant)
4. `start_chromium` avec les bonnes dimensions dès le départ

### Monitoring

- **`kiosk-status.json`** : nouveaux champs `hdmiSwapped` (bool) et `wrongPort` (bool)
- **Heartbeat central** : `hdmiStatus.hdmiSwapped` et `hdmiStatus.wrongPort` remontés dans le heartbeat sync-agent
- **Dashboard admin Pi** : `_getHdmiStatus()` expose `hdmiSwapped` en plus de `wrongPort`

### Diagnostic

```bash
# Vérifier que le boot swap a fonctionné
cat /home/pi/neopro/data/kiosk-status.json | python3 -m json.tool | grep -E 'hdmiSwapped|wrongPort|primaryResolution'
# Attendu: hdmiSwapped=true, primaryResolution=1920x1080 (ou résolution native)

# Vérifier xrandr
DISPLAY=:0 xrandr --query | grep -E 'HDMI.*connected'
# HDMI-A-2 doit être primary avec une géométrie (ex: 1920x1080+0+0)

# Vérifier les flags
ls -la /tmp/hdmi-swapped /tmp/hdmi-wrong-port 2>/dev/null
```

### Smoke tests de régression

- `kiosk-watchdog must do xrandr --primary --auto BEFORE start_chromium when only HDMI-1 connected`
- `kiosk-status.json must include hdmiSwapped and wrongPort fields`
- `hdmi.service.js getBothPortsStatus must read /tmp/hdmi-swapped flag`

---

## Vidéo gelée/lag sur navigateur PC (v3.114+)

### Symptômes

- En accédant à `http://neopro.local/tv` ou `http://neopro.local/secondary` depuis un navigateur PC
- Les vidéos sont gelées (freeze-frame visible) ou en lag
- Un refresh de la page fait repartir les vidéos temporairement
- Le problème revient après quelques minutes ou après une micro-coupure WiFi

### Cause racine

Le Socket.IO local du Pi (serveur `raspberry/server/server.js` + client Angular `socket.service.ts`) n'avait **aucune configuration de résilience** :

1. **Serveur sans ping/pong** : les connexions zombie restaient ouvertes 45s (défaut Socket.IO) → le slave ne recevait plus `tv-loop-state` → vidéo gelée
2. **Client sans options de reconnexion** : un drop socket (latence WiFi, micro-coupure) → pas de tentative de reconnexion → TV gelée indéfiniment
3. **Pas de re-register après reconnexion** : même si le socket reconnectait, le serveur avait perdu le `tv-register` → le slave ne recevait plus les événements master
4. **Double-buffer timeout trop court (2s)** : en accès distant via WiFi, les vidéos chargent par HTTP au lieu du disque local → 2s insuffisant → freeze-frame forcé prématurément

### Correction (v3.114)

| Fichier                                                     | Correction                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `raspberry/server/server.js`                                | `pingInterval: 10000`, `pingTimeout: 5000`, `transports: ['websocket', 'polling']`                                       |
| `raspberry/src/app/services/socket.service.ts`              | Reconnexion agressive (1s→5s, Infinity attempts), handlers `disconnect`/`reconnect`/`connect_error`, API `onReconnect()` |
| `raspberry/src/app/components/tv/tv.component.ts`           | Re-emit `tv-register` on `onReconnect()` pour restaurer le rôle master/slave                                             |
| `raspberry/src/app/services/double-buffer-video.service.ts` | Timeout preload 2000ms → 5000ms                                                                                          |

### Diagnostic

```bash
# Vérifier la connexion Socket.IO depuis le navigateur PC
# Ouvrir la console du navigateur (F12) et chercher :
# [Socket] Connected, id: ...
# [Socket] Disconnected, reason: ...
# [Socket] Reconnected after X attempts
# [TV] Socket reconnected — re-registering as tv/secondary

# Vérifier côté serveur Pi
ssh pi@neopro.local
journalctl -u neopro-server -f --no-pager | grep -E 'register|disconnect|reconnect'
```

### Smoke tests de régression

- `server.js must configure pingInterval and pingTimeout for Socket.IO`
- `server.js must configure transports for Socket.IO`
- `socket.service.ts must configure reconnection options`
- `socket.service.ts must have disconnect and reconnect lifecycle handlers`
- `socket.service.ts must expose onReconnect callback mechanism`
- `tv.component.ts must re-emit tv-register on socket reconnection`
- `double-buffer preload timeout must be >= 5000ms for remote network access`

---

## 28. Vidéos de boucle "introuvables" après reconnexion site hors ligne (v3.115.2+)

**Symptôme :** Après déploiement de vidéos sur un site hors ligne, quand le site se reconnecte (heures/jours plus tard), le dashboard affiche _"N vidéo(s) introuvable(s)"_ dans la configuration des boucles avec un bouton "Réparer automatiquement". Les vidéos pointent vers `videos/UPLOADS/X.mp4` alors que le Pi les a stockées à `videos/default/X.mp4`.

**Cause :** Mismatch de fallback catégorie. Quand une vidéo est uploadée sans catégorie (`category = NULL` en DB), le dashboard construisait un chemin spéculatif avec le fallback `'UPLOADS'` (`videos/UPLOADS/X.mp4`). Mais le `deployment.service.ts` envoie `category: 'default'` au Pi, qui stocke le fichier à `videos/default/X.mp4`. Quand l'utilisateur sélectionne cette vidéo dans la boucle, le chemin `videos/UPLOADS/X.mp4` se retrouve dans la config. Quand le site se reconnecte et rapporte ses fichiers réels, le mismatch est détecté → vidéo "introuvable".

**Correctif (v3.115.2) :** Alignement du fallback catégorie dans `site-content-tab.component.ts` : `'UPLOADS'` → `'default'`, en cohérence avec `deployment.service.ts`. Le chemin spéculatif est maintenant identique au chemin réel du Pi.

**Réparation des sites déjà affectés :**

1. **Automatique (bouton)** : Cliquer "Réparer automatiquement" dans la bannière d'alerte — corrige les chemins dans la config boucle par correspondance de filename
2. **Automatique (backfill)** : Le mécanisme `backfillDeployedPaths()` corrige les `deployed_path` NULL à chaque `sync_local_state` — le prochain rechargement du dashboard utilisera le chemin réel
3. **Manuel** : Re-sélectionner la vidéo dans le dropdown du loop-manager

**Smoke tests :**

- `dashboard speculative path fallback must use "default" not "UPLOADS" to match deployment.service`

**Monitoring :**

Le mécanisme de détection d'orphelins (`detectOrphanedVideoPaths()`) dans le dashboard agit comme moniteur en temps réel : toute vidéo dans la config dont le chemin ne correspond à aucun fichier connu (local Pi + cloud) génère la bannière d'alerte. Ce monitoring est passif (détection côté dashboard, pas de push) mais couvre 100% des cas car il est exécuté à chaque chargement de la fiche site.

---

## 29. Échec validation post-OTA (v3.116+)

**Symptôme :** La mise à jour OTA échoue à 85% avec le message `Post-OTA validation failed: <N> critical check(s) failed` suivi d'un rollback automatique vers la version précédente.

**Cause :** La validation post-OTA (`validate-post-update.js`) a détecté un ou plusieurs checks critiques en échec après l'installation de la nouvelle version.

**Diagnostic :**

```bash
# Exécuter la validation manuellement
bash ~/neopro/scripts/validate-pi.sh

# Mode JSON (pour dashboard/scripts)
bash ~/neopro/scripts/validate-pi.sh --json

# Via l'admin API
curl http://localhost:8080/api/system/validate
```

**Checks critiques et solutions :**

| Check                        | Cause probable                                         | Solution                                                                           |
| ---------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `neopro-app inactive`        | Crash au démarrage (dépendance manquante, port occupé) | `sudo journalctl -u neopro-app -n 50`                                              |
| `neopro-admin inactive`      | Même cause                                             | `sudo journalctl -u neopro-admin -n 50`                                            |
| `HTTP 3000 unreachable`      | Service démarré mais serveur pas encore ready          | Augmenter le délai de grâce dans `validate-post-update.js`                         |
| `HTTP 8080 unreachable`      | Admin crashé                                           | Vérifier les logs admin                                                            |
| `configuration.json invalid` | Fichier corrompu pendant l'OTA                         | Restaurer depuis backup : `cp ~/neopro/backup/configuration.json ~/neopro/public/` |
| `webapp/index.html missing`  | Build Angular non déployé                              | Re-déployer via OTA                                                                |

**Warnings (informationnels, pas de rollback) :**

Les warnings HDMI, nginx, espace disque, analytics et Chromium sont loggés dans le rapport mais ne déclenchent pas de rollback. Ils sont visibles dans le dashboard (onglet État du site).

---

## 30. Alerte canary post-OTA (v3.116+)

**Symptôme :** Une alerte `canary_post_ota` (sévérité critique) apparaît dans le dashboard 1 à 5 minutes après un déploiement OTA réussi.

**Cause :** Le monitoring canary a détecté un problème sur le Pi après le déploiement. Trois raisons possibles :

| Raison             | Message alerte                                | Action                                                                                                                             |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `site_offline`     | "Site went offline N checks after OTA"        | Vérifier que le Pi est alimenté et connecté au réseau. 1 check offline est toléré (reboot post-OTA), l'alerte se déclenche au 2ème |
| `version_mismatch` | "Version mismatch: expected X, got Y"         | Le Pi a potentiellement fait un auto-rollback local. Vérifier `cat ~/neopro/VERSION` et les logs sync-agent                        |
| `crash_loop`       | "Possible crash-loop: N disconnects in 5 min" | Services instables après OTA. `sudo journalctl -u neopro-app -n 100` + vérifier kiosk-watchdog                                     |

**Important :** Le canary monitoring ne fait PAS d'auto-rollback. C'est une décision manuelle. L'alerte signale un problème à investiguer.

**Configuration :**

```bash
# Variables d'environnement (central-server)
CANARY_WINDOW_MS=300000       # Durée monitoring (défaut: 5 min)
CANARY_CHECK_INTERVAL_MS=30000 # Intervalle checks (défaut: 30s)
```

**Smoke tests :**

- `canary-monitor.service.ts must exist and check site health`
- `deploy-progress.handler.ts must start canary watch on OTA completion`
- `alerting.service.ts must run canary checks in its periodic loop`

---

---

## 31. Bgscan reconfigure loop — déconnexions WiFi auto-infligées (v3.116.25+)

**Symptôme :** 15+ déconnexions WiFi par heure, site oscille "En ligne / Hors ligne" toutes les 90 secondes. Les logs montrent des `wpa_cli reconfigure` en boucle.

**Cause racine :** Le signal WiFi oscillait entre -68 et -73 dBm (typique en environnement mesh). Le seuil bgscan fixe à -72 dBm dans `_computeOptimalBgscan()` causait un flip-flop :

1. Signal -68 dBm → `_computeOptimalBgscan()` retourne threshold -75 (signal "bon")
2. `autoOptimize()` détecte que la config actuelle (-70) diffère → `wpa_cli reconfigure`
3. Le reconfigure coupe le carrier RTL8192EU ~3s → signal tombe à -73 dBm
4. Prochain check : signal -73 dBm → `_computeOptimalBgscan()` retourne threshold -70 (signal "moyen")
5. Config (-75) diffère → `wpa_cli reconfigure` → retour à l'étape 1

Chaque cycle prenait ~90s, causant 15+ déconnexions/heure auto-infligées.

**Fix (v3.116.25) — deux corrections :**

1. **Hystérésis dans `_computeOptimalBgscan()`** : seuils -67/-78 au lieu de -72 → dead zone de 11 dBm qui absorbe les oscillations normales
2. **Skip reconfigure si config identique** : `autoOptimize()` compare la bgscan actuelle dans wpa_supplicant avant d'appeler `wpa_cli reconfigure`

**Diagnostic :**

```bash
# Vérifier si le reconfigure loop est actif (version non-patchée)
sudo journalctl -u neopro-sync-agent --since "1 hour ago" | grep -c "wpa_cli.*reconfigure"
# Si > 5 en 1 heure → loop actif, mettre à jour vers v3.116.25+

# Vérifier le signal moyen
sudo journalctl -u neopro-sync-agent --since "1 hour ago" | grep "signal_dbm"
```

**Impact :** Principalement les sites mesh avec signal -65 à -75 dBm (NLF, NTES). Les sites avec signal stable (> -60 ou < -80) ne sont pas affectés.

---

## 32. OTA bloquée à 5% sur WiFi mesh (v3.116.24+)

**Symptôme :** Le déploiement OTA reste bloqué à ~5% indéfiniment. Le dashboard affiche "En cours" mais le progrès ne bouge plus. Plus fréquent sur les sites mesh WiFi.

**Cause racine :** Le stream HTTP de téléchargement du paquet OTA se bloque silencieusement (stall) quand le WiFi mesh change d'AP ou subit une micro-coupure. Node.js `http.get()` n'a pas de timeout sur le data stream (seulement sur la connexion initiale). Le download restait ouvert indéfiniment sans recevoir de données.

**Fix (v3.116.24) :**

- **Stall detection** : timer 30s sur le data stream — si aucune donnée reçue pendant 30s, le stream est détruit
- **3 retries** avec backoff progressif (5s / 10s / 15s) avant de reporter l'échec
- Log `Download stall detected at X%, retrying (attempt N/3)` pour le diagnostic

**Diagnostic :**

```bash
# Vérifier si un OTA est bloqué
sudo journalctl -u neopro-sync-agent --since "1 hour ago" | grep -i "download\|stall\|retry"

# Forcer un retry manuellement
# Depuis le dashboard : relancer le déploiement via le bouton "Retry"
```

---

## 33. Hotspot channel flapping au boot (v3.116.26+)

**Symptôme :** Après un reboot, les clients connectés au hotspot (télécommande) perdent la connexion 2 à 3 fois dans les premières minutes. Les logs `hotspot-optimizer.log` montrent des changements de canal répétés.

**Cause racine :** `hotspot-optimizer.sh` pouvait être relancé plusieurs fois au boot (via systemd restart/retry ou manuellement). Chaque exécution re-scannait les canaux WiFi et pouvait choisir un canal différent (le scan est non-déterministe, les interférences fluctuent). Les seuils de congestion (3 réseaux / 2 d'amélioration) étaient trop bas, déclenchant des switchs sur des différences insignifiantes.

**Fix (v3.116.26) :**

1. **Once-per-boot optimization** : un flag `/tmp/neopro-hotspot-channel-optimized` empêche les optimisations multiples
2. **Seuils relevés** : congestion >=5 (vs 3), amélioration >=3 (vs 2)
3. **Skip si clients connectés** : `hostapd_cli all_sta` vérifie si des clients sont connectés avant de scanner wlan0 (chaque scan wlan0 cause un micro-dropout de 1-2s pour les clients AP)

**Diagnostic :**

```bash
# Vérifier si l'optimisation a été faite au boot
ls -la /tmp/neopro-hotspot-channel-optimized

# Voir les changements de canal
grep "Switching channel" /var/log/neopro-hotspot-optimizer.log
```

---

## 34. Hotspot recovery disproportionnée — restart complet pour IP manquante (v3.116.26+)

**Symptôme :** Le hotspot perd sa connectivité pendant ~10s alors que seule l'IP 192.168.4.1 avait disparu (dhcpcd lent). Les clients doivent se reconnecter.

**Cause racine :** Le NetworkWatchdog (hotspot monitor) détectait "IP 192.168.4.1 absente" et déclenchait un restart complet hostapd + dnsmasq. Le restart hostapd fait perdre la connexion à tous les clients AP, alors qu'un simple `ip addr add` aurait suffi.

**Fix (v3.116.26) :**

- **Fast-path IP fix** : si hostapd et dnsmasq sont actifs mais l'IP est absente, applique `ip addr add 192.168.4.1/24 dev wlan0` sans redémarrer les services
- **Full restart** seulement quand hostapd ou dnsmasq sont réellement down (`systemctl is-active` retourne `inactive`/`failed`)

**Diagnostic :**

```bash
# Vérifier si l'IP est présente
ip addr show wlan0 | grep 192.168.4.1

# Appliquer manuellement si absente
sudo ip addr add 192.168.4.1/24 dev wlan0 2>/dev/null || true
```

---

---

## 35. Déploiement OTA "Échoué" sans message d'erreur (v3.116.28+)

**Symptôme :** Dans le dashboard Historique des mises à jour, un déploiement affiche le badge "Échoué" (rouge) mais aucun message d'erreur n'apparaît — impossible de diagnostiquer la cause.

**Causes racines (3 bugs corrigés) :**

1. **Événement temps réel incomplet** : `subscribeToDeploymentProgress()` dans le dashboard recevait les events `update_progress` via Socket.IO mais ne récupérait pas le champ `error` → le status passait à "Échoué" mais `error_message` restait null dans le composant Angular.

2. **Template trop restrictif** : le bloc d'erreur avait `*ngIf="deployment.status === 'failed' && deployment.error_message"` → quand `error_message` est null (Pi jamais répondu), le bloc n'était jamais affiché.

3. **Pas d'auto-fail backend** : `checkStuckDeployments()` dans `alerting.service.ts` créait une alerte pour les déploiements bloqués >30min mais ne les marquait jamais comme `failed` → un déploiement où le Pi ne répond jamais restait en `in_progress` indéfiniment.

**Fix (v3.116.28) :**

- **Dashboard temps réel** : `error` est maintenant propagé depuis l'event `update_progress` vers `deployment.error_message`
- **Fallback UX** : les déploiements échoués sans `error_message` affichent : _"Aucune réponse du Pi — le site était probablement hors ligne ou la commande a expiré"_
- **Auto-fail backend** : les déploiements OTA bloqués en `in_progress` depuis >2h sont automatiquement marqués `failed` avec message _"Timeout : aucune réponse du Pi après N minutes"_
- **Résumé visuel** : les déploiements réussis affichent maintenant la durée (_"Déployé avec succès en 3min 42s"_), et les déploiements en cours montrent le temps écoulé

**Diagnostic :**

```bash
# Vérifier l'état d'un déploiement en DB
source central-server/.env && psql "$DATABASE_URL" -c "
  SELECT id, status, progress, error_message, started_at, completed_at
  FROM update_deployments
  ORDER BY created_at DESC LIMIT 5;
"

# Vérifier les déploiements bloqués en in_progress
source central-server/.env && psql "$DATABASE_URL" -c "
  SELECT ud.id, s.site_name, ud.status, ud.progress,
    EXTRACT(EPOCH FROM (NOW() - COALESCE(ud.started_at, ud.created_at))) / 60 AS minutes_stuck
  FROM update_deployments ud
  JOIN sites s ON ud.target_id = s.id
  WHERE ud.status = 'in_progress'
  ORDER BY ud.created_at DESC;
"
```

**Fichiers modifiés :**

| Fichier                                                 | Changement                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `central-dashboard/.../updates-management.component.ts` | Propagation `error` dans events temps réel, fallback message, résumé durée |
| `central-server/.../alerting.service.ts`                | Auto-fail déploiements OTA bloqués >2h                                     |

---

## 36. Post-OTA validation failed: ECONNREFUSED ::1 (v3.116.28+)

**Symptôme :** Après une mise à jour OTA, la validation post-update échoue avec `Admin server not responding on port 8080: connect ECONNREFUSED ::1:8080`. Le rollback automatique se déclenche alors que tous les services fonctionnent correctement.

**Cause racine :** Sur Debian 12+ (Bookworm), `/etc/gai.conf` préfère IPv6. Quand axios/Node.js résout `localhost`, il essaie `::1` (IPv6) en premier. Mais Express écoute sur `0.0.0.0` (IPv4 only) → ECONNREFUSED. Node.js ne fait **pas** de fallback automatique vers `127.0.0.1`.

**Impact :** Toute validation post-OTA échoue sur Pi sous Debian 12+ → rollback systématique → le Pi revient à l'ancienne version → déploiement rapporté comme échoué.

**Fix (v3.116.29) :**

Remplacement de `http://localhost` par `http://127.0.0.1` dans tous les fichiers du sync-agent qui font des connexions HTTP locales :

- `validate-post-update.js` (ports 3000, 4200, 8080)
- `local-socket.js` (Socket.IO port 3000)
- `update-software.js` (health checks port 3000)

**Problème de bootstrapping (v3.116.31) :**

Le fix v3.116.29 ne prenait pas effet sur les Pi upgradeant **depuis** une version pré-3.116.29. Raison : `update-software.js` charge `validate-post-update.js` via `require()` au démarrage du module — le validateur en mémoire est l'**ancienne** version (avec `localhost`). Même si `extractAndInstall()` écrase les fichiers sur disque avec le nouveau code, Node.js utilise le module déjà en cache.

**Fix bootstrapping (v3.116.31) :**

Le cache-bust `require.cache` dans `update-software.js` ne suffit pas : c'est l'**ancien** `update-software.js` (chargé en mémoire avant l'OTA) qui exécute la mise à jour — le cache-bust dans le nouveau code n'est jamais atteint.

**Solution définitive :** Les serveurs Pi (`admin-server.js` port 8080, `server.js` port 3000) écoutent maintenant sur `'::'` (dual-stack IPv4+IPv6) au lieu de `'0.0.0.0'` (IPv4-only). Ainsi, que le validateur utilise `localhost` (→ `::1`) ou `127.0.0.1`, la connexion aboutit. Ce fix s'applique dès le redémarrage des services après l'OTA (avant la validation), résolvant le problème de bootstrapping. Protégé par smoke test.

**Diagnostic :**

```bash
# Vérifier la résolution de localhost sur le Pi
getent ahosts localhost
# Si ::1 apparaît avant 127.0.0.1, IPv6 est préféré

# Tester la connexion IPv4 explicite
curl -s http://127.0.0.1:8080/api/version
# Devrait retourner la version admin

# Tester la connexion via localhost (maintenant OK avec dual-stack)
curl -s http://localhost:8080/api/version
# Fonctionne depuis v3.116.31 (dual-stack ::)

# Vérifier que le serveur écoute sur IPv6
ss -tlnp | grep 8080
# Devrait montrer [::]:8080 (pas 0.0.0.0:8080)
```

---

## Hotspot-watchdog restart loop sur Debian 13 Trixie (v3.116.33+)

### Symptôme

`hostapd` et `dnsmasq` redémarrés toutes les ~40 secondes en groupes de 3, avec un cooldown de 5 minutes entre chaque cycle. Le Pi fonctionne normalement (WiFi, internet) mais le hotspot est perturbé par les restarts constants.

### Cause racine

Debian 13 (Trixie) a **supprimé `iptables`** du système de base — tout est migré vers `nftables`. Le `neopro-hotspot-watchdog` exécutait `iptables -t nat -C PREROUTING ...` pour vérifier le captive portal Android. Sur Trixie, `iptables: command not found` (exit 127) était interprété comme "captive portal manquant" → recovery complète déclenchée (rfkill unblock → restart hostapd → restart dnsmasq) toutes les 30s.

### Diagnostic

```bash
# Vérifier si iptables est disponible
which iptables 2>/dev/null || echo "iptables absent"

# Vérifier la version Debian
cat /etc/debian_version
# Si ≥13.x → Debian Trixie, iptables absent par défaut

# Vérifier les restarts hostapd récents
journalctl --since "1 hour ago" | grep "restart hostapd" | wc -l
# Si >10 → boucle de restart confirmée

# Vérifier les logs du watchdog
tail -30 /var/log/neopro-hotspot-watchdog.log
# Chercher "iptables captive portal manquant" en boucle
```

### Solution (v3.116.33+)

Le fix est intégré dans le code :

1. **`check_captive_portal_iptables()`** : détecte automatiquement `iptables` (Debian ≤12) ou `nft` (Debian 13+), retourne code 2 si aucun n'est disponible
2. **Le captive portal est un warning** (logué une seule fois), pas un trigger de recovery — seuls les services critiques déclenchent la recovery complète
3. **`setup-captive-portal-iptables.sh`** : support dual backend (iptables + nftables natif)

Pour un Pi déjà affecté, déployer les scripts mis à jour et redémarrer le watchdog :

```bash
sudo systemctl restart neopro-hotspot-watchdog
# Vérifier que la boucle a cessé
sleep 60 && journalctl --since "1 minute ago" | grep -c "restart hostapd"
# Doit retourner 0
```

---

## WiFi wlan1 drop après double scan RTL8192EU (v3.117.1+)

### Symptôme

La connexion WiFi du Pi (wlan1, clé USB RTL8192EU) tombe soudainement. Le dmesg montre `wlan1: authentication timed out` après 3 tentatives. Le NetworkWatchdog escalade les phases de recovery (gentle → aggressive) sans succès pendant 5 minutes.

### Cause racine

Le RTL8192EU est **single-radio** : chaque `iwlist wlan1 scan` coupe le carrier pendant ~6 secondes. Si **deux scans se produisent en moins de 120 secondes**, le carrier ne se rétablit pas et l'association WPA est perdue définitivement.

Scénario typique : `networkDetector` fait un scan au boot/toutes les heures, puis une commande `export_debug_bundle` ou `get_wifi_bssid_status` déclenche un second scan immédiatement après.

### Diagnostic

```bash
# Vérifier le dmesg pour auth timeout
sudo dmesg | grep "authentication.*timed out"

# Vérifier les scans récents dans les logs
journalctl --since "30 min ago" | grep "iwlist wlan1 scan"
# Si 2+ scans en <120s → cause confirmée
```

### Solution (v3.117.1+)

Tous les consommateurs de scan wlan1 partagent un cache inter-processus `/tmp/neopro-wlan1-scan-cache` :

- `network-detector.js` : vérifie le cache avant de scanner
- `wifi-bssid.js` : vérifie le cache avant le scan mesh detection
- `wifi-client.js` : écrit le cache après un scan utilisateur
- `hotspot-optimizer.sh` : écrit le cache au boot

Un scan frais n'est fait que si le cache est absent ou plus vieux que 120s.

---

## Fausses alertes offline/online Slack — flapping Socket.IO (v3.118.2+)

**Symptôme :** Un site reçoit 10-20+ alertes Slack offline/online par jour en alternance rapide (cycles de 2-5 minutes), malgré un réseau parfait (Ethernet 1Gbps, 113ms vers Railway, Pi UP).

**Exemple typique :**

```
08:00 ✅ Site Online
08:02 ❌ Site Offline
08:04 ✅ Site Online
08:06 ❌ Site Offline
... (toute la journée)
```

### Diagnostic

```bash
# 1. Vérifier le réseau (doit être parfait)
ip -br addr && cat /sys/class/net/eth0/operstate
curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" https://neopro-central-production.up.railway.app/health

# 2. Logs sync-agent (chercher transport close)
journalctl -u neopro-sync-agent --since "2 hours ago" --no-pager | grep -v "wlan1\|NetworkWatchdog" | tail -50

# 3. Vérifier le spam wlan1 reconnect (si > 1 par minute = bug v3.118.0)
journalctl -u neopro-sync-agent --since "1 hour ago" --no-pager | grep -c "wlan1 reconnected"
```

### Causes (3 bugs corrigés en v3.118.2)

**Bug 1 — Race condition server-side (cause principale des fausses alertes) :**

Lors d'une reconnexion rapide (Pi reconnecte en ~1s), l'ancien socket se déconnecte APRES que le nouveau s'est authentifié. Sans vérification `socket.id`, le handler de l'ancien socket supprimait le nouveau de `connectedSites` et marquait le site offline → fausse alerte, alors que le Pi est connecté.

**Bug 2 — Fuite de watchers/listeners côté Pi :**

Chaque `onAuthenticated()` créait de nouveaux ConfigWatcher + VideoWatcher sans stopper les anciens. Après N reconnexions = N watchers polling en parallèle + N listeners pong accumulés.

**Bug 3 — Spam boucle reconnect wlan1 :**

Quand le Pi est sur Ethernet et que wlan1 est connecté, la boucle `wlan1ReconnectLoop` se stoppait (wlan1 a une IP) puis `internetWatchLoop` la redémarrait 30s plus tard → cycle infini de logs toutes les 30s.

### Solution (v3.118.2+)

1. `socket.service.ts` : vérifie `currentSocket.id !== socket.id` avant de marquer offline
2. `agent.js` : `stopWatchers()` + `removeAllListeners('pong')` avant chaque reconnexion
3. `network-watchdog.js` : vérifie `getInternetIp()` avant `startWlan1Reconnect()`

### Cause 4 — Railway heap memory pressure (cause des `transport close`)

Si après les fixes v3.118.2 les `transport close` persistent (décos toutes les 10-30s), le problème est **côté Railway**, pas côté Pi. Le central-server tourne avec un heap V8 très limité (~40-44MB sur Railway Hobby plan). Quand le heap atteint 87-94%, les pauses GC bloquent le event loop → Socket.IO ne peut pas répondre aux pings → `transport close`.

**Diagnostic :**

```bash
# Health check mémoire (depuis n'importe où)
curl -s https://neopro-central-production.up.railway.app/health | python3 -c "
import json, sys; d = json.load(sys.stdin)
m = d['checks']['memory']['details']
print(f\"Heap: {m['heapUsedMB']:.0f}/{m['heapTotalMB']:.0f}MB ({m['heapUsagePercent']:.0f}%) RSS: {m['rssMB']:.0f}MB\")
print(f\"Status: {d['checks']['memory']['status']}  Uptime: {d['uptime']//60:.0f}min\")
"
```

- Heap > 88% → warning (`memory-manager.service.ts` tente un GC)
- Heap > 93% → critique (cleanup agressif)
- Heap > 97% → urgence (force GC + dump)

**Solutions :**

1. **Restart Railway** (résout les états corrompus post-deploy)
2. **Vérifier le plan Railway** — le Hobby plan ($5/mo) a ~512MB RAM, le heap V8 est limité à 256MB (`--max-old-space-size=256` dans Dockerfile). Les librairies natives (canvas, ffmpeg) consomment ~90MB de RSS hors-heap
3. **Si ça persiste après restart** → vérifier les métriques Railway (Memory Usage dans Metrics) pour détecter un memory leak progressif
4. **Le monitoring existant** (`memory-manager.service.ts`) gère les seuils automatiquement et log les warnings dans Railway logs

### Vérification post-fix

```bash
# Les alertes Slack devraient cesser immédiatement après deploy central (Fix 1)
# Les Fixes 2-3 nécessitent OTA vers v3.118.2 sur le Pi

# Vérifier côté central que les stale sockets sont détectés
# (chercher dans les logs Railway)
# "Stale socket disconnected, newer connection exists — skipping offline"

# Vérifier la mémoire Railway
curl -s https://neopro-central-production.up.railway.app/health | python3 -m json.tool | grep -A5 memory
```

---

---

## 37. Déploiement vidéo SaaS bloqué indéfiniment (v3.127.5+)

**Symptôme :** Les déploiements vidéo vers des sites `site_type = 'saas'` restent en `in_progress` à 0% indéfiniment. Des alertes "Déploiement bloqué" apparaissent toutes les 30 minutes dans Slack.

**Cause (pré-v3.127.5) :** `deployment.service.ts` traitait les sites SaaS comme des sites Pi : il envoyait un `deploy_video` via `commandQueueService.sendOrQueue()` qui attendait un Raspberry Pi pour confirmer le téléchargement. Les sites SaaS n'ont pas de Pi → la commande restait en queue indéfiniment → `checkStuckDeployments()` créait des alertes critiques.

**Vérification**

```sql
-- Chercher les déploiements SaaS bloqués
SELECT cd.id, cd.status, cd.progress,
       EXTRACT(EPOCH FROM (NOW() - COALESCE(cd.started_at, cd.created_at))) / 60 AS minutes_stuck,
       s.site_name, s.site_type
FROM content_deployments cd
JOIN sites s ON cd.target_id = s.id
WHERE cd.status = 'in_progress'
  AND s.site_type = 'saas';

-- Vérifier les alertes liées
SELECT id, type, severity, created_at
FROM alerts
WHERE site_id IN (SELECT id FROM sites WHERE site_type = 'saas')
  AND type = 'Déploiement bloqué'
ORDER BY created_at DESC LIMIT 20;
```

**Résolution (si encore sur version < 3.127.5)**

```sql
-- Compléter manuellement les déploiements SaaS bloqués
UPDATE content_deployments cd
SET status = 'completed', completed_at = NOW(), progress = 100
FROM sites s
WHERE cd.target_id = s.id
  AND s.site_type = 'saas'
  AND cd.status = 'in_progress';
```

**Fix définitif (v3.127.5+) :**

- `deployment.service.ts` : détecte `siteType === 'saas'` et marque le déploiement `completed` immédiatement (pas de `sendOrQueue`)
- `alerting.service.ts` : `checkStuckDeployments()` exclut les sites SaaS via `JOIN sites WHERE site_type != 'saas'`
- Smoke tests enforced pour prévenir la régression

| Fichier modifié                              | Rôle                                                  |
| -------------------------------------------- | ----------------------------------------------------- |
| `central-server/.../deployment.service.ts`   | Skip `deployToSite()` pour SaaS, completion immédiate |
| `central-server/.../alerting.service.ts`     | Exclut SaaS de `checkStuckDeployments()`              |
| `central-server/.../__tests__/smoke.test.ts` | 2 smoke tests : SaaS skip + alerting exclusion        |

**Voir aussi :** ADR-037 (Architecture SaaS), [COMMAND_QUEUE.md](/docs/technical/COMMAND_QUEUE.md)

---

---

## 41. Taille vidéo affichée "-" au lieu de la vraie taille (v3.127.7+)

**Symptôme :** Après upload d'une vidéo, la colonne "Taille" dans la vidéothèque du dashboard affiche `"-"` au lieu de la taille réelle (ex: `12.5 MB`).

**Cause racine :** Le driver PostgreSQL `pg` retourne les colonnes `BIGINT` (OID 20) comme des **strings** JavaScript (`"12345678"` au lieu de `12345678`). La colonne `file_size` en DB est de type `BIGINT`. Côté frontend, `Number.isFinite("12345678")` retourne `false` → `formatBytes()` retourne `'-'`.

**Diagnostic :**

```sql
-- Vérifier que file_size est bien renseigné en DB
SELECT id, filename, file_size, pg_typeof(file_size) FROM videos ORDER BY created_at DESC LIMIT 5;
```

```typescript
// Le driver pg retourne file_size comme string :
// typeof row.file_size === 'string'  // "12345678" — PAS un number !
// Number.isFinite("12345678")        // false — le test échoue sur les strings
```

**Fix (3 niveaux — defense-in-depth) :**

1. **Cause racine (serveur)** : `database.ts` — `setTypeParser(20, ...)` de `pg-types` convertit tous les BIGINT en `number` au niveau driver, globalement pour toutes les requêtes
2. **Defense-in-depth (frontend)** : `formatBytes()` accepte `string | number | null` et coerce via `Number()` avant le test `isFinite`
3. **Smoke tests** : 2 tests vérifient la présence de `setTypeParser` et du parsing BIGINT dans `database.ts`

| Fichier modifié                                    | Rôle                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `central-server/src/config/database.ts`            | `setTypeParser(20, parseInt)` — parse BIGINT comme number globalement |
| `central-dashboard/.../video-library.component.ts` | `formatBytes` accepte strings, coerce via `Number()`                  |
| `central-server/src/__tests__/smoke.test.ts`       | 2 smoke tests : import pg-types + parsing OID 20                      |

**Voir aussi :** CLAUDE.md (règle `setTypeParser`), [REFERENCE.md](/docs/technical/REFERENCE.md)

---

**Dernière mise à jour :** 6 avril 2026 (fix BIGINT type parser — tailles vidéo affichées correctement — v3.127.7)
