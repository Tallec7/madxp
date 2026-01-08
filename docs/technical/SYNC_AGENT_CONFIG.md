# Configuration du Sync-Agent - Guide complet

## ✅ Votre infrastructure

- **Serveur central (API) :** https://neopro-central-production.up.railway.app
- **Dashboard :** https://neopro-admin.kalonpartners.bzh
- **Base de données :** Supabase (PostgreSQL)
- **Credentials admin :**
  - Email : `admin@neopro.fr`
  - Password : `admin123`

## 🔧 Configuration du sync-agent sur le boîtier

### Sur le Raspberry Pi

```bash
# 1. Se connecter au Pi
ssh pi@neopro.local

# 2. Aller dans sync-agent
cd /home/pi/neopro/sync-agent

# 3. Enregistrer le site
sudo node scripts/register-site.js
```

### Répondre aux questions

#### Étape 1 : Connexion au serveur central

```
Central Server URL: https://neopro-central-production.up.railway.app
Admin email: admin@neopro.fr
Admin password: admin123
```

**⚠️ Important :** Entrez exactement ces valeurs.

#### Étape 2 : Informations du site

```
Site Name: MANGIN BEAULIEU
Club Name: NANTES LOIRE FÉMININ HANDBALL
City: NANTES
Region: PDL
Country: France
Sports (comma-separated): handball
Hardware Model: Raspberry Pi 4 Model B Rev 1.4  # (détecté automatiquement)
```

### Résultat attendu

```
✅ Site enregistré avec succès
Site ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Configuration sauvegardée dans /etc/neopro/site.conf
```

### Installer le service

```bash
# Installer le service systemd
sudo npm run install-service

# Vérifier le statut
sudo systemctl status neopro-sync-agent
```

**Résultat attendu :**

```
● neopro-sync-agent.service - NEOPRO Sync Agent
   Active: active (running)
```

### Voir les logs

```bash
# Logs en temps réel
sudo journalctl -u neopro-sync-agent -f

# 50 dernières lignes
sudo journalctl -u neopro-sync-agent -n 50
```

**Résultat attendu :**

```
Connected to central server
Metrics sent successfully
```

---

## 📊 Vérification sur le dashboard

### Accéder au dashboard

1. Ouvrir : https://neopro-admin.kalonpartners.bzh
2. Se connecter avec :
   - Email : `admin@neopro.fr`
   - Password : `admin123`

### Vérifier le site

1. Menu **Sites** → **Liste des sites**
2. Chercher : **MANGIN BEAULIEU**
3. Vérifier :
   - ✅ Statut : 🟢 **En ligne**
   - ✅ Dernière connexion : il y a quelques secondes
   - ✅ Métriques : CPU, RAM, etc.

---

## 🐛 Troubleshooting

### Erreur "Not Found" lors de l'enregistrement

**Problème :** L'URL du serveur n'est pas correcte

**Solution :**

```bash
# Vérifier que le serveur répond
curl https://neopro-central-production.up.railway.app/

# Devrait retourner
{
  "service": "NEOPRO Central Server",
  "version": "1.0.0",
  "status": "online"
}
```

### Erreur 401 "Unauthorized"

**Problème :** Email ou mot de passe incorrect

**Solution :**

- Vérifier que vous utilisez bien :
  - Email : `admin@neopro.fr`
  - Password : `admin123`
- Tester le login :

```bash
curl -X POST https://neopro-central-production.up.railway.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@neopro.fr","password":"admin123"}'
# Devrait retourner un token
```

### Service fail to start (status 217/USER)

**Problème :** Permissions incorrectes

**Solution :**

```bash
# Corriger les permissions
sudo chown -R pi:pi /home/pi/neopro/sync-agent

# Vérifier le fichier de service
cat /etc/systemd/system/neopro-sync-agent.service

# Devrait contenir :
# User=pi
# Group=pi

# Redémarrer
sudo systemctl daemon-reload
sudo systemctl restart neopro-sync-agent
```

### Le site n'apparaît pas sur le dashboard

**Vérifications :**

1. **Service actif ?**

   ```bash
   sudo systemctl status neopro-sync-agent
   # Doit être "active (running)"
   ```

2. **Connexion établie ?**

   ```bash
   sudo journalctl -u neopro-sync-agent -n 20
   # Chercher "Connected to central server"
   ```

3. **Site enregistré ?**

   ```bash
   # Vérifier le fichier de config
   sudo cat /etc/neopro/site.conf
   # Doit contenir SITE_ID=...
   ```

4. **Serveur accessible ?**
   ```bash
   # Depuis le Pi
   curl https://neopro-central-production.up.railway.app/
   ```

---

## 🔄 Réenregistrer un site

Si vous devez réenregistrer le site :

```bash
ssh pi@neopro.local
cd /home/pi/neopro/sync-agent

# Supprimer l'ancienne config
sudo rm -f /etc/neopro/site.conf

# Réenregistrer
sudo node scripts/register-site.js

# Redémarrer le service
sudo systemctl restart neopro-sync-agent
```

---

## ✅ Checklist finale

- [ ] Service neopro-sync-agent actif
- [ ] Logs montrent "Connected to central server"
- [ ] Site apparaît sur le dashboard
- [ ] Statut : 🟢 En ligne
- [ ] Métriques remontent (CPU, RAM, etc.)
- [ ] Dernière connexion : récente

---

## 🎯 Commandes rapides

```bash
# Statut du service
sudo systemctl status neopro-sync-agent

# Logs en temps réel
sudo journalctl -u neopro-sync-agent -f

# Redémarrer
sudo systemctl restart neopro-sync-agent

# Voir la config
sudo cat /etc/neopro/site.conf
```

---

**Prochaine étape :** Tester le boîtier sur http://neopro.local/login 🚀
