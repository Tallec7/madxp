# Fix iOS/iPadOS Hotspot — Connexion et accès neopro.local

## Problème

Quand un iPhone/iPad se connecte au hotspot `NEOPRO-{CLUB}`, plusieurs symptômes peuvent apparaître :

1. **Safari affiche "impossible de se connecter au serveur"** pour `neopro.local`
2. **Le captive portal sheet iOS s'ouvre** et bloque l'accès dans Safari
3. **`neopro.local` ne résout pas** (mais `192.168.4.1` fonctionne)
4. **La connexion WiFi semble fonctionner** mais aucune page ne charge

## Diagnostic rapide

```bash
ssh pi@192.168.4.1

# Vérifier tous les services d'un coup
systemctl is-active hostapd dnsmasq nginx avahi-daemon
# Les 4 doivent afficher "active"

# Tester le captive portal iOS
curl -s http://localhost/hotspot-detect.html
# Doit retourner : <HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>

# Tester la résolution DNS
grep "captive.apple.com" /etc/dnsmasq.conf
# Doit afficher : address=/captive.apple.com/192.168.4.1

# Vérifier avahi sur wlan0
sudo journalctl -u avahi-daemon -n 30 | grep wlan0
# Doit afficher : "Joining mDNS multicast group on interface wlan0.IPv4"
```

## Solutions rapides (sans modification du Pi)

### Solution 1 : Utiliser l'IP directe (recommandation immédiate)

Sur votre iPhone/iPad :

1. Connectez-vous au WiFi `NEOPRO-{CLUB_NAME}`
2. Si iOS affiche un captive portal → fermez-le
3. Ouvrez Safari et allez à :
   ```
   http://192.168.4.1/login
   ```
   (au lieu de `http://neopro.local/login`)

### Solution 2 : Forcer la reconnexion WiFi

1. **Paramètres → WiFi**
2. Tapez le ℹ️ à côté de `NEOPRO-{CLUB}`
3. **Oublier ce réseau**
4. Reconnectez-vous au réseau

## Arbre de diagnostic détaillé

### Cas 1 : `192.168.4.1` fonctionne mais `neopro.local` non

**Cause** : Problème de résolution DNS/mDNS uniquement.

```bash
ssh pi@192.168.4.1

# Vérifier avahi-daemon
sudo systemctl status avahi-daemon

# S'il est inactif → le redémarrer
sudo systemctl restart avahi-daemon

# Vérifier qu'il écoute sur wlan0 (pas seulement wlan1)
sudo journalctl -u avahi-daemon -n 30 | grep wlan0
```

Si avahi n'écoute pas sur wlan0 :

```bash
# Ajouter allow-interfaces dans avahi-daemon.conf
sudo sed -i 's/^#allow-interfaces=.*/allow-interfaces=eth0,wlan0,wlan1/' /etc/avahi/avahi-daemon.conf

# Si la ligne n'existe pas, l'ajouter
grep -q "allow-interfaces" /etc/avahi/avahi-daemon.conf || \
  sudo sed -i '/^\[server\]/a allow-interfaces=eth0,wlan0,wlan1' /etc/avahi/avahi-daemon.conf

sudo systemctl restart avahi-daemon
```

