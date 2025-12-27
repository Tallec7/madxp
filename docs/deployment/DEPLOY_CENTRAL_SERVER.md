# Déploiement du serveur central Neopro

## 🎯 Objectif

Le serveur central permet de :

- 📊 Monitorer tous les boîtiers depuis un dashboard unique
- 🔄 Synchroniser les données
- ⚡ Pousser des mises à jour OTA
- 📈 Voir les statistiques d'utilisation

**Important :** Le serveur central est **optionnel**. Les boîtiers fonctionnent parfaitement en autonome sans lui.

---

## 🌐 Architecture actuelle (Production)

| Composant                        | Hébergeur | URL                                                |
| -------------------------------- | --------- | -------------------------------------------------- |
| **Backend (API + WebSocket)**    | Railway   | `https://neopro-central-production.up.railway.app` |
| **Frontend (Dashboard Angular)** | Hostinger | `https://neopro-admin.kalonpartners.bzh`           |
| **Base de données**              | Supabase  | PostgreSQL managé                                  |

---

## ⚠️ Prérequis

- Compte GitHub/GitLab
- Compte Railway.app (~$5/mois) OU Render.com
- Compte Supabase (gratuit jusqu'à 500MB)
- Code du projet poussé sur Git

---

## 🚀 Déploiement sur Railway (Recommandé)

### Étape 1 : Créer un compte Railway

1. Aller sur https://railway.app
2. Sign up with GitHub
3. Créer un nouveau projet

### Étape 2 : Déployer le backend

1. Dans Railway Dashboard → **New Project** → **Deploy from GitHub repo**
2. Sélectionner votre repo `neopro`
3. Configurer le service :
   - **Root Directory**: `central-server`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

### Étape 3 : Configurer les variables d'environnement

Dans Railway → Service → Variables, ajouter :

```
NODE_ENV=production
PORT=3001
ADMIN_EMAIL=admin@neopro.fr
ADMIN_PASSWORD=VotreMotDePasseSecuriseIci123!
JWT_SECRET=GenerezUneLongueCleAleatoire123456789ABCDEF
DATABASE_URL=postgresql://user:password@host:port/dbname
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_KEY=votre-service-role-key
ALLOWED_ORIGINS=https://neopro-admin.kalonpartners.bzh
```

**Important pour CORS cross-origin :**

- `ALLOWED_ORIGINS` doit contenir l'URL exacte du frontend (sans slash final)
- Plusieurs origines peuvent être séparées par des virgules

**Configuration Supabase Storage :**

1. Dans Supabase Dashboard → Storage → New bucket
2. Nom : `videos`, cocher "Public bucket"
3. Récupérer l'URL et la clé service dans Settings → API

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
curl https://neopro-central.onrender.com/health
# Devrait retourner: {"status":"ok","timestamp":"..."}

# Tester l'API
curl https://neopro-central.onrender.com/api/sites
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
Central Server URL: https://neopro-central-production.up.railway.app
Admin email: admin@neopro.fr
Admin password: VotreMotDePasseSecuriseIci123!
```

### Configuration manuelle (si nécessaire)

Si le service ne se connecte pas, vérifier `/etc/neopro/site.conf` :

```bash
sudo nano /etc/neopro/site.conf
```

**Variables importantes :**

```bash
# URL du serveur central (IMPORTANT: doit correspondre au backend Railway)
CENTRAL_SERVER_URL=https://neopro-central-production.up.railway.app

# Activer la connexion au serveur central
CENTRAL_SERVER_ENABLED=true

# Identifiants du site (générés lors de l'enregistrement)
SITE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SITE_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Après modification, redémarrer le service :**

```bash
sudo systemctl restart neopro-sync-agent
sudo journalctl -u neopro-sync-agent -f
```

**Résultat attendu dans les logs :**

```
✅ Connected to central server
Authentification réussie
📤 Local state synced to central
Starting heartbeat
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
curl https://neopro-central.onrender.com/health
# ✅ {"status":"ok"}
```

### 2. Boîtier enregistré

```bash
curl https://neopro-central.onrender.com/api/sites
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

### Erreur "Connection error" en boucle sur le Raspberry Pi

**Problème :** L'URL du serveur central est incorrecte dans `/etc/neopro/site.conf`

**Solution :**

```bash
ssh pi@neopro.local
sudo nano /etc/neopro/site.conf

# Vérifier que CENTRAL_SERVER_URL pointe vers Railway :
# CENTRAL_SERVER_URL=https://neopro-central-production.up.railway.app

sudo systemctl restart neopro-sync-agent
```

### Erreur 401 sur les requêtes API du dashboard

**Problème :** Les cookies cross-origin ne sont pas envoyés

**Causes possibles :**

1. `sameSite` du cookie mal configuré côté serveur
2. `withCredentials: true` manquant côté frontend
3. `ALLOWED_ORIGINS` ne contient pas l'URL du frontend

**Solution côté serveur** (`central-server/src/controllers/auth.controller.ts`) :

```typescript
const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' pour cross-origin
  maxAge: 8 * 60 * 60 * 1000,
  path: '/',
};
```

**Solution Railway :** Vérifier `ALLOWED_ORIGINS` dans les variables d'environnement

### Erreur 500 lors du login

**Problème :** Colonnes manquantes dans la base de données

**Solution :** Exécuter la migration SQL :

```sql
-- Dans Supabase SQL Editor
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS sponsor_id UUID;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS agency_id UUID;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
```

Ou utiliser le script de migration :

```bash
psql $DATABASE_URL -f central-server/src/scripts/migrations/00-initial-users-schema.sql
```

### Dashboard affiche "Déconnecté" alors que l'utilisateur est connecté

**Problème :** Le WebSocket n'est pas connecté après le login

**Solution :** La connexion WebSocket doit être établie dans le `LayoutComponent` après l'authentification :

```typescript
ngOnInit(): void {
  this.authService.currentUser$.subscribe(user => {
    if (user) {
      const token = this.authService.getSseToken();
      if (token && !this.socketService.isConnected()) {
        this.socketService.connect(token);
      }
    }
  });
}
```

### ERR_CONNECTION_RESET sur le dashboard

**Problème :** Le serveur Railway est en cold start ou temporairement indisponible

**Solution :**

1. Attendre quelques secondes et rafraîchir la page
2. Vérifier que Railway n'est pas en maintenance
3. Vérifier les logs Railway pour des erreurs

### Erreur 404 lors de l'enregistrement

**Problème :** Serveur central pas déployé ou URL incorrecte

**Solution :**

```bash
# Tester l'URL
curl https://neopro-central-production.up.railway.app/api/sites

