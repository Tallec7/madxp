# Configuration du Sync-Agent - Guide complet

> Pour comprendre l'architecture globale du sync-agent, voir [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md).

## ✅ Votre infrastructure

- **Serveur central (API) :** https://neopro-central-production.up.railway.app
- **Dashboard :** https://neopro-admin.kalonpartners.bzh
- **Base de données :** Supabase (PostgreSQL)
- **Credentials admin :**
  - Email : `<ADMIN_EMAIL>`
  - Password : `<ADMIN_PASSWORD>`
  - _Les credentials sont disponibles auprès de l'équipe Neopro._

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
Admin email: <ADMIN_EMAIL>
Admin password: <ADMIN_PASSWORD>
```

**⚠️ Important :** Demandez les credentials admin à l'équipe Neopro avant de procéder.

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
   - Email : `<ADMIN_EMAIL>`
   - Password : `<ADMIN_PASSWORD>`

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

- Vérifier que vous utilisez bien les credentials fournis par l'équipe Neopro
- Tester le login :

```bash
curl -X POST https://neopro-central-production.up.railway.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<ADMIN_EMAIL>","password":"<ADMIN_PASSWORD>"}'
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

## ⚙️ Options de configuration du sync-agent

| Variable             | Description                                                        | Valeur par défaut                           |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| `CENTRAL_SERVER_URL` | URL du serveur central                                             | _(obligatoire)_                             |
| `SITE_ID`            | UUID du site (généré automatiquement lors de l'enregistrement)     | _(auto)_                                    |
| `API_KEY`            | Clé API du site (générée automatiquement lors de l'enregistrement) | _(auto)_                                    |
| `HEARTBEAT_INTERVAL` | Intervalle heartbeat en secondes                                   | `30`                                        |
| `VIDEO_DIR`          | Répertoire de stockage des vidéos                                  | `/home/pi/neopro/videos`                    |
| `CONFIG_PATH`        | Chemin vers le fichier configuration.json                          | `/home/pi/neopro/webapp/configuration.json` |

Ces options sont définies dans `/etc/neopro/site.conf` sur le Raspberry Pi.

### Variables d'environnement complémentaires

Les variables suivantes peuvent être définies dans l'environnement du service systemd (`/etc/systemd/system/neopro-sync-agent.service`) :

| Variable                 | Description                                      | Valeur par défaut |
| ------------------------ | ------------------------------------------------ | ----------------- |
| `LOG_LEVEL`              | Niveau de log (`debug`, `info`, `warn`, `error`) | `info`            |
| `METRICS_INTERVAL`       | Intervalle d'envoi des métriques (ms)            | `60000`           |
| `RECONNECT_DELAY`        | Délai avant reconnexion WebSocket (ms)           | `5000`            |
| `MAX_RECONNECT_ATTEMPTS` | Nombre max de tentatives de reconnexion          | `Infinity`        |
| `BACKUP_ENABLED`         | Activer les sauvegardes locales chiffrées        | `true`            |
| `BACKUP_INTERVAL`        | Intervalle entre sauvegardes (ms)                | `86400000` (24h)  |

---

**Prochaine étape :** Tester le boîtier sur http://neopro.local/login

---

_Dernière mise à jour : 10 février 2026_

## Voir aussi

- [SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md) -- Architecture détaillée du sync-agent
- [ARCHITECTURE.md](./ARCHITECTURE.md) -- Architecture système globale
- [TROUBLESHOOTING.md](../guides/TROUBLESHOOTING.md) -- Guide de dépannage