Vérifier aussi la résolution DNS classique (iOS l'utilise en priorité) :

```bash
grep "neopro.local" /etc/dnsmasq.conf
# Si rien → l'ajouter
echo "address=/neopro.local/192.168.4.1" | sudo tee -a /etc/dnsmasq.conf
sudo systemctl restart dnsmasq
```

### Cas 2 : Rien ne charge (ni IP ni neopro.local)

**Cause probable** : nginx est tombé.

```bash
ssh pi@192.168.4.1  # via un autre réseau ou Ethernet

# Vérifier nginx
sudo systemctl status nginx
sudo nginx -t  # Test de la config

# Redémarrer
sudo systemctl restart nginx
```

### Cas 3 : Le captive portal iOS bloque l'accès

**Symptôme** : iOS ouvre un mini-navigateur (captive portal sheet) au lieu de laisser Safari charger normalement. Ce sheet a des restrictions réseau.

**Cause** : iOS envoie un GET vers `http://captive.apple.com/hotspot-detect.html`. Sans la bonne réponse, iOS considère le réseau comme un portail captif et restreint l'accès.

**Vérification** :

```bash
# L'endpoint doit retourner exactement ce contenu
curl -s http://localhost/hotspot-detect.html
# Attendu : <HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>

# Vérifier la redirection DNS
grep "captive.apple.com" /etc/dnsmasq.conf
# Attendu : address=/captive.apple.com/192.168.4.1
```

**Solution — Configurer le captive portal** :

#### 1. Ajouter les DNS dans dnsmasq

```bash
# Vérifier si déjà présent
grep "captive.apple.com" /etc/dnsmasq.conf

# Si absent, ajouter les redirections iOS
cat << 'EOF' | sudo tee -a /etc/dnsmasq.conf

# Apple iOS/macOS captive portal detection
address=/captive.apple.com/192.168.4.1
address=/www.apple.com/192.168.4.1
EOF

sudo systemctl restart dnsmasq
```

#### 2. Ajouter les endpoints dans nginx

Ajouter dans le bloc `server` de la config nginx (`/etc/nginx/sites-enabled/default` ou `/etc/nginx/sites-enabled/neopro-captive`) :

```nginx
# Apple iOS / macOS — endpoint principal
location /hotspot-detect.html {
    default_type text/html;
    return 200 "<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>";
}

# Apple iOS — endpoint alternatif (certaines versions iOS)
location /library/test/success.html {
    default_type text/html;
    return 200 "Success";
}
```

```bash
sudo nginx -t && sudo systemctl restart nginx
```

#### 3. Tester

1. Sur l'iPhone, **Paramètres → WiFi → Oublier le réseau** `NEOPRO-{CLUB}`
2. Reconnectez-vous
3. iOS ne devrait plus ouvrir le captive portal sheet
4. Accédez à `http://neopro.local/login` dans Safari

### Cas 4 : "Ça marchait avant" — un service a crashé

Si la connexion fonctionnait et a soudainement cessé, le problème est probablement un service qui a crashé silencieusement (souvent après un reboot ou un OTA).

```bash
# Diagnostic express — vérifier les 4 services critiques
for svc in hostapd dnsmasq nginx avahi-daemon; do
  printf "%-15s %s\n" "$svc:" "$(systemctl is-active $svc)"
done

# Si un service est inactif, le redémarrer
sudo systemctl restart nginx avahi-daemon  # les deux coupables habituels

# Le hotspot-watchdog (v3.61+) surveille désormais les 4 services
# et les relance automatiquement toutes les 30 secondes
```

## Comment iOS détecte la connectivité

iOS vérifie la connectivité Internet via plusieurs URLs à chaque connexion WiFi :

| URL | Réponse attendue | Effet si absent |
|-----|-------------------|-----------------|
| `http://captive.apple.com/hotspot-detect.html` | HTTP 200 + body "Success" | Captive portal sheet s'ouvre |
| `http://www.apple.com/library/test/success.html` | HTTP 200 + body "Success" | Fallback check |

La config complète (dnsmasq + nginx) est dans :
- `raspberry/config/systemd/dnsmasq.conf` — Redirections DNS
- `raspberry/config/nginx-captive-portal.conf` — Endpoints HTTP

## Différences Mac vs iPhone

| Comportement | Mac | iPhone |
|-------------|-----|--------|
| Résolution mDNS (.local) | Cache Bonjour robuste, résout même si Avahi est lent | Dépend du DNS dnsmasq + mDNS, échoue plus facilement |
| Captive portal | Ouvre un mini-navigateur séparé, n'affecte pas Safari | Sheet intégré qui **restreint l'accès réseau dans Safari** |
| Fallback DNS | Utilise mDNS Bonjour en natif | Priorité au DNS classique, mDNS en fallback |

C'est pourquoi `neopro.local` peut fonctionner sur Mac mais pas sur iPhone connecté au même hotspot.

## Vérification complète

```bash
# Depuis le Pi : vérifier que tout est opérationnel
echo "=== Services ==="
systemctl is-active hostapd dnsmasq nginx avahi-daemon

echo "=== Captive Portal iOS ==="
curl -s http://localhost/hotspot-detect.html

echo "=== Captive Portal Android ==="
curl -s -o /dev/null -w "%{http_code}" http://localhost/generate_204

echo "=== DNS neopro.local ==="
grep "neopro.local" /etc/dnsmasq.conf

echo "=== Avahi wlan0 ==="
sudo journalctl -u avahi-daemon -n 10 | grep -c wlan0 && echo "OK" || echo "NON DETECTE"
```

## Résumé

| Problème | Cause probable | Solution rapide |
|----------|---------------|-----------------|
| `neopro.local` ne résout pas | avahi-daemon crashé ou pas sur wlan0 | `sudo systemctl restart avahi-daemon` |
| Rien ne charge | nginx tombé | `sudo systemctl restart nginx` |
| Captive portal sheet bloque | Endpoint `/hotspot-detect.html` absent | Ajouter dans nginx (voir ci-dessus) |
| DNS `captive.apple.com` pas redirigé | Manque dans dnsmasq.conf | Ajouter `address=/captive.apple.com/192.168.4.1` |
| Fonctionnait avant, plus maintenant | Service crashé silencieusement | `systemctl is-active hostapd dnsmasq nginx avahi-daemon` |

## Références

- [Apple Captive Network Detection](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/NetworkingOverview/CaptivePortals/CaptivePortals.html)
- [Avahi Documentation](https://www.avahi.org/)
- Guide Android : [ANDROID_HOTSPOT_FIX.md](ANDROID_HOTSPOT_FIX.md)
- Configuration complète : `raspberry/config/nginx-captive-portal.conf`