# Si erreur → Vérifier le déploiement Railway
```

### Service fail to start (USER error)

**Problème :** Permissions incorrectes

**Solution :**

```bash
ssh pi@neopro.local
sudo chown -R pi:pi /home/pi/neopro/sync-agent
sudo systemctl restart neopro-sync-agent
```

---

## 💰 Coûts hébergement

### Railway (~$5-10/mois)

- ✅ Toujours actif (pas de cold start)
- ✅ Déploiement automatique depuis GitHub
- ✅ Logs en temps réel
- ✅ Variables d'environnement faciles à gérer
- ✅ Recommandé pour production

### Render.com (~$7-14/mois)

- ✅ Plan gratuit disponible (avec cold start)
- ✅ PostgreSQL inclus
- ❌ Service s'endort après 15min d'inactivité (plan gratuit)

### Supabase (gratuit jusqu'à 500MB)

- ✅ PostgreSQL managé
- ✅ Storage pour les vidéos
- ✅ Interface SQL pratique
- ✅ Backups automatiques

---

## 🎯 Résumé

1. ✅ Push code sur GitHub
2. ✅ Créer compte Railway.app
3. ✅ Déployer le backend depuis GitHub
4. ✅ Configurer variables d'environnement (dont `ALLOWED_ORIGINS`)
5. ✅ Configurer Supabase pour la base de données
6. ✅ Déployer le frontend sur Hostinger/Netlify/Vercel
7. ✅ Tester : `curl https://neopro-central-production.up.railway.app/api/sites`
8. ✅ Enregistrer les boîtiers (mettre à jour `/etc/neopro/site.conf`)
9. ✅ Accéder au dashboard

**Durée totale :** 30-45 minutes

---

## 📚 Liens utiles

- **Railway.app :** https://railway.app
- **Supabase :** https://supabase.com
- **Code serveur central :** `central-server/`
- **Code dashboard :** `central-dashboard/`
- **Migration SQL :** `central-server/src/scripts/migrations/00-initial-users-schema.sql`

---

**Prochaine étape :** [README.md](../README.md) pour utiliser les boîtiers
