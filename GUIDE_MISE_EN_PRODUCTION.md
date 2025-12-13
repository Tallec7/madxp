# Guide de mise en production - NeoPro

Guide pas à pas pour déployer NeoPro en production sur Render.com avec Supabase et Redis.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Étape 1 : Créer un compte Supabase](#étape-1--créer-un-compte-supabase)
3. [Étape 2 : Configurer la base de données](#étape-2--configurer-la-base-de-données)
4. [Étape 3 : Configurer le stockage Supabase](#étape-3--configurer-le-stockage-supabase)
5. [Étape 4 : Créer un compte Redis (Upstash)](#étape-4--créer-un-compte-redis-upstash)
6. [Étape 5 : Créer un compte Render](#étape-5--créer-un-compte-render)
7. [Étape 6 : Déployer le serveur central](#étape-6--déployer-le-serveur-central)
8. [Étape 7 : Déployer le dashboard](#étape-7--déployer-le-dashboard)
9. [Étape 8 : Exécuter les migrations](#étape-8--exécuter-les-migrations)
10. [Étape 9 : Créer le premier administrateur](#étape-9--créer-le-premier-administrateur)
11. [Étape 10 : Vérifier le déploiement](#étape-10--vérifier-le-déploiement)
12. [Configuration optionnelle](#configuration-optionnelle)
13. [Référence des variables d'environnement](#référence-des-variables-denvironnement)
14. [Dépannage](#dépannage)

---

## 1. Vue d'ensemble

### Services requis

| Service | Usage | Gratuit | Obligatoire |
|---------|-------|---------|-------------|
| Supabase | Base PostgreSQL + Storage | 500MB + 1GB | Oui |
| Upstash | Redis serverless | 10K req/jour | Oui |
| Render | Hébergement | 750h/mois | Oui |

### Services optionnels

| Service | Usage | Gratuit |
|---------|-------|---------|
| SendGrid | Envoi d'emails | 100/jour |
| Slack | Notifications | Oui |
| Logtail | Logs centralisés | 1GB/mois |
| UptimeRobot | Surveillance uptime | 50 monitors |

### Architecture déployée

```
┌─────────────────┐     ┌─────────────────┐
│  Raspberry Pi   │────▶│ Central Server  │
│  (sync-agent)   │     │ (Render.com)    │
└─────────────────┘     └────────┬────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Supabase     │     │  Redis Upstash  │     │    Dashboard    │
│  (PostgreSQL)   │     │    (Cache)      │     │  (Render.com)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Étape 1 : Créer un compte Supabase

### 1.1. Accéder à Supabase

1. Ouvrir https://supabase.com dans votre navigateur
2. Cliquer sur le bouton **Start your project** (en haut à droite)

### 1.2. S'inscrire

1. Cliquer sur **Sign up with GitHub** (recommandé pour synchroniser avec votre repo)
2. Autoriser Supabase à accéder à votre compte GitHub
3. Vous êtes maintenant connecté au dashboard Supabase

### 1.3. Créer un nouveau projet

1. Sur le dashboard, cliquer sur **New Project**
2. Sélectionner votre organisation (ou "Personal" si vous n'en avez pas)
3. Remplir le formulaire :

   | Champ | Valeur |
   |-------|--------|
   | Project name | `neopro-production` |
   | Database Password | Cliquer sur **Generate a password** |
   | Region | `West EU (Paris)` |

4. **IMPORTANT** : Copier le mot de passe généré dans un endroit sûr (gestionnaire de mots de passe)
5. Cliquer sur **Create new project**
6. Attendre 2-3 minutes que le projet soit créé (indicateur de progression visible)

---

## Étape 2 : Configurer la base de données

### 2.1. Récupérer l'URL de connexion

1. Dans le menu de gauche, cliquer sur l'icône **engrenage** (Settings)
2. Cliquer sur **Database** dans le sous-menu
3. Faire défiler jusqu'à la section **Connection string**
4. Cliquer sur l'onglet **URI**
5. Copier l'URL qui ressemble à :
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.abcdefgh.supabase.co:5432/postgres
   ```

### 2.2. Activer le Connection Pooling

Le pooling est **obligatoire** pour les applications serverless comme Render.

1. Toujours dans **Settings > Database**
2. Faire défiler jusqu'à **Connection Pooling**
3. Vérifier que le toggle est sur **Enabled** (vert)
4. Dans la section **Connection string** en dessous :
   - Cliquer sur l'onglet **URI**
   - Copier l'URL du pooler :
   ```
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```

**IMPORTANT** : C'est cette URL (port 6543 avec `?pgbouncer=true`) que vous utiliserez comme `DATABASE_URL`.

### 2.3. Récupérer les clés API

1. Dans le menu de gauche, cliquer sur **Settings** > **API**
2. Copier les valeurs suivantes :

   | Élément | Variable d'environnement | Exemple |
   |---------|--------------------------|---------|
   | Project URL | `SUPABASE_URL` | `https://abcdefgh.supabase.co` |
   | service_role (secret) | `SUPABASE_SERVICE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

**ATTENTION** : Le `service_role` est **secret**. Ne jamais l'exposer côté client ou dans le code source.

### 2.4. Résumé des informations obtenues

À ce stade, vous devez avoir :
```
DATABASE_URL=postgresql://postgres.[project-ref]:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Étape 3 : Configurer le stockage Supabase

Le stockage sert à héberger les vidéos et les mises à jour logicielles.

### 3.1. Créer le bucket "videos"

1. Dans le menu de gauche, cliquer sur **Storage**
2. Cliquer sur **New bucket**
3. Remplir :
   - **Name** : `videos`
   - **Public bucket** : Cocher la case (les Raspberry Pi doivent pouvoir télécharger)
4. Cliquer sur **Create bucket**

### 3.2. Créer le bucket "software-updates"

1. Cliquer à nouveau sur **New bucket**
2. Remplir :
   - **Name** : `software-updates`
   - **Public bucket** : Cocher la case
3. Cliquer sur **Create bucket**

### 3.3. Configurer les permissions du bucket "videos"

1. Cliquer sur le bucket **videos** pour l'ouvrir
2. Cliquer sur l'onglet **Policies**
3. Cliquer sur **New policy**
4. Choisir **For full customization**
5. Créer la première policy (lecture publique) :
   - **Policy name** : `Allow public read`
   - **Allowed operation** : `SELECT`
   - **Target roles** : Laisser vide (tous)
   - **Policy definition** :
     ```sql
     true
     ```
6. Cliquer sur **Review** puis **Save policy**
7. Cliquer à nouveau sur **New policy** > **For full customization**
8. Créer la deuxième policy (upload via service_role) :
   - **Policy name** : `Allow service upload`
   - **Allowed operation** : `INSERT`
   - **Target roles** : Laisser vide
   - **Policy definition** :
     ```sql
     auth.role() = 'service_role'
     ```
9. Cliquer sur **Review** puis **Save policy**

### 3.4. Configurer les permissions du bucket "software-updates"

Répéter exactement les mêmes étapes (3.3) pour le bucket `software-updates`.

---

## Étape 4 : Créer un compte Redis (Upstash)

### 4.1. S'inscrire sur Upstash

1. Ouvrir https://upstash.com
2. Cliquer sur **Sign Up**
3. Choisir **Continue with GitHub** (recommandé)
4. Autoriser Upstash

### 4.2. Créer une base Redis

1. Sur le dashboard, cliquer sur **Create Database**
2. Remplir le formulaire :

   | Champ | Valeur |
   |-------|--------|
   | Name | `neopro-redis` |
   | Type | `Regional` |
   | Region | `eu-west-1` (Ireland) |
   | TLS (SSL) | Cocher la case (recommandé) |

3. Cliquer sur **Create**

### 4.3. Récupérer l'URL de connexion

1. La base est créée, vous êtes sur sa page de détails
2. Dans la section **Connect to your database**
3. Chercher **Endpoint** avec le format Redis URL
4. Copier l'URL complète :
   ```
   rediss://default:xxxxxxxxxxxx@eu1-caring-owl-12345.upstash.io:6379
   ```

**Note** : `rediss://` (avec 's') signifie connexion TLS sécurisée.

### 4.4. Résumé

À ce stade, vous devez avoir :
```
REDIS_URL=rediss://default:xxxxxxxxxxxx@eu1-caring-owl-12345.upstash.io:6379
```

---

## Étape 5 : Créer un compte Render

### 5.1. S'inscrire sur Render

1. Ouvrir https://render.com
2. Cliquer sur **Get Started**
3. Choisir **GitHub** pour vous connecter
4. Autoriser Render à accéder à votre compte GitHub

### 5.2. Connecter le repository

1. Après connexion, Render peut vous demander d'installer l'application GitHub
2. Cliquer sur **Configure** ou aller dans **Account Settings** > **Git Providers**
3. Cliquer sur **Connect** à côté de GitHub
4. Sélectionner **Only select repositories**
5. Choisir le repository `neopro`
6. Cliquer sur **Install & Authorize**

---

## Étape 6 : Déployer le serveur central

### 6.1. Créer le Web Service

1. Sur le dashboard Render, cliquer sur **New +**
2. Sélectionner **Web Service**
3. Choisir **Build and deploy from a Git repository**
4. Cliquer sur **Next**
5. Sélectionner le repository `neopro`
6. Cliquer sur **Connect**

### 6.2. Configurer le service

Remplir le formulaire avec ces valeurs **exactes** :

| Champ | Valeur |
|-------|--------|
| Name | `neopro-central-server` |
| Region | `Frankfurt (EU Central)` |
| Branch | `main` |
| Root Directory | `central-server` |
| Runtime | `Node` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |

### 6.3. Choisir le plan

1. Faire défiler jusqu'à **Instance Type**
2. Choisir :
   - **Free** (0$) pour tester - mise en veille après 15 min d'inactivité
   - **Starter** (7$/mois) pour production - toujours actif

### 6.4. Ajouter les variables d'environnement

1. Faire défiler jusqu'à **Environment Variables**
2. Cliquer sur **Add Environment Variable** pour chaque variable
3. Ajouter les variables suivantes **une par une** :

**Variables obligatoires :**

| Key | Value | Description |
|-----|-------|-------------|
| `NODE_ENV` | `production` | Mode production |
| `PORT` | `3001` | Port du serveur |
| `DATABASE_URL` | `postgresql://postgres...` | URL Supabase avec pooler (étape 2.2) |
| `SUPABASE_URL` | `https://xxx.supabase.co` | URL projet Supabase (étape 2.3) |
| `SUPABASE_SERVICE_KEY` | `eyJhbGci...` | Clé service_role (étape 2.3) |
| `REDIS_URL` | `rediss://default:...` | URL Redis Upstash (étape 4.3) |
| `JWT_SECRET` | (voir ci-dessous) | Secret pour tokens JWT |
| `JWT_EXPIRES_IN` | `7d` | Durée de validité des tokens |
| `MFA_ISSUER` | `NeoPro` | Nom affiché dans l'app authenticator |
| `MFA_ENCRYPTION_KEY` | (voir ci-dessous) | Clé de chiffrement MFA |

**Générer les secrets :**

Ouvrir un terminal et exécuter :
```bash
# JWT_SECRET (64 caractères)
openssl rand -base64 48
# Exemple de résultat : a3F5K8mN9pR2sT6vX0yB4dG7hJ1lO3qU5wE8zC2fA6iL9nM4oP7rS0tV3xY6bK

# MFA_ENCRYPTION_KEY (32 caractères)
openssl rand -base64 24
# Exemple de résultat : X7kL9mN2pQ4rS6tU8vW0xY3zA5bC
```

Ou utiliser https://randomkeygen.com/ et copier une clé "CodeIgniter Encryption Keys".

### 6.5. Configurer le Health Check

1. Faire défiler jusqu'à **Advanced**
2. Cliquer pour développer
3. Dans **Health Check Path**, entrer : `/health`

### 6.6. Créer le service

1. Cliquer sur **Create Web Service**
2. Render va :
   - Cloner le repository
   - Installer les dépendances
   - Builder l'application
   - Démarrer le serveur
3. Attendre que le statut passe à **Live** (vert) - environ 3-5 minutes

### 6.7. Noter l'URL du service

Une fois déployé, Render affiche l'URL en haut de la page :
```
https://neopro-central-server.onrender.com
```

Copier cette URL, elle sera nécessaire pour le dashboard.

---

## Étape 7 : Déployer le dashboard

### 7.1. Créer le Static Site

1. Sur le dashboard Render, cliquer sur **New +**
2. Sélectionner **Static Site**
3. Choisir le repository `neopro`
4. Cliquer sur **Connect**

### 7.2. Configurer le site

| Champ | Valeur |
|-------|--------|
| Name | `neopro-dashboard` |
| Branch | `main` |
| Root Directory | `central-dashboard` |
| Build Command | `npm install && npm run build:prod` |
| Publish Directory | `dist/central-dashboard` |

### 7.3. Ajouter les variables d'environnement

Cliquer sur **Add Environment Variable** et ajouter :

| Key | Value |
|-----|-------|
| `NG_APP_API_URL` | `https://neopro-central-server.onrender.com` |

(Remplacer par l'URL obtenue à l'étape 6.7)

### 7.4. Configurer les redirections SPA

1. Faire défiler jusqu'à **Redirects/Rewrites**
2. Cliquer sur **Add Rule**
3. Configurer :
   - **Source** : `/*`
   - **Destination** : `/index.html`
   - **Action** : `Rewrite`

### 7.5. Créer le site

1. Cliquer sur **Create Static Site**
2. Attendre le déploiement (environ 2-3 minutes)
3. Noter l'URL : `https://neopro-dashboard.onrender.com`

### 7.6. Mettre à jour ALLOWED_ORIGINS

Retourner sur le service `neopro-central-server` :

1. Cliquer sur **Environment**
2. Cliquer sur **Add Environment Variable**
3. Ajouter :
   - **Key** : `ALLOWED_ORIGINS`
   - **Value** : `https://neopro-dashboard.onrender.com`
4. Cliquer sur **Save Changes**
5. Le service va redémarrer automatiquement

---

## Étape 8 : Exécuter les migrations

### 8.1. Accéder au SQL Editor Supabase

1. Retourner sur https://supabase.com
2. Ouvrir votre projet `neopro-production`
3. Dans le menu de gauche, cliquer sur **SQL Editor**
4. Cliquer sur **New query**

### 8.2. Exécuter le schéma initial

1. Copier le contenu du fichier `central-server/src/scripts/init-db.sql` depuis votre repository
2. Coller dans l'éditeur SQL
3. Cliquer sur **Run** (ou Ctrl+Enter)
4. Vérifier qu'il n'y a pas d'erreurs (message "Success" en bas)

### 8.3. Exécuter les tables analytics

1. Cliquer sur **New query**
2. Copier le contenu de `central-server/src/scripts/analytics-tables.sql`
3. Coller et cliquer sur **Run**

### 8.4. Exécuter la migration MFA

1. Cliquer sur **New query**
2. Coller le code suivant :

```sql
-- Migration: Ajout du support MFA (Multi-Factor Authentication)

-- Ajouter les colonnes MFA à la table users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[],
ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMP WITH TIME ZONE;

-- Index pour les requêtes MFA
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled
ON users(mfa_enabled)
WHERE mfa_enabled = TRUE;

-- Commentaires
COMMENT ON COLUMN users.mfa_enabled IS 'Indique si MFA est activé';
COMMENT ON COLUMN users.mfa_secret IS 'Secret TOTP chiffré';
COMMENT ON COLUMN users.mfa_backup_codes IS 'Codes de secours hachés';
COMMENT ON COLUMN users.mfa_verified_at IS 'Dernière vérification MFA';
```

3. Cliquer sur **Run**

### 8.5. Vérifier les migrations

1. Cliquer sur **New query**
2. Exécuter :

```sql
-- Vérifier les tables créées
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Vous devez voir les tables : `users`, `sites`, `groups`, `analytics`, etc.

---

## Étape 9 : Créer le premier administrateur

### Option A : Via le shell Render (recommandé)

1. Sur Render, aller sur le service `neopro-central-server`
2. Cliquer sur **Shell** dans le menu de gauche
3. Attendre que le shell se connecte
4. Exécuter :
   ```bash
   npm run create-admin
   ```
5. Suivre les prompts :
   - Entrer votre email
   - Entrer un mot de passe (min 8 caractères)
   - Entrer votre nom complet

### Option B : Via SQL (si le shell ne fonctionne pas)

1. D'abord, générer un hash bcrypt pour votre mot de passe :
   - Aller sur https://bcrypt-generator.com/
   - Entrer votre mot de passe
   - Sélectionner **12 rounds**
   - Cliquer sur **Generate**
   - Copier le hash (commence par `$2a$` ou `$2b$`)

2. Dans Supabase SQL Editor, exécuter :

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

---

## Étape 10 : Vérifier le déploiement

### 10.1. Tester le health check

Ouvrir dans le navigateur :
```
https://neopro-central-server.onrender.com/health
```

Réponse attendue :
```json
{
  "status": "healthy",
  "timestamp": "2024-12-14T...",
  "version": "1.0.0"
}
```

### 10.2. Tester l'API

```bash
# Health check
curl https://neopro-central-server.onrender.com/health

# Liveness
curl https://neopro-central-server.onrender.com/live

# Readiness
curl https://neopro-central-server.onrender.com/ready
```

### 10.3. Tester le dashboard

1. Ouvrir : `https://neopro-dashboard.onrender.com`
2. La page de login doit s'afficher
3. Se connecter avec l'admin créé à l'étape 9
4. Vérifier que le dashboard se charge correctement

### 10.4. Tester la documentation API

Ouvrir : `https://neopro-central-server.onrender.com/api-docs`

La documentation Swagger doit s'afficher avec tous les endpoints.

### 10.5. Checklist de validation

- [ ] Health check retourne `healthy`
- [ ] Dashboard accessible
- [ ] Login fonctionne avec l'admin
- [ ] Dashboard affiche les données (même vides)
- [ ] Documentation API accessible

---

## Configuration optionnelle

### Alertes par email (SendGrid)

#### 1. Créer un compte SendGrid

1. Aller sur https://sendgrid.com
2. Cliquer sur **Start For Free**
3. Créer un compte avec votre email professionnel

#### 2. Vérifier un expéditeur

1. Dans SendGrid, aller dans **Settings** > **Sender Authentication**
2. Cliquer sur **Verify a Single Sender**
3. Remplir avec votre email professionnel
4. Valider via l'email de confirmation reçu

#### 3. Créer une clé API

1. Aller dans **Settings** > **API Keys**
2. Cliquer sur **Create API Key**
3. Nommer la clé : `neopro-production`
4. Choisir **Restricted Access**
5. Activer uniquement **Mail Send** > **Mail Send**
6. Cliquer sur **Create & View**
7. **COPIER LA CLÉ** (elle commence par `SG.`)

#### 4. Ajouter la variable sur Render

Dans `neopro-central-server` > Environment :
- `SENDGRID_API_KEY` = `SG.xxxxx...`
- `EMAIL_FROM` = `noreply@votredomaine.com`

---

### Notifications Slack

#### 1. Créer une App Slack

1. Aller sur https://api.slack.com/apps
2. Cliquer sur **Create New App** > **From scratch**
3. Nommer l'app : `NeoPro Alerts`
4. Sélectionner votre workspace
5. Cliquer sur **Create App**

#### 2. Configurer le Webhook

1. Dans le menu gauche, cliquer sur **Incoming Webhooks**
2. Activer le toggle **Activate Incoming Webhooks**
3. Cliquer sur **Add New Webhook to Workspace**
4. Sélectionner le channel (ex: `#alerts-neopro`)
5. Cliquer sur **Allow**
6. Copier l'URL du webhook

#### 3. Tester le webhook

```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Test NeoPro - Configuration OK!"}' \
  https://hooks.slack.com/services/VOTRE/WEBHOOK/URL
```

#### 4. Ajouter la variable sur Render

- `SLACK_WEBHOOK_URL` = `https://hooks.slack.com/services/...`
- `ALERT_SLACK_CHANNEL` = `#alerts-neopro`

---

### Logs centralisés (Logtail)

#### 1. Créer un compte

1. Aller sur https://betterstack.com/logtail
2. Cliquer sur **Start for free**
3. Se connecter avec GitHub

#### 2. Créer une source

1. Cliquer sur **Connect source**
2. Choisir **Node.js**
3. Copier le **Source token**

#### 3. Ajouter la variable sur Render

- `LOGTAIL_TOKEN` = `votre_token`

Les logs apparaîtront automatiquement dans le dashboard Logtail.

---

### Monitoring uptime (UptimeRobot)

#### 1. Créer un compte

1. Aller sur https://uptimerobot.com
2. Créer un compte gratuit

#### 2. Ajouter un monitor

1. Cliquer sur **Add New Monitor**
2. Configurer :
   - **Monitor Type** : `HTTP(s)`
   - **Friendly Name** : `NeoPro API`
   - **URL** : `https://neopro-central-server.onrender.com/health`
   - **Monitoring Interval** : `5 minutes`
3. Configurer les alertes (email, Slack, etc.)
4. Cliquer sur **Create Monitor**

---

## Référence des variables d'environnement

### Variables obligatoires

| Variable | Description | Exemple |
|----------|-------------|---------|
| `NODE_ENV` | Mode d'exécution | `production` |
| `PORT` | Port du serveur | `3001` |
| `DATABASE_URL` | URL PostgreSQL Supabase (avec pooler) | `postgresql://postgres...` |
| `SUPABASE_URL` | URL du projet Supabase | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Clé service_role Supabase | `eyJhbGci...` |
| `REDIS_URL` | URL Redis Upstash | `rediss://default:...` |
| `JWT_SECRET` | Secret pour signer les JWT (64 car.) | `a3F5K8mN9p...` |
| `JWT_EXPIRES_IN` | Durée de validité des tokens | `7d` |
| `MFA_ISSUER` | Nom affiché dans l'app auth | `NeoPro` |
| `MFA_ENCRYPTION_KEY` | Clé de chiffrement MFA (32 car.) | `X7kL9mN2pQ...` |

### Variables optionnelles

| Variable | Description | Exemple |
|----------|-------------|---------|
| `ALLOWED_ORIGINS` | Origines CORS autorisées | `https://dashboard.com,https://admin.com` |
| `SENDGRID_API_KEY` | Clé API SendGrid | `SG.xxx...` |
| `EMAIL_FROM` | Adresse expéditeur | `noreply@example.com` |
| `SLACK_WEBHOOK_URL` | URL Webhook Slack | `https://hooks.slack.com/...` |
| `ALERT_SLACK_CHANNEL` | Channel Slack | `#alerts-neopro` |
| `LOGTAIL_TOKEN` | Token Logtail | `xxx...` |
| `METRICS_ENABLED` | Activer les métriques Prometheus | `true` |
| `LOG_LEVEL` | Niveau de log | `info` |

### Générer les secrets

```bash
# JWT_SECRET (64 caractères)
openssl rand -base64 48

# MFA_ENCRYPTION_KEY (32 caractères)
openssl rand -base64 24
```

---

## Dépannage

### L'application ne démarre pas sur Render

1. Aller sur Render > votre service > **Logs**
2. Chercher les erreurs au démarrage
3. Erreurs courantes :
   - `DATABASE_URL` manquante ou incorrecte
   - `SUPABASE_SERVICE_KEY` manquante
   - Port incorrect (doit être 3001)

**Solution** : Vérifier toutes les variables d'environnement

### Erreur de connexion à la base de données

Symptômes : `Connection refused` ou `Connection timeout`

Vérifications :
1. Utiliser le port `6543` (pooler), pas `5432`
2. Vérifier que `?pgbouncer=true` est présent dans l'URL
3. Vérifier le mot de passe dans l'URL

Test de connexion (local) :
```bash
psql "postgresql://postgres.xxx:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
```

### Erreur CORS

Symptômes : `Access-Control-Allow-Origin` error dans la console

Solution :
1. Ajouter l'origine du frontend dans `ALLOWED_ORIGINS`
2. Format : `https://monsite.com` (sans `/` à la fin)
3. Plusieurs origines : `https://site1.com,https://site2.com`

### Redis ne se connecte pas

Vérifications :
1. URL commence par `redis://` ou `rediss://` (avec TLS)
2. Le token est correct

Test (local) :
```bash
redis-cli -u "rediss://default:xxx@xxx.upstash.io:6379" ping
# Doit répondre PONG
```

### Upload de vidéos échoue

1. Vérifier `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`
2. Vérifier que les buckets existent dans Supabase Storage
3. Vérifier les policies des buckets (SELECT et INSERT)

### Les emails ne partent pas (SendGrid)

1. Vérifier que l'expéditeur est vérifié dans SendGrid
2. Vérifier que la clé API commence par `SG.`
3. Vérifier les logs pour l'erreur exacte

### Le dashboard affiche une page blanche

1. Ouvrir les DevTools (F12) > Console
2. Chercher les erreurs
3. Vérifier que `NG_APP_API_URL` est correctement configuré
4. Vérifier que le build s'est bien passé sur Render

---

## Ressources

| Service | Documentation |
|---------|---------------|
| Supabase | https://supabase.com/docs |
| Render | https://render.com/docs |
| Upstash | https://docs.upstash.com |
| SendGrid | https://docs.sendgrid.com |
| Logtail | https://betterstack.com/docs/logs |

---

**Version :** 3.0
**Dernière mise à jour :** 14 décembre 2025
