# Déploiement du serveur central Neopro

## 🎯 Objectif

Le serveur central permet de :
- 📊 Monitorer tous les boîtiers depuis un dashboard unique
- 🔄 Synchroniser les données
- ⚡ Pousser des mises à jour OTA
- 📈 Voir les statistiques d'utilisation

**Important :** Le serveur central est **optionnel**. Les boîtiers fonctionnent parfaitement en autonome sans lui.

---

## ⚠️ Prérequis

- Compte GitHub/GitLab
- Compte Render.com (gratuit pour tester, ~$14/mois pour production)
- Code du projet poussé sur Git

---

## 🚀 Déploiement sur Render.com

### Étape 1 : Pousser le code sur Git

```bash
cd /path/to/neopro

# Si pas encore de repo Git
git init
git add .
git commit -m "Initial commit"

# Créer un repo sur GitHub et pousser
git remote add origin https://github.com/votre-username/neopro.git
git push -u origin main
```

### Étape 2 : Créer un compte Render

1. Aller sur https://render.com
2. Sign up with GitHub
3. Autoriser l'accès à votre repo

### Étape 3 : Déployer via Blueprint

1. Dans Render Dashboard → **New** → **Blueprint**
2. Sélectionner votre repo `neopro`
3. Render détecte automatiquement `render.yaml`
4. Cliquer sur **Apply**

**Ce qui est créé automatiquement :**
- ✅ Web Service : `neopro-central-server`
- ✅ PostgreSQL Database : `neopro-central-db`

### Étape 4 : Configurer les variables d'environnement

Dans Render Dashboard → Services → neopro-central-server → Environment

Ajouter ces variables :

```
NODE_ENV=production
PORT=3001
ADMIN_EMAIL=admin@neopro.fr
ADMIN_PASSWORD=VotreMotDePasseSecuriseIci123!
JWT_SECRET=GenerezUneLongueCleAleatoire123456789ABCDEF
DATABASE_URL=(automatique, fourni par Render)
```

**Générer un JWT_SECRET** :
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Étape 5 : Initialiser la base de données

```bash
# Dans Render Dashboard → Database → neopro-central-db → Shell
# OU en local avec psql

# Récupérer l'External Database URL depuis Render
# Format: postgresql://user:password@host:port/dbname

psql "postgresql://user:password@host:port/dbname" -f central-server/src/scripts/init-db.sql
```

Ou directement dans le Shell Render :
```sql
-- Copier/coller le contenu de central-server/src/scripts/init-db.sql
```

### Étape 6 : Vérifier le déploiement

```bash
# Tester la santé du serveur
curl https://neopro-central-server.onrender.com/health
# Devrait retourner: {"status":"ok","timestamp":"..."}

# Tester l'API
curl https://neopro-central-server.onrender.com/api/sites
# Devrait retourner: {"sites":[]}
```

---

## 🔗 Connecter un boîtier au serveur central

### Sur le boîtier Raspberry Pi

```bash
# 1. Se connecter
ssh pi@neopro.local

# 2. Aller dans sync-agent
cd /home/pi/neopro/sync-agent

# 3. Enregistrer le site
sudo node scripts/register-site.js
```

**Répondre aux questions :**
```
Central Server URL: https://neopro-central-server.onrender.com
Admin email: admin@neopro.fr
Admin password: VotreMotDePasseSecuriseIci123!
```

**Puis répondre aux infos du site :**
```
Site Name: MANGIN BEAULIEU
Club Name: NANTES LOIRE FÉMININ HANDBALL
City: NANTES
Region: PDL
Country: France
Sports: handball
Contact Email: gwenvael.letallec@nantes-loire-feminin-handball.fr
Contact Phone: 0673565696
```

### Installer le service

```bash
sudo npm run install-service
sudo systemctl status neopro-sync-agent
```

**Résultat attendu :**
```
● neopro-sync-agent.service - NEOPRO Sync Agent
   Active: active (running)
```

---

## 📊 Accéder au dashboard central

### Déployer le dashboard

Le dashboard Angular doit aussi être déployé (séparément) :

```bash
cd central-dashboard
npm install
npm run build

# Déployer sur Render/Netlify/Vercel
# OU directement dans central-server/public/
```

**URL :** https://neopro-central.onrender.com

**Login :**
- Email : admin@neopro.fr
- Password : VotreMotDePasseSecuriseIci123!

---

## 🔍 Vérifications

### 1. Serveur central actif

```bash
curl https://neopro-central-server.onrender.com/health
# ✅ {"status":"ok"}
```

### 2. Boîtier enregistré

```bash
curl https://neopro-central-server.onrender.com/api/sites
# ✅ Devrait lister votre site
```

### 3. Connexion WebSocket

```bash
ssh pi@neopro.local 'sudo journalctl -u neopro-sync-agent -n 20'
# ✅ Devrait montrer "Connected to central server"
```

### 4. Statut dans le dashboard

Aller sur le dashboard → Sites → Liste des sites
- ✅ Site apparaît
- ✅ Statut : 🟢 En ligne

---

## ❌ Troubleshooting

### Erreur 404 lors de l'enregistrement

**Problème :** Serveur central pas déployé ou URL incorrecte

**Solution :**
```bash
# Tester l'URL
curl https://neopro-central-server.onrender.com/health

# Si 404 → Vérifier le déploiement Render
```

### Erreur 401 Unauthorized

**Problème :** Email ou mot de passe incorrect

**Solution :**
- Vérifier les variables d'environnement Render
- `ADMIN_EMAIL` et `ADMIN_PASSWORD` doivent correspondre

### Service fail to start (USER error)

**Problème :** Permissions incorrectes

**Solution :**
```bash
ssh pi@neopro.local
sudo chown -R pi:pi /home/pi/neopro/sync-agent
sudo systemctl restart neopro-sync-agent
```

### Render service crash

**Problème :** Base de données pas initialisée

**Solution :**
```bash
# Initialiser la DB via Render Shell
psql $DATABASE_URL -f src/scripts/init-db.sql
```

---

## 💰 Coûts Render.com

### Plan gratuit (Free)
- ✅ 750h/mois (suffisant pour tester)
- ✅ PostgreSQL 256MB
- ❌ Service s'endort après 15min d'inactivité
- ❌ Redémarre au premier appel (30-60s)

### Plan Starter (~$14/mois)
- ✅ Toujours actif
- ✅ PostgreSQL 1GB
- ✅ Backups automatiques
- ✅ Recommandé pour production

---

## 🎯 Résumé

1. ✅ Push code sur GitHub
2. ✅ Créer compte Render.com
3. ✅ Déployer via Blueprint (render.yaml)
4. ✅ Configurer variables d'environnement
5. ✅ Initialiser la base de données
6. ✅ Tester : `curl .../health`
7. ✅ Enregistrer les boîtiers
8. ✅ Accéder au dashboard

**Durée totale :** 20-30 minutes

---

## 📚 Liens utiles

- **Render.com :** https://render.com
- **Documentation Render :** https://render.com/docs
- **Code serveur central :** `central-server/`
- **Code dashboard :** `central-dashboard/`

---

**Prochaine étape :** [README.md](../README.md) pour utiliser les boîtiers
