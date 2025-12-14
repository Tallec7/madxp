# Guide de mise en production - NeoPro

Guide complet pour déployer NeoPro en production. Conçu pour les débutants avec des explications détaillées.

---

## Sommaire

1. [Vue d'ensemble : Comprendre l'architecture](#1-vue-densemble--comprendre-larchitecture)
2. [Ce que vous allez configurer](#2-ce-que-vous-allez-configurer)
3. [Partie 1 : Supabase (Base de données)](#3-partie-1--supabase-base-de-données)
4. [Partie 2 : Redis Upstash (Cache)](#4-partie-2--redis-upstash-cache)
5. [Partie 3 : Render (Serveur API)](#5-partie-3--render-serveur-api)
6. [Partie 4 : Hostinger (Dashboard)](#6-partie-4--hostinger-dashboard)
7. [Partie 5 : Initialiser la base de données](#7-partie-5--initialiser-la-base-de-données)
8. [Partie 6 : Créer l'administrateur](#8-partie-6--créer-ladministrateur)
9. [Partie 7 : Vérifier le déploiement](#9-partie-7--vérifier-le-déploiement)
10. [Comment utiliser les outils au quotidien](#10-comment-utiliser-les-outils-au-quotidien)
11. [Configurations optionnelles](#11-configurations-optionnelles)
12. [Dépannage](#12-dépannage)
13. [Glossaire](#13-glossaire)

---

## 1. Vue d'ensemble : Comprendre l'architecture

### Le schéma de NeoPro

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLOUD (Internet)                             │
│                                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────┐ │
│  │  SUPABASE    │   │   RENDER     │   │   UPSTASH    │   │ HOSTINGER│ │
│  │              │   │              │   │              │   │          │ │
│  │ Base de      │◄─►│ Serveur API  │◄─►│ Cache Redis  │   │Dashboard │ │
│  │ données      │   │ central      │   │              │   │ Admin    │ │
│  │ PostgreSQL   │   │              │   │              │   │          │ │
│  │              │   │              │   │              │   │          │ │
│  │ + Stockage   │   │              │   │              │   │          │ │
│  │ vidéos       │   │              │   │              │   │          │ │
│  └──────────────┘   └──────┬───────┘   └──────────────┘   └─────┬────┘ │
│                            │                                     │      │
│                            │              ┌──────────────────────┘      │
│                            │              │                             │
└────────────────────────────┼──────────────┼─────────────────────────────┘
                             │              │
                             ▼              ▼
              ┌────────────────────────────────────────┐
              │         Raspberry Pi (clubs)           │
              │                                        │
              │  • Récupère les configs du serveur API │
              │  • Affiche les vidéos                  │
              │  • Envoie les statistiques             │
              └────────────────────────────────────────┘
```

### Quel service fait quoi ?

| Service | Rôle | Qui l'utilise | URL finale |
|---------|------|---------------|------------|
| **Supabase** | Stocke les données (utilisateurs, clubs, configs) et les vidéos | Le serveur API | https://supabase.com/dashboard |
| **Upstash** | Cache rapide pour les sessions et données temporaires | Le serveur API | https://console.upstash.com |
| **Render** | Fait tourner le serveur API (le "cerveau") | Les Raspberry Pi + le Dashboard | https://neopro-central.onrender.com |
| **Hostinger** | Héberge le dashboard d'administration | Vous (l'admin) | https://neopro-admin.kalonpartners.bzh |

---

## 2. Ce que vous allez configurer

### Où vont les informations que vous notez ?

Pendant ce guide, vous allez récupérer des "clés" et "URLs". Voici **exactement** où chacune sera utilisée :

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    OÙ METTRE CHAQUE INFORMATION                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  SUPABASE vous donne :                                                  │
│  ├── DATABASE_URL ────────────► Variables Render (central-server)       │
│  ├── SUPABASE_URL ────────────► Variables Render (central-server)       │
│  └── SUPABASE_SERVICE_KEY ───► Variables Render (central-server)        │
│                                                                         │
│  UPSTASH vous donne :                                                   │
│  └── REDIS_URL ──────────────► Variables Render (central-server)        │
│                                                                         │
│  VOUS générez :                                                         │
│  ├── JWT_SECRET ─────────────► Variables Render (central-server)        │
│  └── MFA_ENCRYPTION_KEY ────► Variables Render (central-server)         │
│                                                                         │
│  RENDER vous donne :                                                    │
│  └── URL du serveur ─────────► Config Hostinger (API_URL)               │
│                                 + ALLOWED_ORIGINS sur Render            │
│                                                                         │
│  HOSTINGER vous donne :                                                 │
│  └── URL du dashboard ───────► ALLOWED_ORIGINS sur Render               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Fiche à remplir au fur et à mesure

Créez un fichier texte et copiez ce template. Vous le remplirez au fur et à mesure :

```
=== CONFIGURATION NEOPRO ===
Date : _______________

1. SUPABASE (Base de données)
   - Database Password :
   - DATABASE_URL (avec pooler, port 6543) :
   - SUPABASE_URL :
   - SUPABASE_SERVICE_KEY :

2. UPSTASH (Redis)
   - REDIS_URL :

3. SECRETS À GÉNÉRER
   - JWT_SECRET :
   - MFA_ENCRYPTION_KEY :

4. RENDER (Serveur API)
   - URL : https://neopro-central.onrender.com

5. HOSTINGER (Dashboard)
   - URL :

6. ADMIN
   - Email :
   - Mot de passe :
```

---

## 3. Partie 1 : Supabase (Base de données)

### Pourquoi Supabase ?

Supabase stocke :
- Les **utilisateurs** et leurs mots de passe
- Les **clubs/sites** et leurs configurations
- Les **vidéos** (dans le Storage)
- Les **statistiques** d'utilisation

### Étape 3.1 : Créer un compte

1. Aller sur https://supabase.com
2. Cliquer **Start your project**
3. Se connecter avec **GitHub** (cliquer "Continue with GitHub")
4. Autoriser Supabase

### Étape 3.2 : Créer le projet

1. Cliquer **New Project**
2. Remplir :
   - **Name** : `neopro-production`
   - **Database Password** : Cliquer **Generate a password**
   - **Region** : `West EU (Paris)`
3. **COPIER LE MOT DE PASSE** dans votre fiche (vous ne le reverrez plus !)
4. Cliquer **Create new project**
5. Attendre 2-3 minutes

### Étape 3.3 : Récupérer DATABASE_URL

1. Menu gauche → **Settings** (engrenage) → **Database**
2. Descendre jusqu'à **Connection Pooling**
3. Vérifier que c'est **activé** (toggle vert)
4. Juste en dessous, section **Connection string** → onglet **URI**
5. Copier l'URL. Elle ressemble à :
   ```
   postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
6. **Remplacer** `[YOUR-PASSWORD]` par votre vrai mot de passe
7. Noter dans votre fiche comme **DATABASE_URL**

**Vérification :** L'URL doit avoir :
- Le port `6543` (pas 5432)
- `?pgbouncer=true` à la fin
- Votre vrai mot de passe

### Étape 3.4 : Récupérer SUPABASE_URL et SUPABASE_SERVICE_KEY

1. Menu gauche → **Settings** → **API**
2. Copier :
   - **Project URL** → C'est votre `SUPABASE_URL`
   - **service_role** (cliquer Reveal) → C'est votre `SUPABASE_SERVICE_KEY`
3. Noter les deux dans votre fiche

### Étape 3.5 : Créer les buckets de stockage

1. Menu gauche → **Storage**
2. Cliquer **New bucket**
   - Name : `videos`
   - Cocher **Public bucket**
   - Cliquer **Create bucket**
3. Répéter pour créer un bucket `software-updates` (aussi public)

### Étape 3.6 : Configurer les permissions des buckets

Pour chaque bucket (`videos` et `software-updates`) :

1. Cliquer sur le bucket
2. Onglet **Policies**
3. Cliquer **New policy** → **For full customization**
4. Créer policy 1 (lecture) :
   - Name : `Lecture publique`
   - Operation : **SELECT**
   - Definition : `true`
   - Sauvegarder
5. Créer policy 2 (upload) :
   - Name : `Upload serveur`
   - Operation : **INSERT**
   - Definition : `auth.role() = 'service_role'`
   - Sauvegarder

### Ce que vous avez maintenant

Dans votre fiche, vous devez avoir rempli :
- ✅ DATABASE_URL
- ✅ SUPABASE_URL
- ✅ SUPABASE_SERVICE_KEY

---

## 4. Partie 2 : Redis Upstash (Cache)

### Pourquoi Redis ?

Redis accélère l'application en gardant en mémoire :
- Les sessions utilisateurs
- Les données fréquemment demandées
- Les communications temps réel

### Étape 4.1 : Créer un compte

1. Aller sur https://upstash.com
2. Cliquer **Sign Up**
3. Se connecter avec **GitHub**

### Étape 4.2 : Créer la base Redis

1. Cliquer **Create Database**
2. Choisir **Redis** (pas Kafka)
3. Remplir :
   - Name : `neopro-redis`
   - Type : **Regional**
   - Region : `eu-west-1` (Ireland)
   - Cocher **TLS (SSL)**
4. Cliquer **Create**

### Étape 4.3 : Récupérer REDIS_URL

1. Sur la page de votre base
2. Section **Connect to your database**
3. Copier l'URL Redis (commence par `rediss://`)
4. Noter dans votre fiche comme **REDIS_URL**

### Ce que vous avez maintenant

- ✅ REDIS_URL

---

## 5. Partie 3 : Render (Serveur API)

### Pourquoi Render ?

Render fait tourner le serveur API, le "cerveau" qui :
- Reçoit les requêtes des Raspberry Pi
- Gère l'authentification
- Communique avec la base de données

### Étape 5.1 : Générer les secrets

Avant de configurer Render, générez deux clés secrètes.

**Sur Mac/Linux** (Terminal) :
```bash
# JWT_SECRET
openssl rand -base64 48

# MFA_ENCRYPTION_KEY
openssl rand -base64 24
```

**Sur Windows** (PowerShell) :
```powershell
# JWT_SECRET
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])

# MFA_ENCRYPTION_KEY
[Convert]::ToBase64String((1..24 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

**Ou via un site web** : https://randomkeygen.com/ → Section "CodeIgniter Encryption Keys"

Noter les deux clés dans votre fiche.

### Étape 5.2 : Créer un compte Render

1. Aller sur https://render.com
2. Cliquer **Get Started**
3. Se connecter avec **GitHub**
4. Autoriser l'accès au repo `neopro`

### Étape 5.3 : Créer le Web Service

1. Cliquer **New +** → **Web Service**
2. Choisir **Build and deploy from a Git repository**
3. Sélectionner le repo `neopro`
4. Configurer :

| Champ | Valeur |
|-------|--------|
| Name | `neopro-central` |
| Region | `Frankfurt (EU Central)` |
| Branch | `main` |
| Root Directory | `central-server` |
| Runtime | `Node` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |

5. Instance Type : **Free** (pour tester) ou **Starter** (7$/mois, toujours actif)

### Étape 5.4 : Ajouter les variables d'environnement

Section **Environment Variables**, ajouter **chaque variable** :

| Variable | Valeur | D'où ça vient |
|----------|--------|---------------|
| `NODE_ENV` | `production` | Fixe |
| `PORT` | `3001` | Fixe |
| `DATABASE_URL` | Votre URL | Fiche (Supabase) |
| `SUPABASE_URL` | Votre URL | Fiche (Supabase) |
| `SUPABASE_SERVICE_KEY` | Votre clé | Fiche (Supabase) |
| `REDIS_URL` | Votre URL | Fiche (Upstash) |
| `JWT_SECRET` | Votre clé | Fiche (généré) |
| `JWT_EXPIRES_IN` | `7d` | Fixe |
| `MFA_ISSUER` | `NeoPro` | Fixe |
| `MFA_ENCRYPTION_KEY` | Votre clé | Fiche (généré) |

### Étape 5.5 : Configurer le Health Check

1. Section **Advanced** (cliquer pour développer)
2. **Health Check Path** : `/health`

### Étape 5.6 : Créer et déployer

1. Cliquer **Create Web Service**
2. Attendre le déploiement (3-5 minutes)
3. Quand c'est **Live** (vert), noter l'URL :
   ```
   https://neopro-central.onrender.com
   ```

### Étape 5.7 : Tester

Ouvrir dans le navigateur :
```
https://neopro-central.onrender.com/health
```

Vous devez voir :
```json
{"status":"healthy","timestamp":"...","version":"1.0.0"}
```

---

## 6. Partie 4 : Hostinger (Dashboard)

### Pourquoi Hostinger ?

Hostinger héberge le dashboard d'administration (l'interface Angular).

### Étape 6.1 : Préparer le build

Sur votre ordinateur, dans le dossier du projet :

```bash
cd central-dashboard
npm install
npm run build:prod
```

Cela génère un dossier `dist/central-dashboard/` avec les fichiers à uploader.

### Étape 6.2 : Configurer l'URL de l'API

Avant le build, vérifier que le fichier `central-dashboard/src/environments/environment.prod.ts` contient :

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://neopro-central.onrender.com'
};
```

### Étape 6.3 : Uploader sur Hostinger

1. Se connecter à Hostinger
2. Aller dans le **File Manager** de votre hébergement
3. Aller dans `public_html` (ou le dossier de votre sous-domaine)
4. Supprimer les anciens fichiers si présents
5. Uploader tout le contenu de `dist/central-dashboard/`
   - Les fichiers doivent être **à la racine**, pas dans un sous-dossier
   - Structure attendue :
     ```
     public_html/
     ├── index.html
     ├── main.xxxxx.js
     ├── styles.xxxxx.css
     └── ...
     ```

### Étape 6.4 : Configurer la redirection SPA

Pour que les routes Angular fonctionnent, créer un fichier `.htaccess` dans `public_html/` :

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

### Étape 6.5 : Configurer CORS sur Render

Le serveur doit autoriser les requêtes venant de Hostinger :

1. Retourner sur Render → votre service `neopro-central`
2. **Environment** → Ajouter une variable :
   - Key : `ALLOWED_ORIGINS`
   - Value : `https://neopro-admin.kalonpartners.bzh`
3. **Save Changes** (le serveur redémarre)

### Étape 6.6 : Tester

1. Ouvrir https://neopro-admin.kalonpartners.bzh
2. Vous devez voir la page de login
3. Si page blanche : voir section Dépannage

---

## 7. Partie 5 : Initialiser la base de données

La base est vide, il faut créer les tables.

### Étape 7.1 : Ouvrir l'éditeur SQL

1. Sur Supabase → votre projet
2. Menu gauche → **SQL Editor**
3. Cliquer **New query**

### Étape 7.2 : Créer les tables

1. Sur GitHub, ouvrir le fichier `central-server/src/scripts/init-db.sql`
2. Copier tout le contenu
3. Coller dans l'éditeur SQL Supabase
4. Cliquer **Run**
5. Vérifier "Success"

### Étape 7.3 : Créer les tables analytics

1. Nouvelle query
2. Copier `central-server/src/scripts/analytics-tables.sql`
3. Coller et **Run**

### Étape 7.4 : Migration MFA

Nouvelle query avec ce code :

```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[],
ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled
ON users(mfa_enabled) WHERE mfa_enabled = TRUE;
```

Cliquer **Run**.

### Étape 7.5 : Vérifier

Nouvelle query :
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

Vous devez voir : `analytics`, `groups`, `sites`, `users`, etc.

---

## 8. Partie 6 : Créer l'administrateur

### Option A : Via Render Shell

1. Sur Render → votre service
2. Menu gauche → **Shell**
3. Taper : `npm run create-admin`
4. Répondre aux questions (email, mot de passe, nom)

### Option B : Via SQL

Si le shell ne fonctionne pas :

1. Générer un hash de mot de passe sur https://bcrypt-generator.com/
   - Entrer votre mot de passe
   - 12 rounds
   - Copier le hash

2. Dans Supabase SQL Editor :

```sql
INSERT INTO users (email, password_hash, full_name, role, is_active, created_at, updated_at)
VALUES (
  'votre@email.com',
  '$2a$12$VOTRE_HASH_ICI',
  'Votre Nom',
  'admin',
  true,
  NOW(),
  NOW()
);
```

3. **Run**

---

## 9. Partie 7 : Vérifier le déploiement

### Checklist

| Test | URL | Résultat attendu |
|------|-----|------------------|
| Health check | https://neopro-central.onrender.com/health | `{"status":"healthy"...}` |
| API docs | https://neopro-central.onrender.com/api-docs | Page Swagger |
| Dashboard | https://neopro-admin.kalonpartners.bzh | Page de login |
| Login | Dashboard → se connecter | Accès au dashboard |

---

## 10. Comment utiliser les outils au quotidien

### Supabase : Voir et modifier les données

**Accès** : https://supabase.com/dashboard → Votre projet

**Ce que vous pouvez faire :**

1. **Voir les utilisateurs** :
   - Menu → **Table Editor** → Table `users`
   - Vous voyez tous les utilisateurs, leurs rôles, etc.

2. **Voir les sites/clubs** :
   - Table Editor → Table `sites`
   - Liste de tous les Raspberry Pi enregistrés

3. **Modifier une donnée** :
   - Double-cliquer sur une cellule pour éditer
   - Attention : les modifications sont immédiates !

4. **Exécuter des requêtes SQL** :
   - Menu → **SQL Editor**
   - Exemples utiles :
     ```sql
     -- Voir tous les sites actifs
     SELECT name, status, last_seen FROM sites WHERE is_active = true;

     -- Réinitialiser un mot de passe (remplacer le hash)
     UPDATE users SET password_hash = '$2a$12$nouveauhash' WHERE email = 'user@email.com';
     ```

5. **Voir les vidéos stockées** :
   - Menu → **Storage** → Bucket `videos`
   - Vous pouvez uploader/supprimer des fichiers

### Upstash : Surveiller le cache

**Accès** : https://console.upstash.com → Votre base

**Ce que vous pouvez faire :**

1. **Voir les statistiques** :
   - Dashboard principal : requêtes/jour, mémoire utilisée

2. **Voir les données en cache** :
   - Onglet **Data Browser**
   - Liste des clés stockées (sessions, etc.)

3. **Vider le cache** (si problème) :
   - Onglet **CLI**
   - Taper : `FLUSHALL`
   - ⚠️ Déconnecte tous les utilisateurs !

### Render : Gérer le serveur

**Accès** : https://dashboard.render.com → Votre service

**Ce que vous pouvez faire :**

1. **Voir les logs en direct** :
   - Menu → **Logs**
   - Utile pour débugger

2. **Redémarrer le serveur** :
   - Menu → **Manual Deploy** → **Deploy latest commit**
   - Ou : **Settings** → **Restart**

3. **Modifier une variable d'environnement** :
   - Menu → **Environment**
   - Modifier → **Save Changes**
   - Le serveur redémarre automatiquement

4. **Voir si le serveur est "endormi"** (plan Free) :
   - Si dernière activité > 15 min, il dort
   - La prochaine requête prend ~30 sec pour le réveiller

### Hostinger : Mettre à jour le dashboard

**Quand mettre à jour ?**
- Après une modification du code `central-dashboard`
- Après un `git pull` avec des changements frontend

**Comment :**
1. Sur votre PC : `cd central-dashboard && npm run build:prod`
2. Sur Hostinger : supprimer les anciens fichiers de `public_html`
3. Uploader le nouveau contenu de `dist/central-dashboard/`

---

## 11. Configurations optionnelles

### Monitoring avec Better Stack (ex-Logtail)

Better Stack surveille que votre serveur fonctionne.

**Configuration :**

1. Aller sur https://betterstack.com
2. Créer un compte (gratuit)
3. Section **Uptime** → **Create monitor**
   - URL : `https://neopro-central.onrender.com/health`
   - Check interval : 3 minutes
4. Configurer les alertes (email, SMS...)

**Ce que ça fait :**
- Vérifie toutes les 3 min que le serveur répond
- Vous alerte si le site est down
- Historique de disponibilité

### Alertes Slack

**Configuration :**

1. https://api.slack.com/apps → **Create New App**
2. Incoming Webhooks → Activer
3. Add New Webhook → Choisir un channel
4. Copier l'URL du webhook
5. Sur Render, ajouter :
   - `SLACK_WEBHOOK_URL` = l'URL copiée

**Ce que ça fait :**
- Envoie des messages Slack quand il y a des erreurs critiques

### Emails avec SendGrid

**Configuration :**

1. https://sendgrid.com → Créer un compte
2. Settings → Sender Authentication → Vérifier un email
3. Settings → API Keys → Créer une clé (Mail Send only)
4. Sur Render, ajouter :
   - `SENDGRID_API_KEY` = votre clé
   - `EMAIL_FROM` = l'email vérifié

**Ce que ça fait :**
- Permet d'envoyer des emails (réinitialisation mot de passe, alertes)

---

## 12. Dépannage

### Le serveur ne démarre pas (Render)

**Symptômes** : Statut "Deploy failed" ou "Crashed"

**Solutions** :
1. Render → Logs → Chercher l'erreur en rouge
2. Vérifier les variables d'environnement :
   - Toutes les 10 présentes ?
   - DATABASE_URL a le bon mot de passe ?
   - Pas d'espace en début/fin de valeur ?

### Le dashboard affiche une page blanche

**Symptômes** : Page blanche ou erreur console

**Solutions** :
1. F12 → Console → Chercher les erreurs
2. Vérifier que `environment.prod.ts` a la bonne URL API
3. Vérifier le `.htaccess` (redirection SPA)
4. Vérifier `ALLOWED_ORIGINS` sur Render

### Erreur CORS

**Symptômes** : Erreur "Access-Control-Allow-Origin" dans la console

**Solution** :
1. Render → Environment
2. Vérifier `ALLOWED_ORIGINS`
3. Format : `https://votresite.com` (pas de `/` à la fin)
4. Plusieurs sites : `https://site1.com,https://site2.com`

### Erreur de connexion base de données

**Symptômes** : "Connection refused", "timeout"

**Solutions** :
1. Vérifier DATABASE_URL :
   - Port `6543` (pas 5432)
   - `?pgbouncer=true` à la fin
   - Mot de passe correct

### Le login ne fonctionne pas

**Symptômes** : "Invalid credentials"

**Solutions** :
1. Supabase → Table Editor → Table `users`
2. Vérifier que l'utilisateur existe
3. Vérifier `is_active = true`
4. Vérifier `role = 'admin'`

### Le serveur dort (plan Free Render)

**Symptômes** : Première requête très lente (~30 sec)

**C'est normal** : Le plan Free met en veille après 15 min d'inactivité.

**Solutions** :
- Passer au plan Starter (7$/mois)
- Ou utiliser UptimeRobot pour "réveiller" le serveur régulièrement

---

## 13. Glossaire

| Terme | Explication |
|-------|-------------|
| **API** | Interface permettant aux applications de communiquer entre elles |
| **Backend** | La partie serveur (invisible pour l'utilisateur) |
| **Bucket** | Un dossier de stockage dans le cloud |
| **Cache** | Stockage temporaire pour accélérer les accès |
| **CORS** | Sécurité navigateur qui bloque les requêtes entre sites différents |
| **Dashboard** | Interface d'administration visuelle |
| **Deploy** | Mettre en ligne une application |
| **Frontend** | La partie visible (interface utilisateur) |
| **Health Check** | Test automatique pour vérifier qu'un serveur fonctionne |
| **JWT** | Token d'authentification (preuve de connexion) |
| **MFA** | Authentification à deux facteurs (mot de passe + code) |
| **Pooler** | Système qui partage les connexions à la base de données |
| **PostgreSQL** | Type de base de données |
| **Redis** | Base de données ultra-rapide en mémoire |
| **SPA** | Application web mono-page (comme Angular) |
| **SSL/TLS** | Chiffrement des communications (https) |
| **Token** | Code temporaire prouvant l'identité d'un utilisateur |

---

## Récapitulatif des URLs

| Service | URL |
|---------|-----|
| Supabase Dashboard | https://supabase.com/dashboard |
| Upstash Console | https://console.upstash.com |
| Render Dashboard | https://dashboard.render.com |
| Votre API | https://neopro-central.onrender.com |
| Health Check | https://neopro-central.onrender.com/health |
| API Docs | https://neopro-central.onrender.com/api-docs |
| Votre Dashboard | https://neopro-admin.kalonpartners.bzh |

---

**Version :** 5.0
**Dernière mise à jour :** 14 décembre 2025
