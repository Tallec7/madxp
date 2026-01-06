# Fix Android Hotspot - Connexion sans Internet

## Problème

Android détecte automatiquement que le hotspot `NEOPRO-{CLUB}` n'a pas d'accès Internet et :

1. **Affiche "Pas d'accès Internet"**
2. **Peut refuser de rester connecté** ou basculer sur les données mobiles
3. **Bloque la résolution DNS** de `neopro.local`

Résultat : impossible d'accéder à `http://neopro.local/login` depuis Android.

## Solutions rapides (sans modification du Pi)

### Solution 1 : Utiliser l'IP directe ⭐ RECOMMANDÉ

Sur votre téléphone Android :

1. Connectez-vous au WiFi `NEOPRO-{CLUB_NAME}`
2. Android affiche "Pas d'accès Internet" → **Tapez "Rester connecté"**
3. Ouvrez votre navigateur et allez à :
   ```
   http://192.168.4.1/login
   ```
   (au lieu de `http://neopro.local/login`)

### Solution 2 : Désactiver temporairement les données mobiles

1. Connectez-vous au WiFi `NEOPRO-{CLUB_NAME}`
2. **Désactivez les données mobiles** (4G/5G)
3. Android sera forcé d'utiliser le WiFi
4. Accédez à `http://192.168.4.1/login`

### Solution 3 : Forcer l'utilisation du réseau WiFi

1. **Paramètres → WiFi**
2. Appuyez longuement sur `NEOPRO-{CLUB_NAME}`
3. **Modifier le réseau**
4. **Options avancées** → Activer
5. Cochez **"Utiliser ce réseau même sans Internet"** (selon la version Android)

## Solution technique : Ajouter un Captive Portal

Pour que Android accepte automatiquement le hotspot, vous pouvez configurer un **Captive Portal**.

### Qu'est-ce qu'un Captive Portal ?

Quand Android se connecte à un WiFi, il envoie une requête HTTP vers :

```
http://connectivitycheck.gstatic.com/generate_204
```

- Si la réponse est **204 No Content** → Android considère qu'il y a Internet
- Si pas de réponse → Android affiche "Pas d'accès Internet"

### Étape 1 : Modifier la configuration nginx

SSH sur le Raspberry Pi :

```bash
ssh pi@192.168.4.1
```

Éditez le fichier nginx principal :

```bash
sudo nano /etc/nginx/sites-enabled/default
```

Ajoutez ces lignes **avant** les autres `location` blocks :

```nginx
# Captive Portal - Android connectivity check
location /generate_204 {
    return 204;
}

location /gen_204 {
    return 204;
}

# Chrome connectivity check
location /connecttest.txt {
    return 200 "Microsoft Connect Test";
    add_header Content-Type text/plain;
}

# Windows connectivity check
location /ncsi.txt {
    return 200 "Microsoft NCSI";
    add_header Content-Type text/plain;
}
```

### Étape 2 : Configurer dnsmasq pour rediriger les requêtes

Éditez la configuration dnsmasq :

```bash
sudo nano /etc/dnsmasq.conf
```

Ajoutez ces lignes pour rediriger toutes les requêtes de connectivité vers le Pi :

```conf
# Rediriger les checks de connectivité Android vers le Pi
address=/connectivitycheck.gstatic.com/192.168.4.1
address=/connectivitycheck.google.com/192.168.4.1
address=/clients3.google.com/192.168.4.1
address=/www.msftconnecttest.com/192.168.4.1
```

### Étape 3 : Redémarrer les services

```bash
sudo systemctl restart nginx
sudo systemctl restart dnsmasq
```

### Étape 4 : Tester

1. **Déconnectez** votre Android du WiFi `NEOPRO-{CLUB}`
2. **Reconnectez-vous**
3. Android devrait maintenant accepter le réseau sans afficher "Pas d'accès Internet"

## Alternative : Redirection automatique vers /login

Si vous voulez que Android **ouvre automatiquement le navigateur** avec la page de login :

```nginx
# Au lieu de return 204, rediriger vers la page de login
location /generate_204 {
    return 302 http://192.168.4.1/login;
}
```

**Avantage** : Le navigateur s'ouvre automatiquement
**Inconvénient** : Peut être répétitif si l'utilisateur reste connecté longtemps

## Vérification

Pour tester si le captive portal fonctionne :

```bash
# Depuis le Pi
curl -I http://localhost/generate_204

# Doit retourner :
HTTP/1.1 204 No Content
```

## Debugging Android

Pour voir ce qui se passe côté Android :

1. **Chrome DevTools via USB** (mode développeur Android activé)
2. Connectez le téléphone en USB
3. `chrome://inspect` dans Chrome sur PC
4. Regardez les requêtes réseau du navigateur Android

Ou vérifiez les logs nginx sur le Pi :

```bash
sudo tail -f /var/log/nginx/access.log
```

Vous devriez voir les requêtes `/generate_204` arriver.

## Résumé

| Méthode                    | Difficulté | Efficacité   | Notes                              |
| -------------------------- | ---------- | ------------ | ---------------------------------- |
| IP directe `192.168.4.1`   | ⭐ Facile  | ⭐⭐⭐ Haute | Solution immédiate, pas de modif   |
| Désactiver données mobiles | ⭐ Facile  | ⭐⭐ Moyenne | Temporaire, il faut y penser       |
| Captive Portal (204)       | ⭐⭐ Moyen | ⭐⭐⭐ Haute | Solution permanente, config réseau |
| Redirection vers /login    | ⭐⭐ Moyen | ⭐⭐ Moyenne | Ouvre auto le navigateur           |

## Références

- [Android Captive Portal Detection](https://android.googlesource.com/platform/frameworks/base/+/master/core/java/android/net/CaptivePortal.java)
- [Google Connectivity Checks](https://www.chromium.org/chromium-os/chromiumos-design-docs/network-portal-detection/)
- [RFC 7710 - Captive-Portal Identification](https://datatracker.ietf.org/doc/html/rfc7710)
