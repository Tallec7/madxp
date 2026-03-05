# Fix Android Hotspot - Connexion sans Internet

## Problème

Android detecte automatiquement que le hotspot `NEOPRO-{CLUB}` n'a pas d'acces Internet et :

1. **Affiche "Pas d'acces Internet"**
2. **Bascule automatiquement sur les donnees mobiles (4G/5G)** — le WiFi reste "connecte" mais le trafic passe par la 4G
3. **Bloque la resolution DNS** de `neopro.local`

Resultat : impossible d'acceder a `http://neopro.local/login` ou `http://192.168.4.1` depuis Android.

> **Note** : Les iPhones (iOS) ne sont PAS affectes par ce probleme. iOS gere correctement le captive portal HTTP.

## Cause racine (v3.99.5)

Android fait ses connectivity checks en **HTTPS** (port 443) depuis Android 10+. Le Pi ne repond pas en HTTPS, donc Android considere "pas d'internet" et bascule silencieusement sur la 4G.

La solution DNS + nginx (`/generate_204`) corrige le check **HTTP** mais pas le check **HTTPS**. Il faut en plus des regles **iptables NAT** qui redirigent le port 443 vers nginx (port 80).

## Solution automatique (v3.99.5+)

Depuis la v3.99.5, le fix est **automatique** :

1. **`install.sh`** configure les regles iptables au setup initial
2. **`hotspot-watchdog.sh`** verifie et restaure les regles a chaque cycle (survit au reboot)
3. **`fix-fleet-pi.sh`** applique le fix sur les Pi deja deployes
4. **`deploy-remote.sh`** deploie le script via la mise a jour standard

### Architecture du fix

```
┌──────────────────────────────────────────────────────────────┐
│  Android phone connecte au hotspot NEOPRO                    │
│  → Check HTTPS: https://connectivitycheck.gstatic.com/...   │
│  → Port 443                                                  │
└───────────────────────────┬──────────────────────────────────┘
                            │
                   iptables NAT PREROUTING
                   wlan0:443 → 192.168.4.1:80
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  nginx (port 80) → /generate_204 → return 204               │
│  Android recoit HTTP 200/204 au lieu du timeout HTTPS        │
│  → Detecte "captive portal" → reste sur le WiFi             │
└──────────────────────────────────────────────────────────────┘
```

### Verification sur le Pi

```bash
# Verifier que les regles iptables sont actives
sudo iptables -t nat -L PREROUTING -n | grep -E "dpt:(80|443)"

# Doit afficher :
# DNAT  tcp  --  0.0.0.0/0   0.0.0.0/0   tcp dpt:80  to:192.168.4.1:80
# DNAT  tcp  --  0.0.0.0/0   0.0.0.0/0   tcp dpt:443 to:192.168.4.1:80

# Verifier le statut complet du hotspot
/home/pi/neopro/scripts/hotspot-watchdog.sh --status
# Doit afficher : [✓] iptables: captive portal actif (Android HTTPS → nginx)
```

### Application manuelle sur un Pi existant

```bash
# Option 1 : Via le script dedie (recommande)
sudo AP_INTERFACE=wlan0 /home/pi/neopro/scripts/setup-captive-portal-iptables.sh

# Option 2 : Via fix-fleet-pi (applique toutes les corrections)
sudo /home/pi/neopro/scripts/fix-fleet-pi.sh
```

## Solutions utilisateur (en attendant le deploy)

### Solution 1 : Utiliser l'IP directe

1. Connectez-vous au WiFi `NEOPRO-{CLUB_NAME}`
2. Android affiche "Pas d'acces Internet" → **Tapez "Rester connecte"**
3. Ouvrez votre navigateur et allez a :
   ```
   http://192.168.4.1/login
   ```

### Solution 2 : Desactiver temporairement les donnees mobiles

1. Connectez-vous au WiFi `NEOPRO-{CLUB_NAME}`
2. **Desactivez les donnees mobiles** (4G/5G)
3. Android sera force d'utiliser le WiFi
4. Accedez a `http://192.168.4.1/login`

### Solution 3 : Forcer l'utilisation du reseau WiFi

1. **Parametres → WiFi**
2. Appuyez longuement sur `NEOPRO-{CLUB_NAME}`
3. **Modifier le reseau**
4. **Options avancees** → Activer
5. Cochez **"Utiliser ce reseau meme sans Internet"** (selon la version Android)

## Debugging

```bash
# Test captive portal HTTP (doit retourner 204)
curl -s -o /dev/null -w "%{http_code}" http://localhost/generate_204

# Verifier les domaines DNS rediriges
grep -i "connectivitycheck\|gstatic\|googleapis" /etc/dnsmasq.conf

# Verifier les regles iptables NAT
sudo iptables -t nat -L -n -v

# Voir les requetes des clients hotspot dans nginx
sudo tail -f /var/log/nginx/access.log

# Statut complet du hotspot watchdog
/home/pi/neopro/scripts/hotspot-watchdog.sh --status
```

## Monitoring

Le **hotspot-watchdog** surveille les regles iptables a chaque cycle (30s) et les restaure automatiquement si elles disparaissent (ex: apres un flush iptables manuel ou un bug kernel).

Le check est visible dans le statut :

```
[✓] iptables: captive portal actif (Android HTTPS → nginx)
```

ou en cas de probleme :

```
[✗] iptables: captive portal MANQUANT — Android bascule sur 4G
```

## Resume

| Methode                             | Difficulte | Efficacite | Notes                               |
| ----------------------------------- | ---------- | ---------- | ----------------------------------- |
| **iptables NAT (v3.99.5+)**         | Auto       | Haute      | Fix permanent, survit au reboot     |
| IP directe `192.168.4.1`            | Facile     | Haute      | Solution immediate, pas de modif Pi |
| Desactiver donnees mobiles          | Facile     | Moyenne    | Temporaire, il faut y penser        |
| "Rester connecte" dans notification | Facile     | Haute      | Doit etre fait a chaque connexion   |

## References

- [Android Captive Portal Detection](https://android.googlesource.com/platform/frameworks/base/+/master/core/java/android/net/CaptivePortal.java)
- [Google Connectivity Checks](https://www.chromium.org/chromium-os/chromiumos-design-docs/network-portal-detection/)
- [RFC 7710 - Captive-Portal Identification](https://datatracker.ietf.org/doc/html/rfc7710)
